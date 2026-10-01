/**
 * install-gtm.mjs — one-off, idempotent installer for Google Tag Manager
 * container GTM-P26S4QMN on every public page that carries the site's
 * Consent Mode v2 block.
 *
 * Placement is deliberate: the GTM loader is inserted directly AFTER the
 * existing `gtag('consent', 'default', {...denied...})` call, so the denied
 * defaults are already in the dataLayer when GTM starts and every GTM tag
 * inherits the visitor's consent state. The <noscript> iframe goes right
 * after <body>. Existing gtag (GA4 / Google Ads) config is left untouched.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

export const GTM_ID = 'GTM-P26S4QMN';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKIP = new Set(['node_modules', 'agent', '.git', '.claude', '.netlify', 'tests', 'dashboard', 'outreach']);

const CONSENT_END = "  wait_for_update: 500\n});\n";
const LOADER =
  "// Google Tag Manager (after Consent Mode defaults, so all GTM tags respect consent)\n" +
  "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n" +
  "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n" +
  "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n" +
  "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n" +
  `})(window,document,'script','dataLayer','${GTM_ID}');\n`;
const NOSCRIPT =
  `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}" ` +
  'height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>';

export function installGtm(html) {
  if (html.includes(`gtm.js?id='+i+dl`) || html.includes(`ns.html?id=${GTM_ID}`)) return html; // idempotent
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  const consentEnd = CONSENT_END.replace(/\n/g, nl);
  if (html.split(consentEnd).length !== 2) return html; // no (or ambiguous) consent block -> untouched
  let out = html.replace(consentEnd, consentEnd + LOADER.replace(/\n/g, nl));
  out = out.replace(/<body([^>]*)>/, (m) => m + nl + NOSCRIPT);
  return out;
}

function htmlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...htmlFiles(full));
    else if (extname(entry) === '.html') files.push(full);
  }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let changed = 0, skipped = 0;
  for (const f of htmlFiles(ROOT)) {
    const html = readFileSync(f, 'utf8');
    const out = installGtm(html);
    if (out !== html) { writeFileSync(f, out, 'utf8'); changed++; } else skipped++;
  }
  console.log(`GTM ${GTM_ID}: installed on ${changed} page(s), ${skipped} untouched.`);
}
