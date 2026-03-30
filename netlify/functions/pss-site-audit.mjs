const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const REQUIRED_ENV = [
  "GITHUB_OWNER",
  "GITHUB_REPO",
  "GITHUB_TOKEN",
  "NETLIFY_SITE_URL",
];

async function githubGet(pathname) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${pathname}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "user-agent": "pss-audit-agent",
      accept: "application/vnd.github+json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function githubPut(pathname, content, message) {
  const existing = await githubGet(pathname);
  const body = {
    message,
    content: Buffer.from(content).toString("base64"),
    branch: "main",
  };
  if (existing?.sha) body.sha = existing.sha;

  const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${pathname}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "user-agent": "pss-audit-agent",
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`GitHub put failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function githubReadText(pathname) {
  const existing = await githubGet(pathname);
  if (!existing?.content) throw new Error(`Missing repo file: ${pathname}`);
  return Buffer.from(existing.content, "base64").toString("utf8");
}

function parseFrontmatter(text) {
  const src = String(text || "");
  if (!src.startsWith("---")) return { data: {}, body: src };

  const match = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: src };

  const raw = match[1];
  const body = match[2] || "";
  const data = {};

  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value === "true") value = true;
    else if (value === "false") value = false;

    data[m[1]] = value;
  }

  return { data, body };
}

function extractTitleFromBody(body) {
  const m = String(body || "").match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

function countWords(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

async function readBlogIndex() {
  try {
    const txt = await githubReadText("content/auto/blog-index.json");
    return JSON.parse(txt);
  } catch {
    return { items: [] };
  }
}

async function listContentAutoFiles() {
  const dir = await githubGet("content/auto");
  if (!Array.isArray(dir)) return [];
  return dir
    .filter((item) => item.type === "file" && item.name.endsWith(".md"))
    .map((item) => item.path);
}

async function listAutoHtmlFiles() {
  const dir = await githubGet("auto");
  if (!Array.isArray(dir)) return [];
  return dir
    .filter((item) => item.type === "file" && item.name.endsWith(".html"))
    .map((item) => item.path);
}

async function auditArticles() {
  const mdFiles = await listContentAutoFiles();
  const htmlFiles = await listAutoHtmlFiles();
  const blogIndex = await readBlogIndex();

  const htmlSet = new Set(
    htmlFiles.map((p) => p.split("/").pop()?.replace(/\.html$/i, "")).filter(Boolean)
  );

  const titleMap = new Map();
  const slugMap = new Map();
  const imageMap = new Map();

  const results = [];
  let totals = {
    articles: 0,
    critical: 0,
    medium: 0,
    minor: 0,
  };

  for (const file of mdFiles) {
    const text = await githubReadText(file);
    const { data, body } = parseFrontmatter(text);

    const slug = String(data.slug || "").trim();
    const title = String(data.title || extractTitleFromBody(body) || "").trim();
    const heroImage = String(data.heroImage || "").trim();
    const seoTitle = String(data.seoTitle || "").trim();
    const metaDescription = String(data.metaDescription || "").trim();
    const service = String(data.service || "").trim();
    const city = String(data.city || "").trim();

    const issues = [];
    const wordCount = countWords(body);

    if (!title) issues.push({ level: "critical", code: "missing_title", message: "Title fehlt." });
    if (!slug) issues.push({ level: "critical", code: "missing_slug", message: "Slug fehlt." });
    if (!seoTitle) issues.push({ level: "medium", code: "missing_seo_title", message: "SEO title fehlt." });
    if (!metaDescription) issues.push({ level: "medium", code: "missing_meta_description", message: "Meta description fehlt." });
    if (!service) issues.push({ level: "medium", code: "missing_service", message: "Service fehlt im Frontmatter." });
    if (!city) issues.push({ level: "medium", code: "missing_city", message: "City fehlt im Frontmatter." });
    if (!heroImage) issues.push({ level: "minor", code: "missing_hero_image", message: "Hero image fehlt." });
    if (wordCount < 250) issues.push({ level: "medium", code: "too_short", message: `Artikel ist eher kurz (${wordCount} Wörter).` });
    if (!/##\s+Häufige Fragen/i.test(body)) issues.push({ level: "medium", code: "missing_faq", message: "FAQ-Bereich fehlt." });
    if (!/##\s+CTA|##\s+Jetzt anfragen/i.test(body)) issues.push({ level: "medium", code: "missing_cta", message: "CTA-Bereich fehlt." });

    if (slug && !htmlSet.has(slug)) {
      issues.push({ level: "critical", code: "missing_html", message: `HTML-Datei für slug "${slug}" fehlt.` });
    }

    const blogIndexed = Array.isArray(blogIndex.items)
      ? blogIndex.items.some((item) => normalize(item.slug) === normalize(slug))
      : false;

    if (!blogIndexed) {
      issues.push({ level: "medium", code: "missing_blog_index", message: "Artikel fehlt im Blog-Index." });
    }

    if (title) {
      const key = normalize(title);
      titleMap.set(key, [...(titleMap.get(key) || []), file]);
    }

    if (slug) {
      const key = normalize(slug);
      slugMap.set(key, [...(slugMap.get(key) || []), file]);
    }

    if (heroImage) {
      const key = normalize(heroImage);
      imageMap.set(key, [...(imageMap.get(key) || []), file]);
    }

    totals.articles += 1;
    totals.critical += issues.filter((x) => x.level === "critical").length;
    totals.medium += issues.filter((x) => x.level === "medium").length;
    totals.minor += issues.filter((x) => x.level === "minor").length;

    results.push({
      file,
      slug,
      title,
      city,
      service,
      heroImage,
      wordCount,
      issues,
    });
  }

  for (const article of results) {
    if (article.title && (titleMap.get(normalize(article.title)) || []).length > 1) {
      article.issues.push({
        level: "critical",
        code: "duplicate_title",
        message: "Titel ist mehrfach vorhanden.",
      });
      totals.critical += 1;
    }

    if (article.slug && (slugMap.get(normalize(article.slug)) || []).length > 1) {
      article.issues.push({
        level: "critical",
        code: "duplicate_slug",
        message: "Slug ist mehrfach vorhanden.",
      });
      totals.critical += 1;
    }

    if (article.heroImage && (imageMap.get(normalize(article.heroImage)) || []).length >= 3) {
      article.issues.push({
        level: "minor",
        code: "image_reuse_high",
        message: "Dieses Bild wird sehr oft wiederverwendet.",
      });
      totals.minor += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    site: process.env.NETLIFY_SITE_URL,
    totals,
    articles: results,
  };
}

export default async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ ok: false, error: "POST or GET only" }, 405);
  }

  const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missingEnv.length) {
    return json({ ok: false, error: `Missing env: ${missingEnv.join(", ")}` }, 500);
  }

  try {
    const report = await auditArticles();

    await githubPut(
      "agent/state/site-audit-report.json",
      JSON.stringify(report, null, 2),
      "chore(audit): update site audit report"
    );

    return json({
      ok: true,
      summary: report.totals,
      reportPath: "agent/state/site-audit-report.json",
      generatedAt: report.generatedAt,
    });
  } catch (error) {
    return json({ ok: false, error: error.message || "Unknown error" }, 500);
  }
};
