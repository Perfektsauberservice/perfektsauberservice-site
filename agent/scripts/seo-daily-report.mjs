/**
 * SEO Daily Report Agent
 *
 * Trimite zilnic pe Telegram un raport complet:
 * - Pozitii Google (GSC API) — click-uri, impresii, pozitii cuvinte cheie
 * - Backlink-uri (GSC API)
 * - Viteza site (PageSpeed Insights API)
 * - Concurenti — pagini noi detectate, titluri, structura
 * - Audit tehnic site propriu
 *
 * Rulare: node agent/scripts/seo-daily-report.mjs
 * GitHub Actions: pss-seo-daily-report.yml (zilnic 07:00 Germania)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── Config ──────────────────────────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const GSC_SERVICE_ACCOUNT = process.env.GSC_SERVICE_ACCOUNT_JSON; // continutul fisierului JSON
const PAGESPEED_API_KEY  = process.env.PAGESPEED_API_KEY || ''; // optional, merge si fara

const SITE_URL    = 'https://perfektsauberservice.com';
const SITE_DOMAIN = 'perfektsauberservice.com';

// Concurenti de monitorizat
const COMPETITORS = [
  { name: 'Rödermark', url: 'https://www.roedermark-entruempelung.de' },
  { name: 'Sperrmüll24', url: 'https://www.sperrmuell24.de' },
  { name: 'Haushaltsaufloesung Rastatt', url: 'https://www.haushaltsaufloesungen-rastatt.de' },
];

// Cuvinte cheie de urmarit
const KEYWORDS = [
  'entrümpelung rastatt',
  'haushaltsauflösung rastatt',
  'entrümpelung baden-baden',
  'entrümpelung karlsruhe',
  'kellerentrümpelung rastatt',
  'wohnungsauflösung rastatt',
  'entrümpelung gaggenau',
  'entrümpelung ettlingen',
  'entrümpelung bühl',
  'entrümpelung gernsbach',
];

// State pentru comparatie zi precedenta
const STATE_PATH = join(ROOT, 'agent', 'state', 'seo-report-state.json');

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
  const totalsRes = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({ startDate: startDate28, endDate, dimensions: [] }),
  });
  const totalsData = await totalsRes.json();

  // Date ziua precedenta
  const yesterdayRes = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({ startDate: startDate1, endDate, dimensions: [] }),
  });
  const yesterdayData = await yesterdayRes.json();

  // Backlink-uri via links API
  const backlinksRes = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL + '/')}/sitemaps`,
    { headers }
  );

  return {
    keywords: keywordsData.rows || [],
    totals28: totalsData.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    yesterday: yesterdayData.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 },
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

// ─── Competitor Monitor ───────────────────────────────────────────────────────

async function monitorCompetitor(comp) {
  try {
    const res = await fetch(comp.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEO-Monitor/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { name: comp.name, error: `HTTP ${res.status}` };
    const html = await res.text();

    // Extrage titlu
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '?';

    // Numara pagini din sitemap daca exista
    let pageCount = null;
    try {
      const sitemapRes = await fetch(comp.url + '/sitemap.xml', { signal: AbortSignal.timeout(5000) });
      if (sitemapRes.ok) {
        const sitemap = await sitemapRes.text();
        pageCount = (sitemap.match(/<loc>/g) || []).length;
      }
    } catch {}

    // Detecteaza schimbari in H1
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const h1 = h1Match ? h1Match[1].trim() : '?';

    return { name: comp.name, title, h1, pageCount, url: comp.url };
  } catch (err) {
    return { name: comp.name, error: err.message };
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

function buildReport({ gsc, pageSpeed, competitors, audit, prevState, blogCount }) {
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  let msg = `<b>📊 SEO Tageszericht — ${today}</b>\n`;
  msg += `<b>perfektsauberservice.com</b>\n\n`;

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

  // ─ Site Audit
  if (audit && !audit.error) {
    const h1Status = audit.h1Count === 1 ? '✅' : '⚠️';
    const altStatus = audit.imgNoAlt === 0 ? '✅' : '🔶';
    msg += `<b>🔧 Audit Tehnic Homepage</b>\n`;
    msg += `${h1Status} H1 tags: ${audit.h1Count} (ideal: 1)\n`;
    msg += `${altStatus} Imagini fara ALT: ${audit.imgNoAlt}\n`;
    msg += `• Linkuri interne: ${audit.internalLinks}\n\n`;
  }

  // ─ Concurenti
  msg += `<b>👀 Concurenti</b>\n`;
  for (const comp of competitors) {
    if (comp.error) {
      msg += `• ${comp.name}: ⚠️ ${comp.error}\n`;
    } else {
      const pages = comp.pageCount ? ` (${comp.pageCount} pag.)` : '';
      msg += `• <b>${comp.name}</b>${pages}\n`;
      msg += `  H1: <i>${comp.h1?.slice(0, 60) || '?'}</i>\n`;
    }
  }
  msg += '\n';

  // ─ Footer
  msg += `<i>Urmatorul raport maine la 07:00</i>`;

  return msg;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[SEO Daily Report] Start:', new Date().toISOString());

  const prevState = loadState();
  const newState = {};

  // 1. Blog count
  const blogIndex = JSON.parse(readFileSync(join(ROOT, 'content', 'auto', 'blog-index.json'), 'utf8'));
  const blogCount = blogIndex.items.length;
  newState.blogCount = blogCount;
  console.log('Blog articole:', blogCount);

  // 2. Google Search Console
  let gsc = null;
  if (GSC_SERVICE_ACCOUNT) {
    try {
      console.log('Fetching GSC data...');
      const token = await getGoogleAccessToken(GSC_SERVICE_ACCOUNT);
      gsc = await getGSCData(token);
      newState.clicks28 = gsc.totals28.clicks;
      newState.impressions28 = gsc.totals28.impressions;
      console.log('GSC OK — clicks28:', gsc.totals28.clicks);
    } catch (err) {
      console.error('GSC error:', err.message);
    }
  } else {
    console.log('GSC_SERVICE_ACCOUNT_JSON lipsa — skip GSC');
  }

  // 3. PageSpeed
  console.log('Fetching PageSpeed...');
  const pageSpeed = await getPageSpeed(SITE_URL);
  if (pageSpeed) {
    newState.performance = pageSpeed.performance;
    console.log('PageSpeed OK — performance:', pageSpeed.performance);
  }

  // 4. Competitors
  console.log('Monitoring competitors...');
  const competitors = await Promise.all(COMPETITORS.map(monitorCompetitor));
  console.log('Competitors done');

  // 5. Site audit
  console.log('Auditing own site...');
  const audit = await auditOwnSite();
  console.log('Audit done');

  // 6. Build & send report
  const report = buildReport({ gsc, pageSpeed, competitors, audit, prevState, blogCount });
  console.log('\nRaport generat. Trimit pe Telegram...');
  await sendTelegram(report);
  console.log('Trimis!');

  // 7. Save state
  newState.lastRunAt = new Date().toISOString();
  saveState(newState);
  console.log('State salvat.');
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
