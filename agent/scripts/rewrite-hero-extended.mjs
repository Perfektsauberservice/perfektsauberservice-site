// Rewrite hero on ~35 additional city/service pages.
// Templated by service so the GEO direct answer follows a consistent
// pattern. Companion to rewrite-hero-top-pages.mjs.
//
// Run from repo root: node agent/scripts/rewrite-hero-extended.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

// Per-service templates that produce title / desc / deck for any city.
function templates({ service, city, price, duration = '48 Stunden', durationShort = '48 h' }) {
  const cfg = {
    Entrümpelung: {
      titleTail: `Festpreis ab ${price} € | Termin in ${durationShort}`,
      descLead: `Festpreis ab ${price} €, Termin in ${durationShort}, kostenlose Besichtigung. Keller, Wohnung, Haus, Garage – besenrein, Entsorgung inklusive.`,
      deckBody: `Wir entrümpeln Keller, Wohnung, Haus und Garage – besenrein, mit Schutt-Entsorgung inklusive. Kostenlose Besichtigung vor Ort.`,
    },
    Haushaltsauflösung: {
      titleTail: `Festpreis ab ${price} €`,
      descLead: `Festpreis ab ${price} €, ${durationShort} Termin, diskret. Wohnung, Haus, Nachlass – besenrein, mit Wertanrechnung. Kostenlose Besichtigung.`,
      deckBody: `Wir lösen Wohnung, Haus oder Nachlass diskret auf – besenrein, mit Wertanrechnung verwertbarer Gegenstände. Kostenlose Besichtigung vor Ort.`,
    },
    Wohnungsauflösung: {
      titleTail: `Festpreis ab ${price} €`,
      descLead: `Festpreis ab ${price} €, ${durationShort} Termin. Mietwohnung oder Eigentum übergabe-fertig – besenrein, mit Wertanrechnung. Kostenlose Besichtigung.`,
      deckBody: `Wir lösen Mietwohnung oder Eigentum auf – übergabe-fertig, besenrein, mit Wertanrechnung. Kostenlose Besichtigung vor Ort.`,
    },
  }[service];

  return {
    title: `${service} ${city} ★5,0 | ${cfg.titleTail}`,
    desc: `${service} ${city}: ${cfg.descLead}`,
    deck: `Eine ${service} in ${city} kostet ab ${price} € Festpreis und ist innerhalb von ${duration} terminierbar. ${cfg.deckBody}`,
  };
}

const PAGES_RAW = [
  // Entrümpelung — 23 cities at €150 (€200 Pforzheim big city)
  ['entruempelung-achern.html',              'Entrümpelung', 'Achern',             150],
  ['entruempelung-au-am-rhein.html',         'Entrümpelung', 'Au am Rhein',        150],
  ['entruempelung-bad-herrenalb.html',       'Entrümpelung', 'Bad Herrenalb',      150],
  ['entruempelung-bad-wildbad.html',         'Entrümpelung', 'Bad Wildbad',        150],
  ['entruempelung-bietigheim.html',          'Entrümpelung', 'Bietigheim',         150],
  ['entruempelung-bischweier.html',          'Entrümpelung', 'Bischweier',         150],
  ['entruempelung-durmersheim.html',         'Entrümpelung', 'Durmersheim',        150],
  ['entruempelung-elchesheim-illingen.html', 'Entrümpelung', 'Elchesheim-Illingen',150],
  ['entruempelung-forbach.html',             'Entrümpelung', 'Forbach',            150],
  ['entruempelung-gernsbach.html',           'Entrümpelung', 'Gernsbach',          150],
  ['entruempelung-huegelsheim.html',         'Entrümpelung', 'Hügelsheim',         150],
  ['entruempelung-iffezheim.html',           'Entrümpelung', 'Iffezheim',          150],
  ['entruempelung-kuppenheim.html',          'Entrümpelung', 'Kuppenheim',         150],
  ['entruempelung-malsch.html',              'Entrümpelung', 'Malsch',             150],
  ['entruempelung-muggensturm.html',         'Entrümpelung', 'Muggensturm',        150],
  ['entruempelung-oetigheim.html',           'Entrümpelung', 'Ötigheim',           150],
  ['entruempelung-pforzheim.html',           'Entrümpelung', 'Pforzheim',          200],
  ['entruempelung-rheinmuenster.html',       'Entrümpelung', 'Rheinmünster',       150],
  ['entruempelung-rheinstetten.html',        'Entrümpelung', 'Rheinstetten',       150],
  ['entruempelung-sinzheim.html',            'Entrümpelung', 'Sinzheim',           150],
  ['entruempelung-steinmauern.html',         'Entrümpelung', 'Steinmauern',        150],
  ['entruempelung-stutensee.html',           'Entrümpelung', 'Stutensee',          150],
  ['entruempelung-weisenbach.html',          'Entrümpelung', 'Weisenbach',         150],
  // Haushaltsauflösung — 5 cities still missing (Rastatt/KA/Gaggenau/Bühl done in top 15)
  ['haushaltsaufloesung-achern.html',        'Haushaltsauflösung', 'Achern',       1000],
  ['haushaltsaufloesung-baden-baden.html',   'Haushaltsauflösung', 'Baden-Baden',  1000],
  ['haushaltsaufloesung-ettlingen.html',     'Haushaltsauflösung', 'Ettlingen',    1000],
  ['haushaltsaufloesung-loffenau.html',      'Haushaltsauflösung', 'Loffenau',     1000],
  ['haushaltsaufloesung-pforzheim.html',     'Haushaltsauflösung', 'Pforzheim',    1000],
  // Wohnungsauflösung — top 6 cities
  ['wohnungsaufloesung-baden-baden.html',    'Wohnungsauflösung',  'Baden-Baden',  1000],
  ['wohnungsaufloesung-buehl.html',          'Wohnungsauflösung',  'Bühl',         1000],
  ['wohnungsaufloesung-gaggenau.html',       'Wohnungsauflösung',  'Gaggenau',     1000],
  ['wohnungsaufloesung-karlsruhe.html',      'Wohnungsauflösung',  'Karlsruhe',    1000],
  ['wohnungsaufloesung-loffenau.html',       'Wohnungsauflösung',  'Loffenau',     1000],
  ['wohnungsaufloesung-rastatt.html',        'Wohnungsauflösung',  'Rastatt',      1000],
];

// Format price with German thousands separator for >= 1000.
function formatPrice(p) {
  return p >= 1000 ? `${Math.floor(p / 1000)}.${String(p % 1000).padStart(3, '0')}` : String(p);
}

const PAGES = PAGES_RAW.map(([file, service, city, price]) => ({
  file,
  ...templates({ service, city, price: formatPrice(price) }),
}));

function replaceTitle(html, newTitle) {
  const re = /<title>([^<]*)<\/title>/;
  const m = html.match(re);
  if (!m) return { html, changed: false };
  return { html: html.replace(re, `<title>${newTitle}</title>`), changed: m[1] !== newTitle };
}

function replaceMeta(html, attr, value, newContent) {
  const re = new RegExp(
    `(<meta\\s+${attr}="${value.replace(/[.*+?^${}()|[\\\]]/g, '\\\\$&')}"\\s+content=")([^"]*)(")`,
    'i'
  );
  const m = html.match(re);
  if (!m) return { html, changed: false };
  return {
    html: html.replace(re, `$1${newContent.replace(/\$/g, '$$$$')}$3`),
    changed: m[2] !== newContent,
  };
}

function replaceDeck(html, newDeck) {
  const re = /<p class="deck">([\s\S]*?)<\/p>/;
  const m = html.match(re);
  if (!m) return { html, changed: false };
  return { html: html.replace(re, `<p class="deck">${newDeck}</p>`), changed: m[1] !== newDeck };
}

let totals = { files: 0, edits: 0, missing: [] };

for (const cfg of PAGES) {
  const path = `${ROOT}/${cfg.file}`;
  let html;
  try { html = await readFile(path, 'utf8'); }
  catch { totals.missing.push(cfg.file); continue; }
  let perFile = 0;

  for (const [fn, args] of [
    [replaceTitle, [cfg.title]],
    [replaceMeta, ['name', 'description', cfg.desc]],
    [replaceMeta, ['property', 'og:title', cfg.title]],
    [replaceMeta, ['property', 'og:description', cfg.desc]],
    [replaceMeta, ['name', 'twitter:title', cfg.title]],
    [replaceMeta, ['name', 'twitter:description', cfg.desc]],
    [replaceDeck, [cfg.deck]],
  ]) {
    const result = fn(html, ...args);
    html = result.html;
    if (result.changed) perFile++;
  }

  await writeFile(path, html, 'utf8');
  totals.files++;
  totals.edits += perFile;
  console.log(`${cfg.file}: ${perFile} field(s) updated`);
}

console.log();
console.log(`Files processed: ${totals.files}`);
console.log(`Total field updates: ${totals.edits}`);
if (totals.missing.length) {
  console.log(`Missing files: ${totals.missing.join(', ')}`);
}
