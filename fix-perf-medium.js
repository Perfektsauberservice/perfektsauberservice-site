#!/usr/bin/env node
/**
 * Medium-priority perf + UX fixes for perfektsauberservice.com
 *   #12 Honest review count (5,0 → 5,0 · 2 Bewertungen)
 *   #13 Move inline GA4 from <head> to before </body>
 *   #15 Mirror meta description into og:description when og is shorter
 *   #18 Add hero <link rel=preload as=image> for LCP
 *
 * Idempotent — safe to re-run.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const ROOT = __dirname;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'agent', 'master', 'outreach', 'public', 'dashboard', 'netlify', 'fonts', 'css', 'images', 'content'].includes(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

// ============ #12 Honest review count ============
const reviewReplacements = [
  { from: '<strong>5,0 ★</strong><span>Google</span>',
    to:   '<strong>5,0 ★</strong><span>Google · 2 Rezensionen</span>' },
  { from: '<span class="star">★★★★★</span> <b>5,0</b> Google',
    to:   '<span class="star">★★★★★</span> <b>5,0</b> Google · 2 Rezensionen' },
  { from: '<div class="rev-mark">★★★★★ · 5,0 auf Google</div>',
    to:   '<div class="rev-mark">★★★★★ · 5,0 auf Google · 2 Rezensionen</div>' },
  { from: '<h3>5,0 ★ Google-Bewertung</h3>',
    to:   '<h3>5,0 ★ Google-Bewertung (2 Rezensionen)</h3>' },
  { from: '5,0 auf Google',
    to:   '5,0 auf Google · 2 Rezensionen' },
];

function honestReviews(html) {
  let updated = html;
  let changed = false;
  // Skip ONLY if BOTH visible patterns already mention count
  // (detect "5,0" without "Rezensionen" within ~200 chars)
  const countAlready = /5,0[^<]{0,80}(Rezensionen|Bewertungen)/.test(updated);
  if (countAlready && !/<h3>5,0 ★ Google-Bewertung<\/h3>/.test(updated) && !/<b>5,0<\/b> Google</.test(updated)) {
    return { html, changed };
  }

  // Apply ALL applicable patterns (some pages have multiple displays)
  for (const { from, to } of reviewReplacements) {
    if (updated.includes(from)) {
      updated = updated.split(from).join(to);
      changed = true;
    }
  }
  return { html: updated, changed };
}

// ============ #13 Move GA4 inline from head to body ============
const GA4_HEAD_RE = /<!-- Google Analytics 4 \(consent-gated[^)]*\) -->\s*<script>\s*window\.dataLayer = window\.dataLayer \|\| \[\];[\s\S]*?<\/script>/;

function moveGA4ToBody(html) {
  const match = html.match(GA4_HEAD_RE);
  if (!match) return { html, changed: false };

  // Check if already in body (after </main> or near </body>)
  const idxMatch = html.indexOf(match[0]);
  const idxHead = html.indexOf('</head>');
  if (idxMatch > idxHead) return { html, changed: false }; // already past head

  const ga4Block = match[0];
  // Remove from head
  let updated = html.replace(GA4_HEAD_RE, '');
  // Insert before </body>, with explicit deferred-by-position behavior
  updated = updated.replace(/<\/body>/, `${ga4Block}\n</body>`);
  return { html: updated, changed: true };
}

// ============ #15 Mirror meta description into og:description ============
function mirrorMeta(html) {
  const metaDesc = html.match(/<meta name="description" content="([^"]*)">/);
  const ogDesc = html.match(/<meta property="og:description" content="([^"]*)">/);
  if (!metaDesc || !ogDesc) return { html, changed: false };
  if (metaDesc[1] === ogDesc[1]) return { html, changed: false };
  // Only replace when og is meaningfully shorter (>20% gap)
  if (ogDesc[1].length >= metaDesc[1].length * 0.8) return { html, changed: false };

  const updated = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${metaDesc[1]}">`
  );
  // Mirror twitter:description if it matches the old og value
  let updated2 = updated;
  const twDesc = updated.match(/<meta name="twitter:description" content="([^"]*)">/);
  if (twDesc && twDesc[1] === ogDesc[1]) {
    updated2 = updated.replace(
      /<meta name="twitter:description" content="[^"]*">/,
      `<meta name="twitter:description" content="${metaDesc[1]}">`
    );
  }
  return { html: updated2, changed: true };
}

// ============ #18 Hero LCP preload ============
function addHeroPreload(html) {
  // Skip if already has any rel="preload" as="image"
  if (/<link rel="preload"[^>]*as="image"/.test(html)) return { html, changed: false };

  // Find first <img> inside .hero or .hero-img — likely the LCP candidate
  const heroImgMatch = html.match(/<div class="hero-img">[\s\S]*?<img\s+src="([^"]+)"/) ||
                       html.match(/<section class="hero"[^>]*>[\s\S]*?<img\s+src="([^"]+)"/);
  if (!heroImgMatch) return { html, changed: false };

  const heroSrc = heroImgMatch[1];
  // Skip if it's an external/absolute URL — we only preload local
  if (/^https?:\/\//i.test(heroSrc) && !heroSrc.includes('perfektsauberservice.com')) return { html, changed: false };
  // Skip if it's a tiny logo
  if (/logo|favicon|icon/i.test(heroSrc)) return { html, changed: false };

  const preloadTag = `<link rel="preload" as="image" href="${heroSrc}" fetchpriority="high">`;

  // Insert just before </head>
  if (!html.includes('</head>')) return { html, changed: false };
  const updated = html.replace(/<\/head>/, `${preloadTag}\n</head>`);
  return { html: updated, changed: true };
}

// ============ Main ============
const files = walk(ROOT);
console.log(`Found ${files.length} HTML files`);

const totals = { reviews: 0, ga4Moved: 0, ogMirrored: 0, heroPreload: 0, total: 0 };

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  const orig = html;

  const r1 = honestReviews(html); if (r1.changed) { html = r1.html; totals.reviews++; }
  const r2 = moveGA4ToBody(html); if (r2.changed) { html = r2.html; totals.ga4Moved++; }
  const r3 = mirrorMeta(html); if (r3.changed) { html = r3.html; totals.ogMirrored++; }
  const r4 = addHeroPreload(html); if (r4.changed) { html = r4.html; totals.heroPreload++; }

  if (html !== orig) {
    totals.total++;
    if (!DRY) fs.writeFileSync(file, html, 'utf8');
  }
}

console.log('\n=== Summary ===');
console.log(`Files changed:        ${totals.total} / ${files.length}`);
console.log(`#12 Reviews honest:   ${totals.reviews}`);
console.log(`#13 GA4 moved to body:${totals.ga4Moved}`);
console.log(`#15 og:desc mirrored: ${totals.ogMirrored}`);
console.log(`#18 Hero preload:     ${totals.heroPreload}`);
if (DRY) console.log('\n(dry-run — no files written)');
