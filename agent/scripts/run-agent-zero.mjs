import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const safeReadJson = async (relativePath, fallback = {}) => {
  try {
    const full = path.join(repoRoot, relativePath);
    const raw = await fs.readFile(full, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const slugify = (value = '') =>
  value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const normalize = (value = '') =>
  value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const jaccard = (a, b) => {
  const setA = new Set(normalize(a).split(/\s+/).filter(Boolean));
  const setB = new Set(normalize(b).split(/\s+/).filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
};

const scorePriority = ({ intent, supportsLocalPage, supportsServicePage, format }) => {
  let score = 5;
  if (intent === 'commercial/informational') score += 2;
  if (supportsLocalPage) score += 1;
  if (supportsServicePage) score += 1;
  if (format === 'article GEO + SEO') score += 1;
  return Math.min(score, 10);
};

const extractCities = (payload) => {
  const list = Array.isArray(payload) ? payload : payload.cities || payload.items || [];
  return list.map((item) => ({
    slug: item.slug || slugify(item.city || item.name || item.label || ''),
    name: item.name || item.city || item.label || item.slug || '',
    nearbyAreas: item.nearbyAreas || item.nearby || item.zones || []
  })).filter(x => x.slug && x.name);
};

const extractServices = (payload) => {
  const list = Array.isArray(payload) ? payload : payload.services || payload.items || [];
  return list.map((item) => ({
    slug: item.slug || slugify(item.name || item.service || item.label || ''),
    name: item.name || item.service || item.label || item.slug || '',
    primaryKeywordBase: item.primaryKeywordBase || item.keywordBase || item.name || item.service || '',
    secondaryKeywordBase: item.secondaryKeywordBase || item.secondaryKeyword || '',
    questionTemplates: item.questionTemplates || item.topics || [],
    targetPage: item.targetPage || item.supportsPage || item.servicePage || item.slug || ''
  })).filter(x => x.slug && x.name);
};

const extractExisting = (contentIndex, publicationState) => {
  const existing = [];
  const add = (entry) => {
    if (!entry) return;
    existing.push({
      slug: entry.slug || '',
      title: entry.title || entry.topic || '',
      keyword: entry.primaryKeyword || entry.keyword || '',
      url: entry.url || ''
    });
  };

  if (Array.isArray(contentIndex)) contentIndex.forEach(add);
  if (Array.isArray(contentIndex.items)) contentIndex.items.forEach(add);
  if (Array.isArray(contentIndex.articles)) contentIndex.articles.forEach(add);
  if (Array.isArray(publicationState.items)) publicationState.items.forEach(add);
  return existing.filter(x => x.slug || x.title);
};

const duplicateDecision = (candidate, existingList) => {
  const candidateSlug = slugify(candidate.topic);
  const exactSlug = existingList.find(x => x.slug === candidateSlug);
  if (exactSlug) {
    return {
      status: 'update existing',
      reason: 'Există deja exact același slug.',
      affected: exactSlug.title || exactSlug.slug,
      cannibalizationRisk: 'high'
    };
  }

  let best = null;
  let bestScore = 0;
  for (const entry of existingList) {
    const score = Math.max(jaccard(candidate.topic, entry.title), jaccard(candidate.primaryKeyword, entry.keyword || entry.title));
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (best && bestScore >= 0.8) {
    return {
      status: 'merge with existing',
      reason: 'Tema este foarte apropiată de un articol existent.',
      affected: best.title || best.slug,
      cannibalizationRisk: 'high'
    };
  }

  if (best && bestScore >= 0.55) {
    return {
      status: 'update existing',
      reason: 'Tema se suprapune parțial și ar fi mai sigur un update.',
      affected: best.title || best.slug,
      cannibalizationRisk: 'medium'
    };
  }

  return {
    status: 'create new',
    reason: 'Nu există suprapunere semnificativă cu conținutul existent.',
    affected: null,
    cannibalizationRisk: 'low'
  };
};

const inferIntent = (topic) => {
  const low = normalize(topic);
  if (low.includes('kosten') || low.includes('preis') || low.includes('termin')) return 'commercial/informational';
  if (low.includes('wie lauft') || low.includes('ablauf')) return 'informational/commercial';
  return 'informational';
};

const inferFormat = (topic, cityName) => {
  const low = normalize(topic);
  if (low.includes(cityName.toLowerCase())) return 'article GEO + SEO';
  if (low.includes('faq') || low.includes('haufige fragen')) return 'FAQ';
  return 'article';
};

const main = async () => {
  const citiesRaw = await safeReadJson('agent/config/cities.json', { cities: [] });
  const servicesRaw = await safeReadJson('agent/config/services.json', { services: [] });
  const goalsRaw = await safeReadJson('agent/config/goals.json', { goals: ['lead generation', 'local SEO', 'GEO'] });
  const contentIndexRaw = await safeReadJson('agent/state/content-index.json', { items: [] });
  const publicationStateRaw = await safeReadJson('agent/state/publication-state.json', { items: [] });

  const cities = extractCities(citiesRaw);
  const services = extractServices(servicesRaw);
  const existing = extractExisting(contentIndexRaw, publicationStateRaw);
  const goals = goalsRaw.goals || goalsRaw.objectives || goalsRaw;

  const output = {
    generatedAt: new Date().toISOString(),
    goals,
    summary: {
      cityCount: cities.length,
      serviceCount: services.length,
      existingContentCount: existing.length
    },
    candidates: []
  };

  for (const city of cities) {
    for (const service of services) {
      const templates = service.questionTemplates.length
        ? service.questionTemplates
        : [
            `Was kostet eine ${service.name} in ${city.name}?`,
            `Wie läuft eine ${service.name} in ${city.name} ab?`,
            `Wie schnell bekommt man einen Termin für eine ${service.name} in ${city.name}?`
          ];

      for (const topic of templates) {
        const primaryKeyword = `${normalize(service.primaryKeywordBase || service.name).replace(/\s+/g, ' ')} ${normalize(city.name).replace(/\s+/g, ' ')}`.trim();
        const secondaryKeyword = service.secondaryKeywordBase
          ? `${service.secondaryKeywordBase} ${city.name}`
          : `${service.name} ${city.name} Ablauf`;
        const intent = inferIntent(topic);
        const format = inferFormat(topic, city.name);
        const duplicate = duplicateDecision({ topic, primaryKeyword }, existing);
        const supportsPage = service.targetPage || `${service.slug}-${city.slug}`;
        const priority = scorePriority({
          intent,
          supportsLocalPage: true,
          supportsServicePage: true,
          format
        });

        output.candidates.push({
          city: city.name,
          service: service.name,
          topic,
          primaryKeyword,
          secondaryKeywords: [secondaryKeyword],
          searchIntent: intent,
          priority: `${priority}/10`,
          recommendedFormat: format,
          supportsPage,
          nearbyAreas: city.nearbyAreas,
          duplicateCheck: duplicate
        });
      }
    }
  }

  output.candidates.sort((a, b) => {
    const aStatus = a.duplicateCheck.status === 'create new' ? 0 : 1;
    const bStatus = b.duplicateCheck.status === 'create new' ? 0 : 1;
    if (aStatus !== bStatus) return aStatus - bStatus;
    return parseInt(b.priority, 10) - parseInt(a.priority, 10);
  });

  const outputPath = path.join(repoRoot, 'agent/output/agent-zero-preview.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');

  console.log(`Agent Zero preview generated: ${output.candidates.length} candidates`);
  console.log(`Saved to: ${outputPath}`);
  console.log(JSON.stringify(output.candidates.slice(0, 5), null, 2));
};

main().catch((error) => {
  console.error('Agent Zero failed:', error);
  process.exit(1);
});
