#!/usr/bin/env node
/**
 * Bulk legal-compliance fix for perfektsauberservice.com
 *   1. Replace Google Fonts CDN with self-hosted /fonts/fonts.css (eliminates DSGVO IP transmission)
 *   2. Replace inline GA4 loader with consent-gated version (TTDSG opt-in)
 *   3. Replace lying cookie banner text with truthful disclosure
 *   4. Wire cookie accept button to actually load GA4
 *   5. Add /agb and /widerrufsbelehrung links to footer
 *
 * Idempotent — safe to re-run.
 *
 * Usage: node fix-legal-compliance.js [--dry]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const ROOT = __dirname;

// ============ Patterns ============

// 1. Google Fonts CDN -> local
const GFONTS_BLOCK_RE = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"\/>\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin\/>\s*<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*"[^>]*><noscript><link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet"\/><\/noscript>/g;
const GFONTS_LOCAL_REPLACEMENT = `<link rel="preload" href="/fonts/fonts.css" as="style" onload="this.onload=null;this.rel='stylesheet'"/><noscript><link rel="stylesheet" href="/fonts/fonts.css"/></noscript>`;

// 2. Inline GA4 -> consent-gated version
const GA4_OLD_RE = /<!-- Google Analytics 4 \(deferred to browser idle for perf\) -->\s*<script>\s*window\.dataLayer = window\.dataLayer \|\| \[\];\s*function gtag\(\)\{dataLayer\.push\(arguments\);\}\s*\(function\(\)\{\s*var loaded = false;\s*function loadGA\(\)\{\s*if \(loaded\) return; loaded = true;\s*gtag\('js', new Date\(\)\);\s*gtag\('config', 'G-BMC32KSYKF'\);\s*var s = document\.createElement\('script'\);\s*s\.async = true;\s*s\.src = 'https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-BMC32KSYKF';\s*document\.head\.appendChild\(s\);\s*\}\s*if \('requestIdleCallback' in window\) requestIdleCallback\(loadGA, \{ timeout: 4000 \}\);\s*else setTimeout\(loadGA, 2500\);\s*\}\)\(\);\s*<\/script>/;
const GA4_NEW = `<!-- Google Analytics 4 (consent-gated, DSGVO/TTDSG compliant — only loads if user opted in) -->
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.psLoadGA = function(){
  if (window.psGALoaded) return; window.psGALoaded = true;
  gtag('js', new Date());
  gtag('config', 'G-BMC32KSYKF', { anonymize_ip: true });
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-BMC32KSYKF';
  document.head.appendChild(s);
};
(function(){
  try {
    var c = localStorage.getItem('psCookieChoice');
    if (c === 'all') {
      if ('requestIdleCallback' in window) requestIdleCallback(window.psLoadGA, { timeout: 4000 });
      else setTimeout(window.psLoadGA, 2500);
    }
  } catch(e) {}
})();
</script>`;

// 3a. Cookie banner text — most pages
const BANNER_TEXT_OLD = `<p>Wir verwenden notwendige Cookies, damit die Website funktioniert. Optionale Analyse-Cookies helfen uns, sie zu verbessern.</p>`;
const BANNER_TEXT_NEW = `<p>Wir nutzen notwendige Cookies für den Betrieb der Website sowie – nur mit Ihrer Einwilligung – Google Analytics 4 zur Verbesserung der Website (anonymisierte Nutzungsstatistik). Details in der <a href="/datenschutz">Datenschutzerklärung</a>.</p>`;

// 3b. Cookie banner text — index.html (different wording)
const INDEX_BANNER_TEXT_OLD = `<p style="font-size:.88rem; line-height:1.55; color:var(--muted); margin-bottom:18px;">Diese Website verwendet ausschließlich <strong style="color:var(--ink);">technisch notwendige Cookies</strong>, die für den Betrieb erforderlich sind. Wir setzen <strong style="color:var(--ink);">keine Tracking- oder Werbe-Cookies</strong> ein. Mehr Infos in der <a href="/datenschutz" style="color:var(--bordeaux); text-decoration:underline;">Datenschutzerklärung</a>.</p>`;
const INDEX_BANNER_TEXT_NEW = `<p style="font-size:.88rem; line-height:1.55; color:var(--muted); margin-bottom:18px;">Wir nutzen notwendige Cookies für den Betrieb der Website sowie – <strong style="color:var(--ink);">nur mit Ihrer Einwilligung</strong> – Google Analytics 4 zur Verbesserung der Website (anonymisierte Nutzungsstatistik). Details in der <a href="/datenschutz" style="color:var(--bordeaux); text-decoration:underline;">Datenschutzerklärung</a>.</p>`;

// 3c. Index.html has only "Verstanden" button — convert to two-button opt-in/out (regex for CRLF/LF tolerance)
const INDEX_BANNER_BUTTONS_OLD_RE = /<div style="display:flex; gap:10px; flex-wrap:wrap;">\r?\n\s*<button id="cookieAccept"[^>]*>Verstanden →<\/button>\r?\n\s*<a href="\/datenschutz"[^>]*>Details<\/a>\r?\n\s*<\/div>/;
const INDEX_BANNER_BUTTONS_NEW = `<div style="display:flex; gap:10px; flex-wrap:wrap;">
    <button id="cookieAccept" style="flex:1; min-width:140px; background:var(--ink); color:var(--bg); border:0; padding:12px 20px; border-radius:8px; font-family:'Geist Mono',monospace; font-size:.74rem; letter-spacing:.14em; text-transform:uppercase; cursor:pointer;">Alle akzeptieren</button>
    <button id="cookieDecline" style="flex:1; min-width:140px; background:transparent; color:var(--ink); border:1px solid var(--line); padding:12px 20px; border-radius:8px; font-family:'Geist Mono',monospace; font-size:.74rem; letter-spacing:.14em; text-transform:uppercase; cursor:pointer;">Nur notwendige</button>
    <a href="/datenschutz" style="flex:0 0 100%; text-align:center; background:transparent; color:var(--muted); padding:6px 12px; font-family:'Geist Mono',monospace; font-size:.7rem; letter-spacing:.14em; text-transform:uppercase; text-decoration:underline;">Details</a>
  </div>`;

// 3d. Index.html cookie script — wire up GA4 + decline button (regex)
const INDEX_BANNER_SCRIPT_OLD_RE = /const KEY = 'cookie_consent_v1';\r?\n\s*const banner = document\.getElementById\('cookieBanner'\);\r?\n\s*const btn = document\.getElementById\('cookieAccept'\);\r?\n\s*const reopen = document\.getElementById\('cookieReopen'\);\r?\n\s*function show\(\)\{ banner\.style\.display = 'block'; \}\r?\n\s*function hide\(\)\{ banner\.style\.display = 'none'; \}\r?\n\s*if \(!localStorage\.getItem\(KEY\)\) \{\r?\n\s*setTimeout\(show, 800\);\r?\n\s*\}\r?\n\s*btn\.addEventListener\('click', \(\) => \{\r?\n\s*localStorage\.setItem\(KEY, JSON\.stringify\(\{accepted:true, ts:Date\.now\(\)\}\)\);\r?\n\s*hide\(\);\r?\n\s*\}\);\r?\n\s*reopen\.addEventListener\('click', \(e\) => \{ e\.preventDefault\(\); show\(\); \}\);/;
const INDEX_BANNER_SCRIPT_NEW = `const KEY = 'psCookieChoice';
  const banner = document.getElementById('cookieBanner');
  const btnAccept = document.getElementById('cookieAccept');
  const btnDecline = document.getElementById('cookieDecline');
  const reopen = document.getElementById('cookieReopen');
  function show(){ banner.style.display = 'block'; }
  function hide(){ banner.style.display = 'none'; }
  if (!localStorage.getItem(KEY)) {
    setTimeout(show, 800);
  }
  btnAccept.addEventListener('click', () => {
    localStorage.setItem(KEY, 'all');
    if (typeof window.psLoadGA === 'function') window.psLoadGA();
    hide();
  });
  btnDecline.addEventListener('click', () => {
    localStorage.setItem(KEY, 'necessary');
    hide();
  });
  reopen.addEventListener('click', (e) => { e.preventDefault(); show(); });`;

// 4a. Cookie banner script — most pages: wire accept to load GA4
const BANNER_SCRIPT_OLD = `document.getElementById('cookieAccept').onclick = function(){ close('all'); };`;
const BANNER_SCRIPT_NEW = `document.getElementById('cookieAccept').onclick = function(){ close('all'); if (typeof window.psLoadGA === 'function') window.psLoadGA(); };`;

// 5. Footer links — add /agb + /widerrufsbelehrung
// Pattern A (city pages, no separator):
const FOOTER_A_OLD = `<a href="/impressum">Impressum</a> <a href="/datenschutz">Datenschutz</a> <a href="#" id="cookieReopen">Cookies</a>`;
const FOOTER_A_NEW = `<a href="/impressum">Impressum</a> <a href="/datenschutz">Datenschutz</a> <a href="/agb">AGB</a> <a href="/widerrufsbelehrung">Widerruf</a> <a href="#" id="cookieReopen">Cookies</a>`;

// Pattern B (admin/legal pages with bullet separators):
const FOOTER_B_OLD = `<a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="#" id="cookieReopen">Cookies</a>`;
const FOOTER_B_NEW = `<a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="/agb">AGB</a> · <a href="/widerrufsbelehrung">Widerruf</a> · <a href="#" id="cookieReopen">Cookies</a>`;

// Pattern C (index.html — uses "Cookie-Einstellungen" not "Cookies"):
const FOOTER_C_OLD = `<a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="#" id="cookieReopen">Cookie-Einstellungen</a>`;
const FOOTER_C_NEW = `<a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="/agb">AGB</a> · <a href="/widerrufsbelehrung">Widerruf</a> · <a href="#" id="cookieReopen">Cookie-Einstellungen</a>`;

// Pattern D (kontakt.html secondary footer) — regex for CRLF tolerance:
const FOOTER_D_OLD_RE = /<a href="\/impressum">Impressum<\/a>\r?\n\s*<a href="\/datenschutz">Datenschutz<\/a>\r?\n\s*<a href="\/ueber-uns">Über uns<\/a>\r?\n\s*<a href="\/leistungen">Leistungen<\/a>/;
const FOOTER_D_NEW = `<a href="/impressum">Impressum</a>
      <a href="/datenschutz">Datenschutz</a>
      <a href="/agb">AGB</a>
      <a href="/widerrufsbelehrung">Widerruf</a>
      <a href="/ueber-uns">Über uns</a>
      <a href="/leistungen">Leistungen</a>`;

// ============ Walk + apply ============

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip common non-site dirs
      if (['node_modules', '.git', 'agent', 'master', 'outreach', 'public', 'dashboard', 'netlify', 'fonts', 'css', 'images', 'content'].includes(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
console.log(`Found ${files.length} HTML files`);

let totals = {
  fonts: 0,
  ga4: 0,
  bannerText: 0,
  bannerTextIndex: 0,
  bannerButtonsIndex: 0,
  bannerScriptIndex: 0,
  bannerScript: 0,
  footerA: 0,
  footerB: 0,
  footerC: 0,
  footerD: 0,
  changed: 0,
};

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  const orig = html;

  // 1. Google Fonts -> local
  const fontsBefore = (html.match(GFONTS_BLOCK_RE) || []).length;
  html = html.replace(GFONTS_BLOCK_RE, GFONTS_LOCAL_REPLACEMENT);
  if (fontsBefore > 0) totals.fonts += fontsBefore;

  // 2. GA4 consent gate
  if (GA4_OLD_RE.test(html)) {
    html = html.replace(GA4_OLD_RE, GA4_NEW);
    totals.ga4++;
  }

  // 3. Banner text + script
  if (html.includes(BANNER_TEXT_OLD)) {
    html = html.replace(BANNER_TEXT_OLD, BANNER_TEXT_NEW);
    totals.bannerText++;
  }
  if (html.includes(INDEX_BANNER_TEXT_OLD)) {
    html = html.replace(INDEX_BANNER_TEXT_OLD, INDEX_BANNER_TEXT_NEW);
    totals.bannerTextIndex++;
  }
  if (INDEX_BANNER_BUTTONS_OLD_RE.test(html)) {
    html = html.replace(INDEX_BANNER_BUTTONS_OLD_RE, INDEX_BANNER_BUTTONS_NEW);
    totals.bannerButtonsIndex++;
  }
  if (INDEX_BANNER_SCRIPT_OLD_RE.test(html)) {
    html = html.replace(INDEX_BANNER_SCRIPT_OLD_RE, INDEX_BANNER_SCRIPT_NEW);
    totals.bannerScriptIndex++;
  }
  if (html.includes(BANNER_SCRIPT_OLD) && !html.includes(BANNER_SCRIPT_NEW)) {
    html = html.replace(BANNER_SCRIPT_OLD, BANNER_SCRIPT_NEW);
    totals.bannerScript++;
  }

  // 5. Footer
  if (html.includes(FOOTER_A_OLD)) {
    html = html.replace(FOOTER_A_OLD, FOOTER_A_NEW);
    totals.footerA++;
  } else if (html.includes(FOOTER_B_OLD)) {
    html = html.replace(FOOTER_B_OLD, FOOTER_B_NEW);
    totals.footerB++;
  } else if (html.includes(FOOTER_C_OLD)) {
    html = html.replace(FOOTER_C_OLD, FOOTER_C_NEW);
    totals.footerC++;
  }
  if (FOOTER_D_OLD_RE.test(html)) {
    html = html.replace(FOOTER_D_OLD_RE, FOOTER_D_NEW);
    totals.footerD++;
  }

  if (html !== orig) {
    totals.changed++;
    if (!DRY) fs.writeFileSync(file, html, 'utf8');
  }
}

console.log('\n=== Summary ===');
console.log(`Files changed:           ${totals.changed} / ${files.length}`);
console.log(`Google Fonts → local:    ${totals.fonts}`);
console.log(`GA4 consent-gated:       ${totals.ga4}`);
console.log(`Banner text (default):   ${totals.bannerText}`);
console.log(`Banner text (index):     ${totals.bannerTextIndex}`);
console.log(`Banner buttons (index):  ${totals.bannerButtonsIndex}`);
console.log(`Banner script (index):   ${totals.bannerScriptIndex}`);
console.log(`Banner script (default): ${totals.bannerScript}`);
console.log(`Footer A (city pages):   ${totals.footerA}`);
console.log(`Footer B (legal pages):  ${totals.footerB}`);
console.log(`Footer C (index):        ${totals.footerC}`);
console.log(`Footer D (kontakt 2nd):  ${totals.footerD}`);
if (DRY) console.log('\n(dry-run — no files written)');
