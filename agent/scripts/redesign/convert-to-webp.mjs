// Convert all raster images under /images/ to WebP, then update HTML
// references across the repo (root + blog/) so the new .webp paths are used.
//
// Strategy:
//  1. Walk images/ recursively, find every .jpg/.jpeg/.png
//  2. If a sibling .webp already exists with reasonable size, skip
//  3. Else run cwebp at quality 85 to produce the .webp counterpart
//  4. Walk all .html in root + blog/ and replace src/href references:
//       "X.jpg"  → "X.webp"   (only when X.webp exists)
//       "X.jpeg" → "X.webp"
//       "X.png"  → "X.webp"  (only for photo PNGs we converted; favicons stay)
//  5. NOT deleting originals — keeps fallbacks. They can be pruned later.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO = 'C:/Users/laral/Documents/proiect 1 claude code/perfektsauberservice-site-main';
const CWEBP = path.join(REPO, 'agent/tools/libwebp/libwebp-1.5.0-windows-x64/bin/cwebp.exe');
const QUALITY = 85;

// Files we explicitly DO NOT touch (icons, app manifest, favicons stay PNG)
const SKIP_BASENAMES = new Set([
  'favicon.png', 'favicon-32.png', 'apple-touch-icon.png',
  'logo.png', 'logo-small.png',  // kept as PNG fallbacks
]);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function isImage(p) {
  return /\.(jpe?g|png)$/i.test(p);
}

function convert(src, dst) {
  const cmd = `"${CWEBP}" -q ${QUALITY} -m 6 -mt -quiet "${src}" -o "${dst}"`;
  execSync(cmd);
}

function relForUrl(absPath) {
  // Convert absolute path to /images/... URL
  const rel = absPath.replace(/\\/g, '/').split('/images/')[1];
  return rel ? '/images/' + rel : null;
}

console.log('=== STEP 1: Convert images to WebP ===');
const allImages = walk(path.join(REPO, 'images')).filter(isImage);
console.log(`Found ${allImages.length} raster images`);

let converted = 0, skipped = 0, failed = 0;
const conversions = []; // { jpg: '/images/foo.jpg', webp: '/images/foo.webp' }

for (const src of allImages) {
  const base = path.basename(src);
  if (SKIP_BASENAMES.has(base)) { skipped++; continue; }

  const ext = path.extname(src);
  const webpPath = src.slice(0, -ext.length) + '.webp';

  // If webp already exists and is non-trivial size, skip (we already optimized it)
  if (fs.existsSync(webpPath)) {
    const stat = fs.statSync(webpPath);
    if (stat.size > 1000) { skipped++; continue; }
  }

  try {
    convert(src, webpPath);
    converted++;
    conversions.push({
      orig: relForUrl(src),
      origExt: ext.slice(1),
      webp: relForUrl(webpPath),
      origBytes: fs.statSync(src).size,
      webpBytes: fs.statSync(webpPath).size,
    });
    if (converted % 25 === 0) console.log(`  ${converted} converted...`);
  } catch (e) {
    console.error(`  ✗ ${src}: ${e.message}`);
    failed++;
  }
}

console.log(`\nConverted: ${converted}, skipped (existing): ${skipped}, failed: ${failed}`);
const totalOrig = conversions.reduce((s, c) => s + c.origBytes, 0);
const totalWebp = conversions.reduce((s, c) => s + c.webpBytes, 0);
const saved = totalOrig - totalWebp;
console.log(`Bytes: ${(totalOrig/1024/1024).toFixed(1)}MB → ${(totalWebp/1024/1024).toFixed(1)}MB (saved ${(saved/1024/1024).toFixed(1)}MB, ${(100*saved/totalOrig).toFixed(0)}%)`);

console.log('\n=== STEP 2: Update HTML references ===');
const htmlFiles = [
  ...walk(REPO).filter(p => /\.html$/.test(p) && !p.includes('_archived') && !p.includes('node_modules')
    && !p.includes('agent/scripts')),
];
console.log(`Scanning ${htmlFiles.length} HTML files`);

// Build a lookup: original URL → webp URL (only for things we just converted, plus
// any pre-existing webp counterparts we want to prefer)
const urlMap = new Map();
for (const c of conversions) {
  if (c.orig && c.webp) urlMap.set(c.orig, c.webp);
}
// Also map all jpg/png images that had a pre-existing webp (we want HTML to use webp now)
for (const src of allImages) {
  const base = path.basename(src);
  if (SKIP_BASENAMES.has(base)) continue;
  const ext = path.extname(src);
  const webpPath = src.slice(0, -ext.length) + '.webp';
  if (fs.existsSync(webpPath)) {
    const origUrl = relForUrl(src);
    const webpUrl = relForUrl(webpPath);
    if (origUrl && webpUrl) urlMap.set(origUrl, webpUrl);
  }
}
console.log(`URL map size: ${urlMap.size}`);

let updatedFiles = 0, totalReplacements = 0;
for (const file of htmlFiles) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  let count = 0;
  for (const [orig, webp] of urlMap) {
    // Replace in src="...", href="...", url(...), as well as srcset and absolute URLs
    const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    html = html.replace(re, m => { count++; return webp; });
  }
  if (count > 0) {
    fs.writeFileSync(file, html);
    updatedFiles++;
    totalReplacements += count;
  }
}
console.log(`\nUpdated ${updatedFiles} HTML files with ${totalReplacements} replacements`);

console.log('\n=== STEP 3: Update sitemap if needed ===');
// sitemap.xml is fine — it points to URLs (/page-name) not image files. No change.

console.log('\nDone. Originals kept as fallbacks. Run the script again to re-convert if needed.');
