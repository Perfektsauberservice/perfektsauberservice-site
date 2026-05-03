// Comprehensive site-asset audit:
//   1. Internal images (all <img src="/images/..."> — file exists?)
//   2. Internal scripts/styles (<script src="">, <link rel="stylesheet" href="">)
//   3. Canonical URL consistency (canonical href matches the page slug)
//   4. External hrefs — unique URLs, HEAD-checked in parallel (network)

import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const SKIP_DIRS = ['node_modules','_archived','.git','agent','content','dashboard','public','netlify'];

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
console.log(`Scanning ${htmlFiles.length} HTML files...\n`);

const brokenImages = new Map(); // url → [sources]
const brokenScripts = new Map();
const brokenStyles = new Map();
const canonicalIssues = [];
const externalUrls = new Set();

function fileExists(rel) {
  const abs = path.join(REPO, rel);
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

function urlToRepoPath(url) {
  if (url.startsWith('/')) return url.slice(1).split('?')[0].split('#')[0];
  return null;
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const sourceRel = file.replace(/\\/g, '/').replace(REPO.replace(/\\/g, '/') + '/', '');

  // === Images ===
  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    const url = m[1];
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // External image — collect for later
      if (!url.includes('perfektsauberservice.com')) externalUrls.add(url);
      continue;
    }
    if (url.startsWith('data:')) continue;
    const rel = urlToRepoPath(url);
    if (rel && !fileExists(rel)) {
      if (!brokenImages.has(url)) brokenImages.set(url, []);
      brokenImages.get(url).push(sourceRel);
    }
  }

  // === Scripts ===
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const url = m[1];
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (!url.includes('perfektsauberservice.com')) externalUrls.add(url);
      continue;
    }
    const rel = urlToRepoPath(url);
    if (rel && !fileExists(rel)) {
      if (!brokenScripts.has(url)) brokenScripts.set(url, []);
      brokenScripts.get(url).push(sourceRel);
    }
  }

  // === Stylesheets ===
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"|<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"/g)) {
    const url = m[1] || m[2];
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (!url.includes('perfektsauberservice.com')) externalUrls.add(url);
      continue;
    }
    const rel = urlToRepoPath(url);
    if (rel && !fileExists(rel)) {
      if (!brokenStyles.has(url)) brokenStyles.set(url, []);
      brokenStyles.get(url).push(sourceRel);
    }
  }

  // === Canonical consistency ===
  const canonMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
  if (canonMatch) {
    const canon = canonMatch[1];
    // Expected canonical = https://perfektsauberservice.com/<basename without .html>
    const base = path.basename(file).replace(/\.html$/, '');
    let expected;
    if (sourceRel === 'index.html') expected = 'https://perfektsauberservice.com/';
    else if (sourceRel.startsWith('blog/')) expected = `https://perfektsauberservice.com/blog/${base}`;
    else expected = `https://perfektsauberservice.com/${base}`;
    // Allow trailing slash variants and .html variants
    const canonNorm = canon.replace(/\.html$/, '').replace(/\/$/, '');
    const expNorm = expected.replace(/\.html$/, '').replace(/\/$/, '');
    if (canonNorm !== expNorm) {
      canonicalIssues.push({ source: sourceRel, canonical: canon, expected });
    }
  }

  // === External hrefs (collect unique only) ===
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const url = m[1];
    if (!url.includes('perfektsauberservice.com')) externalUrls.add(url);
  }
}

console.log('=== INTERNAL ASSETS ===');
console.log(`Broken images:      ${[...brokenImages.values()].reduce((s, a) => s + a.length, 0)} instances, ${brokenImages.size} unique URLs`);
console.log(`Broken scripts:     ${[...brokenScripts.values()].reduce((s, a) => s + a.length, 0)} instances, ${brokenScripts.size} unique URLs`);
console.log(`Broken stylesheets: ${[...brokenStyles.values()].reduce((s, a) => s + a.length, 0)} instances, ${brokenStyles.size} unique URLs`);
console.log(`Canonical mismatches: ${canonicalIssues.length}`);

function showTop(map, label) {
  if (map.size === 0) return;
  console.log(`\n--- ${label} ---`);
  const sorted = [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [url, srcs] of sorted.slice(0, 15)) {
    console.log(`✗ ${url}  →  ${srcs.length} files`);
    for (const s of srcs.slice(0, 2)) console.log(`    - ${s}`);
    if (srcs.length > 2) console.log(`    ... +${srcs.length - 2}`);
  }
}

showTop(brokenImages, 'BROKEN IMAGES');
showTop(brokenScripts, 'BROKEN SCRIPTS');
showTop(brokenStyles, 'BROKEN STYLESHEETS');

if (canonicalIssues.length) {
  console.log('\n--- CANONICAL MISMATCHES (first 10) ---');
  for (const c of canonicalIssues.slice(0, 10)) {
    console.log(`✗ ${c.source}: canonical=${c.canonical}, expected=${c.expected}`);
  }
}

console.log(`\n=== EXTERNAL URLS ===`);
console.log(`Unique external URLs: ${externalUrls.size}`);
console.log('Checking with HEAD requests (parallelism=8)...\n');

// HEAD-check external URLs
const urls = [...externalUrls];
const dead = [];
const slow = [];
const concurrency = 8;
let processed = 0;

async function head(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const start = Date.now();
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    clearTimeout(t);
    const ms = Date.now() - start;
    return { url, status: res.status, ms };
  } catch (e) {
    return { url, status: 0, error: e.name };
  }
}

async function runPool() {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const u = urls[i++];
      const r = await head(u);
      results.push(r);
      processed++;
      if (processed % 25 === 0) console.log(`  ${processed}/${urls.length}...`);
    }
  }
  await Promise.all(Array.from({length: concurrency}, worker));
  return results;
}

const results = await runPool();
const byStatus = {};
for (const r of results) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  if (r.status === 0 || r.status >= 400) dead.push(r);
  if (r.ms > 3000 && r.status > 0 && r.status < 400) slow.push(r);
}

console.log('\n=== EXTERNAL HEAD CHECK RESULTS ===');
console.log('By status:', byStatus);

if (dead.length) {
  console.log(`\n--- DEAD/4xx/5xx external URLs (${dead.length}) ---`);
  for (const d of dead.slice(0, 30)) {
    console.log(`✗ [${d.status || d.error}] ${d.url}`);
  }
}

if (slow.length) {
  console.log(`\n--- SLOW external URLs >3s (${slow.length}) ---`);
  for (const s of slow.slice(0, 10)) console.log(`! [${s.ms}ms] ${s.url}`);
}

if (dead.length === 0 && brokenImages.size === 0 && brokenScripts.size === 0 && brokenStyles.size === 0 && canonicalIssues.length === 0) {
  console.log('\n✅ ALL ASSETS HEALTHY');
}
