// Inject cross-service link block (e.g. on entruempelung-rastatt link
// to haushaltsaufloesung-rastatt + wohnungsaufloesung-rastatt). Reduces
// keyword cannibalization risk by signalling to Google that these 3
// pages are related entities for the same city, not duplicates.
//
// Triggered only for cities where all three service pages exist.
//
// Idempotent: skips pages that already contain class="cross-services".
//
// Run from repo root: node agent/scripts/inject-cross-service-links.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const SERVICES = [
  { prefix: 'entruempelung-',       label: 'Entrümpelung' },
  { prefix: 'haushaltsaufloesung-', label: 'Haushaltsauflösung' },
  { prefix: 'wohnungsaufloesung-',  label: 'Wohnungsauflösung' },
];

// City display map (re-used from inject-region-links pattern)
const NAMES = {
  rastatt: 'Rastatt', karlsruhe: 'Karlsruhe', 'baden-baden': 'Baden-Baden',
  gaggenau: 'Gaggenau', buehl: 'Bühl', ettlingen: 'Ettlingen',
  loffenau: 'Loffenau', achern: 'Achern', pforzheim: 'Pforzheim',
  rheinstetten: 'Rheinstetten', 'bad-herrenalb': 'Bad Herrenalb',
  'bad-wildbad': 'Bad Wildbad', gernsbach: 'Gernsbach', kuppenheim: 'Kuppenheim',
  malsch: 'Malsch', muggensturm: 'Muggensturm', sinzheim: 'Sinzheim',
  stutensee: 'Stutensee', iffezheim: 'Iffezheim', huegelsheim: 'Hügelsheim',
  bietigheim: 'Bietigheim', oetigheim: 'Ötigheim', durmersheim: 'Durmersheim',
  steinmauern: 'Steinmauern', weisenbach: 'Weisenbach', bischweier: 'Bischweier',
  'au-am-rhein': 'Au am Rhein', forbach: 'Forbach', rheinmuenster: 'Rheinmünster',
};

function buildBlock(currentService, citySlug, cityName, otherServices) {
  const items = otherServices.map(s => {
    const url = `/${s.prefix}${citySlug.replace(/\.html$/, '')}`;
    return `<li><a href="${url.replace(/\.html$/, '')}">${s.label} ${cityName}</a></li>`;
  }).join('\n      ');

  return `<section class="cross-services" aria-label="Weitere Services in ${cityName}">
    <h2 class="cross-services-title">Weitere Räumungs-Services in ${cityName}</h2>
    <p class="cross-services-sub">${currentService} ist nur eines unserer Angebote in ${cityName}. Wir bieten auch:</p>
    <ul class="cross-services-list">
      ${items}
    </ul>
  </section>`;
}

const CROSS_SERVICES_CSS = `
/* CROSS-SERVICE LINKS */
.cross-services{max-width:1200px; margin:0 auto; padding:28px 24px; border-top:1px solid var(--line,#e5dccb);}
.cross-services-title{font-family:"Fraunces","Fraunces Fallback",serif; font-weight:400; font-size:1.4rem; color:var(--ink,#1a2030); margin:0 0 8px;}
.cross-services-sub{font-size:.95rem; color:var(--muted,#4a5160); margin:0 0 14px; max-width:60ch;}
.cross-services-list{list-style:none; padding:0; margin:0; display:flex; flex-wrap:wrap; gap:10px 16px;}
.cross-services-list li{margin:0;}
.cross-services-list a{display:inline-flex; align-items:center; padding:10px 16px;
  background:var(--bg-2,#f3ede0); border:1px solid var(--line,#e5dccb); border-radius:999px;
  color:var(--ink,#1a2030); font-size:.92rem; transition:all .2s;}
.cross-services-list a:hover{background:var(--green,#5aa83a); color:#fff; border-color:var(--green,#5aa83a);}
`;

// Inject CSS into shared stylesheet once
const CSS_FILE = `${ROOT}/css/site-deferred.css`;
let css = await readFile(CSS_FILE, 'utf8');
if (!css.includes('/* CROSS-SERVICE LINKS */')) {
  css += `\n${CROSS_SERVICES_CSS}\n`;
  await writeFile(CSS_FILE, css, 'utf8');
  console.log('CSS appended to css/site-deferred.css');
}

// Build set of existing files for quick lookup
const allFiles = new Set((await readdir(ROOT)).filter(f => f.endsWith('.html')));

// Find cities that have ALL THREE service pages
function citySlugFor(filename) {
  for (const s of SERVICES) {
    if (filename.startsWith(s.prefix)) {
      return { service: s, slug: filename.slice(s.prefix.length, -'.html'.length) };
    }
  }
  return null;
}

const cities = new Map(); // citySlug -> Set of service prefixes
for (const f of allFiles) {
  const info = citySlugFor(f);
  if (!info) continue;
  if (!cities.has(info.slug)) cities.set(info.slug, new Set());
  cities.get(info.slug).add(info.service.prefix);
}

let totals = { ok: 0, alreadyHad: 0, skippedNoTrio: 0 };

for (const [citySlug, prefixes] of cities) {
  // Only process cities where ALL three services have pages
  if (prefixes.size < 3) {
    totals.skippedNoTrio++;
    continue;
  }
  if (!NAMES[citySlug]) {
    totals.skippedNoTrio++;
    continue;
  }
  const cityName = NAMES[citySlug];

  for (const s of SERVICES) {
    const file = `${s.prefix}${citySlug}.html`;
    if (!allFiles.has(file)) continue;
    const path = `${ROOT}/${file}`;
    let html = await readFile(path, 'utf8');

    if (html.includes('class="cross-services"')) {
      totals.alreadyHad++;
      continue;
    }

    const otherServices = SERVICES.filter(other => other.prefix !== s.prefix);
    const block = buildBlock(s.label, citySlug, cityName, otherServices);

    // Insert before </main>
    const idx = html.lastIndexOf('</main>');
    if (idx === -1) continue;
    html = html.slice(0, idx) + block + '\n' + html.slice(idx);
    await writeFile(path, html, 'utf8');
    totals.ok++;
  }
}

console.log();
console.log(`Cross-service blocks injected: ${totals.ok}`);
console.log(`Already had block: ${totals.alreadyHad}`);
console.log(`Cities skipped (incomplete trio): ${totals.skippedNoTrio}`);
