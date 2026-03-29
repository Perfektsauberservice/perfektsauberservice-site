const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

const REQUIRED_ENV = ['OPENAI_API_KEY', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_TOKEN', 'NETLIFY_SITE_URL'];
const DAILY_LIMIT = Number(process.env.AUTO_DAILY_LIMIT || 5);
const DAILY_STATE_PATH = 'agent/state/publication-state.json';
const BLOG_INDEX_PATH = 'content/auto/blog-index.json';

const slugify = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-');

function berlinDateStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function berlinDateTime(date = new Date()) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

async function githubReadText(pathname) {
  const existing = await githubGet(pathname);
  if (!existing?.content) throw new Error(`Missing repo file: ${pathname}`);
  return Buffer.from(existing.content, 'base64').toString('utf8');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error('OpenAI response was not valid JSON');
}

function pickNextTopic({ city, service, publishedToday, blogIndex }) {
  const usedSlugs = new Set((blogIndex.items || []).map(item => item.slug));
  const usedTopicsToday = new Set((publishedToday || []).map(item => `${item.city}|${item.service}|${item.topic}`));
  const serviceTopics = Array.isArray(service.questionTemplates) ? service.questionTemplates : [];

  for (const template of serviceTopics) {
    const topic = template.replace('{city}', city.name);
    const candidateSlug = slugify(`${service.slug}-${city.slug}-${topic}`);
    if (usedSlugs.has(candidateSlug)) continue;
    if (usedTopicsToday.has(`${city.name}|${service.name}|${topic}`)) continue;
    return topic;
  }

  return serviceTopics[0]?.replace('{city}', city.name) || `${service.name} ${city.name}`;
}

async function openAIArticle({ city, service, topic, promptRules }) {
  const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
  const userPrompt = `Create one German local service article as strict JSON.\n\nCity: ${city.name}\nService: ${service.name}\nTopic: ${topic}\nHero image: ${city.heroImage}\nService page: ${city.servicePage}\nCTA: ${service.cta}\n\nReturn valid JSON with this schema only:\n{\n  "title": string,\n  "slug": string,\n  "seoTitle": string,\n  "metaDescription": string,\n  "intro": string,\n  "sections": [{"heading": string, "html": string}],\n  "faq": [{"question": string, "answer": string}],\n  "cta": string,\n  "needs_review": boolean\n}\n\nReturn ONLY valid JSON. No markdown fences. No explanation.`;

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: promptRules }] },
        { role: 'user', content: [{ type: 'input_text', text: userPrompt }] }
      ],
      max_output_tokens: 2200
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const text =
    (typeof data.output_text === 'string' ? data.output_text.trim() : '') ||
    (Array.isArray(data.output)
      ? data.output
          .flatMap(item => Array.isArray(item.content) ? item.content : [])
          .filter(part => part.type === 'output_text')
          .map(part => part.text || '')
          .join('\n')
          .trim()
      : '');

  if (!text) {
    throw new Error(`OpenAI returned no text output: ${JSON.stringify(data)}`);
  }

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const article = extractJson(cleaned);
  article.slug = slugify(article.slug || `${service.slug}-${city.slug}-${topic}`);
  return article;
}

function articleHtml({ article, city, service }) {
  const faqHtml = (article.faq || [])
    .map(item => `<div class="faq-item"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></div>`)
    .join('');
  const sectionsHtml = (article.sections || [])
    .map(sec => `<section class="content-section"><h2>${escapeHtml(sec.heading)}</h2><div class="content-copy">${sec.html}</div></section>`)
    .join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(article.seoTitle || article.title)}</title>
<meta name="description" content="${escapeHtml(article.metaDescription || '')}" />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="${process.env.NETLIFY_SITE_URL.replace(/\/$/, '')}/auto/${article.slug}.html" />
<style>
:root{--bg:#f5f8fc;--text:#122033;--muted:#5d697a;--line:#dde5ee;--blue:#21466f;--green:#76c043}
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--text);background:#fff;line-height:1.7}a{text-decoration:none;color:inherit}.container{max-width:980px;margin:0 auto;padding:0 22px}.hero{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(15,23,42,.84),rgba(15,23,42,.56)),url('../${city.heroImage}') center/cover no-repeat;color:#fff;padding:88px 0 60px}.hero .container{position:relative;z-index:1}.badge{display:inline-flex;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24);font-weight:800}.hero h1{font-size:clamp(2rem,5vw,4rem);line-height:1.02;margin:18px 0 0}.lead{font-size:1.15rem;max-width:820px;color:rgba(255,255,255,.94);margin-top:14px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}.btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 20px;border-radius:18px;font-weight:800}.btn-green{background:var(--green);color:#fff}.btn-blue{background:rgba(15,23,42,.38);border:1px solid rgba(255,255,255,.42);color:#fff;backdrop-filter:blur(4px)}.wrap{padding:38px 0 56px}.content-card{background:#fff;border:1px solid var(--line);border-radius:24px;padding:26px;box-shadow:0 18px 40px rgba(15,23,42,.06)}.content-section + .content-section{margin-top:26px}.content-section h2{font-size:1.6rem;line-height:1.2;margin:0 0 10px}.content-copy p{margin:0 0 12px}.faq-grid{display:grid;gap:16px;margin-top:18px}.faq-item{border:1px solid var(--line);border-radius:18px;padding:18px;background:#f8fbff}.faq-item h3{margin:0 0 8px;font-size:1.05rem}.notice{margin-top:18px;padding:14px 16px;border-radius:16px;background:#fff7e8;border:1px solid #f6dca7;color:#8a5b00}.footer{padding:28px 0 42px;color:#66778f;font-size:14px}.footer a{font-weight:700;color:#21466f}@media(max-width:720px){.actions{flex-direction:column;align-items:stretch}.content-card{padding:20px}}</style>
</head>
<body>
<section class="hero"><div class="container"><div class="badge">${escapeHtml(service.name)} · ${escapeHtml(city.name)}</div><h1>${escapeHtml(article.title)}</h1><div class="lead">${escapeHtml(article.intro)}</div><div class="actions"><a class="btn btn-green" href="https://wa.me/491639087197">WhatsApp Anfrage</a><a class="btn btn-blue" href="../preisrechner.html">Preisrechner starten</a><a class="btn btn-blue" href="../${city.servicePage}">Zur Stadtseite</a><a class="btn btn-blue" href="../blog.html">Zum Blog</a></div></div></section>
<section class="wrap"><div class="container"><div class="content-card">${sectionsHtml}<section class="content-section"><h2>Häufige Fragen</h2><div class="faq-grid">${faqHtml}</div></section><section class="content-section"><h2>Jetzt anfragen</h2><p>${escapeHtml(article.cta || service.cta)}</p><div class="actions"><a class="btn btn-green" href="https://wa.me/491639087197">WhatsApp</a><a class="btn btn-blue" href="tel:+491639087197">Jetzt anrufen</a></div></section>${article.needs_review ? '<div class="notice">Hinweis: Dieser Beitrag wurde automatisch vorbereitet und sollte vor größeren Preis- oder Leistungsversprechen kurz geprüft werden.</div>' : ''}</div><div class="footer"><a href="../index.html">Startseite</a> · <a href="../blog.html">Blog</a> · <a href="../${city.servicePage}">${escapeHtml(city.name)}</a> · <a href="../preisrechner.html">Preisrechner</a></div></div></section>
</body></html>`;
}

function markdownArticle({ article, city, service }) {
  const sections = (article.sections || [])
    .map(sec => `## ${sec.heading}\n\n${String(sec.html || '').replace(/<[^>]+>/g, ' ')}`)
    .join('\n\n');
  const faq = (article.faq || [])
    .map(item => `### ${item.question}\n\n${item.answer}`)
    .join('\n\n');

  return `---
title: "${article.title}"
slug: "${article.slug}"
city: "${city.name}"
service: "${service.name}"
heroImage: "${city.heroImage}"
servicePage: "${city.servicePage}"
seoTitle: "${article.seoTitle || article.title}"
metaDescription: "${article.metaDescription || ''}"
needs_review: ${article.needs_review ? 'true' : 'false'}
publishedAt: "${new Date().toISOString()}"
---

# ${article.title}

${article.intro}

${sections}

## Häufige Fragen

${faq}

## CTA

${article.cta || service.cta}
`;
}

async function githubGet(pathname) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${pathname}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'user-agent': 'pss-auto-agent',
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
      'user-agent': 'pss-auto-agent',
      accept: 'application/vnd.github+json',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GitHub put failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function readJsonFile(pathname, fallback) {
  const existing = await githubGet(pathname);
  if (!existing?.content) return fallback;
  try {
    return JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(pathname, data, message) {
  return githubPut(pathname, JSON.stringify(data, null, 2), message);
}

async function getDailyState() {
  const today = berlinDateStamp();
  const fallback = { date: today, count: 0, items: [] };
  const state = await readJsonFile(DAILY_STATE_PATH, fallback);
  if (state.date !== today) return fallback;
  return {
    date: today,
    count: Number(state.count || 0),
    items: Array.isArray(state.items) ? state.items : []
  };
}

async function saveDailyState(state) {
  return writeJsonFile(DAILY_STATE_PATH, state, `chore(auto): update daily publication state ${state.date}`);
}

async function getBlogIndex() {
  return readJsonFile(BLOG_INDEX_PATH, { updatedAt: null, items: [] });
}

async function updateBlogIndex(entry) {
  const blogIndex = await getBlogIndex();
  const items = Array.isArray(blogIndex.items) ? blogIndex.items : [];
  const withoutCurrent = items.filter(item => item.slug !== entry.slug);
  withoutCurrent.unshift(entry);
  const trimmed = withoutCurrent.slice(0, 200);
  const updated = {
    updatedAt: new Date().toISOString(),
    items: trimmed
  };
  await writeJsonFile(BLOG_INDEX_PATH, updated, `chore(auto): update blog index for ${entry.slug}`);
  return updated;
}

async function updateSitemap(slug) {
  const pathname = 'sitemap.xml';
  const existing = await githubGet(pathname);
  if (!existing?.content) return null;
  const xml = Buffer.from(existing.content, 'base64').toString('utf8');
  const url = `${process.env.NETLIFY_SITE_URL.replace(/\/$/, '')}/auto/${slug}.html`;
  if (xml.includes(url)) return { skipped: true };
  const now = new Date().toISOString();
  const insert = `  <url>\n    <loc>${url}</loc>\n    <lastmod>${now}</lastmod>\n  </url>\n`;
  const updated = xml.replace('</urlset>', `${insert}</urlset>`);
  return githubPut(pathname, updated, `chore: update sitemap for ${slug}`);
}

async function sendEmailAlert(entry, dailyState) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  if (!apiKey || !to || !from) {
    return { skipped: true, reason: 'missing email env vars' };
  }

  const subject = `Neuer Blogartikel live: ${entry.title}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#122033;line-height:1.6">
      <h2 style="margin-bottom:8px">Neuer Artikel wurde veröffentlicht</h2>
      <p><strong>Titel:</strong> ${escapeHtml(entry.title)}</p>
      <p><strong>Stadt:</strong> ${escapeHtml(entry.city)}</p>
      <p><strong>Service:</strong> ${escapeHtml(entry.service)}</p>
      <p><strong>Topic:</strong> ${escapeHtml(entry.topic)}</p>
      <p><strong>Uhrzeit:</strong> ${escapeHtml(berlinDateTime(new Date(entry.publishedAt)))}</p>
      <p><strong>Tagesstand:</strong> ${dailyState.count} / ${DAILY_LIMIT}</p>
      <p><a href="${entry.url}">Artikel öffnen</a></p>
      <p><a href="${process.env.NETLIFY_SITE_URL.replace(/\/$/, '')}/blog.html">Blog öffnen</a></p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Email alert failed ${res.status}: ${detail}`);
  }

  return res.json();
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'POST only' }, 405);
  }

  const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missingEnv.length) {
    return json({ ok: false, error: `Missing env: ${missingEnv.join(', ')}` }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const cities = JSON.parse(await githubReadText('agent/config/cities.json')).cities;
    const services = JSON.parse(await githubReadText('agent/config/services.json')).services;
    const promptRules = await githubReadText('agent/prompts/content-agent.md');

    const city = cities.find((item) => item.slug === body.city || item.name.toLowerCase() === String(body.city || '').toLowerCase()) || cities[0];
    const service = services.find((item) => item.slug === body.service || item.name.toLowerCase() === String(body.service || '').toLowerCase()) || services[0];

    const dailyState = await getDailyState();
    if (dailyState.count >= DAILY_LIMIT) {
      return json({
        ok: false,
        error: `Daily limit reached (${DAILY_LIMIT}/${DAILY_LIMIT})`,
        limitReached: true,
        daily: dailyState
      }, 429);
    }

    const blogIndex = await getBlogIndex();
    const topic = body.topic || pickNextTopic({ city, service, publishedToday: dailyState.items, blogIndex });

    const article = await openAIArticle({ city, service, topic, promptRules });
    const html = articleHtml({ article, city, service });
    const markdown = markdownArticle({ article, city, service });

    const htmlPath = `auto/${article.slug}.html`;
    const mdPath = `content/auto/${article.slug}.md`;

    const htmlCommit = await githubPut(htmlPath, html, `feat(auto): publish ${article.slug}`);
    const mdCommit = await githubPut(mdPath, markdown, `feat(auto): draft ${article.slug}`);
    await updateSitemap(article.slug).catch(() => null);

    const entry = {
      slug: article.slug,
      title: article.title,
      seoTitle: article.seoTitle || article.title,
      metaDescription: article.metaDescription || '',
      intro: article.intro || '',
      city: city.name,
      citySlug: city.slug,
      service: service.name,
      serviceSlug: service.slug,
      topic,
      image: city.heroImage,
      publishedAt: new Date().toISOString(),
      url: `${process.env.NETLIFY_SITE_URL.replace(/\/$/, '')}/auto/${article.slug}.html`
    };

    dailyState.count += 1;
    dailyState.items.unshift({
      slug: entry.slug,
      title: entry.title,
      city: entry.city,
      service: entry.service,
      topic: entry.topic,
      publishedAt: entry.publishedAt
    });
    dailyState.items = dailyState.items.slice(0, DAILY_LIMIT);

    await saveDailyState(dailyState);
    await updateBlogIndex(entry);

    let emailResult = null;
    try {
      emailResult = await sendEmailAlert(entry, dailyState);
    } catch (emailError) {
      emailResult = { ok: false, error: emailError.message };
    }

    return json({
      ok: true,
      mode: 'live',
      article: {
        title: article.title,
        slug: article.slug,
        city: city.name,
        service: service.name,
        topic,
        url: entry.url
      },
      daily: {
        date: dailyState.date,
        count: dailyState.count,
        limit: DAILY_LIMIT,
        remaining: Math.max(0, DAILY_LIMIT - dailyState.count)
      },
      email: emailResult,
      commits: {
        html: htmlCommit?.commit?.sha || null,
        markdown: mdCommit?.commit?.sha || null
      }
    });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Unknown error' }, 500);
  }
};
