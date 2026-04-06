
import fs from "fs";
import path from "path";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function safeReadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function safeReadText(p, fallback = "") {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return fallback;
  }
}

function normalizeText(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(v) {
  return normalizeText(v)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function currentBerlinDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date());
}

function resolveRepoRoot() {
  const candidates = [
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../..")
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "agent", "config", "cities.json"))) return c;
  }
  return path.resolve(process.cwd());
}

function loadConfig() {
  const root = resolveRepoRoot();
  const cities = safeReadJson(path.join(root, "agent", "config", "cities.json")) || { cities: [] };
  const services = safeReadJson(path.join(root, "agent", "config", "services.json")) || { services: [] };
  const goals = safeReadJson(path.join(root, "agent", "config", "goals.json")) || {};
  const rules = safeReadJson(path.join(root, "agent", "config", "workflow-rules.json")) || {};
  return { root, cities: cities.cities || [], services: services.services || [], goals, rules };
}

function findCity(cities, value) {
  const needle = normalizeText(value);
  return cities.find(c => normalizeText(c.slug) === needle || normalizeText(c.name) === needle) || null;
}

function findService(services, value) {
  const needle = normalizeText(value);
  return services.find(s => normalizeText(s.slug) === needle || normalizeText(s.name) === needle) || null;
}

function buildWorkflow(cityObj, serviceObj, goals, selectedImage) {
  const cityName = cityObj.name;
  const supportPage = cityObj.servicePage || `${serviceObj.slug}-${cityObj.slug}.html`;
  const topicTemplate = (serviceObj.questionTemplates && serviceObj.questionTemplates[0]) || `${serviceObj.name} in {city}`;
  const topic = topicTemplate.replace(/\{city\}/g, cityName);
  const primaryKeyword = `${serviceObj.name} ${cityName}`;
  const secondaryKeywords = uniq([
    `${serviceObj.name} Kosten ${cityName}`,
    `${serviceObj.name} Ablauf ${cityName}`,
    `${serviceObj.name} Termin ${cityName}`
  ]);
  const slug = slugify(topic);
  const title = topic;
  const h1 = topic;
  const metaTitle = `${topic} | Perfekt Sauber Service`;
  const metaDescription = `Klarer Überblick zu ${normalizeText(topic).replace(/-/g, " ")} – mit Ablauf, Kosten, FAQ und schneller Anfrage für ${cityName}.`;

  const recommended = {
    priority: 10,
    topic,
    primaryKeyword,
    secondaryKeywords,
    searchIntent: "informational/commercial",
    format: "FAQ",
    supportsPage: supportPage,
    duplicateDecision: "create new",
    cannibalizationRisk: "low",
    matchedExisting: null
  };

  const duplicate = {
    status: "create new",
    reason: "No matching slug found in preview mode.",
    risk: "low",
    affected: null
  };

  const writer = {
    title,
    metaTitle,
    metaDescription,
    slug,
    h1,
    format: "FAQ",
    primaryKeyword,
    secondaryKeywords,
    supportsPage: supportPage,
    outline: [
      { h2: `Was kostet eine ${serviceObj.name} in ${cityName}?`, points: ["Preisfaktoren", "Richtwerte", "Ersteinschätzung"] },
      { h2: `Wie läuft eine ${serviceObj.name} in ${cityName} ab?`, points: ["Kontakt", "Besichtigung", "Durchführung"] },
      { h2: `Warum Kunden in ${cityName} anfragen`, points: ["schnelle Rückmeldung", "klare Kommunikation", "besenrein"] },
      { h2: "Häufige Fragen", points: ["Termin", "Dauer", "Vorbereitung"] }
    ],
    faq: [
      { q: `Was kostet eine ${serviceObj.name} in ${cityName}?`, a: `${serviceObj.name} in ${cityName} hängt vor allem von Aufwand, Menge, Zugang und Terminlage ab. Eine erste Einschätzung ist schnell per WhatsApp möglich.` },
      { q: `Wie schnell bekommt man einen Termin für eine ${serviceObj.name}?`, a: `Oft ist eine kurzfristige Terminabstimmung möglich. Am schnellsten geht es mit Fotos per WhatsApp.` },
      { q: "Was muss vor dem Termin vorbereitet werden?", a: "In vielen Fällen reichen Fotos, Adresse und eine kurze Beschreibung der Situation." }
    ],
    cta: serviceObj.cta || "Jetzt unverbindlich anfragen"
  };

  const geo = {
    directAnswer: `${serviceObj.name} in ${cityName} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren. Eine erste Einschätzung ist schnell per WhatsApp möglich.`,
    missingSections: [],
    quoteReadyLines: [
      `${serviceObj.name} in ${cityName} wird vor allem nach Aufwand, Menge und Zugang kalkuliert.`,
      `Für eine schnelle Ersteinschätzung reichen oft schon Fotos per WhatsApp.`
    ],
    faqImprovements: writer.faq.map(f => f.q),
    semanticSuggestions: [serviceObj.name, cityName, "Kosten", "Ablauf", "Termin"]
  };

  const localAdaptation = {
    localizedIntro: `${serviceObj.name} in ${cityName} und Umgebung wird oft dann angefragt, wenn es schnell, klar und ohne unnötigen Aufwand gehen soll.`,
    localAreasMentioned: uniq([cityName, ...(cityObj.keywords || []).slice(0, 2)]),
    localCta: `Jetzt ${serviceObj.name} in ${cityName} per WhatsApp anfragen`,
    changedElements: ["intro", "city references", "cta", "faq"]
  };

  const internalLinking = {
    linksOut: uniq([supportPage, "preisrechner.html", "blog.html"]),
    linksIn: uniq(["blog.html", supportPage]),
    anchorTexts: uniq([
      `${serviceObj.name} in ${cityName}`,
      `${serviceObj.name} Kosten ${cityName}`,
      "Preisrechner"
    ])
  };

  const leadConversion = {
    ctaTop: `Jetzt kostenlose Einschätzung für ${serviceObj.name} in ${cityName} anfragen`,
    ctaMiddle: "Preisorientierung in 1 Minute berechnen",
    ctaBottom: "Fotos senden und exaktes Angebot erhalten",
    microConversion: "Fotos per WhatsApp senden und schnelle Rückmeldung erhalten",
    channels: ["WhatsApp", "Preisrechner", "Telefon"]
  };

  const imageSuggestions = uniq([
    selectedImage,
    cityObj.articleImage,
    cityObj.heroImage
  ]).map((src, idx) => ({
    src,
    fitScore: 10 - idx,
    imageType: idx === 0 ? "approved" : "city",
    reason: idx === 0 ? "Approved image selected for this article." : `Strong visual fit for ${cityName}.`
  })).filter(x => x.src);

  return { recommended, duplicate, writer, geo, localAdaptation, internalLinking, leadConversion, imageSuggestions };
}

function buildArticleHtml(payload) {
  const { cityObj, serviceObj, workflow, siteUrl } = payload;
  const { writer, geo, localAdaptation, internalLinking, leadConversion, imageSuggestions } = workflow;
  const selectedImage = imageSuggestions[0]?.src || cityObj.articleImage || cityObj.heroImage || "";
  const canonical = `${siteUrl}/blog/${writer.slug}.html`;
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": writer.faq.map(item => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": { "@type": "Answer", "text": item.a }
    }))
  };
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: writer.title,
    description: writer.metaDescription,
    mainEntityOfPage: canonical,
    image: selectedImage ? `${siteUrl}/${selectedImage.replace(/^\/+/, "")}` : undefined
  };

  const faqHtml = writer.faq.map(item => `
      <div class="faq-item">
        <h3>${escapeHtml(item.q)}</h3>
        <p>${escapeHtml(item.a)}</p>
      </div>`).join("");

  const outlineHtml = writer.outline.map(sec => `
      <section>
        <h2>${escapeHtml(sec.h2)}</h2>
        <ul>${(sec.points || []).map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
      </section>`).join("");

  const linksHtml = internalLinking.linksOut.map((href, i) => {
    const label = internalLinking.anchorTexts[i] || href;
    const url = href.endsWith(".html") ? `/${href.replace(/^\/+/, "")}` : href;
    return `<li><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></li>`;
  }).join("");

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(writer.metaTitle)}</title>
  <meta name="description" content="${escapeHtml(writer.metaDescription)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <style>
    body{font-family:Inter,Arial,sans-serif;margin:0;background:#f5f8fc;color:#13233a;line-height:1.6}
    .wrap{max-width:1080px;margin:0 auto;padding:24px}
    .hero{background:#fff;border:1px solid #dde5f0;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(14,23,42,.06)}
    .hero img{width:100%;aspect-ratio:16/7;object-fit:cover;display:block;background:#eef4fb}
    .content{padding:28px}
    .kicker{display:inline-block;background:#e8f2ff;color:#2153d6;padding:6px 12px;border-radius:999px;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
    h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.05;margin:16px 0}
    h2{margin-top:32px}
    .grid{display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-top:24px}
    .card{background:#fff;border:1px solid #dde5f0;border-radius:20px;padding:20px}
    .btn{display:inline-block;padding:12px 18px;border-radius:999px;font-weight:700;text-decoration:none;margin-right:10px}
    .btn-green{background:#76c043;color:#fff}.btn-dark{background:#122033;color:#fff}
    ul{padding-left:20px}
    .quote{background:#f2f7ff;border-left:4px solid #2153d6;padding:16px 18px;border-radius:12px}
    .faq-item{padding:14px 0;border-top:1px solid #e6edf7}
    @media(max-width:860px){.grid{grid-template-columns:1fr}}
  </style>
  <script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(articleJsonLd)}</script>
</head>
<body>
  <div class="wrap">
    <article class="hero">
      ${selectedImage ? `<img src="/${escapeHtml(selectedImage.replace(/^\/+/, ""))}" alt="${escapeHtml(cityObj.backgroundAlt || writer.title)}" />` : ""}
      <div class="content">
        <span class="kicker">${escapeHtml(serviceObj.name)} · ${escapeHtml(cityObj.name)}</span>
        <h1>${escapeHtml(writer.h1)}</h1>
        <p>${escapeHtml(localAdaptation.localizedIntro)}</p>
        <p class="quote">${escapeHtml(geo.directAnswer)}</p>
        <p>
          <a class="btn btn-green" href="/preisrechner.html">${escapeHtml(leadConversion.ctaMiddle)}</a>
          <a class="btn btn-dark" href="/${escapeHtml(writer.supportsPage)}">${escapeHtml(leadConversion.ctaTop)}</a>
        </p>
      </div>
    </article>

    <div class="grid">
      <main class="card">
        ${outlineHtml}
        <section>
          <h2>FAQ</h2>
          ${faqHtml}
        </section>
        <section>
          <h2>Weiterführende Links</h2>
          <ul>${linksHtml}</ul>
        </section>
      </main>
      <aside class="card">
        <h2>Schnelle Anfrage</h2>
        <p>${escapeHtml(leadConversion.microConversion)}</p>
        <p><a class="btn btn-green" href="/preisrechner.html">${escapeHtml(leadConversion.ctaMiddle)}</a></p>
        <p><a class="btn btn-dark" href="/${escapeHtml(writer.supportsPage)}">${escapeHtml(leadConversion.ctaBottom)}</a></p>
      </aside>
    </div>
  </div>
</body>
</html>`;
}

function buildArticleMarkdown(payload) {
  const { cityObj, serviceObj, workflow, siteUrl } = payload;
  const { writer, geo, localAdaptation, internalLinking, leadConversion, imageSuggestions } = workflow;
  const selectedImage = imageSuggestions[0]?.src || "";
  return [
    `# ${writer.h1}`,
    ``,
    `- City: ${cityObj.name}`,
    `- Service: ${serviceObj.name}`,
    `- URL: ${siteUrl}/blog/${writer.slug}.html`,
    `- Image: ${selectedImage}`,
    ``,
    `## Meta`,
    `- Title: ${writer.metaTitle}`,
    `- Description: ${writer.metaDescription}`,
    ``,
    `## Intro`,
    localAdaptation.localizedIntro,
    ``,
    `## Direct answer`,
    geo.directAnswer,
    ``,
    ...writer.outline.map(sec => `## ${sec.h2}\n${(sec.points || []).map(p => `- ${p}`).join("\n")}\n`),
    `## FAQ`,
    ...writer.faq.flatMap(item => [`### ${item.q}`, item.a, ``]),
    `## Links out`,
    ...(internalLinking.linksOut || []).map(x => `- ${x}`),
    ``,
    `## CTA`,
    `- Top: ${leadConversion.ctaTop}`,
    `- Middle: ${leadConversion.ctaMiddle}`,
    `- Bottom: ${leadConversion.ctaBottom}`,
    `- Micro: ${leadConversion.microConversion}`,
    ``
  ].join("\n");
}

async function githubRequest(url, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing GITHUB_TOKEN");
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "perfekt-sauber-service-workflow-publish-approved",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${json?.message || text || "Unknown error"}`);
  }
  return json;
}

async function githubGetFile(owner, repo, filePath) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
  const data = await githubRequest(url);
  const content = data.content ? Buffer.from(data.content, "base64").toString("utf8") : "";
  return { sha: data.sha, content, raw: data };
}

async function githubPutFile(owner, repo, filePath, content, message, sha = undefined) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64")
  };
  if (sha) body.sha = sha;
  const data = await githubRequest(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return data;
}

function withShaHash(str) {
  return crypto.subtle ? str : str;
}

function updateSitemapXml(existingXml, siteUrl, blogPath) {
  const cleanUrl = `${siteUrl}/${blogPath.replace(/^\/+/, "")}`;
  if (!existingXml || !existingXml.trim()) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${cleanUrl}</loc></url>\n</urlset>\n`;
  }
  if (existingXml.includes(cleanUrl)) return existingXml;
  return existingXml.replace(/<\/urlset>\s*$/i, `  <url><loc>${cleanUrl}</loc></url>\n</urlset>`);
}

export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "POST only" }, 405);
    }

    const body = await request.json().catch(() => ({}));
    const { city, service, topic, slug } = body || {};

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const siteUrl = (process.env.NETLIFY_SITE_URL || "https://perfektsauberservice.com").replace(/\/+$/, "");

    if (!owner || !repo) {
      return jsonResponse({ ok: false, error: "Missing GITHUB_OWNER or GITHUB_REPO" }, 500);
    }

    const { cities, services, goals } = loadConfig();
    const cityObj = findCity(cities, city);
    const serviceObj = findService(services, service);

    if (!cityObj || !serviceObj) {
      return jsonResponse({
        ok: false,
        error: "Unknown city or service",
        city,
        service,
        acceptedCityExamples: cities.map(c => c.slug),
        acceptedServiceExamples: services.map(s => s.slug)
      }, 400);
    }

    const approvalsPath = "agent/state/pending-approvals.json";
    let approvalsFile;
    try {
      approvalsFile = await githubGetFile(owner, repo, approvalsPath);
    } catch {
      approvalsFile = { sha: undefined, content: JSON.stringify({ items: [] }, null, 2) };
    }
    const approvalsJson = JSON.parse(approvalsFile.content || '{"items":[]}');
    const approvals = approvalsJson.items || [];
    const normTopic = normalizeText(topic || "");
    const normSlug = normalizeText(slug || "");

    const approval = approvals.find(item => {
      if (normalizeText(item.city) !== normalizeText(cityObj.slug) && normalizeText(item.city) !== normalizeText(cityObj.name)) return false;
      if (normalizeText(item.service) !== normalizeText(serviceObj.slug) && normalizeText(item.service) !== normalizeText(serviceObj.name)) return false;
      if (normSlug && normalizeText(item.slug) !== normSlug) return false;
      if (normTopic && normalizeText(item.topic) !== normTopic) return false;
      return true;
    }) || approvals.find(item =>
      (normalizeText(item.city) === normalizeText(cityObj.slug) || normalizeText(item.city) === normalizeText(cityObj.name)) &&
      (normalizeText(item.service) === normalizeText(serviceObj.slug) || normalizeText(item.service) === normalizeText(serviceObj.name))
    );

    if (!approval?.selectedImage) {
      return jsonResponse({
        ok: false,
        error: "No approved image found for this city/service",
        expectedApprovalPath: approvalsPath,
        city: cityObj.slug,
        service: serviceObj.slug
      }, 400);
    }

    const workflow = buildWorkflow(cityObj, serviceObj, goals, approval.selectedImage);
    if (topic) {
      workflow.recommended.topic = topic;
      workflow.writer.title = topic;
      workflow.writer.h1 = topic;
      workflow.writer.slug = slugify(topic);
      workflow.writer.metaTitle = `${topic} | Perfekt Sauber Service`;
      workflow.writer.metaDescription = `Klarer Überblick zu ${normalizeText(topic).replace(/-/g, " ")} – mit Ablauf, Kosten, FAQ und schneller Anfrage für ${cityObj.name}.`;
    }

    const finalSlug = workflow.writer.slug;
    const blogFilePath = `blog/${finalSlug}.html`;
    const mdFilePath = `content/auto/${finalSlug}.md`;
    const blogIndexPath = "content/auto/blog-index.json";
    const sitemapPath = "sitemap.xml";
    const publicationStatePath = "agent/state/publication-state.json";

    const htmlContent = buildArticleHtml({ cityObj, serviceObj, workflow, siteUrl });
    const mdContent = buildArticleMarkdown({ cityObj, serviceObj, workflow, siteUrl });

    // Current files
    const existingBlog = await githubGetFile(owner, repo, blogFilePath).catch(() => ({ sha: undefined, content: "" }));
    const existingMd = await githubGetFile(owner, repo, mdFilePath).catch(() => ({ sha: undefined, content: "" }));
    const existingIndex = await githubGetFile(owner, repo, blogIndexPath).catch(() => ({ sha: undefined, content: JSON.stringify({ items: [] }, null, 2) }));
    const existingSitemap = await githubGetFile(owner, repo, sitemapPath).catch(() => ({ sha: undefined, content: "" }));
    const existingState = await githubGetFile(owner, repo, publicationStatePath).catch(() => ({ sha: undefined, content: JSON.stringify({ date: "1970-01-01", count: 0, items: [] }, null, 2) }));

    // Update blog index
    let indexJson;
    try { indexJson = JSON.parse(existingIndex.content || '{"items":[]}'); } catch { indexJson = { items: [] }; }
    const items = Array.isArray(indexJson.items) ? indexJson.items : [];
    const entry = {
      slug: finalSlug,
      title: workflow.writer.title,
      url: `${siteUrl}/blog/${finalSlug}.html`,
      city: cityObj.name,
      service: serviceObj.name,
      image: approval.selectedImage,
      updatedAt: new Date().toISOString()
    };
    const dedupedItems = [entry, ...items.filter(x => normalizeText(x.slug) !== normalizeText(finalSlug))];
    indexJson.items = dedupedItems.slice(0, 200);

    // Update sitemap
    const updatedSitemap = updateSitemapXml(existingSitemap.content, siteUrl, blogFilePath);

    // Update publication state
    let stateJson;
    try { stateJson = JSON.parse(existingState.content || '{"date":"1970-01-01","count":0,"items":[]}'); } catch { stateJson = { date: "1970-01-01", count: 0, items: [] }; }
    const today = currentBerlinDate();
    if (stateJson.date !== today) {
      stateJson = { date: today, count: 0, items: [] };
    }
    stateJson.items = [
      {
        slug: finalSlug,
        title: workflow.writer.title,
        city: cityObj.name,
        service: serviceObj.name,
        topic: workflow.recommended.topic,
        publishedAt: new Date().toISOString()
      },
      ...(stateJson.items || []).filter(x => normalizeText(x.slug) !== normalizeText(finalSlug))
    ];
    stateJson.count = stateJson.items.length;

    // Remove consumed approval
    const updatedApprovals = {
      items: approvals.filter(item => item !== approval)
    };

    const commitBase = `workflow publish approved ${finalSlug}`;

    const blogCommit = await githubPutFile(owner, repo, blogFilePath, htmlContent, `feat(blog): publish approved ${finalSlug}`, existingBlog.sha);
    const mdCommit = await githubPutFile(owner, repo, mdFilePath, mdContent, `chore(auto): update markdown for ${finalSlug}`, existingMd.sha);
    const indexCommit = await githubPutFile(owner, repo, blogIndexPath, JSON.stringify(indexJson, null, 2), `chore(auto): update blog index for ${finalSlug}`, existingIndex.sha);
    const sitemapCommit = await githubPutFile(owner, repo, sitemapPath, updatedSitemap, `chore: update sitemap for ${finalSlug}`, existingSitemap.sha);
    const stateCommit = await githubPutFile(owner, repo, publicationStatePath, JSON.stringify(stateJson, null, 2), `chore(auto): update daily publication state ${today}`, existingState.sha);
    const approvalsCommit = await githubPutFile(owner, repo, approvalsPath, JSON.stringify(updatedApprovals, null, 2), `chore(workflow): consume approval for ${finalSlug}`, approvalsFile.sha);

    return jsonResponse({
      ok: true,
      mode: "publish-approved",
      article: {
        title: workflow.writer.title,
        slug: finalSlug,
        url: `${siteUrl}/blog/${finalSlug}.html`,
        image: approval.selectedImage,
        htmlPath: blogFilePath,
        markdownPath: mdFilePath
      },
      approvalUsed: approval,
      commits: {
        blog: blogCommit.commit?.sha,
        markdown: mdCommit.commit?.sha,
        blogIndex: indexCommit.commit?.sha,
        sitemap: sitemapCommit.commit?.sha,
        publicationState: stateCommit.commit?.sha,
        approvals: approvalsCommit.commit?.sha
      }
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err?.message || String(err)
    }, 500);
  }
}
