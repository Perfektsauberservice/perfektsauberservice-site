// Make every city service page brand itself as a CITY-LOCAL business.
// The current nav subtitle is hardcoded "Service · Rastatt" on every
// page, which signals to AI engines that PSS is fundamentally a
// Rastatt company. Fix: per-page subtitle that matches the city in
// the URL slug.
//
// Additionally, add a one-line "Erfahrung in [Stadt] seit 2025"
// authority signal in the strip section if missing.
//
// Run from repo root: node agent/scripts/city-brand-identity.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const SERVICE_PREFIXES = [
  'entruempelung-', 'haushaltsaufloesung-', 'wohnungsaufloesung-',
  'bueroaufloesung-', 'bueroreinigung-', 'endreinigung-',
  'unterhaltsreinigung-', 'grundreinigung-', 'bauschlussreinigung-',
];

const SLUG_TO_DISPLAY = {
  'baden-baden': 'Baden-Baden',
  'baden-baden-geroldsau': 'Baden-Baden',
  'baden-baden-innenstadt': 'Baden-Baden',
  'baden-baden-lichtental': 'Baden-Baden',
  'baden-baden-oos': 'Baden-Baden',
  'baden-baden-steinbach': 'Baden-Baden',
  'karlsruhe-durlach': 'Karlsruhe',
  'karlsruhe-hagsfeld': 'Karlsruhe',
  'karlsruhe-knielingen': 'Karlsruhe',
  'karlsruhe-muehlburg': 'Karlsruhe',
  'karlsruhe-nordstadt': 'Karlsruhe',
  'karlsruhe-oststadt': 'Karlsruhe',
  'karlsruhe-suedstadt': 'Karlsruhe',
  'karlsruhe-weststadt': 'Karlsruhe',
  'pforzheim-broetzingen': 'Pforzheim',
  'pforzheim-buckenberg': 'Pforzheim',
  'pforzheim-dillweissenstein': 'Pforzheim',
  'pforzheim-eutingen': 'Pforzheim',
  'pforzheim-innenstadt': 'Pforzheim',
  'pforzheim-nordstadt': 'Pforzheim',
  'rastatt-niederbuehl': 'Rastatt',
  'rastatt-ottersdorf': 'Rastatt',
  'rastatt-plittersdorf': 'Rastatt',
  'rastatt-rauental': 'Rastatt',
  'rastatt-wintersdorf': 'Rastatt',
  'au-am-rhein': 'Au am Rhein',
  'bad-herrenalb': 'Bad Herrenalb',
  'bad-wildbad': 'Bad Wildbad',
  'huegelsheim': 'Hügelsheim',
  'oetigheim': 'Ötigheim',
  'rheinmuenster': 'Rheinmünster',
  'buehl': 'Bühl',
  'region': 'Region',
};

function slugToDisplay(slug) {
  if (SLUG_TO_DISPLAY[slug]) return SLUG_TO_DISPLAY[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function parseFile(filename) {
  for (const p of SERVICE_PREFIXES) {
    if (filename.startsWith(p)) {
      return { service: p, slug: filename.slice(p.length, -'.html'.length) };
    }
  }
  return null;
}

const allFiles = (await readdir(ROOT)).filter(f => f.endsWith('.html')).sort();
let totalNavUpdates = 0;
let totalAuthorityUpdates = 0;
let totalFiles = 0;

for (const file of allFiles) {
  const info = parseFile(file);
  if (!info) continue;
  const city = slugToDisplay(info.slug);
  const path = `${ROOT}/${file}`;
  let html = await readFile(path, 'utf8');
  const orig = html;

  // Update nav-brand subtitle "Service · Rastatt" → "Service · [City]"
  html = html.replace(
    /<span class="sub">Service · [^<]+<\/span>/g,
    `<span class="sub">Service · ${city}</span>`
  );
  if (html !== orig) totalNavUpdates++;

  // Add authority signal to strip — only if not already present
  // Strip has format: <div class="strip-row"><span>...</span></div>
  // Insert "Erfahrung in [City]" badge after first child span if missing
  if (!html.includes(`Aktiv in ${city}`) && !html.includes(`<b>Lokal in ${city}`)) {
    const before = html;
    html = html.replace(
      /(<div class="strip-row">)\s*(<span>)/,
      `$1\n    <span><b>Lokal in ${city}</b> · seit 2025</span>\n    $2`
    );
    if (html !== before) totalAuthorityUpdates++;
  }

  if (html !== orig) {
    await writeFile(path, html, 'utf8');
    totalFiles++;
  }
}

console.log(`Files modified: ${totalFiles}`);
console.log(`Nav subtitle updates: ${totalNavUpdates}`);
console.log(`Authority signal additions (strip): ${totalAuthorityUpdates}`);
