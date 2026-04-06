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

export default async function handler(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'POST only' }, 405);
  }

  const body = await readBody(request);
  const city = pickCity(body.city);
  const service = pickService(body.service);
  const baseIntro = String(body.intro || 'Professionelle Dienstleistung in der Region.');
  const nearby = Array.isArray(body.nearbyAreas) ? body.nearbyAreas : [];
  const topic = String(body.topic || '');
  const ctaBase = String(body.cta || (service?.cta || 'Jetzt unverbindlich anfragen'));

  if (!city || !service) {
    return jsonResponse({ ok: false, error: 'Unknown city or service' }, 400);
  }

  const localizedIntro = `${service.name} in ${city.name} und Umgebung: ${baseIntro}`;
  const localContext = [
    `${city.name} ist die Hauptzielregion für diese Seite.`,
    nearby.length ? `Nahe Bereiche: ${nearby.join(', ')}.` : null,
    `Die Seite unterstützt ${city.servicePage}.`
  ].filter(Boolean);

  const localizedFaq = [
    `Was kostet ${service.name.toLowerCase()} in ${city.name}?`,
    `Wie schnell ist ein Termin in ${city.name} möglich?`,
    `Welche Bereiche rund um ${city.name} werden mitbedient?`
  ];

  return jsonResponse({
    ok: true,
    mode: 'preview',
    city,
    service,
    topic,
    localizedIntro,
    localContext,
    localizedFaq,
    localizedCta: `${ctaBase} – auch für ${city.name}`
  });
}
