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
  const city = String(body.city || '');
  const service = String(body.service || '');
  const format = String(body.format || 'Article');

  return jsonResponse({
    ok: true,
    mode: 'preview',
    ctas: {
      top: `Jetzt kostenlose Einschätzung für ${service} in ${city} per WhatsApp anfragen`,
      middle: 'Preisorientierung in 1 Minute berechnen',
      bottom: `Fotos senden und exaktes Angebot für ${city} erhalten`
    },
    buttons: {
      top: 'WhatsApp Anfrage',
      middle: 'Preisrechner starten',
      bottom: 'Fotos senden'
    },
    microConversion: format === 'FAQ'
      ? 'Kurze Frage? Erst FAQ lesen, dann direkt unverbindlich anfragen.'
      : 'Direkt handeln statt lange vergleichen: jetzt Anfrage senden.'
  });
}
