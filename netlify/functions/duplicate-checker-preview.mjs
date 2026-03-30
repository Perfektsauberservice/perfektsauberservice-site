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
  const topic = String(body.topic || '').trim();
  const slug = String(body.slug || slugify(topic));
  const primaryKeyword = String(body.primaryKeyword || '');
  const universe = readContentUniverse();

  if (!topic && !slug) {
    return jsonResponse({ ok: false, error: 'Missing topic or slug' }, 400);
  }

  const slugNorm = normalize(slug);
  const topicNorm = normalize(topic);
  const keywordNorm = normalize(primaryKeyword);

  let matched = null;
  let risk = 'low';
  let status = 'create new';
  let reason = 'No strong overlap found';

  for (const item of universe) {
    const existingSlug = normalize(item.slug || '');
    const existingTitle = normalize(item.title || '');
    const existingTopic = normalize(item.topic || '');
    const hay = [existingSlug, existingTitle, existingTopic].join(' ');

    if (existingSlug && existingSlug === slugNorm) {
      matched = item;
      risk = 'high';
      status = 'update existing';
      reason = 'Exact slug already exists';
      break;
    }

    if (topicNorm && (existingTitle === topicNorm || existingTopic === topicNorm)) {
      matched = item;
      risk = 'high';
      status = 'update existing';
      reason = 'Exact topic/title already exists';
      break;
    }

    if (keywordNorm && hay.includes(keywordNorm)) {
      matched = item;
      risk = 'medium';
      status = 'merge with existing';
      reason = 'Existing content targets a very similar keyword';
    }
  }

  return jsonResponse({
    ok: true,
    mode: 'preview',
    status,
    reason,
    risk,
    affected: matched ? {
      slug: matched.slug || null,
      title: matched.title || matched.topic || null,
      city: matched.city || null,
      service: matched.service || null
    } : null
  });
}
