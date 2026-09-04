// Fixes the attribution-capture persistence gap (finding F-1201): the
// existing gclid/gbraid/wbraid/utm_* hidden fields on lead-capture forms
// were only ever populated from the CURRENT page's location.search at the
// moment of submit, so attribution was silently lost whenever a visitor
// landed on one page and navigated to a different page before submitting.
//
// Fix: capture the attribution parameters into sessionStorage the first
// time a visitor's cookie consent reaches 'all' (reusing the existing
// window.psGrantConsent hook, already present on this file, which already
// fires at both required moments: page load when consent was already
// granted on a prior visit, and the instant "accept all" is clicked).
// First-touch wins -- a later page's absent/different parameters never
// overwrite an already-captured value. At submit time, the hidden fields
// are populated from that stored snapshot instead of the current page's
// own location.search, plus two new fields (landing_page_url,
// first_seen_at) captured the same way.
//
// Scope: only the 46 files that already declare the gclid/utm hidden-field
// schema (41 hero-form-only, 3 lead-form-only, 2 with both) -- no other
// page is touched. Idempotent: skips a file already carrying the marker.
//
// Run from repo root: node agent/scripts/fix-attribution-persistence.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..', '..');
const MARKER = 'psCaptureAttribution';

const CAPTURE_FN = `window.psCaptureAttribution = function(){
  try {
    if (localStorage.getItem('psCookieChoice') !== 'all') return;
    if (sessionStorage.getItem('ps_attribution')) return;
    var qp = new URLSearchParams(location.search);
    var attr = {
      gclid: qp.get('gclid') || '',
      gbraid: qp.get('gbraid') || '',
      wbraid: qp.get('wbraid') || '',
      utm_source: qp.get('utm_source') || '',
      utm_medium: qp.get('utm_medium') || '',
      utm_campaign: qp.get('utm_campaign') || '',
      utm_term: qp.get('utm_term') || '',
      utm_content: qp.get('utm_content') || '',
      landing_page_url: location.href,
      first_seen_at: new Date().toISOString()
    };
    sessionStorage.setItem('ps_attribution', JSON.stringify(attr));
  } catch(e) {}
};
`;

function buildReadBlock(prefix, varName) {
  // prefix: 'hero' or 'lead' -- matches existing element-id convention.
  return `    try {
      var ${varName} = JSON.parse(sessionStorage.getItem('ps_attribution') || 'null');
      if (${varName}) {
        var lg = document.getElementById('${prefix}Gclid'); if (lg) lg.value = ${varName}.gclid || '';
        var lgb = document.getElementById('${prefix}Gbraid'); if (lgb) lgb.value = ${varName}.gbraid || '';
        var lwb = document.getElementById('${prefix}Wbraid'); if (lwb) lwb.value = ${varName}.wbraid || '';
        var lus = document.getElementById('${prefix}UtmSource'); if (lus) lus.value = ${varName}.utm_source || '';
        var lum = document.getElementById('${prefix}UtmMedium'); if (lum) lum.value = ${varName}.utm_medium || '';
        var luc = document.getElementById('${prefix}UtmCampaign'); if (luc) luc.value = ${varName}.utm_campaign || '';
        var lut = document.getElementById('${prefix}UtmTerm'); if (lut) lut.value = ${varName}.utm_term || '';
        var luco = document.getElementById('${prefix}UtmContent'); if (luco) luco.value = ${varName}.utm_content || '';
        var llp = document.getElementById('${prefix}LandingPage'); if (llp) llp.value = ${varName}.landing_page_url || '';
        var lfs = document.getElementById('${prefix}FirstSeenAt'); if (lfs) lfs.value = ${varName}.first_seen_at || '';
      }
    } catch(e) {}`;
}

// Matches the existing hero-variant submit-time population block.
const HERO_OLD_RE = /if \(localStorage\.getItem\('psCookieChoice'\) === 'all'\) \{\s*\n\s*var qp = new URLSearchParams\(location\.search\);\s*\n\s*var lg = document\.getElementById\('heroGclid'\);[\s\S]*?var luco = document\.getElementById\('heroUtmContent'\); if \(luco\) luco\.value = qp\.get\('utm_content'\) \|\| '';\s*\n\s*\}/;

// Matches the existing lead-variant submit-time population block (var name qp or qp2).
const LEAD_OLD_RE = /if \(localStorage\.getItem\('psCookieChoice'\) === 'all'\) \{\s*\n\s*var (qp2?) = new URLSearchParams\(location\.search\);\s*\n\s*var lg = document\.getElementById\('leadGclid'\);[\s\S]*?var luco = document\.getElementById\('leadUtmContent'\); if \(luco\) luco\.value = \1\.get\('utm_content'\) \|\| '';\s*\n\s*\}/;

const HERO_NEW_HIDDEN = `      <input type="hidden" name="landing_page_url" id="heroLandingPage" value="">
      <input type="hidden" name="first_seen_at" id="heroFirstSeenAt" value="">`;
const LEAD_NEW_HIDDEN_A = `      <input type="hidden" name="landing_page_url" id="leadLandingPage" value=""/>
      <input type="hidden" name="first_seen_at" id="leadFirstSeenAt" value=""/>`;
const LEAD_NEW_HIDDEN_B = `      <input type="hidden" name="landing_page_url" id="leadLandingPage" value="">
      <input type="hidden" name="first_seen_at" id="leadFirstSeenAt" value="">`;

let totals = { ok: 0, alreadyHad: 0, noMatch: 0, missing: 0 };
const changed = [];

const files = execSync('git grep -lE "heroGclid|leadGclid" -- "*.html"', { cwd: ROOT, encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean);

for (const file of files) {
  const path = `${ROOT}/${file}`;
  let html;
  try { html = await readFile(path, 'utf8'); }
  catch { console.log(`MISSING: ${file}`); totals.missing++; continue; }

  if (html.includes(MARKER)) {
    console.log(`SKIP (already patched): ${file}`);
    totals.alreadyHad++;
    continue;
  }

  let out = html;
  let touched = false;

  // 1. Insert the capture function + call it from psGrantConsent.
  const grantIdx = out.indexOf('window.psGrantConsent = function(){');
  if (grantIdx === -1) {
    console.log(`SKIP (no psGrantConsent): ${file}`);
    totals.noMatch++;
    continue;
  }
  out = out.slice(0, grantIdx) + CAPTURE_FN + out.slice(grantIdx);
  // Call it as the first statement inside psGrantConsent's body.
  out = out.replace(
    'window.psGrantConsent = function(){',
    'window.psGrantConsent = function(){\n  window.psCaptureAttribution();'
  );
  touched = true;

  // 2. Hero variant: new hidden fields + submit-time read from sessionStorage.
  if (out.includes('id="heroGclid"')) {
    out = out.replace(
      /(<input type="hidden" name="utm_content" id="heroUtmContent" value="">)/,
      `$1\n${HERO_NEW_HIDDEN}`
    );
    if (!HERO_OLD_RE.test(out)) {
      console.log(`WARN (hero pattern not found for replace): ${file}`);
    } else {
      out = out.replace(HERO_OLD_RE, buildReadBlock('hero', 'attr'));
    }
  }

  // 3. Lead-form variant: new hidden fields + submit-time read.
  if (out.includes('id="leadGclid"')) {
    if (out.includes('id="leadUtmContent" value=""/>')) {
      out = out.replace(
        /(<input type="hidden" name="utm_content" id="leadUtmContent" value=""\/>)/,
        `$1\n${LEAD_NEW_HIDDEN_A}`
      );
    } else {
      out = out.replace(
        /(<input type="hidden" name="utm_content" id="leadUtmContent" value="">)/,
        `$1\n${LEAD_NEW_HIDDEN_B}`
      );
    }
    if (!LEAD_OLD_RE.test(out)) {
      console.log(`WARN (lead pattern not found for replace): ${file}`);
    } else {
      out = out.replace(LEAD_OLD_RE, buildReadBlock('lead', 'attr2'));
    }
  }

  if (touched) {
    await writeFile(path, out, 'utf8');
    console.log(`PATCHED: ${file}`);
    totals.ok++;
    changed.push(file);
  }
}

console.log();
console.log(`Patched: ${totals.ok}`);
console.log(`Already patched: ${totals.alreadyHad}`);
console.log(`No psGrantConsent match: ${totals.noMatch}`);
console.log(`Missing: ${totals.missing}`);
console.log(`Total files touched: ${changed.length}`);
