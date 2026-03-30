import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readJson(relPath, fallback) {
  try {
    const full = path.join(ROOT, relPath);
    const raw = await readFile(full, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function titleCase(s='') {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function pickTopicTemplates(serviceKey, cityName) {
  const serviceLabel = serviceKey === 'entruempelung' ? 'Entrümpelung' : titleCase(serviceKey);
  return [
    `Was kostet eine ${serviceLabel} in ${cityName}?`,
    `Wie läuft eine ${serviceLabel} in ${cityName} ab?`,
    `Wie schnell bekommt man einen Termin für eine ${serviceLabel} in ${cityName}?`
  ];
}

function buildCandidate(topic, citySlug, cityName, serviceKey) {
  const lowerService = serviceKey === 'entruempelung' ? 'entruempelung' : slugify(serviceKey);
  const primary = `${lowerService} ${citySlug} ${topic.toLowerCase().includes('kostet') ? 'kosten' : topic.toLowerCase().includes('termin') ? 'termin' : 'ablauf'}`;
  const secondary = [
    `${lowerService} ${citySlug}`,
    `${citySlug} ${lowerService}`,
    `${lowerService} ${cityName.toLowerCase()}`
  ];
  const format = topic.toLowerCase().includes('kostet') || topic.toLowerCase().includes('termin') || topic.toLowerCase().includes('läuft')
    ? 'artikel'
    : 'faq';
  const intent = topic.toLowerCase().includes('kostet') || topic.toLowerCase().includes('termin')
    ? 'commercial/informational'
    : 'informational';
  return {
    topic,
    slug: slugify(topic),
    primaryKeyword: primary,
    secondaryKeywords: secondary,
    searchIntent: intent,
    priority: 8,
    recommendedFormat: format,
    supportsPage: `${titleCase(serviceKey)} ${cityName}`
  };
}

export default async (request, context) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const cityInput = String(body.city || '').trim().toLowerCase();
    const serviceInput = String(body.service || '').trim().toLowerCase();

    const cities = await readJson('agent/config/cities.json', []);
    const services = await readJson('agent/config/services.json', []);
    const goals = await readJson('agent/config/goals.json', { businessGoals: ['lead generation', 'local seo', 'geo'] });
    const contentIndex = await readJson('agent/state/content-index.json', { items: [] });
    const publicationState = await readJson('agent/state/publication-state.json', { items: [] });

    const city = Array.isArray(cities)
      ? cities.find(c => slugify(c.slug || c.name || c.city) === cityInput || slugify(c.name || c.city) === cityInput)
      : null;
    const service = Array.isArray(services)
      ? services.find(s => slugify(s.slug || s.key || s.name) === serviceInput || slugify(s.name) === serviceInput)
      : null;

    if (!city || !service) {
      return new Response(JSON.stringify({ ok: false, error: 'Unknown city or service', city: cityInput, service: serviceInput }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const cityName = city.name || city.city || titleCase(cityInput);
    const citySlug = slugify(city.slug || city.name || city.city);
    const serviceKey = slugify(service.slug || service.key || service.name);
    const topics = pickTopicTemplates(serviceKey, cityName).map(t => buildCandidate(t, citySlug, cityName, serviceKey));

    const existingSlugs = new Set([
      ...(Array.isArray(contentIndex.items) ? contentIndex.items.map(i => i.slug).filter(Boolean) : []),
      ...(Array.isArray(publicationState.items) ? publicationState.items.map(i => i.slug).filter(Boolean) : [])
    ]);

    const evaluated = topics.map(candidate => {
      const exact = existingSlugs.has(candidate.slug);
      const partial = Array.from(existingSlugs).some(s => s && (s.includes(citySlug) && s.includes(serviceKey) && (s.includes('kostet') === candidate.slug.includes('kostet') || s.includes('termin') === candidate.slug.includes('termin') || s.includes('ablauf') === candidate.slug.includes('ablauf'))));
      let status = 'create new';
      let risk = 'low';
      let reason = 'No competing slug found.';
      if (exact) {
        status = 'update existing';
        risk = 'high';
        reason = 'Exact slug already exists.';
      } else if (partial) {
        status = 'merge with existing';
        risk = 'medium';
        reason = 'A closely related slug already exists for same city/service intent.';
      }
      return { ...candidate, duplicateDecision: { status, cannibalizationRisk: risk, reason } };
    });

    const best = evaluated.find(e => e.duplicateDecision.status === 'create new') || evaluated[0];

    return new Response(JSON.stringify({
      ok: true,
      agent: 'agent-zero-preview',
      input: { city: cityName, service: service.name || serviceKey },
      goals: goals.businessGoals || goals.goals || goals,
      candidates: evaluated,
      recommended: best,
      summary: {
        totalCandidates: evaluated.length,
        createNew: evaluated.filter(e => e.duplicateDecision.status === 'create new').length,
        updates: evaluated.filter(e => e.duplicateDecision.status === 'update existing').length,
        merges: evaluated.filter(e => e.duplicateDecision.status === 'merge with existing').length
      }
    }, null, 2), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error?.message || String(error) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
