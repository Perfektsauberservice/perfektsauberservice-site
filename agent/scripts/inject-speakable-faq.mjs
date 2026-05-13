// Inject Speakable schema into every FAQPage entity across HTML files.
// Adds a SpeakableSpecification with CSS selectors that match the
// rendered FAQ markup (summary = question, .ans = answer).
//
// Idempotent: skips FAQPage entities that already contain "speakable".
//
// Run from repo root: node agent/scripts/inject-speakable-faq.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'agent/staging', 'agent/test-output',
  'agent/tools', 'outreach/node_modules'
]);

const SPEAKABLE_COMPACT = '"speakable":{"@type":"SpeakableSpecification","cssSelector":[".faq summary",".faq .ans"]},';
const SPEAKABLE_FORMATTED_INNER = [
  '"speakable": {',
  '  "@type": "SpeakableSpecification",',
  '  "cssSelector": [".faq summary", ".faq .ans"]',
  '},'
];

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
let totals = { compact: 0, formatted: 0, alreadyHad: 0 };

for (const path of files) {
  let html;
  try { html = await readFile(path, 'utf8'); } catch { continue; }
  const orig = html;

  // Compact: "@type":"FAQPage","mainEntity":[ ... ]
  html = html.replace(
    /("@type":"FAQPage",)(?!"speakable")/g,
    (m, prefix) => {
      totals.compact++;
      return `${prefix}${SPEAKABLE_COMPACT}`;
    }
  );

  // Formatted: "@type": "FAQPage",[\r]\n  "mainEntity": [ ... ]
  // (\r?\n handles CRLF line endings on Windows-authored files.)
  html = html.replace(
    /("@type":\s*"FAQPage",)(\r?\n)([ \t]*)(?!"speakable")/g,
    (m, prefix, nl, indent) => {
      totals.formatted++;
      const block = SPEAKABLE_FORMATTED_INNER.map(l => `${indent}${l}`).join(nl);
      return `${prefix}${nl}${block}${nl}${indent}`;
    }
  );

  if (html !== orig) {
    await writeFile(path, html, 'utf8');
    touched++;
  } else if (orig.includes('"@type":"FAQPage"') || orig.includes('"@type": "FAQPage"')) {
    if (orig.includes('"speakable"')) totals.alreadyHad++;
  }
}

console.log(`HTML files scanned: ${files.length}`);
console.log(`Files modified: ${touched}`);
console.log(`Compact FAQPage injections: ${totals.compact}`);
console.log(`Formatted FAQPage injections: ${totals.formatted}`);
console.log(`Already had speakable (skipped): ${totals.alreadyHad}`);
