/**
 * Agent 6 — Internal Linking Agent
 * Adauga link-uri interne relevante in fiecare pagina:
 *   - Pagini oras: link catre celelalte 3 servicii in acelasi oras
 *   - Articole blog: link catre pagina de serviciu relevanta
 *
 * Ruleaza: node agent/scripts/inject-internal-links.mjs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BASE_URL = 'https://perfektsauberservice.com';

const SERVICE_MAP = {
  'entruempelung':       { label: 'Entrümpelung',     slug: 'entruempelung' },
  'haushaltsaufloesung': { label: 'Haushaltsauflösung', slug: 'haushaltsaufloesung' },
  'wohnungsaufloesung':  { label: 'Wohnungsauflösung', slug: 'wohnungsaufloesung' },
  'gewerberaeumung':     { label: 'Gewerberäumung',   slug: 'gewerberaeumung' },
};

const CITY_NAMES = {
  'rastatt': 'Rastatt', 'baden-baden': 'Baden-Baden', 'gaggenau': 'Gaggenau',
  'karlsruhe': 'Karlsruhe', 'achern': 'Achern', 'au-am-rhein': 'Au am Rhein',
  'bad-herrenalb': 'Bad Herrenalb', 'bad-wildbad': 'Bad Wildbad',
  'bietigheim': 'Bietigheim', 'bischweier': 'Bischweier', 'buehl': 'Bühl',
  'durmersheim': 'Durmersheim', 'elchesheim-illingen': 'Elchesheim-Illingen',
  'ettlingen': 'Ettlingen', 'forbach': 'Forbach', 'gernsbach': 'Gernsbach',
  'huegelsheim': 'Hügelsheim', 'iffezheim': 'Iffezheim', 'kuppenheim': 'Kuppenheim',
  'loffenau': 'Loffenau', 'malsch': 'Malsch', 'muggensturm': 'Muggensturm',
  'oetigheim': 'Ötigheim', 'pforzheim': 'Pforzheim', 'rheinmuenster': 'Rheinmünster',
  'rheinstetten': 'Rheinstetten', 'sinzheim': 'Sinzheim', 'steinmauern': 'Steinmauern',
  'stutensee': 'Stutensee', 'weisenbach': 'Weisenbach',
};

function parseServiceAndCity(filename) {
  const name = filename.replace('.html', '');
  for (const key of Object.keys(SERVICE_MAP).sort((a, b) => b.length - a.length)) {
    if (name.startsWith(key + '-')) {
      const rest = name.slice(key.length + 1);
      if (CITY_NAMES[rest]) return { service: key, city: rest };
    }
  }
  return { service: null, city: null };
}

function fileExists(filename) {
  return existsSync(join(ROOT, filename));
}

// ── Pagini oras/serviciu ───────────────────────────────────────────────────

const SKIP = new Set(['danke.html', '410.html', 'datenschutz.html', 'impressum.html',
  'einsatzgebiete-block.html', 'blog.html', 'leistungen.html', 'einsatzgebiete.html', 'preisrechner.html']);

const rootFiles = readdirSync(ROOT).filter(f => f.endsWith('.html') && !SKIP.has(f));

let cityUpdated = 0, citySkipped = 0;

for (const file of rootFiles) {
  const { service, city } = parseServiceAndCity(file);
  if (!service || !city) { citySkipped++; continue; }

  const filePath = join(ROOT, file);
  let html = readFileSync(filePath, 'utf-8');

  // Construieste lista de link-uri cross-serviciu pentru acelasi oras
  const crossLinks = [];
  for (const [sSlug, sInfo] of Object.entries(SERVICE_MAP)) {
    if (sSlug === service) continue; // sarim serviciul curent
    const targetFile = `${sSlug}-${city}.html`;
    if (fileExists(targetFile)) {
      crossLinks.push({ href: `/${targetFile}`, label: `${sInfo.label} ${CITY_NAMES[city]}` });
    }
  }

  // Adauga si link catre blog si preisrechner daca nu sunt deja
  const extras = [
    { href: '/preisrechner.html', label: 'Preisrechner' },
    { href: '/leistungen.html', label: 'Alle Leistungen' },
    { href: '/blog.html', label: 'Ratgeber Blog' },
  ];

  if (crossLinks.length === 0) { citySkipped++; continue; }

  // Construieste noul bloc de link-uri
  const allLinks = [...crossLinks, ...extras];
  const newLinkListHtml = `<div class="link-list">
${allLinks.map(l => `      <a href="${l.href}">${l.label}</a>`).join('\n')}
    </div>`;

  // Inlocuieste link-list-ul existent SAU adauga inainte de </section> in sectiunea #kontakt
  if (html.includes('class="link-list"')) {
    // Verifica daca link-urile noi sunt deja prezente
    const alreadyHasLinks = crossLinks.every(l => html.includes(`href="${l.href}"`));
    if (alreadyHasLinks) { citySkipped++; continue; }
    html = html.replace(/<div class="link-list">[\s\S]*?<\/div>/, newLinkListHtml);
  } else {
    // Injecteaza inainte de </section> in ultima sectiune cu id="kontakt"
    html = html.replace(/(<section[^>]*id="kontakt"[^>]*>[\s\S]*?)(<\/section>)/,
      `$1\n    ${newLinkListHtml}\n  $2`);
  }

  writeFileSync(filePath, html, 'utf-8');
  cityUpdated++;
}

console.log(`✅ Pagini oras: ${cityUpdated} actualizate cu link-uri interne, ${citySkipped} sarite`);

// ── Articole blog — SARITE COMPLET ─────────────────────────────────────────
// pipeline.mjs adauga link-uri interne la creare. Nu se modifica automat.
const blogDir = join(ROOT, 'blog');
let blogUpdated = 0, blogSkipped = 0;
let blogFiles = [];
// blog/ protejat — nu se proceseaza automat
blogFiles = [];

for (const file of blogFiles) {
  const filePath = join(blogDir, file);
  let html = readFileSync(filePath, 'utf-8');

  // Detecteaza orasul si serviciul din continut (cauta URL-uri catre pagini de servicii)
  const cityServiceMatch = html.match(/href=["']\/([a-z]+(?:aufloesung|ung|raeumung)?-([a-z-]+)\.html)["']/);

  // Verifica daca exista deja sectiunea "Verwandte Seiten"
  if (html.includes('Verwandte Seiten') || html.includes('Weitere Themen')) {
    blogSkipped++;
    continue;
  }

  // Construieste sectiunea de link-uri pentru blog
  const blogLinks = [
    { href: '/entruempelung-rastatt.html', label: 'Entrümpelung Rastatt' },
    { href: '/haushaltsaufloesung-rastatt.html', label: 'Haushaltsauflösung Rastatt' },
    { href: '/wohnungsaufloesung-rastatt.html', label: 'Wohnungsauflösung Rastatt' },
    { href: '/preisrechner.html', label: 'Kostenrechner' },
    { href: '/blog.html', label: 'Mehr Artikel' },
  ];

  const verwandteSection = `
<section class="wrap" style="padding-top:0">
  <div class="container">
    <div class="content-card" style="margin-top:0">
      <h2 style="font-size:1.2rem;margin:0 0 14px;color:#21466f">Weitere Themen</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${blogLinks.map(l => `<a href="${l.href}" style="display:inline-block;padding:8px 14px;border-radius:999px;background:#eef2ff;color:#17315c;font-weight:700;font-size:14px;text-decoration:none">${l.label}</a>`).join('\n        ')}
      </div>
    </div>
  </div>
</section>`;

  // Injecteaza inainte de footer sau </body>
  if (html.includes('<footer') || html.includes('class="footer"')) {
    html = html.replace(/(<(?:footer|div class="footer")[^>]*>)/, `${verwandteSection}\n$1`);
  } else {
    html = html.replace('</body>', `${verwandteSection}\n</body>`);
  }

  writeFileSync(filePath, html, 'utf-8');
  blogUpdated++;
}

console.log(`✅ Articole blog: ${blogUpdated} actualizate cu "Weitere Themen", ${blogSkipped} sarite`);
console.log(`\n🔗 Total link-uri interne injectate in ${cityUpdated + blogUpdated} fisiere.`);
