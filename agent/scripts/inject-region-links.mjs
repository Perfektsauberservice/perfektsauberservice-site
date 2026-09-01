// Inject "Auch in der Region" cross-link block at the bottom of each
// city/service page. Transfers PageRank from low-volume village pages
// (already ranking 1-10 on village queries) to high-volume city pages
// that need a boost (Karlsruhe, Rastatt, Baden-Baden — pos 9-58).
//
// For every page, the section lists 4-5 same-service neighbour cities
// using the same filename pattern (entruempelung-X, haushalts-X, etc.)
// so the link target is guaranteed to exist.
//
// Idempotent: skips pages that already contain class="region-links".
//
// Run from repo root: node agent/scripts/inject-region-links.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

// City display names by slug used in filenames.
const NAMES = {
  rastatt: 'Rastatt',
  karlsruhe: 'Karlsruhe',
  'baden-baden': 'Baden-Baden',
  gaggenau: 'Gaggenau',
  buehl: 'Bühl',
  ettlingen: 'Ettlingen',
  loffenau: 'Loffenau',
  achern: 'Achern',
  pforzheim: 'Pforzheim',
  rheinstetten: 'Rheinstetten',
  'bad-herrenalb': 'Bad Herrenalb',
  'bad-wildbad': 'Bad Wildbad',
  gernsbach: 'Gernsbach',
  kuppenheim: 'Kuppenheim',
  malsch: 'Malsch',
  muggensturm: 'Muggensturm',
  sinzheim: 'Sinzheim',
  stutensee: 'Stutensee',
  iffezheim: 'Iffezheim',
  huegelsheim: 'Hügelsheim',
  bietigheim: 'Bietigheim',
  oetigheim: 'Ötigheim',
  durmersheim: 'Durmersheim',
  steinmauern: 'Steinmauern',
  weisenbach: 'Weisenbach',
  bischweier: 'Bischweier',
  'au-am-rhein': 'Au am Rhein',
  forbach: 'Forbach',
  rheinmuenster: 'Rheinmünster',
  'pforzheim-broetzingen': 'Pforzheim-Brötzingen',
  'pforzheim-buckenberg': 'Pforzheim-Buckenberg',
  'pforzheim-dillweissenstein': 'Pforzheim-Dillweißenstein',
  'pforzheim-eutingen': 'Pforzheim-Eutingen',
  'pforzheim-innenstadt': 'Pforzheim-Innenstadt',
  'pforzheim-nordstadt': 'Pforzheim-Nordstadt',
  'karlsruhe-durlach': 'Karlsruhe-Durlach',
  'karlsruhe-muehlburg': 'Karlsruhe-Mühlburg',
  'karlsruhe-nordstadt': 'Karlsruhe-Nordstadt',
  'karlsruhe-oststadt': 'Karlsruhe-Oststadt',
  'karlsruhe-suedstadt': 'Karlsruhe-Südstadt',
  'karlsruhe-weststadt': 'Karlsruhe-Weststadt',
  'rastatt-niederbuehl': 'Rastatt-Niederbühl',
  'rastatt-ottersdorf': 'Rastatt-Ottersdorf',
  'rastatt-plittersdorf': 'Rastatt-Plittersdorf',
  'rastatt-rauental': 'Rastatt-Rauental',
  'rastatt-wintersdorf': 'Rastatt-Wintersdorf',
  durlach: 'Karlsruhe-Durlach',
  plittersdorf: 'Rastatt-Plittersdorf',
};

// For each city slug, an ordered list of nearby slugs to link out to.
// First 2 are big cities to drain authority toward, then 2-3 nearby
// villages so the block reads natural.
const NEIGHBOURS = {
  // Big cities — link to other big cities + 2-3 villages
  rastatt:        ['karlsruhe', 'baden-baden', 'gaggenau', 'kuppenheim'],
  karlsruhe:      ['rastatt', 'ettlingen', 'rheinstetten', 'stutensee', 'malsch'],
  'baden-baden':  ['rastatt', 'buehl', 'sinzheim', 'gaggenau'],
  gaggenau:       ['rastatt', 'kuppenheim', 'loffenau', 'gernsbach'],
  buehl:          ['baden-baden', 'sinzheim', 'achern', 'bietigheim'],
  ettlingen:      ['karlsruhe', 'malsch', 'rheinstetten', 'stutensee'],
  pforzheim:      ['karlsruhe', 'bad-wildbad', 'bad-herrenalb', 'stutensee'],
  achern:         ['baden-baden', 'buehl', 'sinzheim', 'rheinmuenster'],
  // Mid-sized
  rheinstetten:   ['karlsruhe', 'ettlingen', 'rastatt', 'durmersheim'],
  stutensee:      ['karlsruhe', 'ettlingen', 'rastatt'],
  sinzheim:       ['baden-baden', 'buehl', 'rastatt', 'achern'],
  malsch:         ['karlsruhe', 'ettlingen', 'rastatt'],
  // Villages around Rastatt — drain to Rastatt + Karlsruhe + Baden-Baden
  loffenau:       ['rastatt', 'gaggenau', 'gernsbach', 'baden-baden'],
  gernsbach:      ['rastatt', 'gaggenau', 'loffenau', 'baden-baden'],
  'bad-herrenalb':['karlsruhe', 'gernsbach', 'pforzheim', 'rastatt'],
  'bad-wildbad':  ['pforzheim', 'karlsruhe', 'bad-herrenalb'],
  kuppenheim:     ['rastatt', 'gaggenau', 'baden-baden', 'muggensturm'],
  muggensturm:    ['rastatt', 'kuppenheim', 'malsch', 'karlsruhe'],
  iffezheim:      ['rastatt', 'baden-baden', 'huegelsheim', 'karlsruhe'],
  huegelsheim:    ['rastatt', 'iffezheim', 'baden-baden', 'karlsruhe'],
  bietigheim:     ['rastatt', 'durmersheim', 'oetigheim', 'karlsruhe'],
  oetigheim:      ['rastatt', 'bietigheim', 'muggensturm', 'karlsruhe'],
  durmersheim:    ['karlsruhe', 'rheinstetten', 'rastatt', 'oetigheim'],
  steinmauern:    ['rastatt', 'iffezheim', 'oetigheim', 'karlsruhe'],
  weisenbach:     ['gaggenau', 'gernsbach', 'rastatt', 'forbach'],
  bischweier:     ['rastatt', 'kuppenheim', 'gaggenau', 'baden-baden'],
  'au-am-rhein':  ['rastatt', 'iffezheim', 'baden-baden', 'karlsruhe'],
  forbach:        ['gaggenau', 'gernsbach', 'weisenbach', 'baden-baden'],
  rheinmuenster:  ['buehl', 'achern', 'baden-baden', 'rastatt'],
  // Pforzheim sub-areas — link to Pforzheim main + Karlsruhe
  'pforzheim-broetzingen':       ['pforzheim', 'karlsruhe', 'bad-wildbad'],
  'pforzheim-buckenberg':        ['pforzheim', 'karlsruhe', 'bad-wildbad'],
  'pforzheim-dillweissenstein':  ['pforzheim', 'karlsruhe', 'bad-wildbad'],
  'pforzheim-eutingen':          ['pforzheim', 'karlsruhe', 'bad-wildbad'],
  'pforzheim-innenstadt':        ['pforzheim', 'karlsruhe', 'bad-wildbad'],
  'pforzheim-nordstadt':         ['pforzheim', 'karlsruhe', 'bad-wildbad'],
  // Karlsruhe sub-districts — link back to Karlsruhe main + adjacent
  'karlsruhe-durlach':    ['karlsruhe', 'ettlingen', 'stutensee'],
  'karlsruhe-muehlburg':  ['karlsruhe', 'rheinstetten', 'ettlingen'],
  'karlsruhe-nordstadt':  ['karlsruhe', 'stutensee', 'ettlingen'],
  'karlsruhe-oststadt':   ['karlsruhe', 'durlach', 'ettlingen'],
  'karlsruhe-suedstadt':  ['karlsruhe', 'ettlingen', 'rheinstetten'],
  'karlsruhe-weststadt':  ['karlsruhe', 'rheinstetten', 'ettlingen'],
  // Rastatt sub-districts — link back to Rastatt main + neighbours
  'rastatt-niederbuehl':  ['rastatt', 'kuppenheim', 'muggensturm'],
  'rastatt-ottersdorf':   ['rastatt', 'iffezheim', 'plittersdorf'],
  'rastatt-plittersdorf': ['rastatt', 'iffezheim', 'au-am-rhein'],
  'rastatt-rauental':     ['rastatt', 'kuppenheim', 'muggensturm'],
  'rastatt-wintersdorf':  ['rastatt', 'iffezheim', 'au-am-rhein'],
};

const SERVICE_PREFIXES = ['entruempelung-', 'haushaltsaufloesung-', 'wohnungsaufloesung-'];
const SERVICE_LABELS = {
  'entruempelung-':       'Entrümpelung',
  'haushaltsaufloesung-': 'Haushaltsauflösung',
  'wohnungsaufloesung-':  'Wohnungsauflösung',
};

function parseFile(filename) {
  for (const prefix of SERVICE_PREFIXES) {
    if (filename.startsWith(prefix)) {
      const slug = filename.slice(prefix.length, -'.html'.length);
      return { prefix, slug, service: SERVICE_LABELS[prefix] };
    }
  }
  return null;
}

function buildRegionBlock({ prefix, slug, service }, allFilenames) {
  const neighbours = NEIGHBOURS[slug] || [];
  if (!neighbours.length) return null;

  // Only emit links to files that actually exist on disk.
  const links = neighbours
    .map(n => ({ slug: n, name: NAMES[n], file: `${prefix}${n}.html` }))
    .filter(n => n.name && allFilenames.has(n.file));
  if (links.length < 2) return null;

  const items = links
    .map(n => `<li><a href="/${n.file.replace(/\.html$/, '')}">${service} ${n.name}</a></li>`)
    .join('\n      ');

  return `<section class="region-links" aria-label="${service} in der Region">
    <h2 class="region-links-title">${service} in der Region</h2>
    <ul class="region-links-list">
      ${items}
    </ul>
  </section>`;
}

const REGION_CSS = `<style>
.region-links{max-width:1200px; margin:0 auto; padding:32px 24px 16px; border-top:1px solid var(--line,#e5dccb);}
.region-links-title{font-family:"Geist Mono",monospace; font-size:.72rem; letter-spacing:.18em; text-transform:uppercase; color:var(--muted,#4a5160); margin:0 0 14px; font-weight:500;}
.region-links-list{list-style:none; padding:0; margin:0; display:flex; flex-wrap:wrap; gap:8px 14px;}
.region-links-list li{margin:0;}
.region-links-list a{color:var(--blue,#1d6dd6); text-decoration:none; font-size:.92rem; border-bottom:1px dotted transparent; transition:border-color .15s;}
.region-links-list a:hover{border-bottom-color:var(--blue,#1d6dd6);}
</style>
`;

// Read all city/service HTML files
const files = (await readdir(ROOT))
  .filter(f => f.endsWith('.html'))
  .filter(f => SERVICE_PREFIXES.some(p => f.startsWith(p)))
  .sort();

const filenameSet = new Set(files);

// Inject CSS once into css/site-deferred.css? Or inline per page?
// Inline per page would bloat. Let's add it to site-deferred once.
const CSS_FILE = `${ROOT}/css/site-deferred.css`;
let css = await readFile(CSS_FILE, 'utf8');
const CSS_MARKER = '/* REGION LINKS */';
if (!css.includes(CSS_MARKER)) {
  css += `\n${CSS_MARKER}\n${REGION_CSS.replace(/^<style>|<\/style>\n?$/g, '').trim()}\n`;
  await writeFile(CSS_FILE, css, 'utf8');
  console.log('CSS appended to css/site-deferred.css');
}

let totals = { ok: 0, alreadyHad: 0, noConfig: 0, noAnchor: 0 };

for (const file of files) {
  const path = `${ROOT}/${file}`;
  let html = await readFile(path, 'utf8');

  if (html.includes('class="region-links"')) {
    totals.alreadyHad++;
    continue;
  }

  const info = parseFile(file);
  if (!info) continue;
  const block = buildRegionBlock(info, filenameSet);
  if (!block) {
    console.log(`SKIP (no neighbour config): ${file}`);
    totals.noConfig++;
    continue;
  }

  // Insert before </main>
  const idx = html.lastIndexOf('</main>');
  if (idx === -1) {
    console.log(`SKIP (no </main>): ${file}`);
    totals.noAnchor++;
    continue;
  }

  html = html.slice(0, idx) + block + '\n' + html.slice(idx);
  await writeFile(path, html, 'utf8');
  totals.ok++;
}

console.log();
console.log(`Pages with region block injected: ${totals.ok}`);
console.log(`Already had block (skipped): ${totals.alreadyHad}`);
console.log(`No neighbour config (skipped): ${totals.noConfig}`);
console.log(`No </main> anchor (skipped): ${totals.noAnchor}`);
