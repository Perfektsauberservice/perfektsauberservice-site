// Inject Reinigung cross-links into existing city × old-service pages.
// For each /<old-service>-<city>.html (e.g., entruempelung-karlsruhe.html):
//   - If Reinigung pages exist for this city → 5 city-specific links
//   - Else → 5 service-hub links (/bueroreinigung etc.)
//
// The new section is appended just before the </main> / contact area, inside
// the existing "related" .sec block as an extra group.

import fs from 'node:fs';

const REINIGUNG = ['bueroreinigung','endreinigung','grundreinigung','unterhaltsreinigung'];
const REINIGUNG_LABELS = {
  bueroreinigung: 'Büroreinigung',
  endreinigung: 'Endreinigung',
  grundreinigung: 'Grundreinigung',
  unterhaltsreinigung: 'Unterhaltsreinigung',
};

// Old-service prefixes that should get Reinigung cross-links
const OLD_SERVICES = [
  'bueroaufloesung','dachbodenentruempelung','entruempelung','garagenentruempelung',
  'gewerberaeumung','haushaltsaufloesung','kellerentruempelung','nachlassaufloesung',
  'wohnungsaufloesung','messi-wohnung',
];

function detectCitySlug(filename) {
  const base = filename.replace('.html', '');
  for (const s of OLD_SERVICES) {
    if (base.startsWith(s + '-')) return base.slice(s.length + 1);
  }
  return null;
}

function buildLinks(citySlug, cityLabel) {
  return REINIGUNG.map(s => {
    const cityPage = `${s}-${citySlug}.html`;
    const exists = fs.existsSync(cityPage);
    const href = exists ? `/${s}-${citySlug}` : `/${s}`;
    const label = exists
      ? `${REINIGUNG_LABELS[s]} ${cityLabel}`
      : REINIGUNG_LABELS[s];
    return { href, label };
  });
}

// Try to derive a human-friendly city label from the page H1
function cityLabelFromHtml(html, fallback) {
  // E.g. H1 "Büroauflösung Karlsruhe und Umgebung — ..."
  const m = html.match(/<h1[^>]*class="h1"[^>]*>([\s\S]*?)<\/h1>/);
  if (!m) return fallback;
  const t = m[1].replace(/<[^>]+>/g, '').trim();
  // Take 2nd word as the city (works for "Büroauflösung Karlsruhe...")
  const parts = t.split(/\s+/);
  // Prefer multi-word city names (Bad Wildbad, Au am Rhein, Baden-Baden)
  if (parts[1] === 'Bad' && parts[2]) return `${parts[1]} ${parts[2]}`;
  if (parts[1] === 'Au' && parts[2] === 'am' && parts[3] === 'Rhein') return 'Au am Rhein';
  if (parts[1] === 'Elchesheim-Illingen') return 'Elchesheim-Illingen';
  return parts[1] || fallback;
}

const REINIGUNG_BLOCK_MARK = '<!-- reinigung-cross-links -->';

function buildSection(citySlug, cityLabel, links) {
  const allCity = links.every(l => l.href.includes(citySlug));
  const heading = allCity
    ? `Reinigung in ${cityLabel}`
    : `Reinigungs-Leistungen verfügbar`;
  const items = links.map(l => `<a href="${l.href}">${l.label} →</a>`).join('');
  return `${REINIGUNG_BLOCK_MARK}
<section class="sec">
  <div class="sec-mark">Reinigung</div>
  <h2 class="sec-h"><em>${heading}</em>.</h2>
  <p class="sec-p">${allCity
    ? `Sauberkeit aus einer Hand für ${cityLabel}: regelmäßig oder einmalig, mit Festpreis und eigenem Personal.`
    : `Wir bieten in dieser Region fünf Reinigungsleistungen an — vom regelmäßigen Bürodienst bis zur einmaligen Tiefenreinigung.`}</p>
  <div class="rel-grid">${items}</div>
</section>
${REINIGUNG_BLOCK_MARK}`;
}

function injectIntoPage(filepath) {
  const filename = filepath.split(/[\\/]/).pop();
  const citySlug = detectCitySlug(filename);
  if (!citySlug) return { filepath, status: 'skip-no-city-detected' };

  let html = fs.readFileSync(filepath, 'utf8');

  // Idempotent: skip if our marker already there
  if (html.includes(REINIGUNG_BLOCK_MARK)) return { filepath, status: 'already-injected' };

  const cityLabel = cityLabelFromHtml(html, citySlug);
  const links = buildLinks(citySlug, cityLabel);
  const block = buildSection(citySlug, cityLabel, links);

  // Insert just before the contact section
  // The contact section starts with: <section class="contact" id="kontakt">
  const marker = '<section class="contact" id="kontakt">';
  if (!html.includes(marker)) return { filepath, status: 'no-contact-section' };

  html = html.replace(marker, `${block}\n${marker}`);
  fs.writeFileSync(filepath, html);
  return { filepath, status: 'ok', citySlug, cityLabel, allCity: links.every(l => l.href.includes(citySlug)) };
}

function main() {
  const all = fs.readdirSync('.').filter(f => f.endsWith('.html'));
  const targets = all.filter(f => OLD_SERVICES.some(s => f.startsWith(s + '-')));

  const results = targets.map(injectIntoPage);
  const byStatus = {};
  for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  console.log(`\nCross-link injection: ${results.length} files processed`);
  console.log('Status:', byStatus);
  const ok = results.filter(r => r.status === 'ok');
  const allCity = ok.filter(r => r.allCity).length;
  const hubFallback = ok.length - allCity;
  console.log(`  → ${allCity} pages got city-specific Reinigung links (Tier 1 cities)`);
  console.log(`  → ${hubFallback} pages got hub-fallback Reinigung links (smaller cities)`);
}

if (process.argv[1]?.endsWith('cross-link.mjs')) main();

export { injectIntoPage };
