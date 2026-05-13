// Audit all blog articles to produce a verdict table:
//   - word count of body content
//   - title + canonical URL
//   - GSC impressions in last available snapshot (rough)
//   - off-topic detection (queries unrelated to Entrümpelung/Reinigung)
//   - has HowTo / FAQPage schema
//   - existing keep/noindex/delete verdict heuristic
//
// Run from repo root: node agent/scripts/audit-blog-articles.mjs > agent/seo/blog-audit-2026-05-13.md

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const BLOG_DIR = join(ROOT, 'blog');

// Pull most recent GSC snapshot for impressions data.
const GSC_DIR = join(ROOT, 'agent', 'gsc-snapshots');
async function latestGscSnapshot() {
  const files = (await readdir(GSC_DIR)).filter(f => f.endsWith('.json')).sort();
  if (!files.length) return null;
  const raw = await readFile(join(GSC_DIR, files[files.length - 1]), 'utf8');
  return JSON.parse(raw);
}

// Aggregate impressions per page URL (and per blog file name).
function indexImpressionsByPage(gsc) {
  const byPage = new Map();
  for (const q of gsc.queries || []) {
    const p = q.page || '';
    const cur = byPage.get(p) || { imp: 0, clicks: 0, queries: [] };
    cur.imp += q.impressions || 0;
    cur.clicks += q.clicks || 0;
    if (q.impressions > 0) cur.queries.push({ q: q.q, imp: q.impressions, pos: q.position });
    byPage.set(p, cur);
  }
  return byPage;
}

// Off-topic intent detection: queries unrelated to Entrümpelung/Räumung/
// Haushaltsauflösung/Reinigung/Nachlass.
const RELEVANT_RE = /(entr[uü]mpel|h[aä]ushaltsaufl|wohnungsaufl|nachlass|r[aä]umung|reinigung|entsorg|aufl[oö]sung|ger[uü]mpel|sperrm[uü]ll|m[uö]bel|umzug|messie|verwert|kell|dachboden|garage|besenrein|sch[uü]tt|gewerbe|b[uü]ro|endrein)/i;

function isOffTopicQuery(query) {
  return !RELEVANT_RE.test(query);
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function extractBodyText(html) {
  // Strip script/style + tags, keep textual content of <main> or <body>.
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
  const source = mainMatch ? mainMatch[0] : html;
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1].trim() : '';
}

function extractCanonical(html) {
  const m = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  return m ? m[1] : '';
}

function hasHowToSchema(html) {
  return /"@type":\s*"HowTo"/i.test(html);
}

function hasFAQSchema(html) {
  return /"@type":\s*"FAQPage"/i.test(html);
}

function hasNoindex(html) {
  return /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html);
}

// Detect process-step content (numbered steps, "Schritt", lists with verbs).
function hasProcessSteps(html, body) {
  if (/<ol[\s\S]*?<\/ol>/.test(html)) return true;
  if (/(Schritt 1|Schritt 2|1\.\s|2\.\s|3\.\s)/.test(body.slice(0, 4000))) return true;
  return false;
}

const gsc = await latestGscSnapshot();
const gscDate = gsc?.date || 'n/a';
const byPage = gsc ? indexImpressionsByPage(gsc) : new Map();

function pageKey(filename) {
  // Match GSC page URL pattern, account for both /blog/file and /blog/file.html.
  const base = basename(filename, '.html');
  return [
    `https://perfektsauberservice.com/blog/${base}`,
    `https://perfektsauberservice.com/blog/${base}.html`,
  ];
}

const files = (await readdir(BLOG_DIR))
  .filter(f => f.endsWith('.html') && f !== 'index.html')
  .sort();

const rows = [];
for (const f of files) {
  const path = join(BLOG_DIR, f);
  const html = await readFile(path, 'utf8');
  const body = extractBodyText(html);
  const wc = wordCount(body);
  const title = extractTitle(html);
  const canonical = extractCanonical(html);
  const howto = hasHowToSchema(html);
  const faq = hasFAQSchema(html);
  const noindex = hasNoindex(html);
  const steps = hasProcessSteps(html, body);

  // GSC lookup
  const [k1, k2] = pageKey(f);
  const data = byPage.get(k1) || byPage.get(k2) || { imp: 0, clicks: 0, queries: [] };
  const relevantQueries = (data.queries || []).filter(q => !isOffTopicQuery(q.q));
  const offTopicQueries = (data.queries || []).filter(q => isOffTopicQuery(q.q));
  const relImp = relevantQueries.reduce((s, q) => s + q.imp, 0);
  const offImp = offTopicQueries.reduce((s, q) => s + q.imp, 0);

  // Verdict heuristic
  let verdict, reason;
  if (wc < 300) {
    verdict = 'DELETE'; reason = `thin content ${wc}w`;
  } else if (data.imp === 0 && wc < 600) {
    verdict = 'NOINDEX'; reason = `no GSC impressions + thin (${wc}w)`;
  } else if (offImp > 0 && relImp === 0) {
    verdict = 'DELETE'; reason = `only off-topic impressions (${offImp})`;
  } else if (offImp > relImp * 3) {
    verdict = 'NOINDEX'; reason = `mostly off-topic (${offImp} off vs ${relImp} relevant)`;
  } else if (data.imp >= 5 && relImp >= 1) {
    verdict = 'KEEP'; reason = `${data.imp} GSC imp, on-topic`;
    if (steps && !howto) reason += ', candidate HowTo schema';
  } else {
    verdict = 'KEEP'; reason = `${wc}w, low GSC signal — wait`;
    if (steps && !howto) reason += ', candidate HowTo schema';
  }

  rows.push({
    file: f, title, canonical, wc, imp: data.imp, clicks: data.clicks,
    relImp, offImp, howto, faq, noindex, steps,
    verdict, reason, offTopicQueries, relevantQueries,
  });
}

// Output as Markdown for user review.
const counts = { KEEP: 0, NOINDEX: 0, DELETE: 0 };
for (const r of rows) counts[r.verdict]++;

console.log(`# Blog audit — ${new Date().toISOString().slice(0, 10)}`);
console.log();
console.log(`Total: **${rows.length}** articles`);
console.log(`Latest GSC snapshot: \`${gscDate}\``);
console.log();
console.log(`| Verdict | Count |`);
console.log(`|---|---|`);
console.log(`| KEEP | ${counts.KEEP} |`);
console.log(`| NOINDEX | ${counts.NOINDEX} |`);
console.log(`| DELETE | ${counts.DELETE} |`);
console.log();

for (const v of ['DELETE', 'NOINDEX', 'KEEP']) {
  console.log(`## ${v} (${counts[v]})`);
  console.log();
  console.log(`| File | Words | GSC imp | Relevant / Off-topic | Reason |`);
  console.log(`|---|---|---|---|---|`);
  for (const r of rows.filter(x => x.verdict === v)) {
    const offTopicPreview = r.offTopicQueries.slice(0, 2).map(q => q.q).join(', ');
    const note = offTopicPreview ? ` (off: ${offTopicPreview})` : '';
    console.log(`| \`${r.file}\` | ${r.wc} | ${r.imp} | ${r.relImp} / ${r.offImp} | ${r.reason}${note} |`);
  }
  console.log();
}

// Candidate HowTo schema additions (KEEP + steps + no HowTo yet)
const howtoCands = rows.filter(r => r.verdict === 'KEEP' && r.steps && !r.howto);
console.log(`## HowTo schema candidates (${howtoCands.length})`);
console.log();
console.log(`Articles to KEEP that have step-by-step content and could gain HowTo schema for AI snippet citation:`);
console.log();
for (const r of howtoCands.slice(0, 30)) {
  console.log(`- \`${r.file}\` (${r.wc}w)`);
}
console.log();
console.log(`---`);
console.log(`Audit generated by agent/scripts/audit-blog-articles.mjs`);
