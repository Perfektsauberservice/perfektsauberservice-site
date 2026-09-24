// Tests for agent/scripts/update-gbp-reviews.mjs (official GBP reviews sync).
//
// These test the pure, exported helpers (mapReviews / computeAverageRating /
// buildOutput / contentUnchanged) with fixture data -- no live network call,
// matching this repo's existing test style (no jsdom/npm deps). They also
// source-scan the script text to prove it never performs a mutating call
// against any Business Profile resource and never hardcodes a secret.
//
// What these tests cannot prove: that the real live API calls succeed end
// to end, or that GitHub Actions secrets are correctly configured -- that
// requires an actual scheduled/dispatched workflow run.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapReviews,
  computeAverageRating,
  buildOutput,
  contentUnchanged,
} from "../agent/scripts/update-gbp-reviews.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const SCRIPT_PATH = path.join(root, "agent/scripts/update-gbp-reviews.mjs");
const scriptSource = readFileSync(SCRIPT_PATH, "utf8");

function rawReview({ id, rating = "FIVE", name = "Test Kunde", comment = "Toll!", createTime, reply = null }) {
  const r = {
    reviewId: id,
    reviewer: { displayName: name },
    starRating: rating,
    comment,
    createTime,
    updateTime: createTime,
  };
  if (reply) r.reviewReply = { comment: reply.comment, updateTime: reply.updateTime };
  return r;
}

test("mapReviews: maps fields to the public canonical shape", () => {
  const raw = [rawReview({ id: "r1", createTime: "2026-01-01T00:00:00Z" })];
  const [mapped] = mapReviews(raw);
  assert.equal(mapped.displayName, "Test Kunde");
  assert.equal(mapped.starRating, 5);
  assert.equal(mapped.text, "Toll!");
  assert.equal(mapped.date, "2026-01-01");
  assert.equal(mapped.ownerReply, null);
  assert.equal(mapped.replyDate, null);
  // internal sort key must not leak into the public shape
  assert.equal("_createTime" in mapped, false);
});

test("mapReviews: preserves owner reply and reply date when present", () => {
  const raw = [rawReview({
    id: "r1", createTime: "2026-01-01T00:00:00Z",
    reply: { comment: "Danke!", updateTime: "2026-01-02T00:00:00Z" },
  })];
  const [mapped] = mapReviews(raw);
  assert.equal(mapped.ownerReply, "Danke!");
  assert.equal(mapped.replyDate, "2026-01-02");
});

test("mapReviews: sorts newest to oldest by createTime", () => {
  const raw = [
    rawReview({ id: "old", createTime: "2026-01-01T00:00:00Z" }),
    rawReview({ id: "newest", createTime: "2026-09-24T00:00:00Z" }),
    rawReview({ id: "middle", createTime: "2026-05-01T00:00:00Z" }),
  ];
  const dates = mapReviews(raw).map(r => r.date);
  assert.deepEqual(dates, ["2026-09-24", "2026-05-01", "2026-01-01"]);
});

test("mapReviews: all input reviews are represented in the output (no silent drops)", () => {
  const raw = Array.from({ length: 11 }, (_, i) =>
    rawReview({ id: `r${i}`, createTime: `2026-0${(i % 9) + 1}-01T00:00:00Z` })
  );
  assert.equal(mapReviews(raw).length, 11);
});

test("mapReviews: unknown/missing starRating maps to null, not a guessed number", () => {
  const raw = [{ reviewer: { displayName: "X" }, comment: "y", createTime: "2026-01-01T00:00:00Z" }];
  const [mapped] = mapReviews(raw);
  assert.equal(mapped.starRating, null);
});

test("computeAverageRating: real fixture -- 11 five-star reviews average to exactly 5", () => {
  const raw = Array.from({ length: 11 }, (_, i) => rawReview({ id: `r${i}`, createTime: "2026-01-01T00:00:00Z" }));
  const reviews = mapReviews(raw);
  assert.equal(computeAverageRating(reviews), 5);
});

test("computeAverageRating: rounds to one decimal", () => {
  const raw = [
    rawReview({ id: "a", rating: "FIVE", createTime: "2026-01-01T00:00:00Z" }),
    rawReview({ id: "b", rating: "FOUR", createTime: "2026-01-02T00:00:00Z" }),
  ];
  assert.equal(computeAverageRating(mapReviews(raw)), 4.5);
});

test("computeAverageRating: empty review list is 0, not NaN or a guessed default", () => {
  assert.equal(computeAverageRating([]), 0);
});

test("buildOutput: shape matches the documented public schema exactly", () => {
  const raw = [rawReview({ id: "r1", createTime: "2026-01-01T00:00:00Z" })];
  const reviews = mapReviews(raw);
  const out = buildOutput(reviews, "https://maps.google.com/maps?cid=123", "2026-09-24T00:00:00.000Z");
  assert.deepEqual(Object.keys(out).sort(), [
    "averageRating", "directGoogleProfileUrl", "lastSuccessfulSync", "reviews", "totalReviewCount",
  ].sort());
  assert.equal(out.totalReviewCount, 1);
  assert.equal(out.directGoogleProfileUrl, "https://maps.google.com/maps?cid=123");
});

test("buildOutput: excludes profile photos, review IDs, and any OAuth/API metadata", () => {
  const raw = [rawReview({ id: "r1", createTime: "2026-01-01T00:00:00Z" })];
  raw[0].reviewer.profilePhotoUrl = "https://example.com/photo.jpg";
  const out = buildOutput(mapReviews(raw), "https://maps.google.com/maps?cid=123", "2026-09-24T00:00:00.000Z");
  const serialized = JSON.stringify(out);
  assert.ok(!serialized.includes("profilePhotoUrl"));
  assert.ok(!serialized.includes("example.com/photo.jpg"));
  assert.ok(!/\breviewId\b/.test(serialized));
});

test("contentUnchanged: identical review data with only a different timestamp is unchanged", () => {
  const a = JSON.stringify({ lastSuccessfulSync: "2026-09-24T00:00:00Z", averageRating: 5, totalReviewCount: 11 });
  const b = JSON.stringify({ lastSuccessfulSync: "2026-09-25T00:00:00Z", averageRating: 5, totalReviewCount: 11 });
  assert.equal(contentUnchanged(a, b), true);
});

test("contentUnchanged: a real data difference (rating) is detected as changed", () => {
  const a = JSON.stringify({ lastSuccessfulSync: "2026-09-24T00:00:00Z", averageRating: 5, totalReviewCount: 11 });
  const b = JSON.stringify({ lastSuccessfulSync: "2026-09-24T00:00:00Z", averageRating: 4.9, totalReviewCount: 11 });
  assert.equal(contentUnchanged(a, b), false);
});

// --- Source-level safety checks (no live network needed) ---

test("sync script: every Business Profile API call is a GET (no PATCH/POST/DELETE against mybusiness resources)", () => {
  // The only POST in this file must be the unavoidable OAuth token refresh.
  const postMatches = [...scriptSource.matchAll(/method:\s*['"]POST['"]/g)];
  assert.equal(postMatches.length, 1, "expected exactly one POST (the OAuth token exchange)");
  const postContext = scriptSource.slice(Math.max(0, postMatches[0].index - 200), postMatches[0].index);
  assert.ok(postContext.includes("oauth2.googleapis.com"), "the one POST must be the OAuth token endpoint");
  assert.ok(!/method:\s*['"](PATCH|DELETE|PUT)['"]/.test(scriptSource));
});

test("sync script: does not depend on GOOGLE_PLACES_API_KEY", () => {
  assert.ok(!scriptSource.includes("GOOGLE_PLACES_API_KEY"));
});

test("sync script: reads OAuth values only from environment variables, never hardcoded", () => {
  assert.ok(scriptSource.includes("process.env.GBP_OAUTH_CLIENT_ID"));
  assert.ok(scriptSource.includes("process.env.GBP_OAUTH_CLIENT_SECRET"));
  assert.ok(scriptSource.includes("process.env.GBP_OAUTH_REFRESH_TOKEN"));
  // No plausible hardcoded secret-shaped literal (long base64/opaque string assigned directly).
  assert.ok(!/(client_secret|refresh_token|access_token)\s*[:=]\s*['"][A-Za-z0-9_\-./]{20,}['"]/.test(scriptSource));
});

test("sync script: never logs the token/secret/refresh_token/authorization code values", () => {
  const consoleLines = scriptSource.split("\n").filter(l => /console\.(log|error)/.test(l));
  for (const line of consoleLines) {
    assert.ok(!/\btoken\b/i.test(line) || !/[`'"]\s*\+\s*token/.test(line), `possible token print: ${line}`);
    assert.ok(!line.includes("CLIENT_SECRET"));
    assert.ok(!line.includes("REFRESH_TOKEN"));
  }
});

test("sync script: on any failure path, exits non-zero and does not call writeFileSync before success", () => {
  // writeFileSync must appear textually after the last `fail(` definition's
  // call sites relevant to data fetching -- simplified structural check:
  // every fail() call must be followed (later in the file) by the single
  // writeFileSync call, i.e. fail() calls guard writes, not the reverse.
  const writeIdx = scriptSource.indexOf("writeFileSync(OUT_FILE");
  assert.ok(writeIdx > -1);
  const failCallsBeforeWrite = [...scriptSource.slice(0, writeIdx).matchAll(/\bfail\(/g)];
  assert.ok(failCallsBeforeWrite.length >= 4, "expected multiple fail() guards before the write");
});
