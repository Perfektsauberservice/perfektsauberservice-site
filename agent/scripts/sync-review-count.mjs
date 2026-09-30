/**
 * sync-review-count.mjs
 *
 * Keeps every hardcoded Google review count on the site in step with the
 * canonical data/google-reviews.json (written daily by
 * update-gbp-reviews.mjs from the official Business Profile API).
 *
 * Rewrites only these exact, known patterns:
 *   - trust bar / hero:   "Google · <n> Rezensionen"
 *   - info box heading:   "Google-Bewertung (<n> Rezensionen)"
 *   - JSON-LD:            "reviewCount": "<n>"  (AggregateRating)
 *   - widget mount:       data-fallback-count="<n>"
 *
 * Only the number changes; rating text and markup are left untouched.
 * Runs in the pss-gbp-reviews-sync workflow; safe to run repeatedly (a
 * no-op when every page already matches).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'agent', '.git', '.claude', '.netlify', 'tests']);

export const PATTERNS = [
  /(Google · )\d+( Rezensionen)/g,
  /(Google-Bewertung \()\d+( Rezensionen\))/g,
  /("reviewCount"\s*:\s*"?)\d+("?)/g,
  /(data-fallback-count=")\d+(")/g,
];

export function applyCount(html, count) {
  let out = html;
  for (const re of PATTERNS) out = out.replace(re, `$1${count}$2`);
  return out;
}

function htmlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...htmlFiles(full));
    else if (extname(entry) === '.html') files.push(full);
  }
  return files;
}

function main() {
  const data = JSON.parse(readFileSync(join(ROOT, 'data/google-reviews.json'), 'utf8'));
  const count = data.totalReviewCount;
  if (!Number.isInteger(count) || count < 1) {
    console.error(`Invalid totalReviewCount (${count}) -- nothing changed.`);
    process.exit(1);
  }
  let changed = 0;
  for (const file of htmlFiles(ROOT)) {
    const html = readFileSync(file, 'utf8');
    const updated = applyCount(html, count);
    if (updated !== html) {
      writeFileSync(file, updated, 'utf8');
      changed++;
    }
  }
  console.log(`Review count ${count}: updated ${changed} page(s).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
