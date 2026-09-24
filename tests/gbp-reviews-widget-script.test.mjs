// Source-level checks for js/gbp-reviews-widget.js. No jsdom in this repo
// (matches existing test style), so XSS-safety and accessibility are
// verified by scanning the actual widget source for the specific patterns
// that make them true, rather than executing it in a simulated DOM.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const src = readFileSync(path.join(root, "js/gbp-reviews-widget.js"), "utf8");

test("widget script: never uses innerHTML with review-derived data (XSS safety via textContent only)", () => {
  // The only innerHTML uses in this file must be `= ''` resets (clearing a
  // mount point before re-rendering), never concatenating API data.
  const innerHtmlAssignments = [...src.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map(m => m[1].trim());
  assert.ok(innerHtmlAssignments.length > 0, "expected at least the mount-clearing resets");
  for (const rhs of innerHtmlAssignments) {
    assert.equal(rhs, "''", `innerHTML assigned something other than an empty-string reset: ${rhs}`);
  }
});

test("widget script: review text/author/reply are set via textContent, not innerHTML/outerHTML", () => {
  // The el() helper is the only place text is inserted into an element, and
  // it always uses textContent internally -- confirm that helper's
  // implementation, then confirm every review-derived value flows through
  // el(...) (or an explicit `.textContent =` assignment) rather than
  // innerHTML/outerHTML string concatenation.
  const elFn = src.slice(src.indexOf("function el("), src.indexOf("function el(") + 200);
  assert.match(elFn, /e\.textContent\s*=\s*text/, "el() helper must assign via textContent");

  assert.match(src, /el\(['"]p['"],\s*['"]gbp-review-text['"],\s*review\.text/, "review.text must be passed through el() -> textContent");
  assert.match(src, /el\(['"]span['"],\s*['"]gbp-review-author['"],\s*review\.displayName/, "review.displayName must be passed through el() -> textContent");
  assert.match(src, /el\(['"]p['"],\s*['"]gbp-owner-reply-text['"],\s*review\.ownerReply/, "review.ownerReply must be passed through el() -> textContent");
  assert.ok(!/\.innerHTML\s*\+?=\s*.*review\./.test(src), "review data must never be concatenated into innerHTML");
});

test("widget script: fetches only this site's own static JSON, never a Google endpoint", () => {
  const fetchCalls = [...src.matchAll(/fetch\(([^,)]+)/g)].map(m => m[1]);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], /DATA_URL/);
  assert.ok(!/fetch\([^)]*google/i.test(src));
});

test("widget script: no tracking/cookie/analytics call added", () => {
  for (const marker of ["document.cookie", "gtag(", "dataLayer", "fbq(", "localStorage.setItem"]) {
    assert.ok(!src.includes(marker), `unexpected tracking/storage marker found: ${marker}`);
  }
});

test("widget script: owner reply uses native <details>/<summary> (keyboard accessible without custom JS)", () => {
  assert.ok(src.includes("createElement('details')"));
  assert.ok(src.includes("createElement('summary')"));
});

test("widget script: renders a synchronous fallback before the fetch resolves (no empty-state layout shift)", () => {
  const mountIdx = src.indexOf("function mountOne");
  const fallbackCallIdx = src.indexOf("renderFallback(mount)", mountIdx);
  const fetchIdx = src.indexOf("fetch(DATA_URL", mountIdx);
  assert.ok(fallbackCallIdx > -1 && fetchIdx > -1 && fallbackCallIdx < fetchIdx,
    "renderFallback must be called before the fetch is issued");
});

test("widget script: fallback path never assumes review content, only rating/count", () => {
  const fallbackFn = src.slice(src.indexOf("function renderFallback"), src.indexOf("function renderReview"));
  assert.ok(!fallbackFn.includes("gbp-review-list"), "fallback must not fabricate a review list");
});

test("widget script: German UI strings are present", () => {
  assert.ok(src.includes("Google-Bewertungen"));
  assert.ok(src.includes("Alle Google-Bewertungen ansehen"));
  assert.ok(src.includes("Antwort des Inhabers anzeigen"));
});

test("widget script: mounts only once per element even if init runs twice", () => {
  assert.ok(src.includes("data-gbp-mounted"));
});
