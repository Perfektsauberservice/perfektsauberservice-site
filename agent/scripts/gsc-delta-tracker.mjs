/**
 * GSC Delta Tracker
 *
 * Trage zilnic pozitii GSC per query (filtered pentru cele 25 orașe + 11 servicii)
 * și compară cu snapshot-ul zilei precedente. Trimite delta report pe Telegram:
 * - 🔝 TOP MOVERS UP (poziții urcate)
 * - ⚠️ DROPS > 5 poziții
 * - 🆕 NEW ENTRIES (queries noi)
 *
 * Rulare: node agent/scripts/gsc-delta-tracker.mjs
 * GitHub Actions: pss-gsc-delta-tracker.yml (zilnic 07:45 Berlin, după seo-daily-report)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const GSC_SERVICE_ACCOUNT = process.env.GSC_SERVICE_ACCOUNT_JSON;
const SITE_URL = 'https://perfektsauberservice.com';

const SNAPSHOTS_DIR = join(ROOT, 'agent', 'gsc-snapshots');

// 27 orașe + 11 servicii — filter pentru queries
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

function isRelevantQuery(q) {
  const lower = q.toLowerCase();
  return CITIES.some(c => lower.includes(c)) || SERVICES.some(s => lower.includes(s));
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Credentiale lipsa — print local:\n' + message);
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
    if (err.includes('message is too long')) {
      const half = Math.floor(message.length / 2);
      await sendTelegram(message.slice(0, half));
      await sendTelegram(message.slice(half));
    } else {
      console.error('[Telegram] Error:', err);
    }
  }
}

// ─── Google Auth (acelasi pattern ca seo-daily-report.mjs) ──────────────────

async function getGoogleAccessToken(serviceAccountJson) {
  const sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;
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

// ─── Fetch GSC queries pentru ultimele 7 zile ────────────────────────────────

async function fetchQueries(accessToken) {
  const today = new Date();
  const endDate = today.toISOString().split('T')[0];
  const startDate7 = new Date(today - 7 * 86400000).toISOString().split('T')[0];

  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL + '/')}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: startDate7,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit: 5000,
      dimensionFilterGroups: [{
        filters: [{ dimension: 'country', operator: 'equals', expression: 'deu' }]
      }],
    }),
  });
  const data = await res.json();
  if (!data.rows) return [];
  return data.rows
    .filter(r => isRelevantQuery(r.keys[0]))
    .map(r => ({
      q: r.keys[0],
      page: r.keys[1] || '',
      position: parseFloat(r.position?.toFixed(2)) || null,
      impressions: r.impressions || 0,
      clicks: r.clicks || 0,
      ctr: parseFloat((r.ctr * 100).toFixed(2)) || 0,
    }));
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

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

// ─── Compute deltas ──────────────────────────────────────────────────────────

function computeDeltas(today, yesterday) {
  const yMap = new Map((yesterday?.queries || []).map(q => [q.q, q]));
  const tMap = new Map(today.queries.map(q => [q.q, q]));
  const ups = [], downs = [], news = [], losts = [];
  for (const t of today.queries) {
    const y = yMap.get(t.q);
    if (!y) { news.push(t); continue; }
    if (t.position == null || y.position == null) continue;
    const delta = t.position - y.position;
    if (delta < 0) ups.push({ ...t, prev: y.position, delta });
    else if (delta > 0) downs.push({ ...t, prev: y.position, delta });
  }
  for (const y of (yesterday?.queries || [])) {
    if (!tMap.has(y.q)) losts.push(y);
  }
  ups.sort((a, b) => a.delta - b.delta);     // most negative first (biggest UP)
  downs.sort((a, b) => b.delta - a.delta);   // most positive first (biggest DOWN)
  news.sort((a, b) => b.impressions - a.impressions);
  return { ups, downs, news, losts };
}

// ─── Format Telegram message ─────────────────────────────────────────────────

function fmtRow(q) {
  const arrow = q.delta < 0 ? '▲' : '▼';
  return `<b>${q.q}</b>\n  ${arrow} pos ${q.prev?.toFixed(1)} → ${q.position?.toFixed(1)} (Δ ${q.delta > 0 ? '+' : ''}${q.delta.toFixed(1)})  · ${q.impressions} impr`;
}

function buildReport(today, yesterday, deltas) {
  const date = today.date;
  const yDate = yesterday?.date || 'N/A';
  const lines = [
    `📈 <b>GSC Delta Report — ${date}</b>`,
    `(vs ${yDate}, ${today.queries.length} tracked queries)`,
    ''
  ];

  if (!yesterday) {
    lines.push('🌱 <b>FIRST RUN</b> — baseline established. Vom raporta deltas începând de mâine.');
    return lines.join('\n');
  }

  if (deltas.ups.length) {
    lines.push(`🔝 <b>TOP MOVERS UP</b> (${deltas.ups.length})`);
    deltas.ups.slice(0, 8).forEach(q => lines.push(fmtRow(q)));
    lines.push('');
  }

  const bigDrops = deltas.downs.filter(d => d.delta > 5);
  if (bigDrops.length) {
    lines.push(`⚠️ <b>DROPS &gt; 5 poziții</b> (${bigDrops.length})`);
    bigDrops.slice(0, 8).forEach(q => lines.push(fmtRow(q)));
    lines.push('');
  }

  if (deltas.news.length) {
    lines.push(`🆕 <b>NEW ENTRIES</b> (${deltas.news.length})`);
    deltas.news.slice(0, 6).forEach(q =>
      lines.push(`<b>${q.q}</b>\n  pos ${q.position?.toFixed(1)} · ${q.impressions} impr · ${q.clicks} clicks`)
    );
    lines.push('');
  }

  if (!deltas.ups.length && !bigDrops.length && !deltas.news.length) {
    lines.push('😴 Nimic notabil azi. Pozițiile sunt stabile.');
  }

  if (deltas.losts.length) {
    lines.push(`📉 LOST: ${deltas.losts.length} queries au dispărut din index/rezultate (probabil scăzut peste 100).`);
  }

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!GSC_SERVICE_ACCOUNT) {
    console.error('GSC_SERVICE_ACCOUNT_JSON missing — abort.');
    process.exit(1);
  }
  const today = new Date().toISOString().split('T')[0];

  console.log('Auth GSC...');
  const token = await getGoogleAccessToken(GSC_SERVICE_ACCOUNT);

  console.log('Fetch queries...');
  const queries = await fetchQueries(token);
  console.log(`  ${queries.length} relevant queries found.`);

  const todaySnapshot = { date: today, queries };
  const yesterdaySnapshot = loadPreviousSnapshot(today);

  console.log('Compute deltas...');
  const deltas = computeDeltas(todaySnapshot, yesterdaySnapshot);
  console.log(`  ups=${deltas.ups.length} downs=${deltas.downs.length} new=${deltas.news.length} lost=${deltas.losts.length}`);

  console.log('Save snapshot...');
  const path = saveSnapshot(today, queries);
  console.log(`  ${path}`);

  console.log('Send Telegram report...');
  const msg = buildReport(todaySnapshot, yesterdaySnapshot, deltas);
  await sendTelegram(msg);

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
