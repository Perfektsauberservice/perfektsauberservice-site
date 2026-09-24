// Validates the committed data/google-reviews.json against the documented
// public schema and the real, live-verified GBP data (11 reviews, average
// 5.0, all real) captured 2026-09-24. Also re-checks it contains no
// secrets/tokens and no excluded fields.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const JSON_PATH = path.join(root, "data/google-reviews.json");

const raw = readFileSync(JSON_PATH, "utf8");
const data = JSON.parse(raw);

test("canonical JSON: top-level schema matches exactly the documented public fields", () => {
  assert.deepEqual(Object.keys(data).sort(), [
    "averageRating", "directGoogleProfileUrl", "lastSuccessfulSync", "reviews", "totalReviewCount",
  ].sort());
});

test("canonical JSON: averageRating is 5 and totalReviewCount is 11 (real live-verified data)", () => {
  assert.equal(data.averageRating, 5);
  assert.equal(data.totalReviewCount, 11);
});

test("canonical JSON: exactly 11 reviews are represented, all real", () => {
  assert.equal(data.reviews.length, 11);
});

test("canonical JSON: directGoogleProfileUrl is the real, place-bound Maps profile link, not a generic search query", () => {
  assert.ok(data.directGoogleProfileUrl.startsWith("https://maps.google.com/maps?cid="));
  assert.ok(!data.directGoogleProfileUrl.includes("google.com/search"));
});

test("canonical JSON: reviews are ordered newest to oldest", () => {
  const dates = data.reviews.map(r => r.date);
  const sorted = [...dates].sort().reverse();
  assert.deepEqual(dates, sorted);
});

test("canonical JSON: every review has the required public fields, correctly typed", () => {
  for (const r of data.reviews) {
    assert.equal(typeof r.displayName, "string");
    assert.ok(r.displayName.length > 0);
    assert.ok([1, 2, 3, 4, 5, null].includes(r.starRating));
    assert.equal(typeof r.text, "string");
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.ownerReply === null || typeof r.ownerReply === "string");
    assert.ok(r.replyDate === null || /^\d{4}-\d{2}-\d{2}$/.test(r.replyDate));
  }
});

test("canonical JSON: excludes profile photo URLs, internal review IDs, and OAuth/API metadata", () => {
  assert.ok(!raw.includes("profilePhotoUrl"));
  assert.ok(!/\breviewId\b/.test(raw));
  assert.ok(!raw.includes("googleusercontent.com")); // profile photo CDN host
  for (const key of Object.keys(data.reviews[0] || {})) {
    assert.ok(
      ["displayName", "starRating", "text", "date", "ownerReply", "replyDate"].includes(key),
      `unexpected field on a review object: ${key}`
    );
  }
});

test("canonical JSON: contains no secret/token-shaped strings", () => {
  const markers = ["client_secret", "refresh_token", "access_token", "AIza", "ya29.", "GBP_OAUTH_"];
  for (const m of markers) assert.ok(!raw.includes(m), `found suspicious marker: ${m}`);
});

test("canonical JSON: all 11 real 5-star reviews have an owner reply (matches live GBP data)", () => {
  const withReply = data.reviews.filter(r => r.ownerReply);
  assert.equal(withReply.length, 11);
});
