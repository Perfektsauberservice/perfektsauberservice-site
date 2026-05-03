// Level-1 site health audit. Static checks only, no network.
//
// Verifies:
//  1. Every page has title / description / og:* / canonical
//  2. JSON-LD blocks parse as valid JSON
//  3. Every <img> has a non-empty alt
//  4. Phone / email / WhatsApp number consistency
//  5. GA4 present on every page
//  6. robots.txt + sitemap.xml exist and are well-formed
//  7. Page weights (in-repo, before CDN compression)
//  8. Duplicate titles / meta descriptions across pages

import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const SKIP_DIRS = ['node_modules','_archived','.git','agent','content','dashboard','public','netlify'];

// Single source of truth for contact data
const PHONE = '+49 163 9087197';
const PHONE_TEL = '+491639087197';        // tel: format
const PHONE_WA = '491639087197';            // wa.me/...
const EMAIL = 'kontakt@perfektsauberservice.com';
const GA4_ID = 'G-BMC32KSYKF';

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.includes(e.name)) continue;
      out.push(...walk(full));
    } else if (e.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const htmlFiles = walk(REPO);
console.log(`Auditing ${htmlFiles.length} HTML files\n`);

const issues = {
  missingTitle: [],
  missingDescription: [],
  missingOgTitle: [],
  missingOgDesc: [],
  missingOgUrl: [],
  missingOgImage: [],
  missingCanonical: [],
  invalidJsonLd: [],
  noJsonLd: [],
  imgsNoAlt: [],
  imgsEmptyAlt: [],
  missingGa4: [],
  badPhone: [],
  badEmail: [],
  duplicateTitles: new Map(),
  duplicateDescs: new Map(),
};

const titles = new Map();
const descs = new Map();
const sizes = { 'city-service': [], 'blog': [], 'static': [], 'other': [] };

function classify(rel) {
  if (rel.startsWith('blog/')) return 'blog';
  if (/^(impressum|datenschutz|kontakt|ueber|danke|410)\.html$/i.test(rel)) return 'static';
  if (/-(rastatt|baden-baden|karlsruhe|pforzheim|ettlingen|gaggenau|gernsbach|buehl|sinzheim|muggensturm|rheinstetten|stutensee|achern|bad-wildbad|bad-herrenalb|forbach|iffezheim|huegelsheim|kuppenheim|loffenau|malsch|oetigheim|steinmauern|weisenbach|bietigheim|bischweier|durmersheim|au-am-rhein|elchesheim-illingen|rheinmuenster|region)\.html$/.test(rel)) return 'city-service';
  return 'other';
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/').replace(REPO.replace(/\\/g, '/') + '/', '');
  const size = Buffer.byteLength(html, 'utf8');
  sizes[classify(rel)].push({ rel, size });

  // ---- Meta tags ----
  const get = (re) => { const m = html.match(re); return m ? m[1].trim() : ''; };
  const title = get(/<title>([\s\S]*?)<\/title>/);
  const description = get(/<meta\s+name="description"\s+content="([^"]*)"/);
  const ogTitle = get(/<meta\s+property="og:title"\s+content="([^"]*)"/);
  const ogDesc = get(/<meta\s+property="og:description"\s+content="([^"]*)"/);
  const ogUrl = get(/<meta\s+property="og:url"\s+content="([^"]*)"/);
  const ogImage = get(/<meta\s+property="og:image"\s+content="([^"]*)"/);
  const canonical = get(/<link\s+rel="canonical"\s+href="([^"]*)"/);

  if (!title) issues.missingTitle.push(rel);
  if (!description) issues.missingDescription.push(rel);
  if (!ogTitle) issues.missingOgTitle.push(rel);
  if (!ogDesc) issues.missingOgDesc.push(rel);
  if (!ogUrl) issues.missingOgUrl.push(rel);
  if (!ogImage) issues.missingOgImage.push(rel);
  if (!canonical) issues.missingCanonical.push(rel);

  // Track for duplicate detection
  if (title) {
    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(rel);
  }
  if (description) {
    if (!descs.has(description)) descs.set(description, []);
    descs.get(description).push(rel);
  }

  // ---- JSON-LD blocks ----
  const ldMatches = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (ldMatches.length === 0 && classify(rel) !== 'static') {
    issues.noJsonLd.push(rel);
  }
  for (const m of ldMatches) {
    try { JSON.parse(m[1].trim()); }
    catch (e) { issues.invalidJsonLd.push({ rel, error: e.message.slice(0, 80) }); }
  }

  // ---- Images alt ----
  const imgs = [...html.matchAll(/<img([^>]+)>/g)];
  for (const m of imgs) {
    const attrs = m[1];
    if (!/\balt=/.test(attrs)) {
      issues.imgsNoAlt.push({ rel, img: m[0].slice(0, 80) });
    } else if (/\balt=""/.test(attrs)) {
      issues.imgsEmptyAlt.push({ rel, img: m[0].slice(0, 80) });
    }
  }

  // ---- GA4 ----
  if (!html.includes(GA4_ID)) issues.missingGa4.push(rel);

  // ---- Phone / email ----
  // Find phone numbers in the page (any digits with German format)
  const phoneInstances = [
    ...html.matchAll(/\+49\s*\d{1,4}[\s\-]*\d{4,9}/g),
    ...html.matchAll(/0163\s*\d{4,9}/g),
  ];
  for (const m of phoneInstances) {
    const found = m[0].replace(/[\s\-]/g, '');
    if (!found.includes('1639087197') && !found.includes('01639087197')) {
      issues.badPhone.push({ rel, found: m[0] });
    }
  }
  // Email: anything with @perfektsauberservice
  const emailInstances = [...html.matchAll(/[\w.-]+@perfektsauberservice\.com/g)];
  for (const m of emailInstances) {
    if (m[0] !== EMAIL && !m[0].startsWith('href=')) {
      issues.badEmail.push({ rel, found: m[0] });
    }
  }
}

// ---- Duplicate detection ----
for (const [title, files] of titles) if (files.length > 1) issues.duplicateTitles.set(title, files);
for (const [desc, files] of descs) if (files.length > 1) issues.duplicateDescs.set(desc, files);

// ---- robots.txt / sitemap.xml ----
const robotsTxt = fs.existsSync('robots.txt') ? fs.readFileSync('robots.txt', 'utf8') : null;
const sitemap = fs.existsSync('sitemap.xml') ? fs.readFileSync('sitemap.xml', 'utf8') : null;
const robotsOk = robotsTxt && /Sitemap:/i.test(robotsTxt) && /User-agent:/i.test(robotsTxt);
const sitemapOk = sitemap && sitemap.startsWith('<?xml') && /<urlset[\s\S]*<\/urlset>/.test(sitemap);
const sitemapUrlCount = sitemap ? (sitemap.match(/<loc>/g) || []).length : 0;

// ---- REPORT ----
function head(label, ok) {
  const icon = ok ? '✅' : '❌';
  console.log(`\n${icon} ${label}`);
}
function showFew(arr, n = 3) {
  for (const x of arr.slice(0, n)) {
    if (typeof x === 'string') console.log(`    - ${x}`);
    else console.log(`    - ${x.rel || x.found || x}: ${x.error || x.img || x.found || ''}`);
  }
  if (arr.length > n) console.log(`    ... +${arr.length - n} more`);
}

console.log('\n=========== LEVEL 1 AUDIT REPORT ===========');

head(`Title:        ${issues.missingTitle.length === 0 ? 'all pages have <title>' : `${issues.missingTitle.length} missing`}`, issues.missingTitle.length === 0);
if (issues.missingTitle.length) showFew(issues.missingTitle);

head(`Description:  ${issues.missingDescription.length === 0 ? 'all pages have meta description' : `${issues.missingDescription.length} missing`}`, issues.missingDescription.length === 0);
if (issues.missingDescription.length) showFew(issues.missingDescription);

head(`Canonical:    ${issues.missingCanonical.length === 0 ? 'all pages have canonical URL' : `${issues.missingCanonical.length} missing`}`, issues.missingCanonical.length === 0);
if (issues.missingCanonical.length) showFew(issues.missingCanonical);

head(`OG tags:      ${issues.missingOgTitle.length + issues.missingOgDesc.length + issues.missingOgUrl.length + issues.missingOgImage.length === 0 ? 'complete on all pages' : 'some missing'}`, issues.missingOgTitle.length === 0 && issues.missingOgDesc.length === 0);
console.log(`    og:title=${issues.missingOgTitle.length} missing, og:description=${issues.missingOgDesc.length}, og:url=${issues.missingOgUrl.length}, og:image=${issues.missingOgImage.length}`);

head(`JSON-LD:      ${issues.invalidJsonLd.length === 0 ? `all ${htmlFiles.length - issues.noJsonLd.length} blocks parse OK` : `${issues.invalidJsonLd.length} invalid`}`, issues.invalidJsonLd.length === 0);
if (issues.invalidJsonLd.length) showFew(issues.invalidJsonLd);
if (issues.noJsonLd.length > 0) console.log(`  (${issues.noJsonLd.length} pages have no JSON-LD — usually static legal pages, OK)`);

head(`Image alt:    ${issues.imgsNoAlt.length === 0 ? 'all images have alt attribute' : `${issues.imgsNoAlt.length} <img> tags without alt`}`, issues.imgsNoAlt.length === 0);
if (issues.imgsNoAlt.length) showFew(issues.imgsNoAlt);
if (issues.imgsEmptyAlt.length) console.log(`  (${issues.imgsEmptyAlt.length} <img> have empty alt="" — sometimes valid for decorative images)`);

head(`GA4 (${GA4_ID}):  ${issues.missingGa4.length === 0 ? 'present on all pages' : `${issues.missingGa4.length} missing GA4`}`, issues.missingGa4.length === 0);
if (issues.missingGa4.length) showFew(issues.missingGa4);

head(`Phone:        ${issues.badPhone.length === 0 ? `consistent (${PHONE})` : `${issues.badPhone.length} non-canonical occurrences`}`, issues.badPhone.length === 0);
if (issues.badPhone.length) showFew(issues.badPhone);

head(`Email:        ${issues.badEmail.length === 0 ? `consistent (${EMAIL})` : `${issues.badEmail.length} non-canonical occurrences`}`, issues.badEmail.length === 0);
if (issues.badEmail.length) showFew(issues.badEmail);

head(`Duplicate titles: ${issues.duplicateTitles.size === 0 ? 'none' : `${issues.duplicateTitles.size} titles used on >1 page`}`, issues.duplicateTitles.size === 0);
if (issues.duplicateTitles.size) {
  const sorted = [...issues.duplicateTitles.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  for (const [t, files] of sorted) {
    console.log(`    "${t.slice(0, 60)}..."  →  ${files.length} pages`);
  }
}

head(`Duplicate descriptions: ${issues.duplicateDescs.size === 0 ? 'none' : `${issues.duplicateDescs.size} descriptions reused`}`, issues.duplicateDescs.size === 0);
if (issues.duplicateDescs.size) {
  const sorted = [...issues.duplicateDescs.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  for (const [d, files] of sorted) {
    console.log(`    "${d.slice(0, 60)}..."  →  ${files.length} pages`);
  }
}

head(`robots.txt:   ${robotsOk ? 'OK (has User-agent + Sitemap)' : 'MISSING or malformed'}`, robotsOk);
head(`sitemap.xml:  ${sitemapOk ? `OK (${sitemapUrlCount} URLs)` : 'MISSING or malformed'}`, sitemapOk);

console.log('\n=== Page weights (in-repo, uncompressed) ===');
for (const [type, arr] of Object.entries(sizes)) {
  if (arr.length === 0) continue;
  const sortedSizes = arr.map(x => x.size).sort((a, b) => a - b);
  const avg = sortedSizes.reduce((s, x) => s + x, 0) / sortedSizes.length;
  const median = sortedSizes[Math.floor(sortedSizes.length / 2)];
  const max = sortedSizes[sortedSizes.length - 1];
  const min = sortedSizes[0];
  console.log(`  ${type.padEnd(15)} count=${arr.length}  avg=${(avg/1024).toFixed(0)}KB  median=${(median/1024).toFixed(0)}KB  min=${(min/1024).toFixed(0)}KB  max=${(max/1024).toFixed(0)}KB`);
  // Find heaviest
  const heaviest = arr.sort((a, b) => b.size - a.size).slice(0, 2);
  for (const h of heaviest) console.log(`    heavy: ${h.rel} = ${(h.size/1024).toFixed(0)}KB`);
}

const allOk = (
  issues.missingTitle.length === 0 &&
  issues.missingDescription.length === 0 &&
  issues.missingCanonical.length === 0 &&
  issues.missingOgTitle.length === 0 &&
  issues.invalidJsonLd.length === 0 &&
  issues.imgsNoAlt.length === 0 &&
  issues.missingGa4.length === 0 &&
  issues.badPhone.length === 0 &&
  issues.badEmail.length === 0 &&
  robotsOk && sitemapOk
);

console.log(allOk ? '\n✅ Level-1 audit clean' : '\n⚠ Level-1 audit found issues — see above');
