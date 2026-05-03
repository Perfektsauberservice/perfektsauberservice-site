// Rebuild gallery sections on all city pages using splitscreen composites
// (real vorher/nachher photos with built-in VORHER|NACHHER overlay labels).
//
// Per-city splitscreen inventory in images/splitscreen/:
//   keller-rastatt:    3   (basement Rastatt — incl. one garage)
//   keller-badenbaden: 9   (basement Baden-Baden)
//   wohnung-rastatt:   4   (apartment Rastatt)
//   wohnung-badenbaden:1   (apartment Baden-Baden)
//   wohnung-ettlingen: 11  (apartment Ettlingen)
//   wohnung-karlsruhe: 5   (apartment Karlsruhe)
//   wohnung-gaggenau:  5   (apartment Gaggenau)
//
// Strategy:
//  • Cities WITH local splitscreens (rastatt, baden-baden, ettlingen, karlsruhe,
//    gaggenau): use LOCAL ones; gallery title stays "Beispiele aus unseren Räumungen
//    in [Stadt]".
//  • Cities WITHOUT local splitscreens (achern, buehl, pforzheim, ...): use a
//    curated regional pool (Mittelbaden mix); gallery title changes to "Beispiele
//    aus der Region (Mittelbaden / Karlsruhe)" and the description states the
//    photos are from neighbouring jobs, not the city itself.
//
// The service prefix (entruempelung, wohnungsaufloesung, kellerentruempelung,
// garagenentruempelung, dachbodenentruempelung, haushaltsaufloesung,
// nachlassaufloesung, gewerberaeumung, bueroaufloesung, bueroreinigung,
// fensterreinigung, grundreinigung, endreinigung, unterhaltsreinigung,
// hausmeisterservice, messi-wohnung) decides which subset of the local pool
// is preferred (keller vs. wohnung).

import fs from 'node:fs';
import path from 'node:path';

const REPO = 'C:/Users/laral/Documents/proiect 1 claude code/perfektsauberservice-site-main';

// Per-city splitscreen counts
const LOCAL = {
  'rastatt':     { keller: 3, wohnung: 4 },
  'baden-baden': { keller: 9, wohnung: 1, slug: 'badenbaden' },
  'ettlingen':   { wohnung: 11 },
  'karlsruhe':   { wohnung: 5 },
  'gaggenau':    { wohnung: 5 },
};

// Regional pool: a curated 6-card mix from across the region for cities with
// no local photos. Hand-picked variety: 2 keller + 4 wohnung from different cities.
const REGIONAL = [
  { folder: 'wohnung-ettlingen',   n: 1 },
  { folder: 'wohnung-rastatt',     n: 1 },
  { folder: 'keller-rastatt',      n: 1 },
  { folder: 'wohnung-karlsruhe',   n: 1 },
  { folder: 'wohnung-gaggenau',    n: 1 },
  { folder: 'keller-badenbaden',   n: 1 },
];

// Service → preferred subset. Default: take whatever is local.
const SERVICE_PREF = {
  'kellerentruempelung': ['keller'],
  'dachbodenentruempelung': ['keller'],
  'garagenentruempelung': ['keller'],         // keller-rastatt-3 is actually a garage
  'wohnungsaufloesung': ['wohnung'],
  'haushaltsaufloesung': ['wohnung', 'keller'],
  'nachlassaufloesung': ['wohnung', 'keller'],
  'messi-wohnung': ['wohnung'],
  'entruempelung': ['wohnung', 'keller'],
  'gewerberaeumung': ['wohnung', 'keller'],
  'bueroaufloesung': ['wohnung'],
  'bueroreinigung': ['wohnung'],
  'fensterreinigung': ['wohnung'],
  'grundreinigung': ['wohnung'],
  'endreinigung': ['wohnung'],
  'unterhaltsreinigung': ['wohnung'],
  'hausmeisterservice': ['wohnung'],
};

// Cities pages exist for (used to extract city from filename)
const ALL_CITIES = [
  'achern','au-am-rhein','bad-herrenalb','bad-wildbad','baden-baden','bietigheim',
  'bischweier','buehl','durmersheim','elchesheim-illingen','ettlingen','forbach',
  'gaggenau','gernsbach','huegelsheim','iffezheim','karlsruhe','karlsruhe-durlach',
  'kuppenheim','loffenau','malsch','muggensturm','oetigheim','pforzheim','rastatt',
  'rheinmuenster','rheinstetten','sinzheim','steinmauern','stutensee','weisenbach',
];

const CITY_LABEL = {
  'achern': 'Achern', 'au-am-rhein': 'Au am Rhein', 'bad-herrenalb': 'Bad Herrenalb',
  'bad-wildbad': 'Bad Wildbad', 'baden-baden': 'Baden-Baden', 'bietigheim': 'Bietigheim',
  'bischweier': 'Bischweier', 'buehl': 'Bühl', 'durmersheim': 'Durmersheim',
  'elchesheim-illingen': 'Elchesheim-Illingen', 'ettlingen': 'Ettlingen',
  'forbach': 'Forbach', 'gaggenau': 'Gaggenau', 'gernsbach': 'Gernsbach',
  'huegelsheim': 'Hügelsheim', 'iffezheim': 'Iffezheim', 'karlsruhe': 'Karlsruhe',
  'karlsruhe-durlach': 'Karlsruhe-Durlach', 'kuppenheim': 'Kuppenheim',
  'loffenau': 'Loffenau', 'malsch': 'Malsch', 'muggensturm': 'Muggensturm',
  'oetigheim': 'Ötigheim', 'pforzheim': 'Pforzheim', 'rastatt': 'Rastatt',
  'rheinmuenster': 'Rheinmünster', 'rheinstetten': 'Rheinstetten', 'sinzheim': 'Sinzheim',
  'steinmauern': 'Steinmauern', 'stutensee': 'Stutensee', 'weisenbach': 'Weisenbach',
};

function parseFilename(file) {
  const base = path.basename(file, '.html');
  // Sort by length desc so 'karlsruhe-durlach' matches before 'karlsruhe'
  const cities = [...ALL_CITIES].sort((a, b) => b.length - a.length);
  for (const c of cities) {
    if (base.endsWith('-' + c)) {
      const service = base.slice(0, -('-' + c).length);
      return { service, city: c };
    }
  }
  return null;
}

function buildCards(items, cityLabel, isLocal) {
  return items.map((it, i) => {
    const num = String(i + 1).padStart(2, '0');
    const src = `/images/splitscreen/${it.folder}-${it.n}-splitscreen.webp`;
    // For local pages: claim the city. For regional pool: stay generic so we don't
    // misrepresent a Rastatt photo as being from e.g. Achern.
    const alt = isLocal
      ? `${cityLabel} — ${it.kind} Vorher und Nachher Beispiel ${i + 1}`
      : `Räumung im Raum Mittelbaden — ${it.kind} Vorher und Nachher Beispiel ${i + 1}`;
    return `    <div class="gal-card">
      <img src="${src}" alt="${alt}" loading="lazy"/>
      <span class="num">№ ${num}</span>
    </div>`;
  }).join('\n');
}

function pickItems(city, service) {
  const local = city ? LOCAL[city] : null;
  const pref = SERVICE_PREF[service] || ['wohnung', 'keller'];

  if (local) {
    const items = [];
    const slug = local.slug || city;
    // Iterate preferred kinds in order, exhaust each
    for (const kind of pref) {
      const count = local[kind] || 0;
      for (let i = 1; i <= count; i++) {
        items.push({ folder: `${kind}-${slug}`, n: i, kind: kind === 'keller' ? 'Keller' : 'Wohnung' });
      }
    }
    // Also add any kind not in pref so we use everything available
    for (const kind of Object.keys(local)) {
      if (kind === 'slug') continue;
      if (pref.includes(kind)) continue;
      const count = local[kind];
      for (let i = 1; i <= count; i++) {
        items.push({ folder: `${kind}-${slug}`, n: i, kind: kind === 'keller' ? 'Keller' : 'Wohnung' });
      }
    }
    return { items, isLocal: true };
  }

  // No local — use regional pool
  const items = REGIONAL.map(r => ({ ...r, kind: r.folder.startsWith('keller') ? 'Keller' : 'Wohnung' }));
  return { items, isLocal: false };
}

function buildGalleryHtml(items, isLocal, cityLabel) {
  const heading = isLocal
    ? `<em>Beispiele</em> aus unseren Räumungen in ${cityLabel}`
    : `<em>Beispiele</em> aus der Region`;
  const desc = isLocal
    ? `Bilder aus realen Aufträgen in ${cityLabel} und direkter Umgebung — Vorher und Nachher direkt vom Einsatzort.`
    : (cityLabel
        ? `Bilder aus realen Aufträgen im Raum Mittelbaden / Karlsruhe. Aus Datenschutzgründen veröffentlichen wir Fotos aus benachbarten Einsätzen statt aus jedem Ort selbst.`
        : `Bilder aus realen Aufträgen im Raum Mittelbaden / Karlsruhe — Vorher und Nachher direkt vom Einsatzort.`);
  const note = `Alle Bilder stammen aus echten Aufträgen — keine Stockfotos. Eigene Fotos können wir auf Anfrage und mit Einverständnis der Auftraggeber für Referenzzwecke teilen.`;

  return `<section class="sec">
    <div class="sec-mark">Galerie</div>
    <h2 class="sec-h">${heading}</h2>
    <p class="sec-p">${desc}</p>
    <div class="gal-grid">
${buildCards(items, cityLabel, isLocal)}
    </div>
    <p class="gal-note">${note}</p>
  </section>`;
}

// Hub pages without a city: treat as regional
const HUB_PAGES = new Set([
  'bueroreinigung.html', 'endreinigung.html', 'fensterreinigung.html',
  'grundreinigung.html', 'hausmeisterservice.html', 'reinigung.html',
  'unterhaltsreinigung.html', 'unterhaltsreinigung-region.html',
]);

function fixPage(file) {
  const baseName = path.basename(file);
  let meta = parseFilename(file);
  if (!meta && HUB_PAGES.has(baseName)) {
    meta = { service: baseName.replace('.html', ''), city: null };
  }
  if (!meta) return { changed: false, reason: 'no city match' };

  let html = fs.readFileSync(file, 'utf8');
  // Find the gallery section. It begins with `<section ...>` containing
  // `<div class="sec-mark">Galerie</div>` and ends with `</section>`.
  const startMarker = /<section class="sec">\s*<div class="sec-mark">Galerie<\/div>/;
  const startMatch = html.match(startMarker);
  if (!startMatch) return { changed: false, reason: 'no gallery section' };

  // Find matching </section>. Use index + brute scan.
  const start = startMatch.index;
  const after = html.slice(start);
  const endIdx = after.indexOf('</section>');
  if (endIdx < 0) return { changed: false, reason: 'no closing section' };
  const sectionEnd = start + endIdx + '</section>'.length;
  const oldSection = html.slice(start, sectionEnd);

  const cityLabel = meta.city ? (CITY_LABEL[meta.city] || meta.city) : null;
  const { items, isLocal } = pickItems(meta.city, meta.service);
  if (items.length === 0) return { changed: false, reason: 'no items' };

  const newSection = buildGalleryHtml(items, isLocal, cityLabel);

  if (oldSection === newSection) return { changed: false, reason: 'identical' };

  html = html.slice(0, start) + newSection + html.slice(sectionEnd);
  fs.writeFileSync(file, html);
  return { changed: true, isLocal, items: items.length, city: meta.city, service: meta.service };
}

function listHtml(dir) {
  return fs.readdirSync(dir)
    .filter(n => n.endsWith('.html') && !n.startsWith('_'))
    .map(n => path.join(dir, n));
}

const files = listHtml(REPO);
const stats = { changed: 0, local: 0, regional: 0, skipped: 0 };
const skipped = [];
for (const f of files) {
  const r = fixPage(f);
  if (r.changed) {
    stats.changed++;
    if (r.isLocal) stats.local++;
    else stats.regional++;
  } else {
    stats.skipped++;
    skipped.push(`${path.basename(f)}: ${r.reason}`);
  }
}
console.log(`Updated ${stats.changed} pages (${stats.local} local-photos, ${stats.regional} regional-pool)`);
console.log(`Skipped ${stats.skipped}`);
if (skipped.length && skipped.length < 50) {
  console.log('Skipped files:');
  for (const s of skipped) console.log('  ' + s);
}
