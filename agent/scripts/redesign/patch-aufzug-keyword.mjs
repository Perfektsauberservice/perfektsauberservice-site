// In-place patch: replace "ohne Aufzug" with "ohne Lift" in city/service pages
// to stop accidental matching on Aufzug-related queries (lift manufacturer,
// elevator service) where PSS does not offer such services.
//
// Observed in GSC 2026-05-04/05: false-positive rankings on "aufzug kuppenheim",
// "aufzug gaggenau", "aufzugservice gaggenau", "aufzugbau kuppenheim" etc. —
// PSS is a clearance/cleaning company, not an elevator service.
//
// Cause: the price-note surcharge text "Aufpreise nur bei ... ohne Aufzug ab dem
// 2. OG (+5% bis +20%) ..." appears on ~93 city pages. "Lift" is a 100% synonym
// of "Aufzug" in German, fully understood by customers, but doesn't trigger the
// elevator-related queries.
//
// Skipped: 2 blog posts that are intentionally about clearance without elevators:
//   - blog/entruempelung-bischweier-ohne-aufzug--kosten-und-tipps.html
//   - blog/entruempelung-elchesheim-illingen-entruempelung-ohne-aufzug--kosten-und.html
// These are valid content for the "Entrümpelung ohne Aufzug" keyword.
//
// Run from repo root: node agent/scripts/redesign/patch-aufzug-keyword.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// Skip blog directory entirely — those posts may legitimately discuss elevators.
const SKIP_DIRS = new Set(['blog', 'agent', 'node_modules', '_archived', '_backup_2026-05-03', '_preview', 'images']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
let patched = 0, untouched = 0, replacements = 0;

for (const f of files) {
  const orig = fs.readFileSync(f, 'utf8');
  // Replace both inflected forms. "Aufzug" (nominative) is what appears in price-note.
  // Also handle "Aufzugs" (genitive, less common but possible).
  const next = orig
    .replace(/ohne Aufzug\b/g, 'ohne Lift')
    .replace(/ohne Aufzugs\b/g, 'ohne Lift');

  if (next !== orig) {
    const diff = (orig.match(/ohne Aufzugs?\b/g) || []).length;
    fs.writeFileSync(f, next);
    patched++;
    replacements += diff;
  } else {
    untouched++;
  }
}

console.log(`✓ files patched: ${patched}`);
console.log(`  · "ohne Aufzug" → "ohne Lift" replacements: ${replacements}`);
console.log(`untouched: ${untouched}`);
