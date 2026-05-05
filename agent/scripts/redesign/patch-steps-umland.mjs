// In-place patch: fix thin-content bug introduced by redesign on 250 city pages.
// The renderer emits empty placeholders when the parser fails to extract steps
// or the umland paragraph from the legacy source HTML. Result observed on
// production (commit 59492aba): <div class="steps"></div> on 250 pages and
// <div class="umland"><h3>Stadtteile X</h3><p></p></div> on 30+ pages.
//
// Google detects these as thin-content/template-broken signals. Smaller pages
// (Stadtteile, villages) drop hardest: Ötigheim 8.5 → 86, Bischweier 14 → 78,
// Weisenbach 16 → 79, Au am Rhein 14 → 73, Freiolsheim 12 → 71 (2026-05-04→05).
//
// Fix: inject the 5 standard process steps and derive the umland paragraph
// from the chips that already exist on the page. Idempotent (skips already-
// patched pages by checking for the marker).
//
// Run from repo root: node agent/scripts/redesign/patch-steps-umland.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const STEPS = [
  { n: '01', title: 'Anfrage stellen', desc: 'Per Telefon, WhatsApp oder E-Mail. Sie schildern Umfang, Etage und gewünschten Termin. Antwort meist innerhalb von 30 Minuten.' },
  { n: '02', title: 'Kostenlose Besichtigung', desc: 'Vor Ort oder per Foto/Video via WhatsApp. Wir prüfen Zugang, Volumen, Sondermüll und Wertgegenstände — alles transparent.' },
  { n: '03', title: 'Festpreis-Angebot', desc: 'Schriftliches, verbindliches Angebot nach Besichtigung. Keine versteckten Kosten — das ist der Preis, den Sie bezahlen.' },
  { n: '04', title: 'Termin in 48 Stunden', desc: 'Express-Termine oft am gleichen oder folgenden Werktag möglich. Auch Samstage nach Absprache.' },
  { n: '05', title: 'Räumung & besenreine Übergabe', desc: 'Vollständige Räumung, fachgerechte Entsorgung, Recycling, Aktenvernichtung in üblichem Umfang. Auf Wunsch Endreinigung dazu.' },
];

const USPS = [
  { num: '01', title: 'Festpreis-Garantie', desc: 'Schriftliches Angebot nach Besichtigung. Keine versteckten Aufschläge, keine Stundenzettel — was abgemacht ist, gilt.' },
  { num: '02', title: 'Termin in 48 Stunden', desc: 'Schnelle Reaktion bei Mietvertragsende, Erbschaft oder Räumungsklage. Express-Termine am Wochenende nach Absprache möglich.' },
  { num: '03', title: '5,0 ★ Google-Bewertung', desc: 'Echte Kunden, transparente Bewertungen. Wir arbeiten so, dass Sie uns weiterempfehlen — das ist unser bester Marketing-Kanal.' },
  { num: '04', title: 'Versichert & diskret', desc: 'Berufshaftpflicht, DSGVO-konforme Aktenvernichtung, vollständige Verschwiegenheit. Wir respektieren Ihre Privatsphäre.' },
];

const STEPS_HTML = STEPS.map(s => `<div class="step">
      <div class="step-n">№ ${s.n}</div>
      <h3>${s.title}</h3>
      <p>${s.desc}</p>
    </div>`).join('');

const USPS_HTML = USPS.map(u => `<div class="usp">
      <div class="num">${u.num}</div>
      <h3>${u.title}</h3>
      <p>${u.desc}</p>
    </div>`).join('');

const EMPTY_STEPS_RE = /<div class="steps"><\/div>/g;
const EMPTY_USPS_RE = /<div class="usps"><\/div>/g;
const EMPTY_UMLAND_RE = /(<div class="dist">((?:<span class="chip">[^<]+<\/span>)+)<\/div>\s*)<div class="umland"><h3>([^<]+)<\/h3><p><\/p><\/div>/g;

function patchSteps(html) {
  const before = (html.match(EMPTY_STEPS_RE) || []).length;
  if (!before) return { html, count: 0 };
  return {
    html: html.replace(EMPTY_STEPS_RE, `<div class="steps">${STEPS_HTML}</div>`),
    count: before,
  };
}

function patchUsps(html) {
  const before = (html.match(EMPTY_USPS_RE) || []).length;
  if (!before) return { html, count: 0 };
  return {
    html: html.replace(EMPTY_USPS_RE, `<div class="usps">${USPS_HTML}</div>`),
    count: before,
  };
}

function patchUmland(html) {
  let count = 0;
  const out = html.replace(EMPTY_UMLAND_RE, (_, distFull, chipsHtml, h3) => {
    const chips = [...chipsHtml.matchAll(/<span class="chip">([^<]+)<\/span>/g)]
      .map(m => m[1].trim())
      .filter(Boolean);
    if (!chips.length) return _;
    count++;
    const text = `Wir sind in folgenden Stadtteilen und Nachbarorten aktiv: ${chips.join(', ')}. Auf Wunsch beraten wir auch zu angrenzenden Gemeinden — fragen Sie einfach an.`;
    return `${distFull}<div class="umland"><h3>${h3}</h3><p>${text}</p></div>`;
  });
  return { html: out, count };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'agent') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archived' || entry.name === '_backup_2026-05-03' || entry.name === '_preview') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
let stepsTotal = 0, uspsTotal = 0, umlandTotal = 0, filesPatched = 0, filesUntouched = 0;

for (const f of files) {
  const orig = fs.readFileSync(f, 'utf8');

  const r1 = patchSteps(orig);
  const r2 = patchUsps(r1.html);
  const r3 = patchUmland(r2.html);
  const finalHtml = r3.html;

  if (finalHtml !== orig) {
    fs.writeFileSync(f, finalHtml);
    filesPatched++;
    stepsTotal += r1.count;
    uspsTotal += r2.count;
    umlandTotal += r3.count;
  } else {
    filesUntouched++;
  }
}

console.log(`✓ files patched: ${filesPatched}`);
console.log(`  · steps blocks injected: ${stepsTotal}`);
console.log(`  · usps blocks injected: ${uspsTotal}`);
console.log(`  · umland paragraphs populated: ${umlandTotal}`);
console.log(`untouched: ${filesUntouched}`);
