#!/usr/bin/env node
// Inject GA4 conversion tracking (phone_click, whatsapp_click, email_click)
// into every page that already loads gtag and has the standard cookie banner script.
// Idempotent: detects existing tracking via marker comment.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MARKER = '// GA4 conversion event tracking';

const ANCHOR = "document.getElementById('cookieReopen').onclick = function(e){ e.preventDefault(); b.style.display='block'; };";

const INJECT = `
  ${MARKER}
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a || typeof gtag !== 'function') return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) gtag('event', 'phone_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
    else if (href.indexOf('wa.me') > -1 || href.indexOf('api.whatsapp') > -1) gtag('event', 'whatsapp_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
    else if (href.indexOf('mailto:') === 0) gtag('event', 'email_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
  });`;

function listHtml(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('_') || f.startsWith('.')) continue;
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (['agent', 'node_modules', 'netlify', 'public', 'master', 'css', 'images', 'dashboard', 'content'].includes(f)) continue;
      out.push(...listHtml(p));
    } else if (f.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

const files = listHtml(ROOT);
let patched = 0, alreadyHad = 0, skipped = 0;
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  if (txt.includes(MARKER)) { alreadyHad++; continue; }
  if (!txt.includes(ANCHOR)) { skipped++; continue; }
  const next = txt.replace(ANCHOR, ANCHOR + INJECT);
  fs.writeFileSync(f, next);
  patched++;
}
console.log(`patched: ${patched}, already had: ${alreadyHad}, skipped (no anchor): ${skipped}, total: ${files.length}`);
