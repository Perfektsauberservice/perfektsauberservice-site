// Inject compact lead-capture form into the hero of top 10 city/service
// pages. Sits right under the deck paragraph, above the existing CTA row.
// Reduces friction from ~5000px scroll (existing bottom form) to 0px.
//
// Uses the same Netlify form name "lead" so submissions land in the
// same inbox. Hidden "seite" field tags the source as "Hero · …" to
// distinguish hero conversions from bottom-form conversions.
//
// Idempotent, template-aware:
//   - no class="hero-form" on the page  -> INJECT the current full template
//     (formMarkup()) after the deck paragraph.
//   - class="hero-form" present, but that specific form block has no
//     name="lead_id" field (OLD template, pre-2026-09-02)               -> MIGRATE:
//     add the lead_id/attribution hidden fields + capture script to that
//     exact block IN PLACE, without touching anything else in it (the
//     "nachricht" field, hf-mini copy, trust row, etc. are left byte-for-
//     byte untouched — this is an additive migration, not a template swap).
//   - class="hero-form" present AND that block already has name="lead_id"
//     (NEW template)                                                    -> SKIP, true
//     idempotency, no rewrite.
// The "already has lead_id" check is scoped to the hero-form block itself
// (from its <form ... class="hero-form"> to the matching </form>), not the
// whole page, so it is not confused by an unrelated lead_id field in a
// separate bottom lead-form on the same page (see the two dual-form Rastatt
// pages, migrated by hand on 2026-09-02, which already follow this exact
// field-naming/id-scoping convention: unprefixed field names shared with
// Netlify Forms, "hero"-prefixed element ids to avoid colliding with a
// bottom lead-form's own "lead*" ids on the same page).
//
// Run from repo root: node agent/scripts/inject-hero-form.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const PAGES = [
  // Top 10 (first wave)
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
  // Cluster B extended Entrümpelung
  ['entruempelung-achern.html',              'Hero · Entrümpelung · Achern'],
  ['entruempelung-au-am-rhein.html',         'Hero · Entrümpelung · Au am Rhein'],
  ['entruempelung-bad-herrenalb.html',       'Hero · Entrümpelung · Bad Herrenalb'],
  ['entruempelung-bad-wildbad.html',         'Hero · Entrümpelung · Bad Wildbad'],
  ['entruempelung-bietigheim.html',          'Hero · Entrümpelung · Bietigheim'],
  ['entruempelung-bischweier.html',          'Hero · Entrümpelung · Bischweier'],
  ['entruempelung-durmersheim.html',         'Hero · Entrümpelung · Durmersheim'],
  ['entruempelung-forbach.html',             'Hero · Entrümpelung · Forbach'],
  ['entruempelung-gernsbach.html',           'Hero · Entrümpelung · Gernsbach'],
  ['entruempelung-huegelsheim.html',         'Hero · Entrümpelung · Hügelsheim'],
  ['entruempelung-iffezheim.html',           'Hero · Entrümpelung · Iffezheim'],
  ['entruempelung-kuppenheim.html',          'Hero · Entrümpelung · Kuppenheim'],
  ['entruempelung-malsch.html',              'Hero · Entrümpelung · Malsch'],
  ['entruempelung-muggensturm.html',         'Hero · Entrümpelung · Muggensturm'],
  ['entruempelung-oetigheim.html',           'Hero · Entrümpelung · Ötigheim'],
  ['entruempelung-pforzheim.html',           'Hero · Entrümpelung · Pforzheim'],
  ['entruempelung-rheinmuenster.html',       'Hero · Entrümpelung · Rheinmünster'],
  ['entruempelung-rheinstetten.html',        'Hero · Entrümpelung · Rheinstetten'],
  ['entruempelung-sinzheim.html',            'Hero · Entrümpelung · Sinzheim'],
  ['entruempelung-steinmauern.html',         'Hero · Entrümpelung · Steinmauern'],
  ['entruempelung-stutensee.html',           'Hero · Entrümpelung · Stutensee'],
  ['entruempelung-weisenbach.html',          'Hero · Entrümpelung · Weisenbach'],
  // Cluster B extended Haushaltsauflösung
  ['haushaltsaufloesung-achern.html',       'Hero · Haushaltsauflösung · Achern'],
  ['haushaltsaufloesung-baden-baden.html',  'Hero · Haushaltsauflösung · Baden-Baden'],
  ['haushaltsaufloesung-buehl.html',        'Hero · Haushaltsauflösung · Bühl'],
  ['haushaltsaufloesung-ettlingen.html',    'Hero · Haushaltsauflösung · Ettlingen'],
  ['haushaltsaufloesung-loffenau.html',     'Hero · Haushaltsauflösung · Loffenau'],
  ['haushaltsaufloesung-pforzheim.html',    'Hero · Haushaltsauflösung · Pforzheim'],
  // Cluster B extended Wohnungsauflösung
  ['wohnungsaufloesung-rastatt.html',       'Hero · Wohnungsauflösung · Rastatt'],
  ['wohnungsaufloesung-karlsruhe.html',     'Hero · Wohnungsauflösung · Karlsruhe'],
  ['wohnungsaufloesung-baden-baden.html',   'Hero · Wohnungsauflösung · Baden-Baden'],
  ['wohnungsaufloesung-gaggenau.html',      'Hero · Wohnungsauflösung · Gaggenau'],
  ['wohnungsaufloesung-buehl.html',         'Hero · Wohnungsauflösung · Bühl'],
  ['wohnungsaufloesung-loffenau.html',      'Hero · Wohnungsauflösung · Loffenau'],
];

function formMarkup(seite) {
  return `<form name="lead" method="POST" data-netlify="true" data-netlify-honeypot="bot-field" action="/danke" class="hero-form">
      <input type="hidden" name="form-name" value="lead">
      <input type="hidden" name="seite" value="${seite}">
      <input type="hidden" name="lead_id" id="leadIdHidden" value="">
      <input type="hidden" name="gclid" id="leadGclid" value="">
      <input type="hidden" name="gbraid" id="leadGbraid" value="">
      <input type="hidden" name="wbraid" id="leadWbraid" value="">
      <input type="hidden" name="utm_source" id="leadUtmSource" value="">
      <input type="hidden" name="utm_medium" id="leadUtmMedium" value="">
      <input type="hidden" name="utm_campaign" id="leadUtmCampaign" value="">
      <input type="hidden" name="utm_term" id="leadUtmTerm" value="">
      <input type="hidden" name="utm_content" id="leadUtmContent" value="">
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
    </form>
    <script>
    (function(){
      var form = document.querySelector('form.hero-form');
      if (!form) return;
      form.addEventListener('submit', function(){
        document.getElementById('leadIdHidden').value = 'PSS-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + crypto.randomUUID().slice(0,8);
        if (localStorage.getItem('psCookieChoice') === 'all') {
          var qp = new URLSearchParams(location.search);
          var lg = document.getElementById('leadGclid'); if (lg) lg.value = qp.get('gclid') || '';
          var lgb = document.getElementById('leadGbraid'); if (lgb) lgb.value = qp.get('gbraid') || '';
          var lwb = document.getElementById('leadWbraid'); if (lwb) lwb.value = qp.get('wbraid') || '';
          var lus = document.getElementById('leadUtmSource'); if (lus) lus.value = qp.get('utm_source') || '';
          var lum = document.getElementById('leadUtmMedium'); if (lum) lum.value = qp.get('utm_medium') || '';
          var luc = document.getElementById('leadUtmCampaign'); if (luc) luc.value = qp.get('utm_campaign') || '';
          var lut = document.getElementById('leadUtmTerm'); if (lut) lut.value = qp.get('utm_term') || '';
          var luco = document.getElementById('leadUtmContent'); if (luco) luco.value = qp.get('utm_content') || '';
        }
      });
    })();
    </script>`;
}

// The exact opening tag of a hero-form, used both to detect the block and to
// locate its start for the migration below.
const HERO_FORM_OPEN =
  '<form name="lead" method="POST" data-netlify="true" data-netlify-honeypot="bot-field" action="/danke" class="hero-form">';

// The nine hidden fields added to an OLD-template hero-form block during
// migration. Same field names and the same "hero"-prefixed element-id
// convention already used on the two dual-form Rastatt pages (migrated by
// hand 2026-09-02), so a page combining a hero-form with a bottom lead-form
// never collides ids between the two forms.
function heroMigrationFields() {
  return '      <input type="hidden" name="lead_id" id="heroLeadIdHidden" value="">\r\n' +
    '      <input type="hidden" name="gclid" id="heroGclid" value="">\r\n' +
    '      <input type="hidden" name="gbraid" id="heroGbraid" value="">\r\n' +
    '      <input type="hidden" name="wbraid" id="heroWbraid" value="">\r\n' +
    '      <input type="hidden" name="utm_source" id="heroUtmSource" value="">\r\n' +
    '      <input type="hidden" name="utm_medium" id="heroUtmMedium" value="">\r\n' +
    '      <input type="hidden" name="utm_campaign" id="heroUtmCampaign" value="">\r\n' +
    '      <input type="hidden" name="utm_term" id="heroUtmTerm" value="">\r\n' +
    '      <input type="hidden" name="utm_content" id="heroUtmContent" value="">\r\n';
}

// Capture script for a migrated hero-form, using the same hero-prefixed ids.
function heroMigrationScript() {
  return '<script>\r\n' +
    '    (function(){\r\n' +
    "      var form = document.querySelector('form.hero-form');\r\n" +
    '      if (!form) return;\r\n' +
    "      form.addEventListener('submit', function(){\r\n" +
    "        document.getElementById('heroLeadIdHidden').value = 'PSS-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + crypto.randomUUID().slice(0,8);\r\n" +
    "        if (localStorage.getItem('psCookieChoice') === 'all') {\r\n" +
    '          var qp = new URLSearchParams(location.search);\r\n' +
    "          var lg = document.getElementById('heroGclid'); if (lg) lg.value = qp.get('gclid') || '';\r\n" +
    "          var lgb = document.getElementById('heroGbraid'); if (lgb) lgb.value = qp.get('gbraid') || '';\r\n" +
    "          var lwb = document.getElementById('heroWbraid'); if (lwb) lwb.value = qp.get('wbraid') || '';\r\n" +
    "          var lus = document.getElementById('heroUtmSource'); if (lus) lus.value = qp.get('utm_source') || '';\r\n" +
    "          var lum = document.getElementById('heroUtmMedium'); if (lum) lum.value = qp.get('utm_medium') || '';\r\n" +
    "          var luc = document.getElementById('heroUtmCampaign'); if (luc) luc.value = qp.get('utm_campaign') || '';\r\n" +
    "          var lut = document.getElementById('heroUtmTerm'); if (lut) lut.value = qp.get('utm_term') || '';\r\n" +
    "          var luco = document.getElementById('heroUtmContent'); if (luco) luco.value = qp.get('utm_content') || '';\r\n" +
    '        }\r\n' +
    '      });\r\n' +
    '    })();\r\n' +
    '    </script>';
}

// Migrates a single page's hero-form block from the OLD template (no
// lead_id field) to carry the lead_id/attribution hidden fields and capture
// script, in place, leaving every other part of the block untouched.
//   status: 'no-hero-form'        - page has no hero-form at all
//           'already-migrated'    - hero-form block already has lead_id (skip)
//           'structural-mismatch' - has hero-form but not the expected exact
//                                   markup this migration anchors on (report,
//                                   do NOT touch — no blind overwrite)
//           'migrated'            - html carries the migrated result
function migrateOldHeroForm(html) {
  const openIdx = html.indexOf(HERO_FORM_OPEN);
  if (openIdx === -1) return { status: 'no-hero-form' };

  const closeIdx = html.indexOf('</form>', openIdx);
  if (closeIdx === -1) return { status: 'structural-mismatch' };
  const formEnd = closeIdx + '</form>'.length;
  const block = html.slice(openIdx, formEnd);

  if (block.includes('name="lead_id"')) return { status: 'already-migrated' };

  const seiteRe = /(<input type="hidden" name="seite" value="[^"]*">\r?\n)/;
  if (!seiteRe.test(block)) return { status: 'structural-mismatch' };

  const migratedBlock = block.replace(seiteRe, (m, g1) => g1 + heroMigrationFields());
  const migratedHtml =
    html.slice(0, openIdx) + migratedBlock + '\r\n    ' + heroMigrationScript() + html.slice(formEnd);
  return { status: 'migrated', html: migratedHtml };
}

let totals = { ok: 0, migrated: 0, alreadyHad: 0, noAnchor: 0, missing: 0, structuralMismatch: 0 };

for (const [file, seite] of PAGES) {
  const path = `${ROOT}/${file}`;
  let html;
  try { html = await readFile(path, 'utf8'); }
  catch { console.log(`MISSING: ${file}`); totals.missing++; continue; }

  if (!html.includes('class="hero-form"')) {
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
    continue;
  }

  const migration = migrateOldHeroForm(html);
  if (migration.status === 'already-migrated') {
    console.log(`SKIP (already has lead_id): ${file}`);
    totals.alreadyHad++;
    continue;
  }
  if (migration.status === 'migrated') {
    await writeFile(path, migration.html, 'utf8');
    console.log(`MIGRATED (added lead_id/attribution fields): ${file}`);
    totals.migrated++;
    continue;
  }
  console.log(`SKIP (hero-form present but structure unexpected — needs manual review): ${file}`);
  totals.structuralMismatch++;
}

console.log();
console.log(`Injected (new hero-form): ${totals.ok}`);
console.log(`Migrated (added lead_id/attribution to existing hero-form): ${totals.migrated}`);
console.log(`Already had lead_id: ${totals.alreadyHad}`);
console.log(`No deck anchor: ${totals.noAnchor}`);
console.log(`Structural mismatch (skipped, needs review): ${totals.structuralMismatch}`);
console.log(`Missing files: ${totals.missing}`);
