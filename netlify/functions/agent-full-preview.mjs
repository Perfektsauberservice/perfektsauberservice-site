import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function slugify(v) {
  return normalizeText(v)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function loadConfig() {
  const root = path.resolve(__dirname, '..', '..');
  const citiesRaw = readJsonSafe(path.join(root, 'agent', 'config', 'cities.json')) || { cities: [] };
  const servicesRaw = readJsonSafe(path.join(root, 'agent', 'config', 'services.json')) || { services: [] };
  const goalsRaw = readJsonSafe(path.join(root, 'agent', 'config', 'goals.json')) || {};
  const publicationState = readJsonSafe(path.join(root, 'agent', 'state', 'publication-state.json')) || { items: [] };
  const contentIndex = readJsonSafe(path.join(root, 'agent', 'state', 'content-index.json')) || { items: [] };
  return {
    root,
    cities: citiesRaw.cities || [],
    services: servicesRaw.services || [],
    goals: goalsRaw,
    publicationState,
    contentIndex
  };
}

function matchCity(input, cities) {
  const n = normalizeText(input);
  return cities.find(c => normalizeText(c.slug) === n || normalizeText(c.name) === n) || null;
}

function matchService(input, services) {
  const n = normalizeText(input);
  return services.find(s => normalizeText(s.slug) === n || normalizeText(s.name) === n) || null;
}

function buildCandidates(city, service) {
  const templates = service.questionTemplates || [];
  return templates.map((tpl, i) => {
    const topic = tpl.replaceAll('{city}', city.name);
    const format = /was kostet|preise|kosten/i.test(topic) ? 'FAQ' : 'Artikel';
    const primaryKeyword = `${service.name} ${city.name}`;
    const secondaryKeywords = uniq([
      `${service.name} Kosten ${city.name}`,
      `${service.name} Ablauf ${city.name}`,
      `${service.name} Termin ${city.name}`
    ]);
    return {
      priority: 10 - i,
      topic,
      primaryKeyword,
      secondaryKeywords,
      searchIntent: /was kostet|preise|kosten/i.test(topic) ? 'informational/commercial' : 'commercial/informational',
      format,
      supportsPage: city.servicePage,
      duplicatedDecision: 'create new',
      cannibalizationRisk: 'low',
      matchedExisting: null
    };
  });
}

function checkDuplicate(recommended, state, contentIndex) {
  const slug = slugify(recommended.topic);
  const existing = [
    ...(state.items || []).map(x => ({ slug: x.slug, title: x.title || x.topic })),
    ...(contentIndex.items || []).map(x => ({ slug: x.slug, title: x.title || x.topic }))
  ];
  const found = existing.find(x => normalizeText(x.slug) === slug || normalizeText(x.title) === normalizeText(recommended.topic));
  if (found) {
    return {
      status: 'update existing',
      reason: 'Matching slug or topic found in publication state or content index.',
      risk: 'high',
      affected: found,
      recommendation: `Prefer update/merge with ${found.slug}`
    };
  }
  return {
    status: 'create new',
    reason: 'No matching slug found in lightweight preview mode.',
    risk: 'low',
    affected: null
  };
}

function buildWriter(recommended, city, service) {
  const slug = slugify(recommended.topic);
  const title = recommended.topic;
  const metaTitle = `${title} | Perfekt Sauber Service`;
  const metaDescription = `Klarer Überblick zu ${normalizeText(title).replace(/-/g, ' ')} – mit Ablauf, Kosten, FAQ und schneller Anfrage für ${city.name}.`;
  return {
    title,
    metaTitle,
    metaDescription,
    slug,
    h1: title,
    format: recommended.format,
    primaryKeyword: recommended.primaryKeyword,
    secondaryKeywords: recommended.secondaryKeywords,
    supportsPage: recommended.supportsPage,
    outline: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie läuft ${service.name} in ${city.name} ab?`,
      `Welche Faktoren beeinflussen den Preis?`,
      `Häufige Fragen zu ${service.name} in ${city.name}`
    ],
    faq: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie schnell bekommt man einen Termin in ${city.name}?`,
      `Was ist im Preis meist enthalten?`
    ]
  };
}

function buildGeo(writer, city, service) {
  return {
    directAnswer: `${service.name} in ${city.name} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren. Eine erste Einschätzung ist schnell per WhatsApp möglich.`,
    missingSections: [],
    quoteReadyLines: [
      `${service.name} in ${city.name} wird meist nach Aufwand und Volumen kalkuliert.`,
      `Für eine schnelle Ersteinschätzung reichen oft Fotos per WhatsApp.`
    ],
    faqImprovements: [
      `Add short answer under each FAQ item.`,
      `Use one direct answer in the first 2 paragraphs.`,
      `Mention access, volume and disposal as cost drivers.`
    ],
    semanticSuggestions: [
      `${service.name} Kosten ${city.name}`,
      `${service.name} Ablauf ${city.name}`,
      `${service.name} Termin ${city.name}`
    ]
  };
}

function buildLocalAdaptation(city) {
  const nearby = {
    rastatt: ['Baden-Baden', 'Gaggenau', 'Kuppenheim'],
    'baden-baden': ['Rastatt', 'Sinzheim', 'Bühl'],
    gaggenau: ['Rastatt', 'Gernsbach', 'Kuppenheim'],
    karlsruhe: ['Ettlingen', 'Rastatt', 'Malsch']
  };
  const zones = nearby[city.slug] || [];
  return {
    localizedIntro: `${city.name} und Umgebung: schnelle Terminvergabe, klare Kommunikation und besenreine Übergabe nach der Räumung.`,
    localAreas: zones,
    localCTA: `Jetzt ${city.name}-Anfrage per WhatsApp senden`,
    localFaqHints: zones.map(z => `Also relevant for nearby area: ${z}`)
  };
}

function buildInternalLinking(city, service, recommended) {
  return {
    linksOut: [
      city.servicePage,
      'preisrechner.html',
      'blog.html'
    ],
    linksIn: [
      `${service.slug}-${city.slug}.html`,
      'blog.html'
    ],
    anchorTexts: [
      `${service.name} in ${city.name}`,
      `Kosten einer ${service.name}`,
      'Preisrechner'
    ],
    note: `Link article to ${recommended.supportsPage} and Preisrechner.`
  };
}

function buildLeadConversion(city, service) {
  return {
    topCTA: 'Jetzt kostenlose Einschätzung per WhatsApp anfragen',
    middleCTA: 'Preisorientierung in 1 Minute berechnen',
    bottomCTA: 'Fotos senden und exaktes Angebot erhalten',
    buttons: {
      top: 'WhatsApp Anfrage',
      middle: 'Preisrechner starten',
      bottom: 'Fotos senden'
    },
    microCopy: `${service.name} in ${city.name}: schnelle Ersteinschätzung ohne langen Aufwand.`
  };
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'POST only' }, 405);
  }

  try {
    const body = await req.json();
    const { cities, services, goals, publicationState, contentIndex } = loadConfig();

    const acceptedCityExamples = cities.flatMap(c => [c.slug, c.name]);
    const acceptedServiceExamples = services.flatMap(s => [s.slug, s.name]);

    const city = matchCity(body.city, cities);
    const service = matchService(body.service, services);

    if (!city || !service) {
      return jsonResponse({
        ok: false,
        error: 'Unknown city or service',
        city: body.city,
        service: body.service,
        acceptedCityExamples,
        acceptedServiceExamples
      }, 400);
    }

    const candidates = buildCandidates(city, service);
    const recommended = candidates[0] || null;
    const duplicate = recommended ? checkDuplicate(recommended, publicationState, contentIndex) : null;
    const writer = recommended ? buildWriter(recommended, city, service) : null;
    const geo = writer ? buildGeo(writer, city, service) : null;
    const localAdaptation = recommended ? buildLocalAdaptation(city) : null;
    const internalLinking = recommended ? buildInternalLinking(city, service, recommended) : null;
    const leadConversion = recommended ? buildLeadConversion(city, service) : null;

    return jsonResponse({
      ok: true,
      mode: 'preview',
      city,
      service,
      goals,
      candidates,
      recommended,
      duplicate,
      writer,
      geo,
      localAdaptation,
      internalLinking,
      leadConversion
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
}
