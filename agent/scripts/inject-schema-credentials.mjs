#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const ID_ANCHOR = /"@id":\s*"https:\/\/www\.google\.com\/maps\?cid=10440757061765338764#organization"/g;

const CREDENTIALS_FIELDS = ',"foundingDate":"2025","founder":{"@type":"Person","name":"Laura Craciun","jobTitle":"Inhaberin"},"hasCredential":{"@type":"EducationalOccupationalCredential","credentialCategory":"license","name":"Gewerbeanmeldung gemäß Gewerbeordnung"}';

async function listHtmlFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_archived' || e.name === 'redesign' || e.name === 'outreach') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await listHtmlFiles(full));
    } else if (e.isFile() && e.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

async function processFile(file) {
  const src = await fs.readFile(file, 'utf8');
  if (!ID_ANCHOR.test(src)) return { file, status: 'no-anchor', count: 0 };
  ID_ANCHOR.lastIndex = 0;
  if (src.includes('"foundingDate":"2025"') && src.includes('"hasCredential"')) {
    return { file, status: 'already-injected', count: 0 };
  }
  let count = 0;
  const out = src.replace(ID_ANCHOR, (m) => {
    count++;
    return m + CREDENTIALS_FIELDS;
  });
  if (count === 0) return { file, status: 'no-anchor', count: 0 };
  await fs.writeFile(file, out, 'utf8');
  return { file, status: 'injected', count };
}

const files = await listHtmlFiles(ROOT);
const results = await Promise.all(files.map(processFile));
const injected = results.filter(r => r.status === 'injected');
const already = results.filter(r => r.status === 'already-injected');
const noAnchor = results.filter(r => r.status === 'no-anchor');
const totalInjections = injected.reduce((s, r) => s + r.count, 0);

console.log(`Total HTML files scanned: ${files.length}`);
console.log(`Files with credentials injected: ${injected.length} (total injection points: ${totalInjections})`);
console.log(`Files already injected (skipped): ${already.length}`);
console.log(`Files without LocalBusiness anchor: ${noAnchor.length}`);
if (injected.length > 0) {
  console.log('\nFirst 5 modified files:');
  injected.slice(0, 5).forEach(r => console.log(`  ${path.relative(ROOT, r.file)} (${r.count}x)`));
}
