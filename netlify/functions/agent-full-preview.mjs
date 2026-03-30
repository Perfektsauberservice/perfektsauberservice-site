import fs from 'fs/promises';
import path from 'path';

const DEFAULT_CITIES = [
  { slug: 'rastatt', name: 'Rastatt', servicePage: 'entruempelung-rastatt.html' },
  { slug: 'baden-baden', name: 'Baden-Baden', servicePage: 'entruempelung-baden-baden.html' },
  { slug: 'gaggenau', name: 'Gaggenau', servicePage: 'entruempelung-gaggenau.html' },
  { slug: 'karlsruhe', name: 'Karlsruhe', servicePage: 'entruempelung-karlsruhe.html' }
];

const DEFAULT_SERVICES = [
  {
    slug: 'entruempelung',
    name: 'Entrümpelung',
    questionTemplates: [
      'Was kostet eine Entrümpelung in {city}?',
      'Wie läuft eine Entrümpelung in {city} ab?',
      'Wie schnell bekommt man einen Termin für eine Entrümpelung in {city}?'
    ]
  },
  {
    slug: 'wohnungsaufloesung',
    name: 'Wohnungsauflösung',
    questionTemplates: [
      'Wie läuft eine Wohnungsauflösung in {city} ab?',
      'Was kostet eine Wohnungsauflösung in {city}?'
    ]
  },
  {
    slug: 'endreinigung',
    name: 'Endreinigung',
    questionTemplates: [
      'Was ist bei einer Endreinigung vor der Wohnungsübergabe in {city} wichtig?',
      'Was kostet eine Endreinigung in {city}?'
    ]
  },
  {
    slug: 'fensterreinigung',
    name: 'Fensterreinigung',
    questionTemplates: [
      'Fensterreinigung in {city}: Preise, Dauer, Ablauf',
      'Wie oft sollte man Fenster in {city} reinigen lassen?'
    ]
  }
];

const DEFAULT_GOALS = {
  goals: ['lead generation', 'local SEO', 'GEO', 'support service pages']
};

async function readJsonMaybe(relPath, fallback) {
  const candidates = [
    path.join(process.cwd(), relPath),
    path.join(process.cwd(), 'src', relPath),
    path.join('/var/task', relPath),
    path.join('/var/task/src', relPath),
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      return JSON.parse(raw);
    } catch {}
  }
  return fallback;
}

function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function slugify(v) {
  return norm(v)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function choosePrimaryKeyword(service, city) {
  return `${service.name} ${city.name}`;
}

function chooseSecondaryKeywords(service, city) {
  const base = `${service.name} ${city.name}`;
  return [
    `${base} Kosten`,
    `${base} Ablauf`,
    `${base} Termin`
  ];
}

function inferFormat(topic) {
  if (/was kostet/i.test(topic)) return 'FAQ';
  if (/wie laeuft|wie läuft/i.test(topic)) return 'article';
  if (/wie schnell/i.test(topic)) return 'article';
  return 'article';
}

function inferIntent(topic) {
  if (/was kostet|kosten|preis/i.test(topic)) return 'informational/commercial';
  return 'commercial/informational';
}

function buildCandidates(city, service) {
  return (service.questionTemplates || []).map((tpl, idx) => {
    const topic = tpl.replaceAll('{city}', city.name);
    return {
      priority: Math.max(10 - idx, 7),
      topic,
      primaryKeyword: choosePrimaryKeyword(service, city),
      secondaryKeywords: chooseSecondaryKeywords(service, city),
      searchIntent: inferIntent(topic),
      format: inferFormat(topic),
      supportsPage: city.servicePage,
      duplicateDecision: 'create new',
      cannibalizationRisk: 'low',
      matchedExisting: null
    };
  });
}

function buildWriter(candidate, city, service) {
  const slug = slugify(candidate.topic);
  return {
    title: candidate.topic,
    metaTitle: `${candidate.topic} | Perfekt Sauber Service`,
    metaDescription: `Klarer Überblick zu ${candidate.topic.toLowerCase()} – mit Ablauf, Kosten, FAQ und schneller Anfrage für ${city.name}.`,
    slug,
    h1: candidate.topic,
    format: candidate.format,
    primaryKeyword: candidate.primaryKeyword,
    secondaryKeywords: candidate.secondaryKeywords,
    supportsPage: candidate.supportsPage,
    outline: [
      'Direkte Antwort',
      'Kosten und Preisfaktoren',
      'Ablauf Schritt für Schritt',
      'Häufige Fragen'
    ],
    faq: [
      `Was kostet ${service.name.toLowerCase()} in ${city.name}?`,
      `Wie schnell bekommt man einen Termin in ${city.name}?`,
      `Wie läuft der Einsatz vor Ort ab?`
    ],
    geoDirectAnswers: [
      `${service.name} in ${city.name} ist meist kurzfristig planbar.`,
      `Die genauen Kosten hängen von Menge, Zugang und Entsorgung ab.`
    ],
    ctas: {
      top: 'Jetzt kostenlose Einschätzung per WhatsApp anfragen',
      middle: 'Preisorientierung in 1 Minute berechnen',
      bottom: 'Fotos senden und exaktes Angebot erhalten'
    }
  };
}

function buildGeo(writer, city, service) {
  return {
    directAnswer: `${service.name} in ${city.name} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren. Eine erste Einschätzung ist schnell per WhatsApp möglich.`,
    missingSections: [],
    quoteReadyLines: writer.geoDirectAnswers,
    faqImprovements: writer.faq,
    semanticSuggestions: [
      `${service.name} ${city.name}`,
      `${service.name} Kosten ${city.name}`,
      `${service.name} Termin ${city.name}`
    ]
  };
}

function buildLinking(city, service, writer) {
  return {
    linksIn: [
      'blog.html',
      city.servicePage
    ],
    linksOut: [
      city.servicePage,
      'preisrechner.html',
      'blog.html'
    ],
    anchors: [
      `${service.name} in ${city.name}`,
      `${service.name} Kosten`,
      'Preisrechner'
    ]
  };
}

function buildConversion(city, service) {
  return {
    top: 'Jetzt kostenlose Einschätzung per WhatsApp anfragen',
    middle: 'Preisorientierung in 1 Minute berechnen',
    bottom: 'Fotos senden und exaktes Angebot erhalten',
    buttons: ['WhatsApp Anfrage', 'Preisrechner starten', 'Kostenloses Angebot'],
    microConversion: `Senden Sie Fotos aus ${city.name} und erhalten Sie schnell eine erste Einschätzung für ${service.name}.`
  };
}

function findCity(cities, input) {
  const n = norm(input);
  return cities.find(c => norm(c.slug) === n || norm(c.name) === n) || null;
}
function findService(services, input) {
  const n = norm(input);
  return services.find(s => norm(s.slug) === n || norm(s.name) === n) || null;
}

export default async function handler(req) {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
        status: 405,
        headers: { 'content-type': 'application/json' }
      });
    }

    const body = await req.json().catch(() => ({}));
    const citiesJson = await readJsonMaybe('agent/config/cities.json', { cities: DEFAULT_CITIES });
    const servicesJson = await readJsonMaybe('agent/config/services.json', { services: DEFAULT_SERVICES });
    const goalsJson = await readJsonMaybe('agent/config/goals.json', DEFAULT_GOALS);

    const cities = Array.isArray(citiesJson.cities) ? citiesJson.cities : DEFAULT_CITIES;
    const services = Array.isArray(servicesJson.services) ? servicesJson.services : DEFAULT_SERVICES;
    const city = findCity(cities, body.city);
    const service = findService(services, body.service);

    if (!city || !service) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Unknown city or service',
        city: body.city,
        service: body.service,
        acceptedCityExamples: cities.slice(0, 4).map(c => ({ slug: c.slug, name: c.name })),
        acceptedServiceExamples: services.slice(0, 4).map(s => ({ slug: s.slug, name: s.name }))
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const candidates = buildCandidates(city, service);
    const recommended = candidates[0];
    const duplicate = {
      status: recommended.duplicateDecision,
      reason: 'No matching slug found in lightweight preview mode.',
      risk: recommended.cannibalizationRisk,
      affected: null
    };
    const writer = buildWriter(recommended, city, service);
    const geo = buildGeo(writer, city, service);
    const linking = buildLinking(city, service, writer);
    const conversion = buildConversion(city, service);

    const response = {
      ok: true,
      mode: 'preview',
      city,
      service,
      goals: goalsJson,
      candidates,
      recommended,
      duplicate,
      writer,
      geo,
      linking,
      conversion
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
