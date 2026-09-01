/**
 * Reusable Google Search Console read-only query client.
 *
 * READ-ONLY BY DESIGN:
 *   - OAuth scope requested is https://www.googleapis.com/auth/webmasters.readonly
 *     (Google rejects any write/administrative call with this scope).
 *   - The only GSC endpoint this file ever calls is searchAnalytics.query
 *     (a read endpoint). No sitemap submission, no property/permission
 *     management, no indexing-API call is implemented here or should ever
 *     be added to this file.
 *
 * Credential handling:
 *   - Reads GSC_SERVICE_ACCOUNT_JSON from process.env if already set
 *     (e.g. injected by GitHub Actions `env:`), otherwise falls back to
 *     reading a single `GSC_SERVICE_ACCOUNT_JSON=...` line from the
 *     repo-root .env file (gitignored) for local runs.
 *   - The credential value is never logged, printed, written to any output
 *     file, or included in thrown error messages. Only non-sensitive query
 *     parameters and results (URLs, counts, metrics) are ever surfaced.
 *
 * Usage as a module:
 *   import { queryGSC } from './gsc-query.mjs';
 *   const result = await queryGSC({
 *     startDate: '2026-08-03', endDate: '2026-08-30',
 *     dimensions: ['page'], filters: { country: 'deu' },
 *     rowLimit: 1000, all: true,
 *   });
 *
 * Usage as a CLI (writes JSON result to stdout, and optionally to --out):
 *   node agent/scripts/gsc-query.mjs --start=2026-08-03 --end=2026-08-30 \
 *     --dimensions=page --country=DEU --all --out=/path/to/result.json
 *
 *   Aggregate (site- or filter-level totals, no per-row breakdown):
 *   node agent/scripts/gsc-query.mjs --start=2026-08-03 --end=2026-08-30 \
 *     --dimensions=none --country=DEU --pageContains=/blog --out=/path/to/result.json
 *
 * Aggregate vs. dimensioned results are NOT interchangeable — see the
 * buildSanitizedResult() docstring below for why `total_clicks` only
 * appears for an aggregate (dimensions: []) query, and why a dimensioned
 * query's summed rows are reported under different field names instead.
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SITE_URL = 'https://perfektsauberservice.com';
const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const MAX_PAGES = 10; // safety cap on pagination loops (see queryGSC({ all: true }))

// ─── Credential loading (never logs the value) ────────────────────────────

function loadServiceAccountJson() {
  if (process.env.GSC_SERVICE_ACCOUNT_JSON) return process.env.GSC_SERVICE_ACCOUNT_JSON;
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return undefined;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (key === 'GSC_SERVICE_ACCOUNT_JSON') {
      return line.slice(idx + 1).trim();
    }
  }
  return undefined;
}

// ─── Google Auth (JWT for Service Account, read-only scope) ───────────────

async function getGoogleAccessToken(serviceAccountJson) {
  const sa = typeof serviceAccountJson === 'string'
    ? JSON.parse(serviceAccountJson)
    : serviceAccountJson;

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: GSC_READONLY_SCOPE,
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
    // Deliberately do not include tokenData in the thrown message beyond
    // Google's own (non-secret) error shape — never echoes sa.private_key.
    throw new Error('Could not obtain Google access token: ' + JSON.stringify({ error: tokenData.error, error_description: tokenData.error_description }));
  }
  return tokenData.access_token;
}

// ─── Filter builder ─────────────────────────────────────────────────────

function buildDimensionFilterGroups(filters) {
  if (!filters || Object.keys(filters).length === 0) return undefined;
  const dimMap = { country: 'country', page: 'page', query: 'query', device: 'device' };
  const groupFilters = [];
  for (const [key, value] of Object.entries(filters)) {
    const dimension = dimMap[key];
    if (!dimension) throw new Error(`Unsupported filter dimension: ${key}`);
    if (value && typeof value === 'object' && 'contains' in value) {
      groupFilters.push({ dimension, operator: 'contains', expression: value.contains });
    } else {
      groupFilters.push({ dimension, operator: 'equals', expression: value });
    }
  }
  return [{ filters: groupFilters }];
}

// ─── Core read-only query function ─────────────────────────────────────

/**
 * Queries GSC Search Analytics (read-only). Supports dimensions
 * page/query/date/country/device in any valid combination, plus filters
 * on country/page/query/device, a rowLimit, and optional full pagination.
 *
 * @param {object} opts
 * @param {string} opts.startDate - 'YYYY-MM-DD'
 * @param {string} opts.endDate - 'YYYY-MM-DD'
 * @param {string[]} [opts.dimensions] - subset of ['page','query','date','country','device']
 * @param {object} [opts.filters] - e.g. { country: 'deu', page: { contains: '/blog/' } }
 * @param {number} [opts.rowLimit] - rows per page, GSC max is 25000, default 1000
 * @param {boolean} [opts.all] - if true, paginates via startRow up to MAX_PAGES safety cap
 * @returns {Promise<{ rows: object[], rowLimitHit: boolean, pagesFetched: number }>}
 */
export async function queryGSC({ startDate, endDate, dimensions = [], filters = {}, rowLimit = 1000, all = false }) {
  if (!startDate || !endDate) throw new Error('queryGSC requires startDate and endDate');

  const serviceAccountJson = loadServiceAccountJson();
  if (!serviceAccountJson) {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON not found in process.env or repo-root .env — cannot authenticate (read-only access unavailable).');
  }

  const accessToken = await getGoogleAccessToken(serviceAccountJson);
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL + '/')}/searchAnalytics/query`;
  const dimensionFilterGroups = buildDimensionFilterGroups(filters);

  const rows = [];
  let startRow = 0;
  let pagesFetched = 0;
  let lastPageLen = 0;

  do {
    const body = {
      startDate,
      endDate,
      dimensions,
      rowLimit,
      startRow,
      ...(dimensionFilterGroups ? { dimensionFilterGroups } : {}),
    };
    const res = await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) {
      throw new Error('GSC searchAnalytics.query failed: ' + JSON.stringify({ status: res.status, error: data.error }));
    }
    const pageRows = data.rows || [];
    rows.push(...pageRows);
    lastPageLen = pageRows.length;
    pagesFetched += 1;
    startRow += rowLimit;
  } while (all && lastPageLen === rowLimit && pagesFetched < MAX_PAGES);

  return {
    rows,
    rowLimitHit: lastPageLen === rowLimit,
    pagesFetched,
  };
}

export { getGoogleAccessToken };

// ─── CLI entrypoint ─────────────────────────────────────────────────────

function parseCliArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

// ─── Sanitized result envelope (CI artifact / pipeline evidence shape) ────

/**
 * Wraps a queryGSC() result into the sanitized envelope shared with the
 * pipeline (Investigator/Analyst/Verifier) and with CI artifacts. Contains
 * only query parameters and Google's own (non-credential) response data —
 * never the service account JSON, a private key, or an access token.
 *
 * Two distinct query shapes, kept semantically separate on purpose:
 *
 *   - AGGREGATE (dimensions: []): GSC returns a single summary row for the
 *     given filters/date range. That row's clicks/impressions are the real
 *     property-level (or filter-level) totals, so they are reported as
 *     `total_clicks`/`total_impressions`.
 *
 *   - DIMENSIONED (dimensions: ['page', ...] etc.): GSC's Search Analytics
 *     API does not guarantee it returns every row that exists for the
 *     filters/date range, even with correct startRow pagination — this is
 *     documented API behaviour (internal sampling/row limits), independent
 *     of our own pagination cap (MAX_PAGES). Summing the rows we did get
 *     back is therefore NOT a verified total, so those sums are reported
 *     under different, explicitly-named fields (`returned_rows_clicks`/
 *     `returned_rows_impressions`) and `metadata.gsc_rows_not_guaranteed_complete`
 *     is always true for this shape — to get a real total for a subset
 *     (e.g. blog pages), run a separate AGGREGATE query with the same
 *     filter (e.g. page contains '/blog') rather than summing dimensioned
 *     rows.
 *
 * `metadata.possibly_truncated` is a different, narrower signal: it only
 * reflects whether OUR OWN pagination loop stopped on a full page (i.e.
 * more rows may exist beyond what this call fetched). It is unrelated to
 * `gsc_rows_not_guaranteed_complete`, which holds even for a dimensioned
 * query whose pagination was not truncated at all.
 */
export function buildSanitizedResult({ startDate, endDate, dimensions, filters, queryResult }) {
  const isAggregate = dimensions.length === 0;

  const sums = queryResult.rows.reduce(
    (acc, row) => {
      acc.clicks += row.clicks || 0;
      acc.impressions += row.impressions || 0;
      return acc;
    },
    { clicks: 0, impressions: 0 }
  );

  const base = {
    source: 'GOOGLE_SEARCH_CONSOLE_API',
    property: SITE_URL,
    start_date: startDate,
    end_date: endDate,
    dimensions,
    filters,
    query_type: isAggregate ? 'aggregate' : 'dimensioned',
    rows: queryResult.rows,
    row_count: queryResult.rows.length,
    metadata: {
      pages_fetched: queryResult.pagesFetched,
      row_limit_hit_on_last_page: queryResult.rowLimitHit,
      possibly_truncated: queryResult.rowLimitHit, // our own pagination cap — more rows may exist beyond what was fetched
      gsc_rows_not_guaranteed_complete: !isAggregate, // GSC API's own row-completeness limitation for dimensioned queries
    },
    captured_at: new Date().toISOString(),
  };

  return isAggregate
    ? { ...base, total_clicks: sums.clicks, total_impressions: sums.impressions }
    : { ...base, returned_rows_clicks: sums.clicks, returned_rows_impressions: sums.impressions };
}

/**
 * Resolves the CLI --dimensions value into a queryGSC() dimensions array.
 * The literal, case-insensitive value "none" deterministically requests an
 * AGGREGATE query (dimensions: []) — GSC's own valid "no dimension" query
 * shape, not [""] and not a dimension named "none". Unset defaults to
 * ['page'] for backward compatibility with prior CLI usage.
 */
export function resolveDimensions(dimensionsArg) {
  if (!dimensionsArg) return ['page'];
  if (String(dimensionsArg).trim().toLowerCase() === 'none') return [];
  return String(dimensionsArg).split(',').map((d) => d.trim()).filter(Boolean);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.start || !args.end) {
    console.error('Usage: node gsc-query.mjs --start=YYYY-MM-DD --end=YYYY-MM-DD [--dimensions=page,query|none] [--country=DEU] [--pageContains=/blog/] [--rowLimit=1000] [--all] [--out=file.json]');
    process.exit(1);
  }
  const dimensions = resolveDimensions(args.dimensions);
  const filters = {};
  if (args.country) filters.country = String(args.country).toLowerCase();
  if (args.pageContains) filters.page = { contains: args.pageContains };
  if (args.queryContains) filters.query = { contains: args.queryContains };

  const queryResult = await queryGSC({
    startDate: args.start,
    endDate: args.end,
    dimensions,
    filters,
    rowLimit: args.rowLimit ? Number(args.rowLimit) : 1000,
    all: Boolean(args.all),
  });

  const result = buildSanitizedResult({ startDate: args.start, endDate: args.end, dimensions, filters, queryResult });

  const output = JSON.stringify(result, null, 2);
  if (args.out) {
    writeFileSync(args.out, output, 'utf8');
    console.log(`Wrote ${result.row_count} rows (pagesFetched=${result.metadata.pages_fetched}, possiblyTruncated=${result.metadata.possibly_truncated}) to ${args.out}`);
  } else {
    console.log(output);
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || (process.argv[1] && process.argv[1].endsWith('gsc-query.mjs'))) {
  main().catch((err) => {
    console.error('gsc-query.mjs failed:', err.message);
    process.exit(1);
  });
}
