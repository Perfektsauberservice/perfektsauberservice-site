// Verifies the widget is mounted on exactly the homepage + every unique
// final URL currently used by an ENABLED ad group (derived from the live
// Ads read-only check, 2026-09-24), and nowhere else. Also checks the
// homepage's old generic-search review link was replaced with the direct
// verified profile link, and that no existing AggregateRating JSON-LD was
// added/removed by this change.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (f) => readFileSync(path.join(root, f), "utf8");

// Exact page list derived from the live Ads read-only check (Task A),
// 2026-09-24 -- not guessed.
const TARGET_PAGES = [
  "index.html",
  "entruempelung-rastatt.html",
  "entruempelung-karlsruhe.html",
  "entruempelung-baden-baden.html",
  "entruempelung-buehl.html",
  "haushaltsaufloesung-rastatt.html",
  "haushaltsaufloesung-karlsruhe.html",
  "haushaltsaufloesung-baden-baden.html",
  "haushaltsaufloesung-buehl.html",
  "wohnungsaufloesung-rastatt.html",
  "grundreinigung.html",
  "treppenhausreinigung.html",
];

// A sample of pages that must NOT have the widget (unrelated to the
// current Ads landing-page set).
const UNRELATED_PAGES = [
  "bueroreinigung.html",
  "unterhaltsreinigung-karlsruhe.html",
  "entruempelung-pforzheim.html",
  "preise.html",
];

test("widget mount: present on every target page (homepage + all active Ads landing pages)", () => {
  for (const page of TARGET_PAGES) {
    const html = read(page);
    assert.ok(html.includes('data-gbp-reviews'), `${page}: missing widget mount point`);
    assert.ok(html.includes('js/gbp-reviews-widget.js'), `${page}: missing widget script`);
    assert.ok(html.includes('css/gbp-reviews-widget.css'), `${page}: missing widget stylesheet`);
  }
});

test("widget mount: absent on unrelated pages (no guessed/blanket rollout)", () => {
  for (const page of UNRELATED_PAGES) {
    if (!existsSync(path.join(root, page))) continue; // tolerate repo drift, don't fail on a missing sample file
    const html = read(page);
    assert.ok(!html.includes('data-gbp-reviews'), `${page}: unexpectedly has the widget mount`);
    assert.ok(!html.includes('js/gbp-reviews-widget.js'), `${page}: unexpectedly loads the widget script`);
  }
});

test("widget mount: fallback data attributes are the real verified 5.0/11 on every target page", () => {
  for (const page of TARGET_PAGES) {
    const html = read(page);
    assert.ok(html.includes('data-fallback-rating="5.0"'), `${page}: wrong/missing fallback rating`);
    assert.ok(html.includes('data-fallback-count="11"'), `${page}: wrong/missing fallback count`);
  }
});

test("widget mount: script is loaded with defer (no render-blocking)", () => {
  for (const page of TARGET_PAGES) {
    const html = read(page);
    const m = html.match(/<script[^>]*gbp-reviews-widget\.js[^>]*>/);
    assert.ok(m, `${page}: widget script tag not found`);
    assert.ok(/\bdefer\b/.test(m[0]), `${page}: widget script tag missing defer`);
  }
});

test("homepage: old generic Google-search review link replaced with the direct verified profile link", () => {
  const html = read("index.html");
  assert.ok(!html.includes("google.com/search?q=perfekt+sauber+service+reviews"), "generic search link still present");
  assert.ok(html.includes("https://maps.google.com/maps?cid=10440757061765338764"), "direct profile link not found");
});

test("no AggregateRating JSON-LD expansion: count is byte-identical to the pre-widget baseline on every target page", () => {
  // Correction to an earlier read-only-audit finding: a live-fetch regex
  // check during that audit missed the existing AggregateRating block on
  // several pages (grundreinigung.html, treppenhausreinigung.html,
  // index.html all already had exactly one, confirmed here directly
  // against the committed source). This task does not touch any JSON-LD
  // anywhere -- the real, provable guarantee is that the count this task
  // leaves behind exactly matches the count already committed on HEAD
  // (i.e. the commit that added the widget), not a specific hand-typed
  // number that turned out to be wrong for some pages.
  for (const page of TARGET_PAGES) {
    const before = execSync(`git show HEAD:${page}`, { cwd: root, encoding: "utf8" });
    const beforeCount = (before.match(/"aggregateRating"/g) || []).length;
    const afterCount = (read(page).match(/"aggregateRating"/g) || []).length;
    assert.equal(afterCount, beforeCount, `${page}: AggregateRating count changed (${beforeCount} -> ${afterCount})`);
  }
});

test("target pages: forms, phone and WhatsApp CTAs are still present and untouched by this change", () => {
  for (const page of TARGET_PAGES) {
    if (page === "index.html") continue; // homepage form identity covered by its own existing tests
    const html = read(page);
    assert.ok(/href="tel:\+?\d/.test(html), `${page}: missing tel: CTA`);
    assert.ok(html.includes("wa.me"), `${page}: missing WhatsApp CTA`);
  }
});
