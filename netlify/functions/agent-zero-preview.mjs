const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function response(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body, null, 2) };
}

async function githubGet(path) {
  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    throw new Error('Missing GitHub env vars');
  }
  const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.raw'
    }
  });
  if (!res.ok) {
    throw new Error(`GitHub fetch failed for ${path}: ${res.status}`);
  }
  return res.text();
}

async function loadJson(path, fallback) {
  try {
    const raw = await githubGet(path);
    return JSON.parse(raw);
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCase(s) {
  return String(s || '')
    .split(/[-\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getServiceName(serviceKey, services) {
  const svc = Array.isArray(services)
    ? services.find(s => normalize(s.key || s.slug || s.name) === normalize(serviceKey))
    : null;
  return svc?.name || titleCase(serviceKey);
}

function getCityName(cityKey, cities) {
  const city = Array.isArray(cities)
    ? cities.find(c => normalize(c.key || c.slug || c.name) === normalize(cityKey))
    : null;
  return city?.name || titleCase(cityKey);
}

function buildCandidates(cityName, serviceName) {
  return [
    {
      topic: `Was kostet eine ${serviceName} in ${cityName}?`,
      primaryKeyword: `${serviceName.toLowerCase()} ${cityName.toLowerCase()} kosten`,
      intent: 'commercial/informational',
      priority: 9,
      format: 'article',
      supports: `${serviceName} ${cityName}`,
    },
    {
      topic: `Wie läuft eine ${serviceName} in ${cityName} ab?`,
      primaryKeyword: `${serviceName.toLowerCase()} ${cityName.toLowerCase()} ablauf`,
      intent: 'commercial/informational',
      priority: 8,
      format: 'article',
      supports: `${serviceName} ${cityName}`,
    },
    {
      topic: `Wie schnell bekommt man einen Termin für eine ${serviceName} in ${cityName}?`,
      primaryKeyword: `${serviceName.toLowerCase()} ${cityName.toLowerCase()} termin`,
      intent: 'commercial',
      priority: 8,
      format: 'faq',
      supports: `${serviceName} ${cityName}`,
    }
  ];
}

function existingSlugsSet(contentIndex, publicationState) {
  const set = new Set();
  const add = s => { if (s) set.add(normalize(s)); };
  if (Array.isArray(contentIndex?.items)) {
    contentIndex.items.forEach(i => add(i.slug || i.url || i.title));
  }
  if (Array.isArray(publicationState?.items)) {
    publicationState.items.forEach(i => add(i.slug || i.url || i.title));
  }
  return set;
}

function duplicateDecision(candidate, slugs) {
  const slug = normalize(candidate.topic);
  if (slugs.has(slug)) {
    return {
      status: 'update existing',
      reason: 'Exact slug already exists',
      cannibalizationRisk: 'high'
    };
  }
  const partial = Array.from(slugs).some(existing => {
    const a = existing.split('-');
    const b = slug.split('-');
    const overlap = a.filter(x => b.includes(x)).length;
    return overlap >= Math.max(4, Math.min(a.length, b.length) - 2);
  });
  if (partial) {
    return {
      status: 'merge with existing',
      reason: 'Very similar topic/intent found',
      cannibalizationRisk: 'medium'
    };
  }
  return {
    status: 'create new',
    reason: 'No close match found',
    cannibalizationRisk: 'low'
  };
}

export default async (request) => {
  try {
    if (request.httpMethod !== 'POST') {
      return response(405, { ok: false, error: 'POST only' });
    }

    const body = JSON.parse(request.body || '{}');
    const cities = await loadJson('agent/config/cities.json', []);
    const services = await loadJson('agent/config/services.json', []);
    const goals = await loadJson('agent/config/goals.json', {});
    const contentIndex = await loadJson('agent/state/content-index.json', { items: [] });
    const publicationState = await loadJson('agent/state/publication-state.json', { items: [] });

    const cityName = getCityName(body.city || body.cityKey || 'rastatt', cities);
    const serviceName = getServiceName(body.service || body.serviceKey || 'entruempelung', services);
    const candidates = buildCandidates(cityName, serviceName);
    const slugs = existingSlugsSet(contentIndex, publicationState);

    const enriched = candidates.map(candidate => ({
      ...candidate,
      secondaryKeywords: [
        `${serviceName.toLowerCase()} ${cityName.toLowerCase()}`,
        `${serviceName.toLowerCase()} ${cityName.toLowerCase()} preis`,
      ],
      duplicateCheck: duplicateDecision(candidate, slugs)
    }));

    const selected = enriched
      .sort((a, b) => {
        const rank = { 'create new': 3, 'merge with existing': 2, 'update existing': 1, reject: 0 };
        return (rank[b.duplicateCheck.status] || 0) - (rank[a.duplicateCheck.status] || 0) || b.priority - a.priority;
      })[0];

    return response(200, {
      ok: true,
      mode: 'preview',
      agentZero: {
        city: cityName,
        service: serviceName,
        businessGoals: goals,
        selected,
        candidates: enriched
      }
    });
  } catch (error) {
    return response(500, { ok: false, error: String(error.message || error) });
  }
};
