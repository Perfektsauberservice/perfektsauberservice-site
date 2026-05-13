// Inject compact lead-capture form into the hero of top 10 city/service
// pages. Sits right under the deck paragraph, above the existing CTA row.
// Reduces friction from ~5000px scroll (existing bottom form) to 0px.
//
// Uses the same Netlify form name "lead" so submissions land in the
// same inbox. Hidden "seite" field tags the source as "Hero · …" to
// distinguish hero conversions from bottom-form conversions.
//
// Idempotent: skips pages that already contain class="hero-form".
//
// Run from repo root: node agent/scripts/inject-hero-form.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const PAGES = [
  ['entruempelung-rastatt.html',          'Hero · Entrümpelung · Rastatt'],
  ['entruempelung-karlsruhe.html',        'Hero · Entrümpelung · Karlsruhe'],
  ['entruempelung-baden-baden.html',      'Hero · Entrümpelung · Baden-Baden'],
  ['entruempelung-gaggenau.html',         'Hero · Entrümpelung · Gaggenau'],
  ['entruempelung-buehl.html',            'Hero · Entrümpelung · Bühl'],
  ['entruempelung-ettlingen.html',        'Hero · Entrümpelung · Ettlingen'],
  ['entruempelung-loffenau.html',         'Hero · Entrümpelung · Loffenau'],
  ['haushaltsaufloesung-rastatt.html',    'Hero · Haushaltsauflösung · Rastatt'],
  ['haushaltsaufloesung-karlsruhe.html',  'Hero · Haushaltsauflösung · Karlsruhe'],
  ['haushaltsaufloesung-gaggenau.html',   'Hero · Haushaltsauflösung · Gaggenau'],
];

function formMarkup(seite) {
  return `<form name="lead" method="POST" data-netlify="true" data-netlify-honeypot="bot-field" action="/danke" class="hero-form">
      <input type="hidden" name="form-name" value="lead">
      <input type="hidden" name="seite" value="${seite}">
      <p class="hp"><label>Bitte leer lassen: <input name="bot-field"></label></p>
      <div class="hf-row">
        <label class="hf-field"><span>Name</span><input type="text" name="name" autocomplete="name" required placeholder="Ihr Name"></label>
        <label class="hf-field"><span>Telefon</span><input type="tel" name="telefon" autocomplete="tel" required placeholder="+49…"></label>
      </div>
      <label class="hf-consent">
        <input type="checkbox" name="agb_widerruf_accepted" required>
        <span>Ich akzeptiere die <a href="/agb">AGB</a> und das <a href="/widerruf">Widerrufsrecht</a>.</span>
      </label>
      <button type="submit" class="btn btn-pri hf-submit">Festpreis anfragen →</button>
      <p class="hf-mini">Antwort in 24 h · kostenlose Besichtigung · kein Werbeversand</p>
    </form>`;
}

let totals = { ok: 0, alreadyHad: 0, noAnchor: 0, missing: 0 };

for (const [file, seite] of PAGES) {
  const path = `${ROOT}/${file}`;
  let html;
  try { html = await readFile(path, 'utf8'); }
  catch { console.log(`MISSING: ${file}`); totals.missing++; continue; }

  if (html.includes('class="hero-form"')) {
    console.log(`SKIP (has form): ${file}`);
    totals.alreadyHad++;
    continue;
  }

  // Insert form after the </p> that closes <p class="deck">…</p>.
  const re = /(<p class="deck">[\s\S]*?<\/p>)/;
  const m = html.match(re);
  if (!m) {
    console.log(`SKIP (no deck anchor): ${file}`);
    totals.noAnchor++;
    continue;
  }

  const insert = `${m[1]}\n    ${formMarkup(seite)}`;
  html = html.replace(re, insert);
  await writeFile(path, html, 'utf8');
  console.log(`INJECTED: ${file}`);
  totals.ok++;
}

console.log();
console.log(`Injected: ${totals.ok}`);
console.log(`Already had form: ${totals.alreadyHad}`);
console.log(`No deck anchor: ${totals.noAnchor}`);
console.log(`Missing files: ${totals.missing}`);
