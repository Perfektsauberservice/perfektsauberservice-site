#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const REPLACEMENTS = [
  { pattern: /"foundingDate":"2025"/g, replacement: '"foundingDate":"2025"', label: 'schema:foundingDate' },
  { pattern: /"foundingDate": "2025"/g, replacement: '"foundingDate": "2025"', label: 'schema:foundingDate-pretty' },
  { pattern: /seit 2025/g, replacement: 'seit 2025', label: 'strip:seit-2023' },
  { pattern: /Gründung 2025/g, replacement: 'Gründung 2025', label: 'text:gruendung-2023' },
  { pattern: /Gewerbeanmeldung 2025/g, replacement: 'Gewerbeanmeldung 2025', label: 'text:gewerbeanmeldung-2023' },
  { pattern: /seit der Gründung 2025/g, replacement: 'seit der Gründung 2025', label: 'text:seit-gruendung-2023' },
  { pattern: /2025 in Loffenau/g, replacement: '2025 in Loffenau', label: 'text:2023-loffenau' },
  { pattern: /seit 2025 in Loffenau/g, replacement: 'seit 2025 in Loffenau', label: 'text:seit-2023-loffenau' },
];

async function listFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_archived' || e.name === 'outreach') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await listFiles(full));
    } else if (e.isFile() && (e.name.endsWith('.html') || e.name.endsWith('.mjs'))) {
      out.push(full);
    }
  }
  return out;
}

async function processFile(file) {
  const src = await fs.readFile(file, 'utf8');
  let out = src;
  const counts = {};
  let total = 0;
  for (const r of REPLACEMENTS) {
    const matches = (out.match(r.pattern) || []).length;
    if (matches > 0) {
      out = out.replace(r.pattern, r.replacement);
      counts[r.label] = matches;
      total += matches;
    }
  }
  if (total === 0) return { file, status: 'no-change', counts: {} };
  await fs.writeFile(file, out, 'utf8');
  return { file, status: 'modified', counts, total };
}

const files = await listFiles(ROOT);
const results = await Promise.all(files.map(processFile));
const modified = results.filter(r => r.status === 'modified');
const totals = {};
let totalReplacements = 0;
for (const r of modified) {
  totalReplacements += r.total;
  for (const [label, n] of Object.entries(r.counts)) {
    totals[label] = (totals[label] || 0) + n;
  }
}
console.log(`Total files scanned: ${files.length}`);
console.log(`Files modified: ${modified.length}`);
console.log(`Total replacements: ${totalReplacements}`);
console.log('\nBreakdown:');
for (const [label, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${label.padEnd(40)} ${n}`);
}
