/**
 * Google Indexing API URL Submitter
 *
 * Trimite URL-uri la Google Indexing API pentru reindexare prioritară.
 * Folosit după modificări mari pe pagini (rewrite, fix bug template etc.)
 * pentru a accelera reprocesarea de la Google (3-7 zile → ~24h).
 *
 * Modes:
 *   node agent/scripts/submit-urls-indexing.mjs              → priority list (8 URLs sat afectate)
 *   node agent/scripts/submit-urls-indexing.mjs --all-city   → toate paginile city (max 200, rate-limited)
 *   node agent/scripts/submit-urls-indexing.mjs <file.txt>   → custom list, 1 URL pe linie
 *
 * Necesită:
 * - process.env.GSC_SERVICE_ACCOUNT_JSON (același service account ca gsc-delta-tracker)
 * - Service account-ul trebuie să fie OWNER în GSC pentru perfektsauberservice.com
 * - Indexing API trebuie activată în Google Cloud project
 *
 * Quota: 200 URL/zi default per service account.
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSign } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SITE = 'https://perfektsauberservice.com';
const LOG_DIR = join(ROOT, 'agent', 'indexing-logs');

const GSC_SERVICE_ACCOUNT = process.env.GSC_SERVICE_ACCOUNT_JSON;

// Priority: pagini sat căzute brusc 2026-05-04→05 (verificate persistent 2 zile)
const PRIORITY_URLS = [
  `${SITE}/haushaltsaufloesung-oetigheim`,
  `${SITE}/haushaltsaufloesung-bischweier`,
  `${SITE}/haushaltsaufloesung-weisenbach`,
  `${SITE}/haushaltsaufloesung-au-am-rhein`,
  `${SITE}/entruempelung-gaggenau`,    // Freiolsheim e Stadtteil aici
  `${SITE}/entruempelung-buehl`,        // entrümpelung bühl 29→90
  `${SITE}/entruempelung-oetigheim`,
  `${SITE}/entruempelung-bischweier`,
];

// ─── Auth (același pattern ca gsc-delta-tracker.mjs) ─────────────────────────

async function getAccessToken(saJson) {
  const sa = typeof saJson === 'string' ? JSON.parse(saJson) : saJson;
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Auth failed: ' + JSON.stringify(data));
  }
  return data.access_token;
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function submitUrl(token, url) {
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── URL list builders ────────────────────────────────────────────────────────

function buildAllCityUrls() {
  // Toate fișierele HTML din root cu prefix de serviciu (excluse blog/, agent/, etc.)
  const SERVICE_PREFIXES = [
    'bueroaufloesung', 'bueroreinigung', 'dachbodenentruempelung', 'endreinigung',
    'entruempelung', 'garagenentruempelung', 'gewerberaeumung', 'haushaltsaufloesung',
    'hausmeisterservice', 'kellerentruempelung', 'messi-wohnung', 'nachlassaufloesung',
    'unterhaltsreinigung', 'wohnungsaufloesung',
  ];
  const files = readdirSync(ROOT).filter((f) => {
    if (!f.endsWith('.html')) return false;
    return SERVICE_PREFIXES.some((p) => f.startsWith(p + '-'));
  });
  return files.map((f) => `${SITE}/${f.replace(/\.html$/, '')}`);
}

function readUrlsFromFile(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.startsWith('http'));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!GSC_SERVICE_ACCOUNT) {
    console.error('GSC_SERVICE_ACCOUNT_JSON nu e setat în env. Abort.');
    process.exit(1);
  }

  const arg = process.argv[2];
  let urls;
  if (!arg) {
    urls = PRIORITY_URLS;
    console.log(`[mode] priority list — ${urls.length} URL(s)`);
  } else if (arg === '--all-city') {
    urls = buildAllCityUrls();
    console.log(`[mode] all city pages — ${urls.length} URL(s) (quota: 200/zi)`);
    if (urls.length > 200) {
      console.warn(`⚠ Trimitem doar primele 200 (quota daily limit).`);
      urls = urls.slice(0, 200);
    }
  } else {
    urls = readUrlsFromFile(arg);
    console.log(`[mode] file ${arg} — ${urls.length} URL(s)`);
  }

  const token = await getAccessToken(GSC_SERVICE_ACCOUNT);
  console.log('✓ auth OK');

  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const r = await submitUrl(token, url);
    const tag = r.ok ? '✓' : '✗';
    console.log(`${tag} [${i + 1}/${urls.length}] ${r.status} ${url}`);
    if (!r.ok) {
      console.log(`  └─ ${JSON.stringify(r.body).slice(0, 200)}`);
    }
    results.push({ url, status: r.status, ok: r.ok, body: r.body });
    if (i < urls.length - 1) await sleep(800); // ~1.25 req/sec, sub limit
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(`\n=== ${ok}/${results.length} succes (${fail} eșec)`);

  // Log persistent
  mkdirSync(LOG_DIR, { recursive: true });
  const today = new Date().toISOString().split('T')[0];
  const logPath = join(LOG_DIR, `${today}.json`);
  writeFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), results }, null, 2));
  console.log(`log: ${logPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
