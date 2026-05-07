#!/usr/bin/env node
// Inject the leadFormSection into the 3 Ads landing pages.
// Anchor: just before <section class="contact" id="kontakt">.
// Idempotent: detects existing form via marker.

import fs from 'node:fs';
import { leadFormSection } from './lib/parts.mjs';

const MARKER = 'name="lead" method="POST"';
const ANCHOR = '<section class="contact" id="kontakt">';

const TARGETS = [
  { file: 'entruempelung-rastatt.html', city: 'Rastatt', service: 'Entrümpelung' },
  { file: 'haushaltsaufloesung-rastatt.html', city: 'Rastatt', service: 'Haushaltsauflösung' },
  { file: 'reinigung.html', city: '', service: 'Reinigung' },
];

let patched = 0, alreadyHad = 0, missing = 0;
for (const t of TARGETS) {
  if (!fs.existsSync(t.file)) { console.error('not found:', t.file); missing++; continue; }
  const txt = fs.readFileSync(t.file, 'utf8');
  if (txt.includes(MARKER)) { console.log('already had:', t.file); alreadyHad++; continue; }
  if (!txt.includes(ANCHOR)) { console.error('no anchor in:', t.file); missing++; continue; }
  const form = leadFormSection(t.city, t.service);
  const next = txt.replace(ANCHOR, form + '\n' + ANCHOR);
  fs.writeFileSync(t.file, next);
  console.log('patched:', t.file);
  patched++;
}
console.log(`\n=== patched: ${patched}, already had: ${alreadyHad}, missing: ${missing} ===`);
