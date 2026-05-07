#!/usr/bin/env node
/**
 * Bulk perf + UX fixes for perfektsauberservice.com
 *   #10 Twitter cards meta — reuses og:title / og:description / og:image
 *   #7 Mobile hamburger nav — adds <button class="nav-toggle"> + small JS, fixes CSS
 *
 * Idempotent — safe to re-run.
 *
 * Usage: node fix-perf-and-ux.js [--dry]
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

// ============ #10 Twitter Cards ============

function addTwitterCards(html) {
  // Skip if already present
  if (html.includes('twitter:card')) return { html, changed: false };

  // Parse og:title, og:description, og:image
  const ogTitle = html.match(/<meta property="og:title" content="([^"]*)">/);
  const ogDesc = html.match(/<meta property="og:description" content="([^"]*)">/);
  const ogImage = html.match(/<meta property="og:image" content="([^"]*)">/);
  if (!ogImage) return { html, changed: false };

  const twitterBlock =
    `<meta name="twitter:card" content="summary_large_image">\n` +
    (ogTitle ? `<meta name="twitter:title" content="${ogTitle[1]}">\n` : '') +
    (ogDesc ? `<meta name="twitter:description" content="${ogDesc[1]}">\n` : '') +
    `<meta name="twitter:image" content="${ogImage[1]}">`;

  // Insert right after og:image line (preserving newline style)
  const updated = html.replace(
    /(<meta property="og:image" content="[^"]*">)/,
    `$1\n${twitterBlock}`
  );
  return { html: updated, changed: updated !== html };
}

// ============ #7 Mobile hamburger nav ============

// Toggle CSS — append to existing <style> blocks. Add only once per file (check for class).
const NAV_TOGGLE_CSS = `
.nav-toggle{display:none; background:none; border:0; padding:8px; cursor:pointer; color:var(--ink); margin-left:auto;}
.nav-toggle svg{display:block; width:26px; height:26px;}
.nav-toggle:focus-visible{outline:2px solid var(--blue); outline-offset:2px; border-radius:4px;}
@media(max-width:820px){
  .nav-toggle{display:inline-flex;}
  .nav-links{display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg, #fbf7f0); flex-direction:column; gap:0; padding:14px 28px 20px; border-bottom:1px solid var(--line, #e5dccb); box-shadow:0 16px 32px -16px rgba(26,32,48,.18);}
  .nav-links.open{display:flex;}
  .nav-links a{padding:12px 0; border-bottom:1px solid var(--line, #e5dccb);}
  .nav-links a:last-child{border-bottom:0;}
  .nav{position:relative;}
}`;

const NAV_TOGGLE_JS = `(function(){
  var btn = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (!btn || !links) return;
  btn.addEventListener('click', function(){
    var open = links.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  // Close menu on link click
  links.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ links.classList.remove('open'); btn.setAttribute('aria-expanded','false'); }); });
})();`;

const NAV_TOGGLE_BUTTON = `<button class="nav-toggle" aria-label="Menü öffnen" aria-expanded="false" aria-controls="navLinks" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>`;

function addMobileNav(html) {
  // Skip if already has nav-toggle
  if (html.includes('class="nav-toggle"') || html.includes('nav-toggle ')) return { html, changed: false };
  // Skip if no .nav-links
  if (!html.includes('class="nav-links"')) return { html, changed: false };

  let updated = html;
  let changed = false;

  // 1. Inject toggle button BEFORE the .nav-links div
  if (!updated.includes('class="nav-toggle"')) {
    const before = updated;
    updated = updated.replace(
      /(<div class="nav-links">)/,
      `${NAV_TOGGLE_BUTTON}\n  $1`
    );
    if (updated !== before) changed = true;
  }

  // 2. Add id="navLinks" to the .nav-links div for aria-controls
  if (!updated.includes('id="navLinks"')) {
    updated = updated.replace(
      /<div class="nav-links">/,
      `<div class="nav-links" id="navLinks">`
    );
  }

  // 3. Append CSS to the FIRST <style>...</style> block. Look for the @media(max-width:820px) line that hides nav-links.
  if (!updated.includes('.nav-toggle{')) {
    // Inject CSS just before the closing </style> of the first style block
    const styleEnd = updated.indexOf('</style>');
    if (styleEnd > -1) {
      updated = updated.slice(0, styleEnd) + NAV_TOGGLE_CSS + '\n' + updated.slice(styleEnd);
      changed = true;
    }
  }

  // 4. Inject JS — append to the first existing <script> after </footer>, or add new one before </body>.
  if (!updated.includes('document.querySelector(\'.nav-toggle\')')) {
    // Add a new script before </body>
    if (updated.includes('</body>')) {
      updated = updated.replace(
        /<\/body>/,
        `<script>${NAV_TOGGLE_JS}</script>\n</body>`
      );
      changed = true;
    }
  }

  return { html: updated, changed };
}

// ============ Main ============

const files = walk(ROOT);
console.log(`Found ${files.length} HTML files`);

let totals = { twitter: 0, navToggle: 0, total: 0 };

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  const orig = html;

  const r1 = addTwitterCards(html);
  if (r1.changed) { html = r1.html; totals.twitter++; }

  const r2 = addMobileNav(html);
  if (r2.changed) { html = r2.html; totals.navToggle++; }

  if (html !== orig) {
    totals.total++;
    if (!DRY) fs.writeFileSync(file, html, 'utf8');
  }
}

console.log('\n=== Summary ===');
console.log(`Files changed:    ${totals.total} / ${files.length}`);
console.log(`Twitter cards:    ${totals.twitter}`);
console.log(`Nav toggle:       ${totals.navToggle}`);
if (DRY) console.log('\n(dry-run — no files written)');
