/**
 * update-gbp-reviews.mjs
 *
 * Fetches Perfekt Sauber Service's real Google reviews via the official
 * Google Business Profile APIs (Business Information API for profile
 * metadata, and the `mybusiness.googleapis.com/v4` reviews endpoint --
 * the only current Google API that still exposes reviews.list) and
 * writes the public-safe canonical file `data/google-reviews.json`.
 *
 * Superseded: agent/scripts/update-review-count.mjs (Google Places API
 * Legacy, patched review count/rating text directly into ~300 HTML
 * files). That script and its GitHub Action
 * (.github/workflows/pss-gmb-reviews-update.yml) are left in place for
 * history but are no longer the active review data source -- see the
 * SUPERSEDED header comment added to both.
 *
 * Auth: OAuth installed-app client + a `business.manage`-scoped refresh
 * token, both stored only as GitHub encrypted secrets (GBP_OAUTH_CLIENT_ID,
 * GBP_OAUTH_CLIENT_SECRET, GBP_OAUTH_REFRESH_TOKEN). The one-time token
 * refresh call is a POST to Google's OAuth endpoint (unavoidable -- there
 * is no GET-based way to exchange a refresh token); every actual Business
 * Profile API call this script makes is a GET. No secret, token, or
 * authorization code is ever printed or written to any file.
 *
 * Run: `node agent/scripts/update-gbp-reviews.mjs`
 * Requires env: GBP_OAUTH_CLIENT_ID, GBP_OAUTH_CLIENT_SECRET, GBP_OAUTH_REFRESH_TOKEN
 *
 * Behavior:
 * - On any API failure: exits non-zero (workflow fails visibly) and never
 *   touches the existing data/google-reviews.json -- the last good file
 *   is preserved untouched, never replaced with zeros/empty data.
 * - On success: writes the file only if its content actually changed
 *   (ignoring only the lastSuccessfulSync timestamp) -- the caller
 *   (workflow) uses this to decide whether to commit.
 *
 * The pure helpers below (mapReviews/computeAverageRating/buildOutput/
 * contentUnchanged) are exported for unit testing without any live
 * network call -- see tests/gbp-reviews-sync.test.mjs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export const ACCOUNT = 'accounts/102093374374813323400';
export const LOCATION = 'locations/10016411432319471201';
export const OUT_FILE = resolve('data/google-reviews.json');
export const RATING_WORD_TO_NUM = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export function escapeForJson(s) {
  // JSON.stringify already escapes correctly; this just guards against
  // non-string input reaching the output (defensive, not a real fix).
  return typeof s === 'string' ? s : String(s ?? '');
}

/** Maps raw mybusiness v4 review objects to the public canonical shape,
 * sorted newest-first by createTime. Pure, no network/filesystem access. */
export function mapReviews(rawReviews) {
  return rawReviews
    .map(r => ({
      displayName: escapeForJson(r.reviewer?.displayName || 'Google-Nutzer'),
      starRating: RATING_WORD_TO_NUM[r.starRating] ?? null,
      text: escapeForJson(r.comment || ''),
      date: (r.createTime || '').slice(0, 10),
      ownerReply: r.reviewReply?.comment ? escapeForJson(r.reviewReply.comment) : null,
      replyDate: r.reviewReply?.updateTime ? r.reviewReply.updateTime.slice(0, 10) : null,
      _createTime: r.createTime || '',
    }))
    .sort((a, b) => (a._createTime < b._createTime ? 1 : a._createTime > b._createTime ? -1 : 0))
    .map(({ _createTime, ...rest }) => rest);
}

/** Average of starRating across reviews, rounded to 1 decimal. Pure. */
export function computeAverageRating(reviews) {
  if (!reviews.length) return 0;
  const sum = reviews.reduce((acc, r) => acc + (r.starRating || 0), 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

/** Builds the canonical output object. Pure (lastSuccessfulSync is passed in). */
export function buildOutput(reviews, mapsUri, nowIso) {
  return {
    averageRating: computeAverageRating(reviews),
    totalReviewCount: reviews.length,
    lastSuccessfulSync: nowIso,
    directGoogleProfileUrl: mapsUri,
    reviews,
  };
}

/** True if two serialized JSON strings differ, ignoring only the
 * lastSuccessfulSync field (so a same-data daily sync is a no-op). Pure. */
export function contentUnchanged(oldContent, newContent) {
  const stripTimestamp = (s) => s.replace(/"lastSuccessfulSync":\s*"[^"]*"/, '"lastSuccessfulSync":""');
  return stripTimestamp(oldContent) === stripTimestamp(newContent);
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  console.error('Preserving previous data/google-reviews.json unchanged (if it exists). Failing workflow visibly.');
  process.exit(1);
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) fail(`OAuth token refresh failed: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.access_token) fail('OAuth token refresh returned no access_token.');
  return json.access_token;
}

async function apiGet(url, token) {
  const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()).slice(0, 300); } catch { /* ignore */ }
    fail(`GET ${url.split('?')[0]} failed: HTTP ${res.status} ${detail}`);
  }
  return res.json();
}

async function main() {
  const CLIENT_ID = process.env.GBP_OAUTH_CLIENT_ID;
  const CLIENT_SECRET = process.env.GBP_OAUTH_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GBP_OAUTH_REFRESH_TOKEN;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    fail('Missing one or more required env vars: GBP_OAUTH_CLIENT_ID, GBP_OAUTH_CLIENT_SECRET, GBP_OAUTH_REFRESH_TOKEN.');
  }

  const token = await getAccessToken(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN);

  // Real profile metadata (for the direct, place-bound "view all reviews" link) --
  // official Business Information API, GET only.
  const loc = await apiGet(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${LOCATION}?readMask=metadata`,
    token
  );
  const mapsUri = loc?.metadata?.mapsUri;
  if (!mapsUri) fail('Business Information API returned no metadata.mapsUri -- refusing to write a file with a missing profile link.');

  // Real reviews -- the official mybusiness.googleapis.com v4 endpoint is the
  // only current Google API that exposes reviews.list; GET only, paginated.
  let allReviews = [];
  let pageToken;
  let guard = 0;
  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${ACCOUNT}/${LOCATION}/reviews`);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await apiGet(url.toString(), token);
    allReviews = allReviews.concat(page.reviews || []);
    pageToken = page.nextPageToken;
    guard++;
  } while (pageToken && guard < 20);

  if (allReviews.length === 0) fail('API returned zero reviews -- refusing to overwrite existing data with an empty set (real profile has reviews).');

  const reviews = mapReviews(allReviews);
  const output = buildOutput(reviews, mapsUri, new Date().toISOString());
  const newContent = JSON.stringify(output, null, 2) + '\n';

  let unchanged = false;
  if (existsSync(OUT_FILE)) {
    unchanged = contentUnchanged(readFileSync(OUT_FILE, 'utf8'), newContent);
  }

  if (unchanged) {
    console.log('No change in review data (rating/count/reviews identical to last sync). Not writing file, workflow will not commit.');
    console.log('::set-output name=changed::false');
    process.exitCode = 0;
    return;
  }

  if (!existsSync(dirname(OUT_FILE))) mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, newContent, 'utf8');
  console.log(`Wrote ${OUT_FILE}: averageRating=${output.averageRating}, totalReviewCount=${output.totalReviewCount}`);
  console.log('::set-output name=changed::true');
}

// Only run as a script (not when imported for tests).
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/') || import.meta.url === `file:///${process.argv[1]}`.replace(/\\/g, '/')) {
  main().catch(e => fail(e?.message || String(e)));
}
