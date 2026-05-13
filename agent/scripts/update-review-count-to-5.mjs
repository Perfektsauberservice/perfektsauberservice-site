// Update review count 4 -> 5 across all HTML files.
// Patches:
//  1. JSON-LD schema: "reviewCount":"4" -> "reviewCount":"5"
//  2. Display text: "4 Rezensionen" -> "5 Rezensionen"
//  3. Fixes duplicated "X Rezensionen · X Rezensionen" pattern on homepage
//
// Run from repo root: node agent/scripts/update-review-count-to-5.mjs

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'agent/staging', 'agent/test-output',
  'agent/tools', 'outreach/node_modules'
]);

async function walk(dir, files = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return files; }
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = full.slice(ROOT.length + 1).replaceAll('\\', '/');
    if (e.isDirectory()) {
      const skip = [...SKIP_DIRS].some(s => rel === s || rel.startsWith(s + '/'));
      if (!skip) await walk(full, files);
    } else if (e.isFile() && e.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(ROOT);
let touched = 0;
let totals = { schema: 0, display: 0, dedup: 0 };

for (const path of files) {
  let html;
  try { html = await readFile(path, 'utf8'); } catch { continue; }
  const orig = html;

  // 3. Fix dedup BEFORE single replacement so we collapse "4 · 4" first.
  html = html.replace(/(\d+) Rezensionen · \1 Rezensionen/g, (m, n) => {
    totals.dedup++;
    return `${n} Rezensionen`;
  });

  // 1. Schema reviewCount (handles tight or spaced JSON)
  html = html.replace(/"reviewCount"\s*:\s*"4"/g, () => {
    totals.schema++;
    return '"reviewCount":"5"';
  });

  // 2. Display text
  html = html.replace(/\b4 Rezensionen\b/g, () => {
    totals.display++;
    return '5 Rezensionen';
  });

  if (html !== orig) {
    await writeFile(path, html, 'utf8');
    touched++;
  }
}

console.log(`HTML files scanned: ${files.length}`);
console.log(`Files modified: ${touched}`);
console.log(`Schema reviewCount replacements: ${totals.schema}`);
console.log(`Display "X Rezensionen" replacements: ${totals.display}`);
console.log(`Dedup "X · X" fixes: ${totals.dedup}`);
