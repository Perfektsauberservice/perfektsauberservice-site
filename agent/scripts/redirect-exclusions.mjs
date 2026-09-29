/**
 * Derives sitemap-exclusion routes directly from netlify.toml's own
 * [[redirects]] table, instead of a second hand-maintained list.
 *
 * Parsing is intentionally narrow, not a general TOML parser: every
 * [[redirects]] block in this repo's netlify.toml uses exactly four flat
 * keys (from/to/status/force), no conditions/headers/query, no multi-line
 * values (confirmed by direct inspection, 2026-09-09) -- a line-based
 * block scan is safe here and a full TOML grammar would be unjustified
 * complexity for a format this constrained.
 *
 * A route with status 301 or 410 must never appear in the sitemap: 301
 * means the URL has moved (list the destination instead), 410 means it's
 * gone permanently. Both normalize to the same pretty-URL shape the
 * sitemap generator already uses (no leading slash, no .html suffix), so
 * "/foo" and "/foo.html" redirect variants collapse to one exclusion.
 */

const REDIRECT_BLOCK_RE = /\[\[redirects\]\]([\s\S]*?)(?=\n\[\[|\n\[[^\[]|$)/g;
const FROM_RE = /^\s*from\s*=\s*"([^"]+)"/m;
const STATUS_RE = /^\s*status\s*=\s*(\d+)/m;
const EXCLUDED_STATUSES = new Set([301, 410]);

function normalizeRoute(fromValue) {
  return fromValue.replace(/^\//, '').replace(/\.html$/, '');
}

/** Pure: netlify.toml text -> [{ from, status }] for every [[redirects]] block. */
export function parseRedirectFromStatusPairs(tomlText) {
  const pairs = [];
  for (const match of tomlText.matchAll(REDIRECT_BLOCK_RE)) {
    const block = match[1];
    const fromMatch = FROM_RE.exec(block);
    const statusMatch = STATUS_RE.exec(block);
    if (!fromMatch || !statusMatch) continue;
    pairs.push({ from: fromMatch[1], status: Number(statusMatch[1]) });
  }
  return pairs;
}

/**
 * Pure: netlify.toml text -> Set of normalized pretty-URL routes (no
 * leading slash, no .html) that must be excluded from the sitemap because
 * they are redirected (301) or gone (410) at the edge. Splat/wildcard
 * `from` values (e.g. "/agent/*") never match a literal page route and are
 * skipped -- they don't correspond to any single sitemap URL.
 */
export function deriveRedirectExclusions(tomlText) {
  const exclusions = new Set();
  for (const { from, status } of parseRedirectFromStatusPairs(tomlText)) {
    if (!EXCLUDED_STATUSES.has(status)) continue;
    if (from.includes('*')) continue;
    exclusions.add(normalizeRoute(from));
  }
  return exclusions;
}
