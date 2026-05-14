// Generate 13 Bauschlussreinigung city pages from the endreinigung
// template. Bauschlussreinigung (post-construction cleaning) is the
// last service-category in the catalog with zero city coverage. This
// closes the 100% gap.
//
// Strategy: take endreinigung-rastatt.html as structural base, apply
// global Endreinigung → Bauschlussreinigung swap + city-specific
// title/H1/canonical/FAQ replacements + price matrix adjustment +
// services list rewrite for post-construction context.
//
// Run from repo root: node agent/scripts/generate-bauschlussreinigung-pages.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const CITIES = [
  { slug: 'achern',         name: 'Achern',         price: 250 },
  { slug: 'baden-baden',    name: 'Baden-Baden',    price: 280 },
  { slug: 'buehl',          name: 'Bühl',           price: 250 },
  { slug: 'ettlingen',      name: 'Ettlingen',      price: 260 },
  { slug: 'gaggenau',       name: 'Gaggenau',       price: 250 },
  { slug: 'gernsbach',      name: 'Gernsbach',      price: 250 },
  { slug: 'karlsruhe',      name: 'Karlsruhe',      price: 280 },
  { slug: 'muggensturm',    name: 'Muggensturm',    price: 250 },
  { slug: 'pforzheim',      name: 'Pforzheim',      price: 280 },
  { slug: 'rastatt',        name: 'Rastatt',        price: 250 },
  { slug: 'rheinstetten',   name: 'Rheinstetten',   price: 260 },
  { slug: 'sinzheim',       name: 'Sinzheim',       price: 250 },
  { slug: 'stutensee',      name: 'Stutensee',      price: 260 },
];

// Service-context replacements: Endreinigung (move-out cleaning) →
// Bauschlussreinigung (post-construction cleaning). Some terms need
// distinct copy because of context differences.
const TEXT_SWAPS = [
  // Service name
  [/Endreinigung/g, 'Bauschlussreinigung'],
  // Move-out vs construction context
  [/Mietwohnungs?[ -]Endreinigung/gi, 'Bauschlussreinigung'],
  [/Bauend-? und Wohnungsendreinigung/gi, 'Bauschluss- und Bauendreinigung'],
  [/Kautionsrückgabe-Garantie/g, 'Abnahme-fertig garantiert'],
  [/Kautionsrückgabe/g, 'Bauabnahme'],
  [/100 % Kautionsrückgabe-Garantie/g, '100 % Abnahme-fertig'],
  [/Mietvertragsende/g, 'Bauende'],
  [/Mietvertrag/g, 'Bauvertrag'],
  [/an Ihren? Vermieter/g, 'an den Bauträger'],
  [/Ihren? Vermieter/g, 'den Bauträger'],
  [/Vermieter/g, 'Bauträger'],
  [/im Mietvertrag/g, 'in der Bauabnahme'],
  [/Mieterauszug/g, 'Bau-/Renovierungsende'],
  [/Erbschaft/g, 'Sanierung'],
  [/Räumungsklage/g, 'Sanierungs-Abschluss'],
  // besenrein vs abnahmefertig — Bauschluss is more specific
  [/übergabe-bereit/g, 'abnahme-fertig'],
  [/übergabe-fertig/g, 'abnahme-fertig'],
  [/besenrein/g, 'abnahmefertig'],
];

const BASE = await readFile(`${ROOT}/endreinigung-rastatt.html`, 'utf8');

function applyTextSwaps(html) {
  let out = html;
  for (const [re, replacement] of TEXT_SWAPS) {
    out = out.replace(re, replacement);
  }
  return out;
}

function customizeCity(html, city) {
  // Replace city name everywhere
  let out = html.replace(/\bRastatt\b/g, city.name);
  out = out.replace(/\brastatt\b/g, city.slug);

  // Districts chips: replace Rastatt-specific list with generic block
  out = out.replace(
    /<div class="dist"><span class="chip">[^<]+(?:<\/span><span class="chip">[^<]+)*<\/span><\/div>\s*<div class="umland">[\s\S]*?<\/div>/,
    `<div class="dist"><span class="chip">Alle Stadtteile</span><span class="chip">Umland 25 km</span><span class="chip">Express-Termin</span><span class="chip">Wochenende möglich</span></div>
      <div class="umland"><h3>Einsatzgebiet ${city.name}</h3><p>Wir bedienen Bauschlussreinigung in ganz ${city.name} und im Umland (bis ca. 25 km). Sowohl Neubauten als auch sanierte Bestandsimmobilien, Privatobjekte wie auch gewerbliche Bauträger. Sprechen Sie uns einfach an — wir richten den Einsatz auf Ihre Bauabnahme-Frist aus.</p></div>`
  );

  // Pricing matrix — Bauschlussreinigung is per m² + complexity
  // The original endreinigung price block: replace 6 rows
  const priceBlock = `<div class="price-edit">
    <div class="price-row">
      <div class="price-name"><strong>1-Zimmer-Wohnung Neubau</strong> (bis 35 m²)</div>
      <div class="price-ex">Apartment, Einliegerwohnung nach Innenausbau</div>
      <div class="price-val">ab ${city.price} €</div>
    </div>
    <div class="price-row">
      <div class="price-name"><strong>2-Zimmer-Wohnung Neubau</strong> (35–65 m²)</div>
      <div class="price-ex">Standardwohnung nach Bauabschluss</div>
      <div class="price-val">ab ${city.price + 130} €</div>
    </div>
    <div class="price-row">
      <div class="price-name"><strong>3-Zimmer-Wohnung Neubau</strong> (65–100 m²)</div>
      <div class="price-ex">Familienwohnung, Etagenwohnung</div>
      <div class="price-val">ab ${city.price + 320} €</div>
    </div>
    <div class="price-row">
      <div class="price-name"><strong>Einfamilienhaus Neubau</strong> (100–180 m²)</div>
      <div class="price-ex">Komplette Bauschlussreinigung nach Innenausbau</div>
      <div class="price-val">ab ${city.price + 590} €</div>
    </div>
    <div class="price-row">
      <div class="price-name"><strong>Sanierung / Renovierung</strong> (bestehend)</div>
      <div class="price-ex">Nach Komplettsanierung — incl. Staub- und Putzreste</div>
      <div class="price-val">ab ${city.price + 50} €</div>
    </div>
    <div class="price-row">
      <div class="price-name"><strong>Gewerbeobjekt / Großprojekt</strong></div>
      <div class="price-ex">Büros, Praxen, Gewerbeeinheiten, größere Bauträger-Aufträge</div>
      <div class="price-val">nach Aufwand</div>
    </div></div>`;
  out = out.replace(
    /<div class="price-edit">[\s\S]*?<\/div><\/div>/,
    priceBlock + '</div>'
  );

  // Price note — Bauschluss-specific
  out = out.replace(
    /<div class="price-note">[\s\S]*?<\/div>/,
    `<div class="price-note"><strong>Im Festpreis enthalten:</strong> Beseitigung von Bauschutt-Resten, Staub, Putzresten, Mörtelflecken, Kleberesten und Folie. Komplette Reinigung aller Oberflächen: Böden, Wände, Decken-erreichbare Bereiche, Fenster (innen + außen mit Rahmen + Dichtungen), Türen, Sanitär (inkl. erstmaliger Nutzung-fertig), Küche (falls montiert), Heizkörper, Lampen, Lichtschalter, Steckdosen. Alle Reinigungsmittel und Industriegeräte (Industriestaubsauger, Kalkentferner, Bauchemie-Reiniger) sind im Preis. <strong>Keine Anfahrtskosten</strong> bis 25 km. Aufpreis möglich bei: stark verschmutzten Fenstern außen (+15 € pro Wohnung), Spezialreinigung bei Estrich-Schleifresten (+10 %), Express-Termin am gleichen Tag (+95 €).</div>`
  );

  // Service cards — Bauschluss-specific
  out = out.replace(
    /<div class="cards">[\s\S]*?<\/div><\/div>\s*<\/section>/,
    `<div class="cards">
    <div class="card">
      <div class="ic">№</div>
      <h3>🧱 Bauschutt-Reste & Staub</h3>
      <p>Aufnahme von Putzresten, Mörtelflecken, Folienresten und Spritzern. Industriestaubsauger für Estrich-Staub, der nach dem Verlegen entsteht. Auch Decken und schwer erreichbare Stellen.</p>
    </div>
    <div class="card">
      <div class="ic">№</div>
      <h3>🪟 Fenster & Türen Erstreinigung</h3>
      <p>Fenster innen und außen inkl. Rahmen, Dichtungen und Aufkleber-Reste. Türen, Türrahmen, Türklinken, Beschläge. Beseitigung von Lack- und Klebespuren ohne Beschädigung.</p>
    </div>
    <div class="card">
      <div class="ic">№</div>
      <h3>🚿 Sanitär abnahmefertig</h3>
      <p>Erstreinigung Toilette, Dusche, Wanne, Waschbecken, Armaturen, Fliesen. Entfernung von Kalk- und Silikonschutzfolien. Spiegel und Fugen werden bauabschluss-fertig übergeben.</p>
    </div>
    <div class="card">
      <div class="ic">№</div>
      <h3>🧹 Böden Erstreinigung</h3>
      <p>Spezialreinigung je nach Belag: Estrich-Staub, Fliesenfugen, Parkett-Schutz, Vinyl-Klebereste. Auch Heizkörper, Lampen, Lichtschalter, Steckdosen und Sockelleisten.</p>
    </div></div>
    </div>
  </section>`
  );

  // FAQ — Bauschluss-specific
  out = out.replace(
    /<details open>\s*<summary>Was kostet eine Bauschlussreinigung in [^<]+\?<\/summary>[\s\S]*?<\/details>\s*<\/div>\s*<\/section>/,
    `<details open>
      <summary>Was kostet eine Bauschlussreinigung in ${city.name}?</summary>
      <div class="ans">Eine Bauschlussreinigung in ${city.name} beginnt bei ${city.price} € für ein 1-Zimmer-Apartment Neubau. 2-Zimmer-Wohnungen liegen bei ${city.price + 130}–${city.price + 270} €, 3-Zimmer-Wohnungen bei ${city.price + 320}–${city.price + 490} €. Einfamilienhäuser Neubau ab ${city.price + 590} €. Sanierungen bei bestehender Bausubstanz ab ${city.price + 50} €. Den verbindlichen Festpreis nennen wir nach kostenloser Besichtigung oder nach Foto/Video per WhatsApp.</div>
    </details>
    <details>
      <summary>Was ist der Unterschied zwischen Bauschlussreinigung und Endreinigung?</summary>
      <div class="ans">Bauschlussreinigung erfolgt nach einem Neubau oder einer Sanierung — typische Verschmutzungen sind Staub, Putzreste, Mörtelflecken, Klebespuren und Folien. Endreinigung erfolgt nach einem Mieterauszug — typische Verschmutzungen sind Kalk, Fett und Wohnstaub. Wir bieten beides — fragen Sie einfach an, was Sie brauchen.</div>
    </details>
    <details>
      <summary>Wie schnell kann eine Bauschlussreinigung durchgeführt werden?</summary>
      <div class="ans">In der Regel ist ein Termin innerhalb von 48 Stunden möglich. Wir richten uns nach Ihrer Bauabnahme-Frist — auch Express-Termine am gleichen Tag oder am Wochenende sind nach Absprache möglich.</div>
    </details>
    <details>
      <summary>Was ist im Festpreis enthalten?</summary>
      <div class="ans">Im Festpreis enthalten sind: Beseitigung Bauschutt-Reste, Staub, Putz- und Mörtelreste, Folien und Klebespuren. Komplette Reinigung Böden (alle Beläge), Wände erreichbar, Fenster innen und außen mit Rahmen, Türen, Sanitär, Küche, Heizkörper, Lampen, Lichtschalter, Steckdosen, Sockelleisten. Alle Industriegeräte und Reinigungschemie inklusive.</div>
    </details>
    <details>
      <summary>Werden Fenster außen mitgereinigt?</summary>
      <div class="ans">Ja. Bei Bauschlussreinigung sind Fenster außen im Standardpreis enthalten — das ist wichtig, weil nach Bauarbeiten oft Putz- und Spritzer-Reste auf der Außenseite haften. Bei stark verschmutzten Fenstern außen kann ein moderater Aufpreis anfallen (+15 € pro Wohnung).</div>
    </details>
    <details>
      <summary>Beseitigen Sie auch Estrich-Staub und Klebereste?</summary>
      <div class="ans">Ja. Estrich-Staub gehört zu den häufigsten Verschmutzungen nach Bauabschluss und wird mit Industriestaubsauger entfernt. Klebereste von Folien, Schutzbänder und Aufkleber lösen wir lösungsmittelfrei und ohne Beschädigung der Oberflächen.</div>
    </details>
    <details>
      <summary>Bekomme ich eine Rechnung mit MwSt für meine Steuererklärung?</summary>
      <div class="ans">Ja. Sie erhalten eine ordentliche Rechnung mit ausgewiesener MwSt. Bauschlussreinigung im Privatbereich ist oft als haushaltsnahe Dienstleistung (§ 35a EStG) steuerlich absetzbar — wir liefern die korrekte Aufschlüsselung. Im Gewerbebereich vollständig als Betriebsausgabe absetzbar.</div>
    </details>
    <details>
      <summary>Arbeiten Sie auch mit Bauträgern und Renovierungsfirmen zusammen?</summary>
      <div class="ans">Ja. Wir kooperieren regelmäßig mit Bauträgern, Renovierungsfirmen und Generalunternehmern in der Region ${city.name} — schlanke Abwicklung, schriftlicher Festpreis pro Objekt, schnelle Termine vor der Bauabnahme. Auf Wunsch Rahmenvertrag für regelmäßige Aufträge.</div>
    </details></div>
  </section>`
  );

  // Related services block — adjust to Bauschluss context
  out = out.replace(
    /<div class="rel-grid"><a href="\/entruempelung-[^"]+">[\s\S]*?<\/h3><div class="rel-grid">[\s\S]*?<\/div>/,
    `<div class="rel-grid"><a href="/grundreinigung-${city.slug}">Grundreinigung ${city.name} →</a><a href="/endreinigung-${city.slug}">Endreinigung ${city.name} →</a><a href="/bueroreinigung-${city.slug}">Büroreinigung ${city.name} →</a><a href="/unterhaltsreinigung-${city.slug}">Unterhaltsreinigung ${city.name} →</a><a href="/entruempelung-${city.slug}">Entrümpelung ${city.name} →</a><a href="/preisrechner">Preisrechner →</a></div><h3 class="rel-h">Bauschlussreinigung in Nachbarstädten</h3><div class="rel-grid"><a href="/bauschlussreinigung-karlsruhe">Bauschlussreinigung Karlsruhe →</a><a href="/bauschlussreinigung-baden-baden">Bauschlussreinigung Baden-Baden →</a><a href="/bauschlussreinigung-rastatt">Bauschlussreinigung Rastatt →</a></div>`
  );

  // Hero deck — direct answer GEO format for Bauschlussreinigung
  out = out.replace(
    /<p class="deck">[^<]*<\/p>/,
    `<p class="deck">Eine Bauschlussreinigung in ${city.name} kostet ab ${city.price} € Festpreis und ist innerhalb von 48 Stunden terminierbar. Wir reinigen abnahmefertig nach Bau oder Renovierung — Staub, Schutt, Klebereste und Putzspuren vollständig entfernt. Versichert, MwSt-Rechnung.</p>`
  );

  // Title + meta — Bauschlussreinigung-specific
  out = out.replace(
    /<title>[^<]+<\/title>/,
    `<title>Bauschlussreinigung ${city.name} ★5,0 | Festpreis ab ${city.price} €</title>`
  );
  out = out.replace(
    /(name="description"\s+content=")[^"]+(")/,
    `$1Bauschlussreinigung ${city.name}: Festpreis ab ${city.price} €, abnahmefertige Reinigung nach Bau oder Renovierung. Staub, Schutt, Klebereste vollständig entfernt. Versichert.$2`
  );
  out = out.replace(
    /(property="og:title"\s+content=")[^"]+(")/,
    `$1Bauschlussreinigung ${city.name} ★5,0 | Festpreis ab ${city.price} €$2`
  );
  out = out.replace(
    /(property="og:description"\s+content=")[^"]+(")/,
    `$1Bauschlussreinigung ${city.name}: Festpreis ab ${city.price} €, abnahmefertige Reinigung nach Bau oder Renovierung. Staub, Schutt, Klebereste vollständig entfernt. Versichert.$2`
  );
  out = out.replace(
    /(name="twitter:title"\s+content=")[^"]+(")/,
    `$1Bauschlussreinigung ${city.name} ★5,0 | Festpreis ab ${city.price} €$2`
  );
  out = out.replace(
    /(name="twitter:description"\s+content=")[^"]+(")/,
    `$1Bauschlussreinigung ${city.name}: Festpreis ab ${city.price} €, abnahmefertige Reinigung nach Bau oder Renovierung. Staub, Schutt, Klebereste vollständig entfernt. Versichert.$2`
  );

  // Canonical / OG url
  out = out.replace(
    /(<link rel="canonical" href=")[^"]+(")/,
    `$1https://perfektsauberservice.com/bauschlussreinigung-${city.slug}$2`
  );
  out = out.replace(
    /(property="og:url"\s+content=")[^"]+(")/,
    `$1https://perfektsauberservice.com/bauschlussreinigung-${city.slug}$2`
  );

  // Hero image — use a more generic cleaning image
  out = out.replace(
    /src="\/images\/cleaning-endreinigung-800\.webp"/g,
    'src="/images/cleaning-grundreinigung-800.webp"'
  );

  return out;
}

let count = 0;
for (const city of CITIES) {
  let html = applyTextSwaps(BASE);
  html = customizeCity(html, city);
  const outPath = `${ROOT}/bauschlussreinigung-${city.slug}.html`;
  await writeFile(outPath, html, 'utf8');
  console.log(`OK: bauschlussreinigung-${city.slug}.html (${city.name}, ab ${city.price} €)`);
  count++;
}

console.log();
console.log(`Generated ${count} Bauschlussreinigung pages`);
