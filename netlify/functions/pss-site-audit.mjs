const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

const REQUIRED_ENV = ['GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_TOKEN', 'NETLIFY_SITE_URL'];
const REPORT_PATH = 'agent/state/site-audit-report.json';

function berlinNow() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(new Date()).replace(' ', 'T');
}

function stripHtml(text = '') {
  return String(text).replace(/<[^>]+>/g, ' ');
}

function countWords(text = '') {
  return stripHtml(String(text || ''))
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function parseFrontmatter(raw = '') {
  const text = String(raw || '');
  if (!text.startsWith('---
')) return { data: {}, body: text };
  const end = text.indexOf('
---
', 4);
  if (end === -1) return { data: {}, body: text };
  const fm = text.slice(4, end).split('
');
  const data = {};
  for (const line of fm) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^"|"$/g, '');
    data[key] = value;
  }
  return { data, body: text.slice(end + 5) };
}

async function githubGet(pathname) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${pathname}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'user-agent': 'pss-site-audit-agent',
      accept: 'application/vnd.github+json'
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function githubPut(pathname, content, message) {
  const existing = await githubGet(pathname);
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: 'main'
  };
  if (existing?.sha) body.sha = existing.sha;
  const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${pathname}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'user-agent': 'pss-site-audit-agent',
      accept: 'application/vnd.github+json',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GitHub put failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function githubReadText(pathname) {
  const existing = await githubGet(pathname);
  if (!existing?.content) throw new Error(`Missing repo file: ${pathname}`);
  return Buffer.from(existing.content, 'base64').toString('utf8');
}

async function readJson(pathname, fallback) {
  const item = await githubGet(pathname);
  if (!item?.content) return fallback;
  try {
    return JSON.parse(Buffer.from(item.content, 'base64').toString('utf8'));
  } catch {
    return fallback;
  }
}

async function listDirectory(pathname) {
  const entries = await githubGet(pathname);
  return Array.isArray(entries) ? entries : [];
}

function buildIssue(severity, code, message) {
  return { severity, code, message };
}

function analyzeArticle(raw, path, htmlExists, cities, services) {
  const { data, body } = parseFrontmatter(raw);
  const issues = [];
  const slug = data.slug || path.replace(/^content\/auto\//, '').replace(/\.md$/, '');
  const wordCount = countWords(body);
  const cityValid = cities.has(data.city || '');
  const serviceValid = services.has(data.service || '');
  if (!data.title) issues.push(buildIssue('high', 'missing_title', 'Title fehlt im Frontmatter.'));
  if (!data.seoTitle) issues.push(buildIssue('medium', 'missing_seo_title', 'seoTitle fehlt.'));
  if (!data.metaDescription) issues.push(buildIssue('high', 'missing_meta_description', 'metaDescription fehlt.'));
  if (!data.heroImage) issues.push(buildIssue('medium', 'missing_hero_image', 'heroImage fehlt.'));
  if (!data.city) issues.push(buildIssue('high', 'missing_city', 'City fehlt im Frontmatter.'));
  if (!data.service) issues.push(buildIssue('high', 'missing_service', 'Service fehlt im Frontmatter.'));
  if (!cityValid && data.city) issues.push(buildIssue('medium', 'unknown_city', `City ist nicht in cities.json: ${data.city}`));
  if (!serviceValid && data.service) issues.push(buildIssue('medium', 'unknown_service', `Service ist nicht in services.json: ${data.service}`));
  if (wordCount < 220) issues.push(buildIssue('high', 'too_short', `Artikel ist zu kurz (${wordCount} Wörter).`));
  else if (wordCount < 350) issues.push(buildIssue('medium', 'thin_content', `Artikel ist eher dünn (${wordCount} Wörter).`));
  if (!/##\s+Häufige Fragen/i.test(body)) issues.push(buildIssue('medium', 'missing_faq', 'FAQ-Bereich fehlt.'));
  if (!/##\s+CTA/i.test(body)) issues.push(buildIssue('medium', 'missing_cta', 'CTA-Bereich fehlt.'));
  if (!htmlExists) issues.push(buildIssue('high', 'missing_html', 'Passende HTML-Datei fehlt.'));
  return {
    slug,
    path,
    htmlPath: `auto/${slug}.html`,
    title: data.title || slug,
    city: data.city || null,
    service: data.service || null,
    heroImage: data.heroImage || null,
    wordCount,
    issueCount: issues.length,
    issues
  };
}

export default async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ ok: false, error: 'GET or POST only' }, 405);
  }

  const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missingEnv.length) {
    return json({ ok: false, error: `Missing env: ${missingEnv.join(', ')}` }, 500);
  }

  try {
    const [citiesData, servicesData, blogIndex, publicationState, mdFiles, htmlFiles] = await Promise.all([
      readJson('agent/config/cities.json', { cities: [] }),
      readJson('agent/config/services.json', { services: [] }),
      readJson('content/auto/blog-index.json', { items: [] }),
      readJson('agent/state/publication-state.json', { date: null, count: 0, items: [] }),
      listDirectory('content/auto'),
      listDirectory('auto')
    ]);

    const cities = new Set((citiesData.cities || []).map(item => item.name));
    const services = new Set((servicesData.services || []).map(item => item.name));
    const htmlSet = new Set(htmlFiles.filter(item => item.type === 'file').map(item => item.name));
    const mdEntries = mdFiles.filter(item => item.type === 'file' && item.name.endsWith('.md') && item.name !== 'README.txt');

    const articles = [];
    for (const file of mdEntries) {
      const path = `content/auto/${file.name}`;
      const raw = await githubReadText(path);
      const slug = file.name.replace(/\.md$/, '');
      articles.push(analyzeArticle(raw, path, htmlSet.has(`${slug}.html`), cities, services));
    }

    const slugMap = new Map();
    const titleMap = new Map();
    const imageMap = new Map();
    for (const article of articles) {
      slugMap.set(article.slug, (slugMap.get(article.slug) || 0) + 1);
      titleMap.set(article.title, (titleMap.get(article.title) || 0) + 1);
      if (article.heroImage) imageMap.set(article.heroImage, (imageMap.get(article.heroImage) || 0) + 1);
    }

    for (const article of articles) {
      if ((slugMap.get(article.slug) || 0) > 1) article.issues.push(buildIssue('high', 'duplicate_slug', 'Slug kommt mehrfach vor.'));
      if ((titleMap.get(article.title) || 0) > 1) article.issues.push(buildIssue('medium', 'duplicate_title', 'Titel kommt mehrfach vor.'));
      if ((imageMap.get(article.heroImage) || 0) >= 3) article.issues.push(buildIssue('low', 'image_reused_often', `Hero-Bild wird oft wiederverwendet (${imageMap.get(article.heroImage)}x).`));
      article.issueCount = article.issues.length;
    }

    const rootChecks = [];
    for (const page of ['index.html', 'blog.html', 'dashboard/index.html', 'dashboard/agent.html']) {
      const exists = await githubGet(page);
      rootChecks.push({ page, exists: !!exists });
    }

    const issueBuckets = { high: 0, medium: 0, low: 0 };
    for (const article of articles) {
      for (const issue of article.issues) issueBuckets[issue.severity] += 1;
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      generatedAtBerlin: berlinNow(),
      siteUrl: process.env.NETLIFY_SITE_URL,
      articleCount: articles.length,
      blogIndexCount: Array.isArray(blogIndex.items) ? blogIndex.items.length : 0,
      publicationState,
      rootChecks,
      issues: issueBuckets,
      reusedImages: [...imageMap.entries()].filter(([, count]) => count >= 2).sort((a,b)=>b[1]-a[1]).map(([image, count]) => ({ image, count })),
      worstArticles: [...articles].sort((a,b) => b.issueCount - a.issueCount).slice(0, 20)
    };

    const report = { ok: true, summary, articles };
    await githubPut(REPORT_PATH, JSON.stringify(report, null, 2), `chore(audit): update site audit ${summary.generatedAtBerlin}`);

    return json(report);
  } catch (error) {
    return json({ ok: false, error: error.message || 'Unknown error' }, 500);
  }
};
