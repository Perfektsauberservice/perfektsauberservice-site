const json = (obj, status = 200) => new Response(JSON.stringify(obj, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

function norm(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

async function ghJson(path) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new Error('Missing GitHub env vars');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pss-agent-zero-preview'
    }
  });
  if (!res.ok) throw new Error(`GitHub fetch failed for ${path}: ${res.status}`);
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return JSON.parse(content);
}

export default async function handler(request) {
  try {
    if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

    const body = await request.json().catch(() => ({}));
    const cityInput = body.city ?? '';
    const serviceInput = body.service ?? '';

    const [citiesDoc, servicesDoc, goalsDoc, contentIndexDoc, publicationStateDoc] = await Promise.all([
      ghJson('agent/config/cities.json'),
      ghJson('agent/config/services.json'),
      ghJson('agent/config/goals.json').catch(() => ({ goals: [] })),
      ghJson('agent/state/content-index.json').catch(() => ({ items: [] })),
      ghJson('agent/state/publication-state.json').catch(() => ({ items: [] }))
    ]);

    const cities = Array.isArray(citiesDoc.cities) ? citiesDoc.cities : [];
    const services = Array.isArray(servicesDoc.services) ? servicesDoc.services : [];

    const city = cities.find(c => norm(c.slug) === norm(cityInput) || norm(c.name) === norm(cityInput));
    const service = services.find(s => norm(s.slug) === norm(serviceInput) || norm(s.name) === norm(serviceInput));

    if (!city || !service) {
      return json({
        ok: false,
        error: 'Unknown city or service',
        city: cityInput,
        service: serviceInput,
        expectedCityExamples: cities.slice(0, 4).map(c => ({ slug: c.slug, name: c.name })),
        expectedServiceExamples: services.slice(0, 4).map(s => ({ slug: s.slug, name: s.name }))
      }, 400);
    }

    const existingItems = [
      ...(Array.isArray(contentIndexDoc.items) ? contentIndexDoc.items : []),
      ...(Array.isArray(publicationStateDoc.items) ? publicationStateDoc.items : [])
    ];

    const existingText = existingItems.map(i => `${i.slug || ''} ${i.title || ''} ${i.topic || ''}`.toLowerCase());

    const goals = Array.isArray(goalsDoc.goals) ? goalsDoc.goals : goalsDoc;
    const templates = Array.isArray(service.questionTemplates) ? service.questionTemplates : [];

    const candidates = templates.map((tpl, index) => {
      const topic = tpl.replaceAll('{city}', city.name);
      const slugBase = norm(topic)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const primaryKeyword = `${service.name} ${city.name}`;
      const secondaryKeywords = [
        `${service.name} ${city.name} Kosten`,
        `${service.name} ${city.name} Ablauf`,
        city.servicePage
      ];
      const hay = `${slugBase} ${topic}`.toLowerCase();
      const duplicate = existingText.find(t => t.includes(slugBase) || hay.includes(t));
      const decision = duplicate ? 'update existing' : 'create new';
      const risk = duplicate ? 'high' : 'low';
      const intent = /kosten|preis/i.test(topic) ? 'commercial/informational' : 'informational/commercial';
      const format = /kosten|preis|ablauf|wie /i.test(topic) ? 'articol GEO + SEO' : 'FAQ';
      return {
        priority: 10 - index,
        topic,
        primaryKeyword,
        secondaryKeywords,
        searchIntent: intent,
        format,
        supportsPage: city.servicePage,
        duplicateDecision: decision,
        cannibalizationRisk: risk,
        matchedExisting: duplicate || null
      };
    });

    return json({
      ok: true,
      city: { slug: city.slug, name: city.name, servicePage: city.servicePage },
      service: { slug: service.slug, name: service.name, cta: service.cta },
      goals,
      candidates,
      recommended: candidates[0] || null
    });
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
}
