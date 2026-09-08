// Structural / regression tests for entsorgungskosten-rechner.html.
// Cannot run a real browser here, so this checks the shipped markup and
// wiring by string/static inspection: SEO placement (unlisted, per the
// approved internal-tool spec), accessibility markers, mobile behavior
// (camera capture, reduced-motion), and that nothing here touches the
// site's existing GA4/gclid/UTM/conversion tracking.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pageHtml = readFileSync(path.join(root, "entsorgungskosten-rechner.html"), "utf8");

let passCount = 0;
let failCount = 0;
const failures = [];

function check(label, fn) {
  try {
    fn();
    passCount++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failCount++;
    failures.push({ label, error: err.message });
    console.log(`FAIL  ${label}\n      ${err.message}`);
  }
}

// --- SEO placement: unlisted internal tool ---

check("page has noindex,nofollow meta (SEO_PLACEMENT: unlisted)", () => {
  assert.match(pageHtml, /<meta name="robots" content="noindex, nofollow" \/>/);
});

check("page is NOT listed in sitemap.xml", () => {
  const sitemap = readFileSync(path.join(root, "sitemap.xml"), "utf8");
  assert.ok(!sitemap.includes("entsorgungskosten-rechner"), "sitemap.xml must not reference the internal tool");
});

check("no public page links to entsorgungskosten-rechner.html (no nav entry)", () => {
  const candidates = ["index.html", "leistungen.html", "preise.html", "preisrechner.html", "kontakt.html"];
  for (const file of candidates) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    const html = readFileSync(full, "utf8");
    assert.ok(!html.includes("entsorgungskosten-rechner"), `${file} must not link to the internal tool`);
  }
});

// --- accessibility ---

check("has a skip-link to main content", () => {
  assert.match(pageHtml, /class="skip-link" href="#main-content"/);
});

check("main content landmark exists and matches skip-link target", () => {
  assert.match(pageHtml, /<main id="main-content">/);
});

check("focus-visible outline style defined for keyboard users", () => {
  assert.match(pageHtml, /:focus-visible\{outline:2px solid var\(--blue\)/);
});

check("loading state uses role=status + aria-live=polite (accessible result messaging)", () => {
  assert.match(pageHtml, /role="status" aria-live="polite"/);
});

check("reduced-motion is respected for the spinner", () => {
  assert.match(pageHtml, /@media \(prefers-reduced-motion: reduce\)/);
});

check("category selects and quantity inputs carry aria-label (not color-only meaning)", () => {
  assert.match(pageHtml, /setAttribute\("aria-label"/);
});

check("progressbar step indicator has ARIA role", () => {
  assert.match(pageHtml, /role="progressbar"/);
});

// --- mobile / UX ---

check("photo input requests the rear camera on mobile (capture=environment)", () => {
  assert.match(pageHtml, /capture="environment"/);
});

check("no horizontal-overflow risk: html/body overflow-x hidden set", () => {
  assert.match(pageHtml, /html,body\{overflow-x:hidden;\}/);
});

check("max content width is constrained for a simple, non-gigantic mobile form", () => {
  assert.match(pageHtml, /main\{max-width:640px;/);
});

// --- tracking safety: this internal tool must not touch existing tracking ---

check("page does not call gtag(...) anywhere (no GA4/Ads conversion regression risk)", () => {
  assert.ok(!/gtag\(/.test(pageHtml), "must not call gtag()");
});

check("page does not reference gclid/UTM persistence", () => {
  assert.ok(!/gclid/i.test(pageHtml) && !/utm_/i.test(pageHtml), "must not touch gclid/UTM logic");
});

check("page does not fire an existing form_submit event", () => {
  assert.ok(!pageHtml.includes("'form_submit'") && !pageHtml.includes('"form_submit"'), "must not reuse the existing form_submit conversion event");
});

// --- business safety ---

check("disclaimer states this is not a customer offer/price", () => {
  assert.match(pageHtml, /Kein Angebot und kein Preis für den Kunden/);
});

check("uses pinned jsPDF version from an allowed CDN (unpkg, per CSP script-src)", () => {
  assert.match(pageHtml, /https:\/\/unpkg\.com\/jspdf@2\.5\.2\//);
});

// --- fee-source transparency: an unofficial rate (Matratzen) must never be
// indistinguishable from an official Landkreis Rastatt one, in the picker,
// on the line item, on the total breakdown, or in the PDF. ---

check("category picker marks non-official categories in their option label", () => {
  assert.match(pageHtml, /c\.official === false \? `\$\{c\.label\} — inoffizieller Tarif` : c\.label/);
});

check("line item shows an explicit non-official-source warning", () => {
  assert.match(pageHtml, /Kein offizieller Landkreis-Tarif/);
});

check("total breakdown flags non-official lines with a footnote", () => {
  assert.match(pageHtml, /kein offizieller Landkreis-Tarif, manuell angegebener Wert/);
});

check("PDF export also flags non-official lines (not just the on-screen UI)", () => {
  assert.match(pageHtml, /hasUnofficial = true/);
  assert.match(pageHtml, /kein offizieller Landkreis-Tarif, manuell angegebener Wert\.", 14, y\);/);
});

// --- AI failure handling: a 200 response shaped wrong must surface as an
// error, never be silently treated as "AI found nothing" ---

check("client rejects a 200 response whose body isn't {items:[...]} instead of silently defaulting to empty", () => {
  assert.match(pageHtml, /if \(!Array\.isArray\(data\.items\)\)/);
  assert.match(pageHtml, /unerwartetes Format/);
});

check("renderLineItems() never unconditionally re-hides the error banner (regression: `|| true` bug made AI-failure errors invisible)", () => {
  assert.ok(!pageHtml.includes('"resultError").hidden = state.lines.length > 0 || true'), "the always-true hide bug must not come back");
});

// --- backend wiring ---

check("netlify.toml redirects /api/entsorgungskosten-analyze to the function", () => {
  const toml = readFileSync(path.join(root, "netlify.toml"), "utf8");
  assert.match(toml, /from = "\/api\/entsorgungskosten-analyze"/);
  assert.match(toml, /to = "\/\.netlify\/functions\/entsorgungskosten-analyze"/);
});

check("Netlify function file exists", () => {
  assert.ok(existsSync(path.join(root, "netlify/functions/entsorgungskosten-analyze.mjs")));
});

check("fee table JSON is valid and reachable from data/", () => {
  const json = JSON.parse(readFileSync(path.join(root, "data/entsorgungsgebuehren-2026.json"), "utf8"));
  assert.ok(Array.isArray(json.categories) && json.categories.length > 0);
});

console.log(`\n${passCount}/${passCount + failCount} passed`);
if (failCount > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
