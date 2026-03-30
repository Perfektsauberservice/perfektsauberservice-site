import fs from 'node:fs';
import path from 'node:path';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function rootDir() {
  return process.cwd();
}

function readJson(relativePath, fallback = {}) {
  const absolute = path.join(rootDir(), relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch {
    return fallback;
  }
}

function slugify(value = '') {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickCity(inputCity) {
  const db = readJson('agent/config/cities.json', { cities: [] });
  const wanted = normalize(inputCity);
  return db.cities.find((item) => normalize(item.slug) === wanted || normalize(item.name) === wanted) || null;
}

function pickService(inputService) {
  const db = readJson('agent/config/services.json', { services: [] });
  const wanted = normalize(inputService);
  return db.services.find((item) => normalize(item.slug) === wanted || normalize(item.name) === wanted) || null;
}

function readContentUniverse() {
  const state = readJson('agent/state/publication-state.json', { items: [] });
  const index = readJson('agent/state/content-index.json', { items: [] });
  const legacy = readJson('content/auto/blog-index.json', { items: [] });
  return [
    ...(state.items || []),
    ...(index.items || []),
    ...(legacy.items || [])
  ];
}

function buildCandidates(city, service) {
  return (service.questionTemplates || []).map((tpl, idx) => {
    const topic = tpl.replaceAll('{city}', city.name);
    return {
      priority: 10 - idx,
      topic,
      primaryKeyword: `${service.name} ${city.name}`,
      secondaryKeywords: [
        `${service.name} Kosten ${city.name}`,
        `${service.name} Ablauf ${city.name}`,
        `${service.name} Termin ${city.name}`
      ],
      searchIntent: idx === 0 ? 'informational/commercial' : 'commercial',
      format: idx === 0 ? 'FAQ' : 'article',
      supportsPage: city.servicePage
    };
  });
}

function duplicateDecision(candidate) {
  const universe = readContentUniverse();
  const topicNorm = normalize(candidate.topic);
  const slugNorm = slugify(candidate.topic);
  for (const item of universe) {
    if (normalize(item.slug || '') === slugNorm) {
      return {
        decision: 'update existing',
        reason: 'Exact slug already exists',
        risk: 'high',
        matchedExisting: item.slug || null
      };
    }
    if (normalize(item.title || item.topic || '') === topicNorm) {
      return {
        decision: 'update existing',
        reason: 'Exact topic already exists',
        risk: 'high',
        matchedExisting: item.slug || null
      };
    }
  }
  return {
    decision: 'create new',
    reason: 'No exact conflict found',
    risk: 'low',
    matchedExisting: null
  };
}

function buildWriter(candidate, city, service) {
  return {
    title: candidate.topic,
    metaTitle: `${candidate.topic} | Perfekt Sauber Service`,
    metaDescription: `Klar erklärt: ${candidate.topic} – mit Ablauf, Kostenfaktoren, FAQ und schneller Anfrage für ${city.name}.`,
    slug: slugify(candidate.topic),
    h1: candidate.topic,
    outline: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie läuft ${service.name} in ${city.name} ab?`,
      `Welche Vorteile bringt ein professioneller Service in ${city.name}?`,
      'Häufige Fragen'
    ],
    faq: [
      `Wie kurzfristig ist ein Termin in ${city.name} möglich?`,
      `Wovon hängen die Kosten in ${city.name} ab?`,
      `Kann ich zuerst Fotos per WhatsApp senden?`
    ],
    geoDirectAnswers: [
      `${service.name} in ${city.name} sollte schnell planbar, transparent kalkuliert und sauber abgeschlossen sein.`,
      `Wer in ${city.name} einen Termin braucht, profitiert von kurzen Antwortwegen und klaren Preisfaktoren.`
    ],
    ctas: {
      top: 'WhatsApp Anfrage',
      middle: 'Preisrechner starten',
      bottom: 'Fotos senden'
    }
  };
}

function buildGeo(writer, city, service) {
  return {
    directAnswer: `${writer.title} wird am stärksten, wenn Preis, Ablauf und Kontaktmöglichkeit in den ersten Abschnitten direkt beantwortet werden.`,
    missingSections: [],
    quoteReadyLines: writer.geoDirectAnswers,
    recommendation: `Text für ${service.name} in ${city.name} ist gut extractable für AI und Search, wenn FAQ und Preisblock sichtbar bleiben.`
  };
}

function buildLinking(writer, city, service) {
  return {
    linksOut: [
      { href: `/${city.servicePage}`, anchor: `${service.name} in ${city.name}` },
      { href: '/preisrechner.html', anchor: 'Preisrechner' },
      { href: '/blog', anchor: 'Weitere Blogartikel' }
    ],
    linksIn: readContentUniverse().slice(0, 5).map((item) => ({
      fromSlug: item.slug || null,
      fromTitle: item.title || item.topic || null,
      suggestedAnchor: writer.title
    }))
  };
}

function buildConversion(city, service) {
  return {
    top: `Jetzt kostenlose Einschätzung für ${service.name} in ${city.name} per WhatsApp anfragen`,
    middle: 'Preisorientierung in 1 Minute berechnen',
    bottom: `Fotos senden und exaktes Angebot für ${city.name} erhalten`
  };
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'POST only' }, 405);
  }

  const body = await readBody(request);
  const city = pickCity(body.city);
  const service = pickService(body.service);
  const goals = readJson('agent/config/goals.json', {});

  if (!city || !service) {
    return jsonResponse({ ok: false, error: 'Unknown city or service' }, 400);
  }

  const candidates = buildCandidates(city, service);
  const recommendedBase = candidates[0];
  const duplicate = duplicateDecision(recommendedBase);
  const recommended = { ...recommendedBase, duplicateDecision: duplicate.decision, cannibalizationRisk: duplicate.risk, matchedExisting: duplicate.matchedExisting };
  const writer = buildWriter(recommended, city, service);
  const geo = buildGeo(writer, city, service);
  const linking = buildLinking(writer, city, service);
  const conversion = buildConversion(city, service);

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
    linking,
    conversion
  });
}
