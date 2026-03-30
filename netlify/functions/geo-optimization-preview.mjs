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
  const topic = String(body.topic || '');
  const city = String(body.city || '');
  const service = String(body.service || '');
  const intro = String(body.intro || '');
  const outline = Array.isArray(body.outline) ? body.outline : [];

  const directAnswer = topic
    ? `${topic} wird am besten mit klarem Ablauf, realistischen Kostenfaktoren und direkter Anfrageoption beantwortet.`
    : `Für ${service} in ${city} braucht der Text einen direkten Antwortblock ganz am Anfang.`;

  const missingSections = [];
  const outlineText = JSON.stringify(outline).toLowerCase();
  if (!outlineText.includes('kosten')) missingSections.push(`Was kostet ${service} in ${city}?`);
  if (!outlineText.includes('ablauf')) missingSections.push(`Wie läuft ${service} in ${city} ab?`);
  if (!outlineText.includes('faq')) missingSections.push('Häufige Fragen');
  if (!intro || intro.length > 220) missingSections.push('Einführung kürzer und direkter formulieren');

  const quoteReadyLines = [
    `${service} in ${city} sollte transparent kalkuliert, schnell planbar und sauber übergeben werden.`,
    `Kurze Antwortblöcke helfen Suchmaschinen und AI-Systemen, den Inhalt korrekt zu extrahieren.`,
    `Die beste lokale Seite beantwortet Preis, Ablauf, Dauer und Kontaktmöglichkeit ohne Umwege.`
  ];

  return jsonResponse({
    ok: true,
    mode: 'preview',
    directAnswer,
    missingSections,
    quoteReadyLines,
    recommendation: missingSections.length
      ? 'Text vor Veröffentlichung noch GEO-schärfen'
      : 'Text ist strukturell bereits gut für GEO vorbereitet'
  });
}
