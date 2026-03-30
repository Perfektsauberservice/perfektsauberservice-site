import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readJson(relPath, fallback = null) {
  try {
    const raw = await fs.readFile(path.join(ROOT, relPath), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function titleCaseSlug(slug = '') {
  return slug
    .split('-')
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('-');
}

function buildCandidates(city, service) {
  const templates = Array.isArray(service.questionTemplates) ? service.questionTemplates : [];
  return templates.map((tpl, idx) => {
    const topic = tpl.replaceAll('{city}', city.name);
    const pri = Math.max(10 - idx, 6);
    const searchIntent = idx === 0 ? 'informational/commercial' : 'commercial/informational';
    const format = idx === 0 ? 'FAQ' : 'article';
    return {
      priority: pri,
      topic,
      primaryKeyword: `${service.name} ${city.name}`,
      secondaryKeywords: [
        `${service.name} Kosten ${city.name}`,
        `${service.name} Ablauf ${city.name}`,
        `${service.name} Termin ${city.name}`
      ],
      searchIntent,
      format,
      supportsPage: city.servicePage,
      duplicateDecision: 'create new',
      cannibalizationRisk: 'low',
      matchedExisting: null
    };
  });
}

function buildDuplicate(recommended, contentIndex) {
  const records = [
    ...(Array.isArray(contentIndex?.items) ? contentIndex.items : []),
    ...(Array.isArray(contentIndex?.articles) ? contentIndex.articles : []),
    ...(Array.isArray(contentIndex) ? contentIndex : [])
  ];
  const normTopic = normalize(recommended.topic);
  const normSlug = normalize(recommended.topic).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const match = records.find((item) => {
    const itemSlug = normalize(item.slug || '');
    const itemTitle = normalize(item.title || item.topic || '');
    return itemSlug === normSlug || itemTitle === normTopic;
  });
  if (match) {
    return {
      status: 'update existing',
      reason: 'Matching slug or topic found in content index.',
      risk: 'high',
      affected: match.slug || match.title || null
    };
  }
  return {
    status: 'create new',
    reason: 'No matching slug found in preview index.',
    risk: 'low',
    affected: null
  };
}

function buildWriter(recommended, city, service) {
  const slug = normalize(recommended.topic).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const title = recommended.topic;
  return {
    title,
    metaTitle: `${title} | Perfekt Sauber Service`,
    metaDescription: `Klarer Überblick zu ${normalize(service.name)} in ${city.name} – mit Ablauf, Kosten, FAQ und schneller Anfrage für ${city.name}.`,
    slug,
    h1: title,
    format: recommended.format,
    primaryKeyword: recommended.primaryKeyword,
    secondaryKeywords: recommended.secondaryKeywords,
    supportsPage: recommended.supportsPage,
    outline: [
      { h2: `Was kostet ${service.name} in ${city.name}?`, h3: ['Preisfaktoren', 'Typische Spannen'] },
      { h2: `Wie läuft ${service.name} in ${city.name} ab?`, h3: ['Vorbereitung', 'Termin', 'Übergabe'] },
      { h2: `Warum Kunden aus ${city.name} anfragen`, h3: ['Schnelle Termine', 'WhatsApp Einschätzung'] },
      { h2: 'Häufige Fragen', h3: ['FAQ 1', 'FAQ 2', 'FAQ 3'] }
    ],
    faq: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie schnell bekommt man einen Termin in ${city.name}?`,
      `Welche Faktoren beeinflussen den Preis?`
    ],
    ctas: {
      top: 'Kostenlose Anfrage per WhatsApp',
      middle: 'Preisrechner in 1 Minute starten',
      bottom: 'Fotos senden und exakte Einschätzung erhalten'
    }
  };
}

function buildGeo(writer, city, service) {
  return {
    directAnswer: `${service.name} in ${city.name} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren. Eine erste Einschätzung ist schnell per WhatsApp möglich.`,
    missingSections: [],
    quoteReadyLines: [
      `${service.name} in ${city.name} ist oft kurzfristig planbar.`,
      `Eine erste Preisorientierung ist meist nach Fotos möglich.`
    ],
    faqImprovements: writer.faq,
    semanticSuggestions: [
      `${service.name} ${city.name} Kosten`,
      `${service.name} ${city.name} Ablauf`,
      `${service.name} ${city.name} Termin`
    ]
  };
}

function buildLocalAdaptation(writer, city) {
  const nearby = city.slug === 'rastatt'
    ? ['Baden-Baden', 'Gaggenau', 'Kuppenheim']
    : city.slug === 'baden-baden'
      ? ['Rastatt', 'Sinzheim', 'Bühl']
      : city.slug === 'gaggenau'
        ? ['Rastatt', 'Gernsbach', 'Kuppenheim']
        : ['Rastatt', 'Ettlingen', 'Baden-Baden'];

  return {
    localizedTitle: writer.title,
    localizedIntro: `${writer.title} – lokal für ${city.name} und Umgebung, mit klaren Infos zu Ablauf, Aufwand und schneller Anfrage.`,
    localAreas: nearby,
    localizedFaq: [
      `Bieten Sie ${writer.primaryKeyword} auch in der Nähe von ${city.name} an?`,
      `Wie schnell ist ein Termin in ${city.name} und Umgebung möglich?`
    ],
    localElementsAdded: [`Hinweis auf ${city.name} und Umgebung`, `Nennung von ${nearby.join(', ')}`]
  };
}

function buildInternalLinking(writer, city, service) {
  return {
    linksOut: [
      { href: city.servicePage, anchor: `${service.name} in ${city.name}` },
      { href: 'preisrechner.html', anchor: 'Preisrechner' },
      { href: 'blog.html', anchor: 'Weitere Blogartikel' }
    ],
    linksIn: [
      { source: city.servicePage, anchor: `${service.name} ${city.name}` },
      { source: 'blog.html', anchor: writer.title }
    ],
    recommendedAnchors: ['Entrümpelung in Rastatt', 'Kosten einer Entrümpelung', 'besenreine Übergabe']
  };
}

function buildLeadConversion(writer) {
  return {
    top: {
      text: 'Jetzt kostenlose Einschätzung per WhatsApp anfragen',
      button: 'WhatsApp Anfrage'
    },
    middle: {
      text: 'Preisorientierung in 1 Minute berechnen',
      button: 'Preisrechner starten'
    },
    bottom: {
      text: 'Fotos senden und exaktes Angebot erhalten',
      button: 'Fotos per WhatsApp senden'
    },
    microConversion: 'Senden Sie 2–3 Fotos und erhalten Sie eine schnelle Ersteinschätzung.'
  };
}

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405,
      headers: { 'content-type': 'application/json' }
    });
  }

  const body = await request.json().catch(() => ({}));
  const inputCity = body.city;
  const inputService = body.service;

  const citiesCfg = await readJson('agent/config/cities.json', { cities: [] });
  const servicesCfg = await readJson('agent/config/services.json', { services: [] });
  const goalsCfg = await readJson('agent/config/goals.json', {
    goals: ['lead generation', 'local seo', 'geo']
  });
  const contentIndex = await readJson('agent/state/content-index.json', { items: [] });

  const cities = Array.isArray(citiesCfg?.cities) ? citiesCfg.cities : [];
  const services = Array.isArray(servicesCfg?.services) ? servicesCfg.services : [];

  const city = cities.find(c => normalize(c.slug) === normalize(inputCity) || normalize(c.name) === normalize(inputCity));
  const service = services.find(s => normalize(s.slug) === normalize(inputService) || normalize(s.name) === normalize(inputService));

  if (!city || !service) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Unknown city or service',
      city: inputCity,
      service: inputService,
      acceptedCityExamples: cities.slice(0, 4).map(c => ({ slug: c.slug, name: c.name })),
      acceptedServiceExamples: services.slice(0, 4).map(s => ({ slug: s.slug, name: s.name }))
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const candidates = buildCandidates(city, service);
  const recommended = candidates[0];
  const duplicate = buildDuplicate(recommended, contentIndex);
  const writer = buildWriter(recommended, city, service);
  const geo = buildGeo(writer, city, service);
  const localAdaptation = buildLocalAdaptation(writer, city);
  const internalLinking = buildInternalLinking(writer, city, service);
  const leadConversion = buildLeadConversion(writer);

  return new Response(JSON.stringify({
    ok: true,
    mode: 'preview',
    city,
    service,
    goals: goalsCfg,
    candidates,
    recommended,
    duplicate,
    writer,
    geo,
    localAdaptation,
    internalLinking,
    leadConversion
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};
