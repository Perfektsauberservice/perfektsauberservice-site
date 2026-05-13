// Rewrite hero (title, meta description, deck paragraph) on the top
// city/service pages. Targets pages from GSC where ranking is already
// page-1 or near-page-1, so CTR + GEO direct-answer wins translate
// straight into traffic.
//
// Per page we update:
//   - <title>
//   - <meta name="description">
//   - <meta property="og:title">
//   - <meta property="og:description">
//   - <meta name="twitter:title">
//   - <meta name="twitter:description">
//   - hero deck <p class="deck">...</p>  (rewritten as GEO direct answer)
//
// Run from repo root: node agent/scripts/rewrite-hero-top-pages.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

// One config entry per file. Each declares the EXACT new values.
// Titles aim 50-60 chars. Meta 150-160 chars. Deck 40-55 words.
const PAGES = [
  {
    file: 'entruempelung-rastatt.html',
    title: 'Entrümpelung Rastatt ★5,0 | Festpreis ab 150 € | Termin in 48 h',
    desc: 'Entrümpelung Rastatt: Festpreis ab 150 €, Termin in 48 h, kostenlose Besichtigung. Keller, Wohnung, Haus, Garage – besenrein, Entsorgung inklusive.',
    deck: 'Eine Entrümpelung in Rastatt kostet ab 150 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir entrümpeln Keller, Wohnung, Haus und Garage – besenrein, mit Schutt-Entsorgung inklusive. Kostenlose Besichtigung vor Ort.',
  },
  {
    file: 'entruempelung-karlsruhe.html',
    title: 'Entrümpelung Karlsruhe ★5,0 | Festpreis ab 200 € | 48 h Termin',
    desc: 'Entrümpelung Karlsruhe: Festpreis ab 200 €, Termin in 48 h, alle 16 Stadtteile. Wohnung, Haus, Keller, Gewerbe – besenrein, Entsorgung inklusive.',
    deck: 'Eine Entrümpelung in Karlsruhe kostet ab 200 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir bedienen alle 16 Stadtteile – von Durlach bis Mühlburg. Wohnung, Haus, Keller, Gewerbe: besenrein, mit Entsorgung inklusive.',
  },
  {
    file: 'entruempelung-baden-baden.html',
    title: 'Entrümpelung Baden-Baden ★5,0 | Diskret | ab 200 € Festpreis',
    desc: 'Entrümpelung Baden-Baden: diskret und professionell, Festpreis ab 200 €, 48 h Termin. Villa, Wohnung, Haus, Keller – besenrein, kostenlose Besichtigung.',
    deck: 'Eine Entrümpelung in Baden-Baden kostet ab 200 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir arbeiten besonders diskret – Villa, Wohnung, Haus oder Keller, besenrein und mit fachgerechter Entsorgung. Kostenlose Besichtigung vor Ort.',
  },
  {
    file: 'entruempelung-gaggenau.html',
    title: 'Entrümpelung Gaggenau ★5,0 | Festpreis ab 200 € | 48 h Termin',
    desc: 'Entrümpelung Gaggenau: Festpreis ab 200 €, schriftlich, 48 h Termin. Wohnung, Haus, Keller, Garage – besenrein, kostenlose Besichtigung, ★ 5,0 Google.',
    deck: 'Eine Entrümpelung in Gaggenau kostet ab 200 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir entrümpeln Wohnung, Haus, Keller und Garage im gesamten Murgtal – besenrein, Festpreis schriftlich, Entsorgung inklusive. Kostenlose Besichtigung.',
  },
  {
    file: 'entruempelung-buehl.html',
    title: 'Entrümpelung Bühl ★5,0 | Festpreis ab 200 € | 48 h Termin',
    desc: 'Entrümpelung Bühl: Festpreis ab 200 €, Termin in 48 h, alle 8 Stadtteile. Wohnung, Haus, Keller, Dachboden – besenrein, Entsorgung inklusive.',
    deck: 'Eine Entrümpelung in Bühl kostet ab 200 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir entrümpeln in allen 8 Stadtteilen Bühls – Wohnung, Haus, Keller, Dachboden oder Gewerbe, besenrein und mit Entsorgung inklusive.',
  },
  {
    file: 'entruempelung-ettlingen.html',
    title: 'Entrümpelung Ettlingen ★5,0 | Festpreis ab 200 € | 48 h Termin',
    desc: 'Entrümpelung Ettlingen: Festpreis ab 200 €, Termin in 48 h, alle 7 Stadtteile. Wohnung, Haus, Keller, Gewerbe – besenrein, Entsorgung inklusive.',
    deck: 'Eine Entrümpelung in Ettlingen kostet ab 200 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir bedienen alle 7 Stadtteile inklusive Karlsruhe-Nähe – Wohnung, Haus, Keller oder Gewerbe, besenrein und mit fachgerechter Entsorgung.',
  },
  {
    file: 'entruempelung-loffenau.html',
    title: 'Entrümpelung Loffenau ★5,0 | Festpreis ab 150 € | Standort',
    desc: 'Entrümpelung Loffenau: Festpreis ab 150 €, Termin in 24 h möglich, kostenlose Besichtigung. Standort Loffenau – Keller, Wohnung, Haus, Garage besenrein.',
    deck: 'Eine Entrümpelung in Loffenau kostet ab 150 € Festpreis und ist innerhalb von 24 Stunden terminierbar – Loffenau ist unser Firmensitz. Wir entrümpeln Keller, Wohnung, Haus oder Garage besenrein, mit Schutt-Entsorgung inklusive.',
  },
  {
    file: 'haushaltsaufloesung-rastatt.html',
    title: 'Haushaltsauflösung Rastatt ★5,0 | Festpreis ab 1.000 €',
    desc: 'Haushaltsauflösung Rastatt: Festpreis ab 1.000 €, 48 h Termin, diskret. Wohnung, Haus, Nachlass – besenrein, mit Wertanrechnung. Kostenlose Besichtigung.',
    deck: 'Eine Haushaltsauflösung in Rastatt kostet ab 1.000 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir lösen Wohnung, Haus oder Nachlass diskret auf – besenrein, mit Wertanrechnung verwertbarer Gegenstände. Kostenlose Besichtigung vor Ort.',
  },
  {
    file: 'haushaltsaufloesung-karlsruhe.html',
    title: 'Haushaltsauflösung Karlsruhe ★5,0 | Festpreis ab 1.000 €',
    desc: 'Haushaltsauflösung Karlsruhe: Festpreis ab 1.000 €, 48 h Termin, alle 16 Stadtteile. Wohnung, Haus, Nachlass – diskret, besenrein, Wertanrechnung.',
    deck: 'Eine Haushaltsauflösung in Karlsruhe kostet ab 1.000 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir bedienen alle 16 Stadtteile – Wohnung, Haus oder Nachlass diskret, besenrein, mit Wertanrechnung. Kostenlose Besichtigung.',
  },
  {
    file: 'haushaltsaufloesung-gaggenau.html',
    title: 'Haushaltsauflösung Gaggenau ★5,0 | Festpreis ab 1.000 €',
    desc: 'Haushaltsauflösung Gaggenau: Festpreis ab 1.000 €, 48 h Termin, gesamtes Murgtal. Wohnung, Haus, Nachlass – diskret, besenrein, mit Wertanrechnung.',
    deck: 'Eine Haushaltsauflösung in Gaggenau kostet ab 1.000 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir bedienen das gesamte Murgtal – Wohnung, Haus oder Nachlass diskret, besenrein, mit Wertanrechnung. Kostenlose Besichtigung vor Ort.',
  },
  {
    file: 'haushaltsaufloesung-buehl.html',
    title: 'Haushaltsauflösung Bühl ★5,0 | Festpreis ab 1.000 €',
    desc: 'Haushaltsauflösung Bühl: Festpreis ab 1.000 €, 48 h Termin, alle 8 Stadtteile. Wohnung, Haus, Nachlass – diskret, besenrein, mit Wertanrechnung.',
    deck: 'Eine Haushaltsauflösung in Bühl kostet ab 1.000 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir bedienen alle 8 Stadtteile – Wohnung, Haus oder Nachlass diskret, besenrein, mit Wertanrechnung. Kostenlose Besichtigung vor Ort.',
  },
  {
    file: 'bueroaufloesung-karlsruhe.html',
    title: 'Büroauflösung Karlsruhe ★5,0 | Festpreis ab 800 € | 48 h',
    desc: 'Büroauflösung Karlsruhe: Festpreis ab 800 €, 48 h Termin, DSGVO-konforme Aktenvernichtung, IT-Recycling, besenrein. Kostenlose Besichtigung vor Ort.',
    deck: 'Eine Büroauflösung in Karlsruhe kostet ab 800 € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir übernehmen DSGVO-konforme Aktenvernichtung, IT-Recycling und Möbeltransport – besenrein, Festpreis schriftlich. Kostenlose Besichtigung vor Ort.',
  },
  {
    file: 'bueroreinigung-karlsruhe.html',
    title: 'Büroreinigung Karlsruhe ★5,0 | Festpreis ab 35 € | 48 h',
    desc: 'Büroreinigung Karlsruhe: Festpreis ab 35 €/Reinigung, 48 h Termin, eigenes Personal, versichert. MwSt-Rechnung. Kostenlose Besichtigung vor Ort.',
    deck: 'Eine Büroreinigung in Karlsruhe kostet ab 35 € pro Termin und ist innerhalb von 48 Stunden buchbar. Wir reinigen mit eigenem, festangestelltem Personal – wöchentlich oder monatlich, versichert, MwSt-Rechnung. Kostenlose Besichtigung.',
  },
  {
    file: 'bueroreinigung-rastatt.html',
    title: 'Büroreinigung Rastatt ★5,0 | Festpreis-Vertrag ab 110 €/Monat',
    desc: 'Büroreinigung Rastatt: Festpreis-Vertrag ab 110 €/Monat, eigenes festangestelltes Team, wöchentlich oder monatlich, DSGVO-konform. Auch Praxen & Kanzleien.',
    deck: 'Eine Büroreinigung in Rastatt kostet ab 110 € pro Monat als Festpreis-Vertrag. Wir reinigen mit eigenem festangestelltem Team – wöchentlich oder monatlich, DSGVO-konform, auch in Praxen und Kanzleien. Kostenlose Besichtigung vor Ort.',
  },
  {
    file: 'endreinigung-rastatt.html',
    title: 'Endreinigung Rastatt ★5,0 | ab 199 € | Kautionsrückgabe-Garantie',
    desc: 'Endreinigung Rastatt: Festpreis ab 199 €, 100 % Kautionsrückgabe-Garantie, 24 h Termin. Fenster, Sanitär, Küche, Balkon inklusive. Versichert.',
    deck: 'Eine Endreinigung in Rastatt kostet ab 199 € Festpreis und ist innerhalb von 24 Stunden terminierbar. Wir reinigen Fenster, Sanitär, Küche und Balkon inklusive – mit 100 % Kautionsrückgabe-Garantie. Versichert, MwSt-Rechnung.',
  },
];

function replaceOnce(html, find, replaceTo) {
  const idx = html.indexOf(find);
  if (idx === -1) return { html, changed: false };
  return {
    html: html.slice(0, idx) + replaceTo + html.slice(idx + find.length),
    changed: true,
  };
}

function replaceMeta(html, attr, value, newContent) {
  // Replaces content="..." for a meta tag matching attr=value.
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

function replaceTitle(html, newTitle) {
  const re = /<title>([^<]*)<\/title>/;
  const m = html.match(re);
  if (!m) return { html, changed: false };
  return {
    html: html.replace(re, `<title>${newTitle}</title>`),
    changed: m[1] !== newTitle,
  };
}

function replaceDeck(html, newDeck) {
  const re = /<p class="deck">([\s\S]*?)<\/p>/;
  const m = html.match(re);
  if (!m) return { html, changed: false };
  return {
    html: html.replace(re, `<p class="deck">${newDeck}</p>`),
    changed: m[1] !== newDeck,
  };
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
