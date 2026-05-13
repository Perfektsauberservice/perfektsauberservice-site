// Inject "sameAs" array into LocalBusiness schema across HTML files.
// Targets two formats:
//   (a) City pages — compact JSON-LD on one line, LocalBusiness is nested
//       as "provider" inside a Service entity.
//   (b) Homepage / pages where LocalBusiness is a top-level formatted entity.
//
// Idempotent: skips files where "sameAs" already appears inside the
// LocalBusiness block.
//
// Reads the URL list from URLS below. Re-run safe when adding new URLs.
//
// Run from repo root: node agent/scripts/inject-sameas-schema.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const URLS = [
  'https://www.google.com/maps?cid=10440757061765338764',
  'https://www.kleinanzeigen.de/pro/PerfektSauberService',
  'https://www.instagram.com/perfektsauberservice',
  'https://www.facebook.com/share/18ioBeB6fa/',
];

const ROOT = resolve(import.meta.dirname, '..', '..');
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'agent/staging', 'agent/test-output',
  'agent/tools', 'outreach/node_modules'
]);

const SAMEAS_COMPACT = `"sameAs":[${URLS.map(u => JSON.stringify(u)).join(',')}],`;
const SAMEAS_FORMATTED = [
  '  "sameAs": [',
  ...URLS.map((u, i) => `    ${JSON.stringify(u)}${i < URLS.length - 1 ? ',' : ''}`),
  '  ],'
].join('\n');

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

function injectCompact(html) {
  // (a) Update existing compact sameAs array in-place if it appears between
  //     LocalBusiness props and aggregateRating.
  // (b) Otherwise insert a new sameAs before aggregateRating.
  let count = 0;

  // Pass 1: replace existing compact "sameAs":[...] inside LocalBusiness scope.
  html = html.replace(
    /("@type":"LocalBusiness"[^[]*?,)"sameAs":\[[^\]]*\](,)/g,
    (m, prefix, comma) => {
      count++;
      return `${prefix}${SAMEAS_COMPACT.slice(0, -1)}${comma}`;
    }
  );

  // Pass 2: insert before aggregateRating where no sameAs exists yet.
  html = html.replace(
    /("@type":"LocalBusiness"[^[]*?)(,"aggregateRating":\{"@type":"AggregateRating")/g,
    (m, prefix, suffix) => {
      if (prefix.includes('"sameAs"')) return m;
      count++;
      return `${prefix},${SAMEAS_COMPACT.slice(0, -1)}${suffix}`;
    }
  );

  return { html, count };
}

function injectFormatted(html) {
  // (a) Update existing formatted sameAs block.
  // (b) Otherwise insert a new sameAs block before aggregateRating.
  let count = 0;

  // Pass 1: replace existing formatted "sameAs": [ ... ], block inside
  // LocalBusiness scope.
  html = html.replace(
    /("@type":\s*"LocalBusiness"[\s\S]*?)\n(\s*)"sameAs":\s*\[[\s\S]*?\],?\n/g,
    (m, prefix, indent) => {
      count++;
      const block = [
        `${indent}"sameAs": [`,
        ...URLS.map((u, i) => `${indent}  ${JSON.stringify(u)}${i < URLS.length - 1 ? ',' : ''}`),
        `${indent}],`
      ].join('\n');
      return `${prefix}\n${block}\n`;
    }
  );

  // Pass 2: insert before aggregateRating where no sameAs exists yet.
  html = html.replace(
    /("@type":\s*"LocalBusiness"[\s\S]*?)\n(\s*)"aggregateRating":\s*\{/g,
    (m, prefix, indent) => {
      if (prefix.includes('"sameAs"')) return m;
      count++;
      const block = [
        `${indent}"sameAs": [`,
        ...URLS.map((u, i) => `${indent}  ${JSON.stringify(u)}${i < URLS.length - 1 ? ',' : ''}`),
        `${indent}],`
      ].join('\n');
      return `${prefix}\n${block}\n${indent}"aggregateRating": {`;
    }
  );

  return { html, count };
}

const files = await walk(ROOT);
let touched = 0;
let totals = { compact: 0, formatted: 0, alreadyHad: 0, noMatch: 0 };

for (const path of files) {
  let html;
  try { html = await readFile(path, 'utf8'); } catch { continue; }
  const orig = html;

  if (!html.includes('"@type":"LocalBusiness"') && !html.includes('"@type": "LocalBusiness"')) {
    continue;
  }

  // Already has sameAs anywhere in a LocalBusiness block? Skip.
  // (Crude check — refine if false-positives appear.)
  const hadBefore = html.includes('"sameAs"');

  const c = injectCompact(html);
  html = c.html;
  totals.compact += c.count;

  const f = injectFormatted(html);
  html = f.html;
  totals.formatted += f.count;

  if (html !== orig) {
    await writeFile(path, html, 'utf8');
    touched++;
  } else if (hadBefore) {
    totals.alreadyHad++;
  } else {
    totals.noMatch++;
  }
}

console.log(`HTML files with LocalBusiness scanned`);
console.log(`Files modified: ${touched}`);
console.log(`Compact-format injections: ${totals.compact}`);
console.log(`Formatted-multiline injections: ${totals.formatted}`);
console.log(`Files that already had sameAs (skipped): ${totals.alreadyHad}`);
console.log(`Files matched LocalBusiness but no inject point (review): ${totals.noMatch}`);
