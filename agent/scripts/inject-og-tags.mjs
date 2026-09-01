/**
 * Agent 11 — OG Tag Injector
 * Adauga Open Graph tags pe toate paginile care nu le au.
 * Necesar pentru preview corect pe WhatsApp, Facebook, LinkedIn.
 *
 * Ruleaza: node agent/scripts/inject-og-tags.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BASE_URL = 'https://perfektsauberservice.com';
const DEFAULT_IMAGE = `${BASE_URL}/images/echipa.png`;

const SKIP = new Set(['danke.html', '410.html', 'einsatzgebiete-block.html']);

const SERVICE_NAMES = {
  'entruempelung':       'Entrümpelung',
  'haushaltsaufloesung': 'Haushaltsauflösung',
  'wohnungsaufloesung':  'Wohnungsauflösung',
  'gewerberaeumung':     'Gewerberäumung',
  'bueroaufloesung':     'Büroauflösung',
  'garagenentruempelung':'Garagenentrümpelung',
  'kellerentruempelung': 'Kellerentrümpelung',
  'dachbodenentruempelung':'Dachbodenentrümpelung',
  'nachlassaufloesung':  'Nachlassauflösung',
  'messi-wohnung':       'Messie-Wohnung Räumung',
};

const CITY_NAMES = {
  'rastatt':'Rastatt','baden-baden':'Baden-Baden','gaggenau':'Gaggenau',
  'karlsruhe':'Karlsruhe','achern':'Achern','au-am-rhein':'Au am Rhein',
  'bad-herrenalb':'Bad Herrenalb','bad-wildbad':'Bad Wildbad',
  'bietigheim':'Bietigheim','bischweier':'Bischweier','buehl':'Bühl',
  'durmersheim':'Durmersheim',
  'ettlingen':'Ettlingen','forbach':'Forbach','gernsbach':'Gernsbach',
  'huegelsheim':'Hügelsheim','iffezheim':'Iffezheim','kuppenheim':'Kuppenheim',
  'loffenau':'Loffenau','malsch':'Malsch','muggensturm':'Muggensturm',
  'oetigheim':'Ötigheim','pforzheim':'Pforzheim','rheinmuenster':'Rheinmünster',
  'rheinstetten':'Rheinstetten','sinzheim':'Sinzheim','steinmauern':'Steinmauern',
  'stutensee':'Stutensee','weisenbach':'Weisenbach',
};

function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '';
}
function extractDescription(html) {
  const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
           || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  return m ? m[1] : '';
}
function extractCanonical(html) {
  const m = html.match(/href=["']([^"']+)["']\s+rel=["']canonical["']|rel=["']canonical["']\s+href=["']([^"'']+)["']/i);
  return m ? (m[1] || m[2]) : '';
}
function extractOgImage(html) {
  const m = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']|content=["']([^"']+)["']\s+property=["']og:image["']/i);
  return m ? (m[1] || m[2]) : '';
}
function hasOgTags(html) {
  return html.includes('og:title') && html.includes('og:description') && html.includes('og:image');
}
function parseServiceCity(filename) {
  const name = filename.replace('.html','');
  for (const key of Object.keys(SERVICE_NAMES).sort((a,b)=>b.length-a.length)) {
    if (name.startsWith(key+'-')) {
      const rest = name.slice(key.length+1);
      if (CITY_NAMES[rest]) return { service: SERVICE_NAMES[key], city: CITY_NAMES[rest] };
    }
  }
  return null;
}

function buildOgTags({ title, description, url, image, type = 'website' }) {
  return [
    `<meta property="og:title" content="${title.replace(/"/g,'&quot;')}">`,
    `<meta property="og:description" content="${description.replace(/"/g,'&quot;')}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:locale" content="de_DE">`,
  ].join('\n');
}

let updated = 0, skipped = 0;

// Root pages
const rootFiles = readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && !SKIP.has(f));

for (const file of rootFiles) {
  const filePath = join(ROOT, file);
  let html = readFileSync(filePath, 'utf-8');

  if (hasOgTags(html)) { skipped++; continue; }

  const title = extractTitle(html);
  const description = extractDescription(html);
  const canonical = extractCanonical(html) || `${BASE_URL}/${file}`;
  const existingImage = extractOgImage(html);
  let image = existingImage || DEFAULT_IMAGE;

  let ogTitle = title;
  let ogDesc = description;

  // Imbunatateste titlul/descrierea pentru pagini oras
  const parsed = parseServiceCity(file);
  if (parsed) {
    ogTitle = `${parsed.service} ${parsed.city} | Perfekt Sauber Service`;
    ogDesc = description || `${parsed.service} in ${parsed.city} – schnell, zuverlässig und besenrein. Kostenlose Einschätzung von Perfekt Sauber Service.`;
  }

  const ogTags = buildOgTags({ title: ogTitle, description: ogDesc, url: canonical, image });

  // Injecteaza dupa </title> sau inainte de </head>
  if (html.includes('</title>')) {
    html = html.replace('</title>', `</title>\n${ogTags}`);
  } else {
    html = html.replace('</head>', `${ogTags}\n</head>`);
  }

  writeFileSync(filePath, html, 'utf-8');
  updated++;
}

// Blog articles
let blogFiles = [];
try { blogFiles = readdirSync(join(ROOT,'blog')).filter(f=>f.endsWith('.html')); } catch {}

for (const file of blogFiles) {
  const filePath = join(ROOT, 'blog', file);
  let html = readFileSync(filePath, 'utf-8');

  if (hasOgTags(html)) { skipped++; continue; }

  const title = extractTitle(html);
  const description = extractDescription(html);
  const canonical = extractCanonical(html) || `${BASE_URL}/blog/${file}`;
  const image = extractOgImage(html) || DEFAULT_IMAGE;
  const datePublished = (html.match(/article:published_time.*?content=["']([^"']+)["']/) || [])[1] || '';

  let ogTags = buildOgTags({ title, description, url: canonical, image, type: 'article' });
  if (datePublished) ogTags += `\n<meta property="article:published_time" content="${datePublished}">`;

  if (html.includes('</title>')) {
    html = html.replace('</title>', `</title>\n${ogTags}`);
  } else {
    html = html.replace('</head>', `${ogTags}\n</head>`);
  }

  writeFileSync(filePath, html, 'utf-8');
  updated++;
}

console.log(`✅ OG Tags injectate in ${updated} fisiere. ${skipped} aveau deja OG tags.`);
