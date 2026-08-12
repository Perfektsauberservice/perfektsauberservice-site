// Build Reinigung pages directly in the new editorial design.
// Constructs the same data shape that parseCityService produces, then feeds it
// into renderCityService — so output looks identical to the migrated existing pages.

import fs from 'node:fs';
import path from 'node:path';
import { renderCityService } from '../lib/render-city-service.mjs';
import { CITIES, ALL_TIER1_CITIES } from './cities.mjs';
import { SERVICES, cityFaqs } from './services.mjs';

const SITE = 'https://perfektsauberservice.com';
const PHONE = '+49 163 9087197';
const EMAIL = 'kontakt@perfektsauberservice.com';

const GALLERY_IMAGES = [
  'lucrare-1.jpg','lucrare-2.jpg','lucrare-3.jpg','lucrare-4.jpg',
  'lucrare-5.jpg','lucrare-6.jpg','lucrare-7.jpg','lucrare-8.jpg',
];

function buildSchema(service, city, slug, faqs) {
  const url = `${SITE}/${slug}`;
  const provider = {
    '@type': 'LocalBusiness',
    name: 'Perfekt Sauber Service',
    telephone: PHONE,
    email: EMAIL,
    url: SITE,
    image: `${SITE}/images/echipa.webp`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Reutstraße 9',
      addressLocality: 'Loffenau',
      postalCode: '76597',
      addressCountry: 'DE',
    },
    priceRange: '€€',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '5.0',
      reviewCount: '9',
      bestRating: '5',
      worstRating: '1',
    },
  };

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${service.label} ${city.label}`,
    serviceType: service.label,
    description: `${service.label} in ${city.label}: regelmäßig oder einmalig, Festpreis nach Begehung, eigenes Personal.`,
    provider,
    areaServed: { '@type': 'City', name: city.label },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'EUR',
      price: String(service.priceFromEur),
      priceSpecification: {
        '@type': 'PriceSpecification',
        priceCurrency: 'EUR',
        price: String(service.priceFromEur),
        description: `ab ${service.priceFromEur} € — Festpreis nach Begehung`,
      },
    },
    url,
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Startseite', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Leistungen', item: `${SITE}/leistungen` },
      { '@type': 'ListItem', position: 3, name: `${service.label} ${city.label}`, item: url },
    ],
  };

  return JSON.stringify([serviceSchema, faqSchema, breadcrumbSchema], null, 2);
}

function buildRelatedLinks(service, city, citySlug) {
  // Two groups:
  //  1. Other Reinigung services in this city
  //  2. Same Reinigung service in nearby cities
  const otherReinigung = Object.values(SERVICES)
    .filter(s => s.slug !== service.slug)
    .map(s => ({ href: `/${s.slug}-${citySlug}`, label: `${s.label} ${city.label}` }));

  const neighbors = ALL_TIER1_CITIES
    .filter(c => c !== citySlug)
    .slice(0, 6)
    .map(c => ({ href: `/${service.slug}-${c}`, label: `${service.label} ${CITIES[c].label}` }));

  return [
    { groupTitle: `Weitere Reinigungs-Leistungen in ${city.label}`, links: otherReinigung },
    { groupTitle: `${service.label} in Nachbarstädten`, links: neighbors },
  ];
}

export function buildCityServicePage(serviceSlug, citySlug) {
  const service = SERVICES[serviceSlug];
  const city = CITIES[citySlug];
  if (!service || !city) throw new Error(`Unknown ${serviceSlug}/${citySlug}`);

  const slug = `${service.slug}-${citySlug}`;
  const url = `${SITE}/${slug}`;

  const allFaqs = [...service.genericFaqs.map(f => ({
    q: typeof f.q === 'function' ? f.q(city) : f.q,
    a: typeof f.a === 'function' ? f.a(city) : f.a,
  })), ...cityFaqs(serviceSlug, city)];

  const title = `${service.label} ${city.label} ab ${service.priceFromEur} € | Festpreis & Termin in 48h | Perfekt Sauber Service`;
  const description = `${service.label} ${city.label} ✓ Festpreis nach Besichtigung ✓ Termin in 48 h ✓ eigenes Personal ✓ versichert ✓ MwSt-Rechnung. Jetzt 0163 9087197 anrufen.`;

  const related = buildRelatedLinks(service, city, citySlug);

  const sections = [
    // 1. Price table
    {
      kind: 'price',
      h2: service.priceTable.h2(city),
      intro: service.priceTable.intro(city),
      headers: service.priceTable.headers,
      rows: service.priceTable.rows,
      note: service.priceTable.note,
    },
    // 2. Service cards
    {
      kind: 'cards',
      h2: service.services.h2(city),
      intro: service.services.intro(city),
      cards: service.services.cards,
    },
    // 3. Gallery
    {
      kind: 'gallery',
      h2: 'Beispiele aus unseren Reinigungen',
      intro: `Bilder aus realen Aufträgen in ${city.label} und Umgebung — direkt vom Einsatzort.`,
      images: GALLERY_IMAGES.map((img, i) => ({
        src: `/images/lucrari/${img}`,
        alt: `${service.label} ${city.label} — Beispiel ${i + 1}`,
      })),
      note: 'Alle Bilder stammen aus echten Aufträgen — keine Stockfotos.',
    },
    // 4. Districts
    {
      kind: 'districts',
      h2: `${city.label}er Stadtteile, in denen wir aktiv sind`,
      intro: `Wir sind in ganz ${city.label} im Einsatz, ${city.flavor}.`,
      chips: city.districts,
      umlandH3: `Auch im Umland von ${city.label}`,
      umlandText: city.umland,
    },
    // 5. Steps
    {
      kind: 'steps',
      h2: `So läuft Ihre ${service.label} in ${city.label} ab`,
      steps: service.steps,
    },
    // 6. USPs
    {
      kind: 'usps',
      h2: `Warum Perfekt Sauber Service in ${city.label}?`,
      usps: service.usps,
    },
    // 7. FAQ
    {
      kind: 'faq',
      h2: `Häufige Fragen zur ${service.label} in ${city.label}`,
      faqs: allFaqs,
    },
    // 8. Related
    {
      kind: 'related',
      h2: `Verwandte Leistungen in ${city.label}`,
      groups: related.map(g => ({ links: g.links })),
      h3s: related.slice(1).map(g => g.groupTitle),
    },
  ];

  const data = {
    title,
    metaDescription: description,
    ogTitle: title,
    ogDescription: description,
    ogUrl: url,
    ogImage: `${SITE}${service.heroImage}`,
    canonical: url,
    lang: 'de',
    jsonLdBlocks: [buildSchema(service, city, slug, allFaqs)],

    eyebrow: service.eyebrow(city),
    h1: `${service.heroH1(city)}`,
    sub: service.heroSub(city),
    heroImg: service.heroImage,
    heroImgAlt: service.heroImageAlt(city),
    waText: encodeURIComponent(`Hallo, ich möchte eine ${service.label} in ${city.label} anfragen.`),

    trustItems: [
      'Termin in 48 h',
      'Festpreis-Garantie',
      'Versichert',
      'MwSt-Rechnung',
    ],

    crumbs: [
      { href: '/', label: 'Startseite' },
      { href: '/leistungen', label: 'Leistungen' },
    ],
    crumbCurrent: `${service.label} ${city.label}`,

    sections,
  };

  return renderCityService(data);
}

// Build a service hub page (no specific city) that lists all city pages
export function buildServiceHubPage(serviceSlug) {
  const service = SERVICES[serviceSlug];
  const slug = service.slug;
  const url = `${SITE}/${slug}`;

  // Construct a "fake city" so service templates work. For the hub use a region label.
  const region = {
    label: 'Mittelbaden',
    districts: ALL_TIER1_CITIES.map(c => CITIES[c].label),
    umland: 'Karlsruhe, Rastatt, Baden-Baden, Pforzheim und der gesamte Raum Mittelbaden + Karlsruher Hardtland',
    wertstoffhof: 'Wertstoffhöfe der jeweiligen Gemeinden',
    flavor: 'in der Region Mittelbaden, im Karlsruher Hardtland und am nördlichen Schwarzwaldrand',
  };

  const title = `${service.label} in Mittelbaden, Karlsruhe & Umgebung | Perfekt Sauber Service`;
  const description = `${service.label} in über 13 Städten in Mittelbaden und im Karlsruher Hardtland — Festpreis, eigenes Personal, versichert. Jetzt 0163 9087197 anrufen.`;

  // Build the city links section
  const cityLinks = ALL_TIER1_CITIES.map(c => ({
    href: `/${slug}-${c}`,
    label: `${service.label} ${CITIES[c].label}`,
  }));

  // Schema: Service + FAQPage with a few generic Qs + BreadcrumbList
  const allFaqs = service.genericFaqs.slice(0, 5).map(f => ({
    q: typeof f.q === 'function' ? f.q(region) : f.q,
    a: typeof f.a === 'function' ? f.a(region) : f.a,
  }));

  const provider = {
    '@type': 'LocalBusiness', name: 'Perfekt Sauber Service',
    telephone: PHONE, email: EMAIL, url: SITE, image: `${SITE}/images/echipa.webp`,
    address: { '@type':'PostalAddress', streetAddress:'Reutstraße 9', addressLocality:'Loffenau', postalCode:'76597', addressCountry:'DE' },
    priceRange:'€€', aggregateRating:{ '@type':'AggregateRating', ratingValue:'5.0', reviewCount:'9', bestRating:'5', worstRating:'1' },
  };

  const jsonLd = JSON.stringify([
    {
      '@context':'https://schema.org', '@type':'Service',
      name: service.label, serviceType: service.label,
      description: `${service.label} in der Region Mittelbaden — Festpreis, eigenes Personal, versichert.`,
      provider,
      areaServed: ALL_TIER1_CITIES.map(c => CITIES[c].label),
      offers: { '@type':'Offer', priceCurrency:'EUR', price:String(service.priceFromEur),
        priceSpecification: { '@type':'PriceSpecification', priceCurrency:'EUR', price:String(service.priceFromEur), description:`ab ${service.priceFromEur} €` } },
      url,
    },
    {
      '@context':'https://schema.org', '@type':'FAQPage',
      mainEntity: allFaqs.map(f => ({ '@type':'Question', name:f.q, acceptedAnswer:{ '@type':'Answer', text:f.a } })),
    },
    {
      '@context':'https://schema.org', '@type':'BreadcrumbList',
      itemListElement: [
        { '@type':'ListItem', position:1, name:'Startseite', item: `${SITE}/` },
        { '@type':'ListItem', position:2, name:'Leistungen', item: `${SITE}/leistungen` },
        { '@type':'ListItem', position:3, name: service.label, item: url },
      ],
    },
  ], null, 2);

  const sections = [
    {
      kind: 'price',
      h2: `Was kostet eine ${service.label}?`,
      intro: `Hier eine ehrliche Orientierung. Festpreise nennen wir nach kurzer Begehung oder nach Fotos per WhatsApp.`,
      headers: service.priceTable.headers,
      rows: service.priceTable.rows,
      note: service.priceTable.note,
    },
    {
      kind: 'cards',
      h2: `Was eine ${service.label} bei uns enthält`,
      intro: service.services.intro(region),
      cards: service.services.cards,
    },
    {
      kind: 'related',
      h2: `${service.label} in Ihrer Stadt`,
      groups: [{ links: cityLinks }],
      h3s: [],
    },
    {
      kind: 'steps',
      h2: `So läuft eine ${service.label} ab`,
      steps: service.steps,
    },
    {
      kind: 'usps',
      h2: `Warum Perfekt Sauber Service?`,
      usps: service.usps,
    },
    {
      kind: 'faq',
      h2: `Häufige Fragen zur ${service.label}`,
      faqs: allFaqs,
    },
  ];

  const data = {
    title, metaDescription: description,
    ogTitle: title, ogDescription: description, ogUrl: url,
    ogImage: `${SITE}${service.heroImage}`, canonical: url, lang: 'de',
    jsonLdBlocks: [jsonLd],

    eyebrow: 'Mittelbaden · Karlsruhe · Nordschwarzwald',
    h1: `${service.label} — sauber, planbar, mit Festpreis`,
    sub: service.heroSub(region),
    heroImg: service.heroImage,
    heroImgAlt: `${service.label} — Perfekt Sauber Service`,
    waText: encodeURIComponent(`Hallo, ich möchte eine ${service.label} anfragen.`),

    trustItems: ['Termin in 48 h','Festpreis-Garantie','Versichert','MwSt-Rechnung'],

    crumbs: [
      { href:'/', label:'Startseite' },
      { href:'/leistungen', label:'Leistungen' },
    ],
    crumbCurrent: service.label,

    sections,
  };

  return renderCityService(data);
}

// CLI
if (process.argv[1]?.endsWith('build.mjs')) {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const inplace = args.includes('--inplace');
  const outDir = inplace ? '.' : '_preview';

  const targets = [];

  if (all) {
    // 3 service hubs
    for (const s of Object.keys(SERVICES)) targets.push({ kind: 'hub', service: s });
    // City × service
    const tier = process.argv.includes('--tier2') ? 2 : 1;
    const COVERAGE_T1 = {
      bueroreinigung: ['achern','buehl','ettlingen','gaggenau','gernsbach','karlsruhe','muggensturm','pforzheim','rheinstetten','sinzheim','stutensee'],
      endreinigung:   ['achern','buehl','ettlingen','gaggenau','gernsbach','muggensturm','pforzheim','rheinstetten','sinzheim','stutensee'],
      grundreinigung: ALL_TIER1_CITIES,
    };
    const COVERAGE_T2 = {
      unterhaltsreinigung: ALL_TIER1_CITIES,
    };
    const coverage = tier === 2 ? COVERAGE_T2 : COVERAGE_T1;
    // Hubs only for the tier we're building
    targets.length = 0;
    for (const s of Object.keys(coverage)) targets.push({ kind: 'hub', service: s });
    for (const [s, cities] of Object.entries(coverage)) {
      for (const c of cities) targets.push({ kind: 'page', service: s, city: c });
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  let okCount = 0, errCount = 0;
  for (const t of targets) {
    try {
      let html, slug;
      if (t.kind === 'hub') {
        html = buildServiceHubPage(t.service);
        slug = t.service;
      } else {
        html = buildCityServicePage(t.service, t.city);
        slug = `${t.service}-${t.city}`;
      }
      const dest = path.join(outDir, `${slug}.html`);
      fs.writeFileSync(dest, html);
      okCount++;
    } catch (e) {
      console.error(`✗ ${t.kind} ${t.service}${t.city ? '/' + t.city : ''}: ${e.message}`);
      errCount++;
    }
  }
  console.log(`\nReinigung pages built: ${okCount} ok, ${errCount} errors → ${outDir}/`);
}
