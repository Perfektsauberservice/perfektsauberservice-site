import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { applyCount } from "../agent/scripts/sync-review-count.mjs";

test("review-count sync: rewrites each known pattern, only the number", () => {
  const html = [
    '<span><b>5,0</b> Google · 11 Rezensionen</span>',
    "<h3>5,0 ★ Google-Bewertung (11 Rezensionen)</h3>",
    '"aggregateRating":{"@type":"AggregateRating","ratingValue":"5.0","reviewCount":"11"}',
    '"reviewCount": 11,',
    '<div data-fallback-rating="5.0" data-fallback-count="11"></div>',
  ].join("\n");
  const out = applyCount(html, 12);
  assert.ok(out.includes("Google · 12 Rezensionen"));
  assert.ok(out.includes("Google-Bewertung (12 Rezensionen)"));
  assert.ok(out.includes('"reviewCount":"12"'));
  assert.ok(out.includes('"reviewCount": 12,'));
  assert.ok(out.includes('data-fallback-count="12"'));
  assert.ok(out.includes('"ratingValue":"5.0"') && out.includes("<b>5,0</b>"), "rating untouched");
  assert.ok(!/\b11\b/.test(out));
});

test("review-count sync: leaves unrelated numbers alone and is idempotent", () => {
  const html = "<p>Seit 11 Jahren · 11 Zimmer</p> Google · 12 Rezensionen";
  assert.equal(applyCount(html, 12), html);
  assert.equal(applyCount(applyCount(html, 13), 13), applyCount(html, 13));
});

test("review-count sync: site pages match the canonical JSON count", () => {
  const { totalReviewCount } = JSON.parse(readFileSync(new URL("../data/google-reviews.json", import.meta.url), "utf8"));
  const root = new URL("../", import.meta.url);
  const stale = [];
  for (const f of readdirSync(root).filter(n => n.endsWith(".html"))) {
    const html = readFileSync(new URL(f, root), "utf8");
    if (applyCount(html, totalReviewCount) !== html) stale.push(f);
  }
  assert.deepEqual(stale, [], `pages with a stale review count: ${stale.slice(0, 5).join(", ")}`);
});

test("review-count sync: wired into the daily GBP reviews workflow and commits HTML", () => {
  const wf = readFileSync(new URL("../.github/workflows/pss-gbp-reviews-sync.yml", import.meta.url), "utf8");
  assert.match(wf, /node agent\/scripts\/sync-review-count\.mjs/);
  assert.match(wf, /git add .*\*\.html/);
});
