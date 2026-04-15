/**
 * Agent 5 — Schema Injector
 * Injecteaza JSON-LD schema corect in toate paginile HTML:
 *   - Pagini oras/serviciu → Service + FAQPage schema
 *   - Articole blog       → Article + FAQPage schema
 *
 * Ruleaza: node agent/scripts/inject-schema.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BASE_URL = 'https://perfektsauberservice.com';

const BUSINESS = {
  '@type': 'LocalBusiness',
  name: 'Perfekt Sauber Service',
  telephone: '+49 163 9087197',
  email: 'kontact@perfektsauberservice.com',
  url: BASE_URL,
  logo: `${BASE_URL}/images/logo.png`,
  image: `${BASE_URL}/images/echipa.png`,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Reutstraße 9',
    addressLocality: 'Loffenau',
    postalCode: '76597',
    addressCountry: 'DE',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 48.7753,
    longitude: 8.2153,
  },
  priceRange: '€€',
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    opens: '07:00',
    closes: '20:00',
  },
};

const SERVICE_NAMES = {
  'entruempelung':     'Entrümpelung',
  'haushaltsaufloesung': 'Haushaltsauflösung',
  'wohnungsaufloesung':  'Wohnungsauflösung',
  'gewerberaeumung':     'Gewerberäumung',
  'bueroaufloesung':     'Büroauflösung',
  'garagenentruempelung': 'Garagenentrümpelung',
  'kellerentruempelung':  'Kellerentrümpelung',
  'dachbodenentruempelung': 'Dachbodenentrümpelung',
  'nachlassaufloesung':  'Nachlassauflösung',
  'messi-wohnung':       'Messie-Wohnung Entrümpelung',
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

// ── Helpers ────────────────────────────────────────────────────────────────

function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']+)["']`, 'i'))
           || html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${name}["']`, 'i'));
  return m ? m[1] : '';
}

function extractOg(html, property) {
  const m = html.match(new RegExp(`<meta\\s+property=["']og:${property}["']\\s+content=["']([^"']+)["']`, 'i'))
           || html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']og:${property}["']`, 'i'));
  return m ? m[1] : '';
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '';
}

function extractCanonical(html) {
  const m = html.match(/href=["']([^"']+)["']\s+rel=["']canonical["']|rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  return m ? (m[1] || m[2]) : '';
}

function extractFaqCityPage(html) {
  // Cauta sectiunea FAQ in paginile de oras (h2 "Fragen und Antworten" + h3/p perechi)
  const faqSection = html.match(/<section[^>]*>[\s\S]*?Fragen[\s\S]*?<\/section>/i);
  if (!faqSection) return [];
  const section = faqSection[0];
  const pairs = [];
  const regex = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = regex.exec(section)) !== null) {
    const q = m[1].replace(/<[^>]+>/g, '').trim();
    const a = m[2].replace(/<[^>]+>/g, '').trim();
    if (q && a) pairs.push({ q, a });
  }
  return pairs;
}

function extractFaqBlogPage(html) {
  // Cauta .faq-item sau .faq-grid in articolele blog
  const pairs = [];
  const regex = /<div[^>]*class=["'][^"']*faq-item[^"']*["'][^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/div>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const q = m[1].replace(/<[^>]+>/g, '').trim();
    const a = m[2].replace(/<[^>]+>/g, '').trim();
    if (q && a) pairs.push({ q, a });
  }
  // Fallback: h3/p perechi in orice sectiune FAQ
  if (pairs.length === 0) {
    const faqBlocks = html.match(/<section[^>]*>[\s\S]*?[Ff][Aa][Qq][\s\S]*?<\/section>/g) || [];
    for (const block of faqBlocks) {
      const r = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
      let n;
      while ((n = r.exec(block)) !== null) {
        const q = n[1].replace(/<[^>]+>/g, '').trim();
        const a = n[2].replace(/<[^>]+>/g, '').trim();
        if (q && a) pairs.push({ q, a });
      }
    }
  }
  return pairs;
}

function hasProperSchema(html) {
  if (!html.includes('application/ld+json')) return false;
  // Verifica daca schema existenta nu e goala (mainEntity: [])
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!m) return false;
  try {
    const schema = JSON.parse(m[1]);
    const arr = Array.isArray(schema) ? schema : [schema];
    // Daca e FAQPage cu mainEntity gol, consideram ca NU are schema proprie
    for (const s of arr) {
      if (s['@type'] === 'FAQPage' && (!s.mainEntity || s.mainEntity.length === 0)) return false;
      if (s['@type'] === 'Article') return true; // are Article schema → ok
      if (s['@type'] === 'Service') return true;
    }
    return false;
  } catch {
    return false;
  }
}

function buildFaqSchema(pairs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

function parseServiceAndCity(filename) {
  // ex: entruempelung-rastatt.html → { service: 'entruempelung', city: 'rastatt' }
  const name = filename.replace('.html', '');
  let service = null, city = null;

  for (const key of Object.keys(SERVICE_NAMES).sort((a, b) => b.length - a.length)) {
    if (name.startsWith(key + '-') || name === key) {
      service = key;
      const rest = name.slice(key.length + 1);
      city = CITY_NAMES[rest] ? rest : null;
      break;
    }
  }
  return { service, city };
}

function injectSchema(html, schemaArr) {
  const json = JSON.stringify(schemaArr, null, 2);
  const tag = `<script type="application/ld+json">\n${json}\n</script>`;

  // Inlocuieste schema existenta daca exista, altfel injecteaza inainte de </head>
  if (html.includes('application/ld+json')) {
    return html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, tag);
  }
  return html.replace('</head>', `${tag}\n</head>`);
}

// ── Procesare ──────────────────────────────────────────────────────────────

let processed = 0, skipped = 0, errors = 0;

const SKIP_FILES = new Set(['danke.html', '410.html', 'datenschutz.html', 'impressum.html',
  'einsatzgebiete-block.html', 'blog.html', 'leistungen.html', 'einsatzgebiete.html', 'preisrechner.html']);

// Pagini oras/serviciu
const rootFiles = readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && !SKIP_FILES.has(f));

for (const file of rootFiles) {
  const filePath = join(ROOT, file);
  let html = readFileSync(filePath, 'utf-8');

  if (hasProperSchema(html)) { skipped++; continue; }

  const { service, city } = parseServiceAndCity(file);
  if (!service || !city) { skipped++; continue; }

  const serviceLabel = SERVICE_NAMES[service];
  const cityLabel = CITY_NAMES[city];
  const title = extractTitle(html);
  const description = extractMeta(html, 'description');
  const canonical = extractCanonical(html) || `${BASE_URL}/${file}`;
  const faqPairs = extractFaqCityPage(html);

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `${serviceLabel} ${cityLabel}`,
      serviceType: serviceLabel,
      description: description || title,
      provider: BUSINESS,
      areaServed: { '@type': 'City', name: cityLabel, '@id': `https://www.wikidata.org/wiki/${cityLabel}` },
      url: canonical,
    },
  ];

  if (faqPairs.length > 0) {
    schemas.push(buildFaqSchema(faqPairs));
  }

  try {
    writeFileSync(filePath, injectSchema(html, schemas), 'utf-8');
    processed++;
    if (processed % 10 === 0) console.log(`  ... ${processed} pagini procesate`);
  } catch (e) {
    console.error(`❌ Eroare la ${file}: ${e.message}`);
    errors++;
  }
}

console.log(`\n✅ Pagini oras/serviciu: ${processed} actualizate, ${skipped} sarite, ${errors} erori`);

// Articole blog — SARITE COMPLET
// pipeline.mjs adauga schema la creare. Nu se modifica automat.
const blogDir = join(ROOT, 'blog');
let blogProcessed = 0;
// blog/ protejat — nu se proceseaza automat
const blogFiles = [];

for (const file of blogFiles) {
  const filePath = join(blogDir, file);
  let html = readFileSync(filePath, 'utf-8');

  if (hasProperSchema(html)) { skipped++; continue; }

  const title = extractTitle(html);
  const description = extractMeta(html, 'description');
  const canonical = extractCanonical(html) || `${BASE_URL}/blog/${file}`;
  const image = extractOg(html, 'image');
  const datePublished = extractMeta(html, 'article:published_time') || new Date().toISOString().split('T')[0];
  const faqPairs = extractFaqBlogPage(html);

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description: description,
      datePublished: datePublished,
      dateModified: datePublished,
      image: image || `${BASE_URL}/images/echipa.png`,
      url: canonical,
      author: { '@type': 'Organization', name: 'Perfekt Sauber Service', url: BASE_URL },
      publisher: {
        '@type': 'Organization',
        name: 'Perfekt Sauber Service',
        logo: { '@type': 'ImageObject', url: `${BASE_URL}/images/logo.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    },
  ];

  if (faqPairs.length > 0) {
    schemas.push(buildFaqSchema(faqPairs));
  }

  try {
    writeFileSync(filePath, injectSchema(html, schemas), 'utf-8');
    blogProcessed++;
  } catch (e) {
    console.error(`❌ Eroare blog ${file}: ${e.message}`);
    errors++;
  }
}

console.log(`✅ Articole blog: ${blogProcessed} actualizate`);
console.log(`\n🎯 Total schema injectata in ${processed + blogProcessed} fisiere.`);
