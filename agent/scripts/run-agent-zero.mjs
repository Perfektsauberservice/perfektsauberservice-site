import fs from 'fs';
import path from 'path';

const root = process.cwd();
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const slugify = value => value.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

function collectExistingSlugs(indexPath, statePath) {
  const slugs = new Set();
  try {
    const blogIndex = readJson(indexPath);
    (blogIndex.items || []).forEach(item => item.slug && slugs.add(item.slug));
  } catch {}
  try {
    const pubState = readJson(statePath);
    (pubState.items || []).forEach(item => item.slug && slugs.add(item.slug));
  } catch {}
  return slugs;
}

function buildIdeas(cities, services) {
  const ideas = [];
  for (const city of cities) {
    for (const service of services) {
      for (const template of service.questionTemplates || []) {
        const topic = template.replaceAll('{city}', city.name);
        ideas.push({
          city: city.slug,
          cityName: city.name,
          service: service.slug,
          serviceName: service.name,
          topic,
          slug: slugify(topic),
          supportPage: city.servicePage,
          recommendedFormat: 'article',
          searchIntent: /kostet|preise|preis/i.test(topic) ? 'commercial/informational' : 'informational/commercial',
          priorityScore: /kostet|termin|ablauf/i.test(topic) ? 9 : 7
        });
      }
    }
  }
  return ideas;
}

const cities = readJson('agent/config/cities.json').cities;
const services = readJson('agent/config/services.json').services;
const goals = readJson('agent/config/goals.json');
const existingSlugs = collectExistingSlugs('content/auto/blog-index.json', 'agent/state/publication-state.json');

const ideas = buildIdeas(cities, services).map(item => ({
  ...item,
  duplicateStatus: existingSlugs.has(item.slug) ? 'reject' : 'create new',
  reason: existingSlugs.has(item.slug) ? 'existing slug already present' : 'no matching slug in index',
  goals: goals.businessGoals
}));

const next = ideas.filter(item => item.duplicateStatus === 'create new')
  .sort((a, b) => b.priorityScore - a.priorityScore)[0] || null;

const output = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalIdeas: ideas.length,
    publishableIdeas: ideas.filter(item => item.duplicateStatus === 'create new').length
  },
  nextRecommendedItem: next,
  ideas
};

const outDir = path.join(root, 'agent', 'output');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'agent-zero-preview.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
