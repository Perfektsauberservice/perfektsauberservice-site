/**
 * SEO Daily Report Agent
 *
 * Trimite pe Telegram un singur raport zilnic unificat:
 * - Pozitii Google (GSC API) — click-uri, impresii, pozitii cuvinte cheie
 * - Miscari de pozitie pentru cuvinte cheie tinta (27 orase + 11 servicii),
 *   comparate cu snapshot-ul zilei precedente (fostul GSC Delta Tracker,
 *   acum parte din acelasi raport — cele doua se suprapuneau mult, ambele
 *   trageau date GSC la ~15 min distanta)
 * - Oportunitati GSC — keywords cu impresii mari si CTR mic
 * - Idei cuvinte cheie noi (Google Autocomplete)
 * - Viteza site (PageSpeed Insights API)
 * - Audit tehnic site propriu
 *
 * Prag miscari (simetric, ca sa nu raporteze zgomot statistic): o miscare
 * de pozitie conteaza doar daca e >=5 pozitii SI cuvantul are >=5 impresii
 * (fie azi, fie ieri) — inainte, sectiunea de urcari nu avea niciun prag,
 * de-aia aparea "▲ pos 77.7 → 77.3 (Δ -0.4)" ca "top mover", desi era doar
 * fluctuatie normala pe un cuvant cu 0 clickuri.
 *
 * Daca nu exista niciun semnal real (nicio miscare peste prag, niciun
 * cuvant nou, niciun click nou fata de ieri, niciun articol nou), raportul
 * NU se mai trimite pe Telegram — doar salveaza state-ul si snapshot-ul.
 * Liniste utila in loc de raport zilnic gol.
 *
 * Rulare: node agent/scripts/seo-daily-report.mjs
 * GitHub Actions: pss-seo-daily-report.yml (zilnic 07:30 Germania)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { queryGSC, buildSanitizedResult } from './gsc-query.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── Config ──────────────────────────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const GSC_SERVICE_ACCOUNT = process.env.GSC_SERVICE_ACCOUNT_JSON; // continutul fisierului JSON
const PAGESPEED_API_KEY  = process.env.PAGESPEED_API_KEY || ''; // optional, merge si fara
const OPR_API_KEY        = process.env.OPR_API_KEY || '';

const SITE_URL = 'https://perfektsauberservice.com';

// Cuvinte cheie seed pentru Google Autocomplete
const AUTOCOMPLETE_SEEDS = [
  'entrümpelung rastatt',
  'entrümpelung baden-baden',
  'haushaltsauflösung rastatt',
  'kellerentrümpelung rastatt',
  'wohnungsauflösung rastatt',
  'entrümpelung karlsruhe',
];

// 27 orase + 11 servicii — filtru pentru cuvintele urmarite in sectiunea de
// miscari de pozitie (fostul GSC Delta Tracker).
const CITIES = [
  'rastatt','baden-baden','baden baden','karlsruhe','gaggenau','ettlingen','bühl','buehl',
  'pforzheim','loffenau','muggensturm','achern','stutensee','ötigheim','oetigheim',
  'steinmauern','au am rhein','elchesheim','illingen','weisenbach','bad herrenalb','bad wildbad',
  'bietigheim','bischweier','durmersheim','forbach','hügelsheim','huegelsheim','iffezheim',
  'kuppenheim','malsch','rheinmünster','rheinmuenster'
];
const SERVICES = [
  'entrümpelung','entruempelung','haushaltsauflösung','haushaltsaufloesung',
  'wohnungsauflösung','wohnungsaufloesung','büroauflösung','bueroauflösung','bueroaufloesung',
  'gewerberäumung','gewerberaeumung','nachlassauflösung','nachlassaufloesung',
  'kellerentrümpelung','kellerentruempelung','garagenentrümpelung','garagenentruempelung',
  'dachbodenentrümpelung','dachbodenentruempelung','messie','messi','hausmeisterservice'
];

export function isRelevantQuery(q) {
  const lower = q.toLowerCase();
  return CITIES.some(c => lower.includes(c)) || SERVICES.some(s => lower.includes(s));
}

// O miscare de pozitie conteaza doar peste acest prag, in ambele directii,
// si doar daca are volum minim — vezi comentariul din header.
export const MIN_MOVE_DELTA = 5;
export const MIN_MOVE_IMPRESSIONS = 5;

// State pentru comparatie zi precedenta
const STATE_PATH = join(ROOT, 'agent', 'state', 'seo-report-state.json');
const SNAPSHOTS_DIR = join(ROOT, 'agent', 'gsc-snapshots');

function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}

function saveState(data) {
  const dir = join(ROOT, 'agent', 'state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function ensureSnapshotsDir() {
  if (!existsSync(SNAPSHOTS_DIR)) mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

function saveSnapshot(date, queries) {
  ensureSnapshotsDir();
  const path = join(SNAPSHOTS_DIR, `${date}.json`);
  writeFileSync(path, JSON.stringify({ date, queries }, null, 2), 'utf8');
  return path;
}

function loadPreviousSnapshot(today) {
  if (!existsSync(SNAPSHOTS_DIR)) return null;
  const files = readdirSync(SNAPSHOTS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .filter(f => f.replace('.json', '') < today)
    .sort()
    .reverse();
  if (!files.length) return null;
  const path = join(SNAPSHOTS_DIR, files[0]);
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

// ─── Position-move deltas (fostul GSC Delta Tracker) ─────────────────────────

export function computeDeltas(todayQueries, previousSnapshot) {
  const yMap = new Map((previousSnapshot?.queries || []).map(q => [q.q, q]));
  const tMap = new Map(todayQueries.map(q => [q.q, q]));
  const ups = [], downs = [], news = [], losts = [];

  for (const t of todayQueries) {
    const y = yMap.get(t.q);
    if (!y) { news.push(t); continue; }
    if (t.position == null || y.position == null) continue;
    const delta = t.position - y.position; // negativ = pozitie mai buna
    const meaningfulVolume = t.impressions >= MIN_MOVE_IMPRESSIONS || y.impressions >= MIN_MOVE_IMPRESSIONS;
    if (!meaningfulVolume) continue;
    if (delta <= -MIN_MOVE_DELTA) ups.push({ ...t, prev: y.position, delta });
    else if (delta >= MIN_MOVE_DELTA) downs.push({ ...t, prev: y.position, delta });
  }
  for (const y of (previousSnapshot?.queries || [])) {
    if (!tMap.has(y.q)) losts.push(y);
  }
  ups.sort((a, b) => a.delta - b.delta);     // cea mai mare urcare prima
  downs.sort((a, b) => b.delta - a.delta);   // cea mai mare scadere prima
  news.sort((a, b) => b.impressions - a.impressions);
  return { ups, downs, news, losts };
}

function fmtMoveRow(q) {
  const arrow = q.delta < 0 ? '▲' : '▼';
  return `${arrow} <b>${q.q}</b> — pos ${q.prev?.toFixed(1)} → ${q.position?.toFixed(1)} (Δ ${q.delta > 0 ? '+' : ''}${q.delta.toFixed(1)}) · ${q.impressions} impr`;
}

// ─── Signal / failure-alert logic ────────────────────────────────────────────

// A dataset that failed to fetch must never be reported as "0 movers" or
// otherwise silently folded into a healthy-looking number -- computeDeltas
// is simply never called for a failed tracked-queries fetch (see main()),
// and this function turns each failure into an explicit, named warning line
// instead, so a partial failure can never look identical to "nothing to
// report today".
export function computeWarnings({ gscFetchFailed, trackedQueriesFetchFailed, pagesFetchFailed }) {
  const warnings = [];
  if (gscFetchFailed) warnings.push('Date GSC generale (totaluri, top cuvinte cheie) indisponibile');
  if (trackedQueriesFetchFailed) warnings.push('Cuvinte cheie tinta (miscari de pozitie) indisponibile');
  if (pagesFetchFailed) warnings.push('Date GSC per pagina indisponibile');
  return warnings;
}

// The single source of truth for whether today's report gets sent at all.
// Any dataset warning ALWAYS forces a send, regardless of how "quiet"
// everything else looks -- a degraded/partial fetch must never be
// indistinguishable from a genuinely uneventful day.
export function computeHasSignal({ warnings, clicksDiff, blogIsNew, deltas, isFirstDeltaRun }) {
  const hasMoveSignal = !!deltas && (deltas.ups.length > 0 || deltas.downs.length > 0 || deltas.news.length > 0);
  return (warnings && warnings.length > 0) || clicksDiff !== 0 || blogIsNew || hasMoveSignal || isFirstDeltaRun;
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Credentiale lipsa — print local:\n', message);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    // Daca mesajul e prea lung, trimite in bucati
    if (err.includes('message is too long')) {
      const half = Math.floor(message.length / 2);
      await sendTelegram(message.slice(0, half));
      await sendTelegram(message.slice(half));
    } else {
      console.error('[Telegram] Error:', err);
    }
  }
}

// ─── Google Auth (JWT pentru Service Account) ─────────────────────────────────

async function getGoogleAccessToken(serviceAccountJson) {
  const sa = typeof serviceAccountJson === 'string'
    ? JSON.parse(serviceAccountJson)
    : serviceAccountJson;

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  // Construieste JWT manual (fara biblioteci externe)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const signingInput = `${header}.${payload}`;

  // Semneaza cu cheia privata RSA
  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  // Schimba JWT pe access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error('Nu s-a putut obtine Google access token: ' + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

// ─── Google Search Console API ────────────────────────────────────────────────

async function getGSCData(accessToken) {
  const today = new Date();
  const endDate = today.toISOString().split('T')[0];
  const startDate28 = new Date(today - 28 * 86400000).toISOString().split('T')[0];
  const startDate7  = new Date(today - 7  * 86400000).toISOString().split('T')[0];
  const startDate1  = new Date(today - 1  * 86400000).toISOString().split('T')[0];

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL + '/')}/searchAnalytics/query`;

  // Date ultimele 7 zile — per query (cuvant cheie)
  const keywordsRes = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({
      startDate: startDate7, endDate,
      dimensions: ['query'],
      rowLimit: 25,
      dimensionFilterGroups: [{
        filters: [{ dimension: 'country', operator: 'equals', expression: 'deu' }]
      }],
    }),
  });
  const keywordsData = await keywordsRes.json();

  // Date ultimele 28 zile — total site (pentru comparatie)
  // country=deu adaugat aici pentru a fi consistent cu pull-ul de keywords
  // de mai sus (care filtreaza deja Germania) — inainte, aceste doua totaluri
  // erau worldwide, in timp ce keywords-urile erau Germania-only, in acelasi
  // raport, fara nicio mentiune a diferentei de scop geografic.
  const totalsRes = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({
      startDate: startDate28, endDate, dimensions: [],
      dimensionFilterGroups: [{
        filters: [{ dimension: 'country', operator: 'equals', expression: 'deu' }]
      }],
    }),
  });
  const totalsData = await totalsRes.json();

  // Date ziua precedenta (acelasi motiv: country=deu pentru consistenta)
  const yesterdayRes = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({
      startDate: startDate1, endDate, dimensions: [],
      dimensionFilterGroups: [{
        filters: [{ dimension: 'country', operator: 'equals', expression: 'deu' }]
      }],
    }),
  });
  const yesterdayData = await yesterdayRes.json();

  const totals28 = totalsData.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  // Page-dimension pull (acelasi interval de 28 zile ca totals28, acelasi
  // filtru country=deu) — foloseste modulul existent gsc-query.mjs (PR #23)
  // in loc sa duplice logica de paginare/autentificare. Read-only, la fel ca
  // toate celelalte apeluri GSC din acest fisier. Esec izolat: daca acest
  // apel nou pica, restul raportului tot se trimite (acelasi tipar ca
  // pageSpeed/backlinks mai jos, care sunt deja optionale).
  let pages = [];
  let pagesFetchFailed = false;
  try {
    const pageResult = await queryGSC({
      startDate: startDate28, endDate,
      dimensions: ['page'],
      filters: { country: 'deu' },
      rowLimit: 1000,
      all: true,
    });
    pages = buildSanitizedResult({
      startDate: startDate28, endDate,
      dimensions: ['page'], filters: { country: 'deu' },
      queryResult: pageResult,
    }).rows;
  } catch (err) {
    console.log('GSC page-dimension pull failed (non-fatal):', err.message);
    pagesFetchFailed = true;
  }

  // Cuvinte cheie tinta (27 orase + 11 servicii), pentru sectiunea de
  // miscari de pozitie fata de ieri (fostul GSC Delta Tracker). Reuseste
  // acelasi accessToken deja obtinut mai sus — un singur login Google in
  // loc de doua (inainte, scriptul separat facea propriul JWT+token exchange
  // la 15 minute dupa acesta). Esec izolat, la fel ca pull-ul de pagini.
  let trackedQueries = [];
  let trackedQueriesFetchFailed = false;
  try {
    const trackedRes = await fetch(base, {
      method: 'POST', headers,
      body: JSON.stringify({
        startDate: startDate7, endDate,
        dimensions: ['query', 'page'],
        rowLimit: 5000,
        dimensionFilterGroups: [{
          filters: [{ dimension: 'country', operator: 'equals', expression: 'deu' }]
        }],
      }),
    });
    const trackedData = await trackedRes.json();
    trackedQueries = (trackedData.rows || [])
      .filter(r => isRelevantQuery(r.keys[0]))
      .map(r => ({
        q: r.keys[0],
        page: r.keys[1] || '',
        position: parseFloat(r.position?.toFixed(2)) || null,
        impressions: r.impressions || 0,
        clicks: r.clicks || 0,
        ctr: parseFloat((r.ctr * 100).toFixed(2)) || 0,
      }));
  } catch (err) {
    console.log('GSC tracked-queries pull failed (non-fatal):', err.message);
    trackedQueriesFetchFailed = true;
  }

  // queryCoverageRatio: cat din clicks/impressions reale (totals28, acum
  // Germania-only, la fel ca keywords) reusesc sa fie vizibile si la nivel
  // de query in lista de top-25 keywords de mai sus. GSC ascunde din motive
  // de confidentialitate o parte din query-urile cu volum mic, deci acest
  // raport poate fi real mai mic decat 1 fara sa insemne o eroare — vezi
  // gsc-query.mjs, campul gsc_rows_not_guaranteed_complete, pentru acelasi
  // fenomen documentat la nivel de pagina.
  const keywordsSum = (keywordsData.rows || []).reduce(
    (acc, row) => ({ clicks: acc.clicks + (row.clicks || 0), impressions: acc.impressions + (row.impressions || 0) }),
    { clicks: 0, impressions: 0 }
  );
  const queryCoverageRatio = {
    clicks: totals28.clicks > 0 ? keywordsSum.clicks / totals28.clicks : null,
    impressions: totals28.impressions > 0 ? keywordsSum.impressions / totals28.impressions : null,
  };

  return {
    keywords: keywordsData.rows || [],
    totals28,
    yesterday: yesterdayData.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    pages,
    pagesFetchFailed,
    trackedQueries,
    trackedQueriesFetchFailed,
    queryCoverageRatio,
  };
}

// ─── PageSpeed Insights ───────────────────────────────────────────────────────

async function getPageSpeed(url) {
  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile${PAGESPEED_API_KEY ? '&key=' + PAGESPEED_API_KEY : ''}`;
    const res = await fetch(apiUrl);
    const data = await res.json();
    if (data.error) return null;

    const cats = data.lighthouseResult?.categories;
    return {
      performance: Math.round((cats?.performance?.score || 0) * 100),
      seo:         Math.round((cats?.seo?.score || 0) * 100),
      accessibility: Math.round((cats?.accessibility?.score || 0) * 100),
      lcp: data.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue || '?',
      cls: data.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue || '?',
    };
  } catch {
    return null;
  }
}

// ─── Google Autocomplete ──────────────────────────────────────────────────────

async function getKeywordSuggestions(seeds) {
  const all = new Set();
  for (const seed of seeds) {
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}&hl=de&gl=de`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0' },
        signal: AbortSignal.timeout(6000),
      });
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        for (const s of data[1].slice(0, 5)) {
          // Exclude seed-ul exact, pastreaza variantele noi
          if (s !== seed) all.add(s);
        }
      }
    } catch (err) {
      console.log(`Autocomplete skip "${seed}":`, err.message);
    }
  }
  return [...all];
}

// ─── Open PageRank — Backlink-uri ────────────────────────────────────────────

async function getBacklinks(domain) {
  if (!OPR_API_KEY) return null;
  try {
    const res = await fetch(`https://openpagerank.com/api/v1.0/getPageRank?domains[0]=${encodeURIComponent(domain)}`, {
      headers: { 'API-OPR': OPR_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const entry = data?.response?.[0];
    if (!entry || entry.status_code !== 200) return null;
    return {
      rank: entry.page_rank_decimal ?? 0,
      rankInt: entry.page_rank_integer ?? 0,
      position: entry.rank ?? null, // pozitie globala
    };
  } catch (err) {
    console.log('OPR skip:', err.message);
    return null;
  }
}

// ─── Site Audit ───────────────────────────────────────────────────────────────

async function auditOwnSite() {
  try {
    const res = await fetch(SITE_URL, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '?';
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || '?';
    const h1Count = (html.match(/<h1/gi) || []).length;
    const imgNoAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
    const internalLinks = (html.match(/href=["']\/[^"']+["']/gi) || []).length;

    return { title, canonical, h1Count, imgNoAlt, internalLinks };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Format mesaj Telegram ────────────────────────────────────────────────────

export function buildReport({ gsc, pageSpeed, audit, backlinks, prevState, blogCount, keywordSuggestions, deltas, isFirstDeltaRun, warnings }) {
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  let msg = `<b>📊 SEO Tageszericht — ${today}</b>\n`;
  msg += `<b>perfektsauberservice.com</b>\n\n`;

  // ─ Avertismente (date indisponibile) — mereu primele, ca sa nu fie ratate
  if (warnings && warnings.length > 0) {
    msg += `<b>⚠️ Date indisponibile azi</b>\n`;
    warnings.forEach(w => { msg += `• ${w}\n`; });
    msg += '\n';
  }

  // ─ GSC
  if (gsc) {
    const t = gsc.totals28;
    const y = gsc.yesterday;
    const prevClicks = prevState.clicks28 || 0;
    const clicksDiff = t.clicks - prevClicks;
    const diffStr = clicksDiff >= 0 ? `+${clicksDiff}` : `${clicksDiff}`;

    msg += `<b>🔍 Google Search (ultimele 28 zile)</b>\n`;
    msg += `• Click-uri: <b>${t.clicks}</b> (${diffStr} fata de ieri)\n`;
    msg += `• Impresii: <b>${t.impressions}</b>\n`;
    msg += `• Pozitie medie: <b>${t.position?.toFixed(1) || '?'}</b>\n`;
    msg += `• CTR: <b>${((t.ctr || 0) * 100).toFixed(1)}%</b>\n\n`;

    msg += `<b>📅 Ieri</b>\n`;
    msg += `• Click-uri: ${y.clicks} | Impresii: ${y.impressions}\n\n`;

    // Top cuvinte cheie
    if (gsc.keywords.length > 0) {
      msg += `<b>🏆 Top cuvinte cheie (7 zile, Germania)</b>\n`;
      const top = gsc.keywords
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 8);
      for (const kw of top) {
        const pos = kw.position?.toFixed(0) || '?';
        const posEmoji = pos <= 3 ? '🥇' : pos <= 10 ? '✅' : pos <= 20 ? '🔶' : '🔻';
        msg += `${posEmoji} <i>${kw.keys[0]}</i> — poz. <b>${pos}</b>, ${kw.clicks} click-uri\n`;
      }
      msg += '\n';
    }
  } else {
    msg += `<b>🔍 GSC</b> — date indisponibile\n\n`;
  }

  // ─ Miscari de pozitie pe cuvinte cheie tinta (fostul GSC Delta Tracker)
  if (isFirstDeltaRun) {
    msg += `<b>📍 Urmarire pozitii initiata</b>\n`;
    msg += `<i>Baseline stabilit pentru cuvintele cheie tinta (orase + servicii). Comparatii incep de maine.</i>\n\n`;
  } else if (deltas) {
    if (deltas.ups.length) {
      msg += `<b>🔝 Miscari pozitive (&gt;${MIN_MOVE_DELTA} pozitii)</b> (${deltas.ups.length})\n`;
      deltas.ups.slice(0, 8).forEach(q => { msg += fmtMoveRow(q) + '\n'; });
      msg += '\n';
    }
    if (deltas.downs.length) {
      msg += `<b>⚠️ Scaderi &gt;${MIN_MOVE_DELTA} pozitii</b> (${deltas.downs.length})\n`;
      deltas.downs.slice(0, 8).forEach(q => { msg += fmtMoveRow(q) + '\n'; });
      msg += '\n';
    }
    if (deltas.news.length) {
      msg += `<b>🆕 Cuvinte noi indexate</b> (${deltas.news.length})\n`;
      deltas.news.slice(0, 6).forEach(q => {
        msg += `<b>${q.q}</b> — pos ${q.position?.toFixed(1)} · ${q.impressions} impr · ${q.clicks} clicks\n`;
      });
      msg += '\n';
    }
    if (deltas.losts.length) {
      msg += `📉 ${deltas.losts.length} cuvinte au disparut din top (probabil scazute peste poz. 100)\n\n`;
    }
  }

  // ─ PageSpeed
  if (pageSpeed) {
    const perfEmoji = pageSpeed.performance >= 80 ? '✅' : pageSpeed.performance >= 50 ? '🔶' : '🔴';
    msg += `<b>⚡ Viteza Site (Mobile)</b>\n`;
    msg += `${perfEmoji} Performance: <b>${pageSpeed.performance}/100</b>\n`;
    msg += `• SEO score: <b>${pageSpeed.seo}/100</b>\n`;
    msg += `• LCP: ${pageSpeed.lcp} | CLS: ${pageSpeed.cls}\n\n`;
  }

  // ─ Blog
  msg += `<b>📝 Continut Blog</b>\n`;
  msg += `• Articole totale: <b>${blogCount}</b>\n`;
  const prevBlog = prevState.blogCount || 0;
  if (blogCount > prevBlog) msg += `• +${blogCount - prevBlog} articole noi ieri\n`;
  msg += '\n';

  // ─ Backlink-uri
  if (backlinks) {
    const prevRank = prevState.oprRank ?? null;
    const rankDiff = prevRank !== null ? (backlinks.rank - prevRank).toFixed(2) : null;
    const diffStr = rankDiff !== null ? (rankDiff >= 0 ? ` (+${rankDiff})` : ` (${rankDiff})`) : '';
    const rankEmoji = backlinks.rank >= 3 ? '✅' : backlinks.rank >= 1 ? '🔶' : '🔴';
    msg += `<b>🔗 Autoritate Domeniu (Open PageRank)</b>\n`;
    msg += `${rankEmoji} Domain Rank: <b>${backlinks.rank}/10</b>${diffStr}\n`;
    if (backlinks.position) msg += `• Pozitie globala: #${backlinks.position.toLocaleString('de-DE')}\n`;
    msg += '\n';
  }

  // ─ Site Audit
  if (audit && !audit.error) {
    const h1Status = audit.h1Count === 1 ? '✅' : '⚠️';
    const altStatus = audit.imgNoAlt === 0 ? '✅' : '🔶';
    msg += `<b>🔧 Audit Tehnic Homepage</b>\n`;
    msg += `${h1Status} H1 tags: ${audit.h1Count} (ideal: 1)\n`;
    msg += `${altStatus} Imagini fara ALT: ${audit.imgNoAlt}\n`;
    msg += `• Linkuri interne: ${audit.internalLinks}\n\n`;
  }

  // ─ Oportunitati GSC (impresii mari, CTR mic = pagina 2-3, merita optimizat)
  if (gsc && gsc.keywords.length > 0) {
    const opportunities = gsc.keywords
      .filter(kw => kw.impressions >= 5 && kw.ctr < 0.05 && kw.position <= 40)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);
    if (opportunities.length > 0) {
      msg += `<b>🎯 Oportunitati (impresii mari, fara click-uri)</b>\n`;
      msg += `<i>Aceste cuvinte apar des in Google dar nu primesc click-uri — optimizeaza titlul/descrierea paginii:</i>\n`;
      for (const kw of opportunities) {
        msg += `• <i>${kw.keys[0]}</i> — poz. <b>${kw.position.toFixed(0)}</b>, ${kw.impressions} impresii\n`;
      }
      msg += '\n';
    }
  }

  // ─ Idei noi de cuvinte cheie (Google Autocomplete)
  if (keywordSuggestions && keywordSuggestions.length > 0) {
    msg += `<b>💡 Idei cuvinte cheie noi (Google Autocomplete)</b>\n`;
    msg += `<i>Ce cauta oamenii pe Google — potential articole blog sau pagini noi:</i>\n`;
    for (const kw of keywordSuggestions.slice(0, 12)) {
      msg += `• ${kw}\n`;
    }
    msg += '\n';
  }

  // ─ Footer
  msg += `<i>Urmatorul raport maine la 07:30</i>`;

  return msg;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[SEO Daily Report] Start:', new Date().toISOString());

  const prevState = loadState();
  const newState = {};
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Blog count
  const blogIndex = JSON.parse(readFileSync(join(ROOT, 'content', 'auto', 'blog-index.json'), 'utf8'));
  const blogCount = blogIndex.items.length;
  newState.blogCount = blogCount;
  console.log('Blog articole:', blogCount);

  // 2. Google Search Console (totaluri, top keywords, cuvinte tinta)
  let gsc = null;
  if (GSC_SERVICE_ACCOUNT) {
    try {
      console.log('Fetching GSC data...');
      const token = await getGoogleAccessToken(GSC_SERVICE_ACCOUNT);
      gsc = await getGSCData(token);
      newState.clicks28 = gsc.totals28.clicks;
      newState.impressions28 = gsc.totals28.impressions;
      newState.queryCoverageRatio = gsc.queryCoverageRatio;
      console.log('GSC OK — clicks28:', gsc.totals28.clicks, '| queryCoverageRatio:', gsc.queryCoverageRatio);
      console.log('Cuvinte tinta urmarite:', gsc.trackedQueries.length);
    } catch (err) {
      console.error('GSC error:', err.message);
    }
  } else {
    console.log('GSC_SERVICE_ACCOUNT_JSON lipsa — skip GSC');
  }

  // 3. Miscari de pozitie fata de ieri (fostul GSC Delta Tracker)
  const previousSnapshot = loadPreviousSnapshot(todayStr);
  const isFirstDeltaRun = !previousSnapshot;
  let deltas = null;
  if (gsc && !gsc.trackedQueriesFetchFailed) {
    deltas = computeDeltas(gsc.trackedQueries, previousSnapshot);
    saveSnapshot(todayStr, gsc.trackedQueries);
    console.log(`Miscari: ups=${deltas.ups.length} downs=${deltas.downs.length} news=${deltas.news.length} losts=${deltas.losts.length}`);
  }

  // 4. PageSpeed
  console.log('Fetching PageSpeed...');
  const pageSpeed = await getPageSpeed(SITE_URL);
  if (pageSpeed) {
    newState.performance = pageSpeed.performance;
    console.log('PageSpeed OK — performance:', pageSpeed.performance);
  }

  // 5. Keyword suggestions + Site audit + Backlinks — in paralel
  console.log('Fetching keyword suggestions, backlinks & auditing site...');
  const [keywordSuggestions, audit, backlinks] = await Promise.all([
    getKeywordSuggestions(AUTOCOMPLETE_SEEDS),
    auditOwnSite(),
    getBacklinks('perfektsauberservice.com'),
  ]);
  console.log('Keyword suggestions:', keywordSuggestions.length, '| Audit done | Backlinks:', backlinks?.rank ?? 'N/A');
  if (backlinks) newState.oprRank = backlinks.rank;

  // 6. Decide daca exista vreun semnal real de raportat. Fara asta, raportul
  // zilnic ajunge sa spuna "nimic notabil" aproape in fiecare zi, la stadiul
  // actual de trafic al site-ului — liniste utila e mai buna decat zgomot
  // zilnic constant. Un fetch esuat (total sau partial) conteaza mereu ca
  // semnal -- o defectiune nu trebuie sa fie identica cu o zi linistita.
  const clicksDiff = gsc ? gsc.totals28.clicks - (prevState.clicks28 || 0) : 0;
  const blogIsNew = blogCount > (prevState.blogCount || 0);
  const gscFetchFailed = !gsc;
  const warnings = computeWarnings({
    gscFetchFailed,
    trackedQueriesFetchFailed: gsc?.trackedQueriesFetchFailed || false,
    pagesFetchFailed: gsc?.pagesFetchFailed || false,
  });
  const hasSignal = computeHasSignal({ warnings, clicksDiff, blogIsNew, deltas, isFirstDeltaRun });

  if (!hasSignal) {
    console.log('[SEO Daily Report] Fara semnal notabil azi — raportul NU se trimite pe Telegram.');
  } else {
    if (warnings.length > 0) console.log('[SEO Daily Report] Avertismente:', warnings.join(' | '));
    const report = buildReport({ gsc, pageSpeed, audit, backlinks, prevState, blogCount, keywordSuggestions, deltas, isFirstDeltaRun, warnings });
    console.log('\nRaport generat. Trimit pe Telegram...');
    await sendTelegram(report);
    console.log('Trimis!');
  }

  // 7. Save state
  newState.lastRunAt = new Date().toISOString();
  saveState(newState);
  console.log('State salvat.');
}

// Only auto-run when executed directly (node agent/scripts/seo-daily-report.mjs
// -- exactly how GitHub Actions invokes it), never when imported as a module
// by a test file. Without this guard, importing this file to unit-test the
// exported pure functions above would also fire a live run as a side effect.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch(err => {
    console.error('[FATAL]', err.message);
    process.exit(1);
  });
}
