// Universal hero rewrite — applies the GEO direct-answer pattern to
// EVERY remaining city/service page. Auto-detects city display name,
// service, and starting price from the existing <title> so we don't
// need a manual config row per page.
//
// Strategy:
//   1. Walk all top-level HTML files matching service-* prefix.
//   2. Skip files whose deck already starts with "Eine ... kostet ab".
//   3. Parse title: "<Service> <City>[ - – |] ... Festpreis ab N €"
//      to extract Service, City, Price.
//   4. Generate new title (compact 50-60), meta (155-160), deck
//      (40-55 words direct answer) using service template.
//   5. Apply via 7 simple replacements (title, 6 meta tags, deck).
//
// Idempotent. Run from repo root: node agent/scripts/rewrite-hero-all-pages.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const SERVICE_PREFIXES = {
  'entruempelung-':       'Entrümpelung',
  'haushaltsaufloesung-': 'Haushaltsauflösung',
  'wohnungsaufloesung-':  'Wohnungsauflösung',
  'bueroaufloesung-':     'Büroauflösung',
  'bueroreinigung-':      'Büroreinigung',
  'endreinigung-':        'Endreinigung',
  'unterhaltsreinigung-': 'Unterhaltsreinigung',
  'grundreinigung-':      'Grundreinigung',
  'bauschlussreinigung-': 'Bauschlussreinigung',
};

// Per-service template that produces title / desc / deck for any city.
function tmpl({ service, city, price }) {
  const cfg = {
    'Entrümpelung': {
      titleTail: `Festpreis ab ${price} € | Termin in 48 h`,
      desc:      `Festpreis ab ${price} €, Termin in 48 h, kostenlose Besichtigung. Keller, Wohnung, Haus, Garage – besenrein, Entsorgung inklusive.`,
      deckBody:  `Wir entrümpeln Keller, Wohnung, Haus und Garage – besenrein, mit Schutt-Entsorgung inklusive. Kostenlose Besichtigung vor Ort.`,
    },
    'Haushaltsauflösung': {
      titleTail: `Festpreis ab ${price} €`,
      desc:      `Festpreis ab ${price} €, 48 h Termin, diskret. Wohnung, Haus, Nachlass – besenrein, mit Wertanrechnung. Kostenlose Besichtigung.`,
      deckBody:  `Wir lösen Wohnung, Haus oder Nachlass diskret auf – besenrein, mit Wertanrechnung verwertbarer Gegenstände. Kostenlose Besichtigung vor Ort.`,
    },
    'Wohnungsauflösung': {
      titleTail: `Festpreis ab ${price} €`,
      desc:      `Festpreis ab ${price} €, 48 h Termin. Mietwohnung oder Eigentum übergabe-fertig – besenrein, mit Wertanrechnung. Kostenlose Besichtigung.`,
      deckBody:  `Wir lösen Mietwohnung oder Eigentum auf – übergabe-fertig, besenrein, mit Wertanrechnung. Kostenlose Besichtigung vor Ort.`,
    },
    'Büroauflösung': {
      titleTail: `Festpreis ab ${price} €`,
      desc:      `Festpreis ab ${price} €, 48 h Termin, DSGVO-konforme Aktenvernichtung, IT-Recycling, besenrein. Kostenlose Besichtigung vor Ort.`,
      deckBody:  `Wir übernehmen DSGVO-konforme Aktenvernichtung, IT-Recycling und Möbeltransport – besenrein, Festpreis schriftlich. Kostenlose Besichtigung vor Ort.`,
    },
    'Büroreinigung': {
      titleTail: `Festpreis ab ${price} €`,
      desc:      `Festpreis ab ${price} €/Termin, eigenes Personal, wöchentlich oder monatlich, DSGVO-konform. Auch Praxen & Kanzleien. Kostenlose Besichtigung.`,
      deckBody:  `Wir reinigen mit eigenem festangestelltem Team – wöchentlich oder monatlich, DSGVO-konform, auch in Praxen und Kanzleien. Kostenlose Besichtigung vor Ort.`,
    },
    'Endreinigung': {
      titleTail: `Festpreis ab ${price} €`,
      desc:      `Festpreis ab ${price} €, 100 % Kautionsrückgabe-Garantie, 24 h Termin. Fenster, Sanitär, Küche, Balkon inklusive. Versichert.`,
      deckBody:  `Wir reinigen Fenster, Sanitär, Küche und Balkon inklusive – mit 100 % Kautionsrückgabe-Garantie. Versichert, MwSt-Rechnung.`,
    },
    'Unterhaltsreinigung': {
      titleTail: `Festpreis ab ${price} €`,
      desc:      `Festpreis ab ${price} €/Termin, regelmäßige Reinigung mit eigenem Team, DSGVO-konform. Wöchentlich, monatlich oder nach Bedarf.`,
      deckBody:  `Wir übernehmen regelmäßige Unterhaltsreinigung mit eigenem festangestelltem Team – wöchentlich, monatlich oder flexibel. Kostenlose Besichtigung vor Ort.`,
    },
    'Grundreinigung': {
      titleTail: `Festpreis ab ${price} €`,
      desc:      `Festpreis ab ${price} €, intensive Reinigung mit eigenem Team, alle Oberflächen, Sanitär, Küche, Boden. Versichert.`,
      deckBody:  `Wir führen intensive Grundreinigung durch – alle Oberflächen, Sanitär, Küche, Boden. Eigenes Team, versichert. Kostenlose Besichtigung vor Ort.`,
    },
    'Bauschlussreinigung': {
      titleTail: `Festpreis ab ${price} €`,
      desc:      `Festpreis ab ${price} €, abnahmefertige Reinigung nach Bau oder Renovierung. Staub, Schutt, Klebereste. Termine flexibel.`,
      deckBody:  `Wir reinigen abnahmefertig nach Bau oder Renovierung – Staub, Schutt und Klebereste vollständig entfernt. Versichert, MwSt-Rechnung.`,
    },
  }[service];

  return {
    title: `${service} ${city} ★5,0 | ${cfg.titleTail}`,
    desc: `${service} ${city}: ${cfg.desc}`,
    deck: `Eine ${service} in ${city} kostet ab ${price} € Festpreis und ist innerhalb von 48 Stunden terminierbar. ${cfg.deckBody}`,
  };
}

// Defaults per service if title has no explicit "ab X €".
const DEFAULT_PRICE = {
  'Entrümpelung': 150,
  'Haushaltsauflösung': 1000,
  'Wohnungsauflösung': 1000,
  'Büroauflösung': 800,
  'Büroreinigung': 35,
  'Endreinigung': 199,
  'Unterhaltsreinigung': 32,
  'Grundreinigung': 282,
  'Bauschlussreinigung': 250,
};

// Convert "rastatt-niederbuehl" → "Rastatt-Niederbühl" (etc.) using a
// human-readable city display map. Falls back to a Title Case fallback
// when slug isn't pre-registered.
const SLUG_TO_DISPLAY = {
  'baden-baden': 'Baden-Baden',
  'baden-baden-geroldsau': 'Baden-Baden-Geroldsau',
  'baden-baden-innenstadt': 'Baden-Baden-Innenstadt',
  'baden-baden-lichtental': 'Baden-Baden-Lichtental',
  'baden-baden-oos': 'Baden-Baden-Oos',
  'baden-baden-steinbach': 'Baden-Baden-Steinbach',
  'karlsruhe-durlach': 'Karlsruhe-Durlach',
  'karlsruhe-hagsfeld': 'Karlsruhe-Hagsfeld',
  'karlsruhe-knielingen': 'Karlsruhe-Knielingen',
  'karlsruhe-muehlburg': 'Karlsruhe-Mühlburg',
  'karlsruhe-nordstadt': 'Karlsruhe-Nordstadt',
  'karlsruhe-oststadt': 'Karlsruhe-Oststadt',
  'karlsruhe-suedstadt': 'Karlsruhe-Südstadt',
  'karlsruhe-weststadt': 'Karlsruhe-Weststadt',
  'pforzheim-broetzingen': 'Pforzheim-Brötzingen',
  'pforzheim-buckenberg': 'Pforzheim-Buckenberg',
  'pforzheim-dillweissenstein': 'Pforzheim-Dillweißenstein',
  'pforzheim-eutingen': 'Pforzheim-Eutingen',
  'pforzheim-innenstadt': 'Pforzheim-Innenstadt',
  'pforzheim-nordstadt': 'Pforzheim-Nordstadt',
  'rastatt-niederbuehl': 'Rastatt-Niederbühl',
  'rastatt-ottersdorf': 'Rastatt-Ottersdorf',
  'rastatt-plittersdorf': 'Rastatt-Plittersdorf',
  'rastatt-rauental': 'Rastatt-Rauental',
  'rastatt-wintersdorf': 'Rastatt-Wintersdorf',
  'au-am-rhein': 'Au am Rhein',
  'bad-herrenalb': 'Bad Herrenalb',
  'bad-wildbad': 'Bad Wildbad',
  'huegelsheim': 'Hügelsheim',
  'oetigheim': 'Ötigheim',
  'rheinmuenster': 'Rheinmünster',
  'buehl': 'Bühl',
  'region': 'Region Rastatt-Karlsruhe-Baden-Baden',
};

function slugToDisplay(slug) {
  if (SLUG_TO_DISPLAY[slug]) return SLUG_TO_DISPLAY[slug];
  // Generic Title Case fallback
  return slug.split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Parse the existing <title> to recover: city display + price.
// Falls back to slug-derived city and per-service default price.
function parseTitle(html, prefix, service, slug) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  const title = m ? m[1] : '';

  // Price: prefer "ab X €" from title, otherwise fall back to default.
  let price;
  const priceMatch = title.match(/ab\s+(\d{1,3}(?:[.,]\d{3})?)\s*€/);
  if (priceMatch) {
    const priceRaw = priceMatch[1].replace(/[.\s]/g, '').replace(',', '');
    const num = Number(priceRaw);
    if (Number.isFinite(num) && num > 0) price = num;
  }
  if (!price) price = DEFAULT_PRICE[service];
  if (!price) return null;

  const priceFmt = price >= 1000
    ? `${Math.floor(price / 1000)}.${String(price % 1000).padStart(3, '0')}`
    : String(price);

  const city = slugToDisplay(slug);
  return { city, price: priceFmt };
}

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

const SKIP_PATTERN = /<p class="deck">Eine [^<]+? kostet ab/;

const allFiles = (await readdir(ROOT)).filter(f => f.endsWith('.html')).sort();

let totals = { ok: 0, skipped: 0, alreadyDone: 0, parseFail: 0 };

for (const file of allFiles) {
  const prefix = Object.keys(SERVICE_PREFIXES).find(p => file.startsWith(p));
  if (!prefix) continue;
  const service = SERVICE_PREFIXES[prefix];

  const path = `${ROOT}/${file}`;
  let html = await readFile(path, 'utf8');

  if (SKIP_PATTERN.test(html)) {
    totals.alreadyDone++;
    continue;
  }

  const slug = file.slice(prefix.length, -'.html'.length);
  const parsed = parseTitle(html, prefix, service, slug);
  if (!parsed) {
    console.log(`PARSE FAIL: ${file}`);
    totals.parseFail++;
    continue;
  }

  const cfg = tmpl({ service, city: parsed.city, price: parsed.price });
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
  console.log(`OK ${file}: ${service} ${parsed.city} (${parsed.price} €) — ${perFile} fields`);
  totals.ok++;
}

console.log();
console.log(`Files rewritten: ${totals.ok}`);
console.log(`Already had GEO format: ${totals.alreadyDone}`);
console.log(`Parse failures (review manually): ${totals.parseFail}`);
console.log(`Skipped (no match): ${totals.skipped}`);
