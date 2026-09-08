// Tests for netlify/functions/entsorgungskosten-analyze.mjs input validation
// and prompt construction ONLY. Per business-safety constraints for this
// build (isolated worktree, no external paid API calls), these tests never
// hit api.anthropic.com — they only exercise the deterministic guard rails
// (method check, image count/shape validation, missing API key) that run
// BEFORE any network call, plus the prompt builder's category allow-list.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { handler, buildSystemPrompt } from "../netlify/functions/entsorgungskosten-analyze.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const feeTable = JSON.parse(readFileSync(path.join(root, "data/entsorgungsgebuehren-2026.json"), "utf8"));

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

async function checkAsync(label, fn) {
  try {
    await fn();
    passCount++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failCount++;
    failures.push({ label, error: err.message });
    console.log(`FAIL  ${label}\n      ${err.message}`);
  }
}

check("buildSystemPrompt lists every allowed categoryId (no invented categories)", () => {
  const prompt = buildSystemPrompt(feeTable);
  for (const cat of feeTable.categories) {
    assert.ok(prompt.includes(cat.id), `prompt should mention category id "${cat.id}"`);
  }
});

check("buildSystemPrompt explicitly forbids the AI from computing price", () => {
  const prompt = buildSystemPrompt(feeTable);
  assert.ok(/nu calcula.*pre/i.test(prompt), "prompt must instruct the model not to calculate price");
});

await checkAsync("non-POST method is rejected (405) before any network call", async () => {
  const res = await handler({ httpMethod: "GET" });
  assert.equal(res.statusCode, 405);
});

await checkAsync("missing ANTHROPIC_API_KEY is rejected (500) before any network call", async () => {
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ images: [{ mediaType: "image/jpeg", data: "abc" }] }),
    });
    assert.equal(res.statusCode, 500);
  } finally {
    if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
  }
});

await checkAsync("invalid JSON body is rejected (400)", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key-not-used-network-blocked-by-earlier-guard";
  const res = await handler({ httpMethod: "POST", body: "{not json" });
  assert.equal(res.statusCode, 400);
});

await checkAsync("empty images array is rejected (400) (minimum input, invalid)", async () => {
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ images: [] }) });
  assert.equal(res.statusCode, 400);
});

await checkAsync("more than MAX_IMAGES is rejected (400) (large/invalid input)", async () => {
  const images = Array.from({ length: 6 }, () => ({ mediaType: "image/jpeg", data: "abc" }));
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ images }) });
  assert.equal(res.statusCode, 400);
});

await checkAsync("unsupported media type is rejected (400) (invalid input)", async () => {
  const res = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ images: [{ mediaType: "image/gif", data: "abc" }] }),
  });
  assert.equal(res.statusCode, 400);
});

await checkAsync("missing base64 data is rejected (400) (invalid input)", async () => {
  const res = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ images: [{ mediaType: "image/jpeg" }] }),
  });
  assert.equal(res.statusCode, 400);
});

delete process.env.ANTHROPIC_API_KEY;

console.log(`\n${passCount}/${passCount + failCount} passed`);
if (failCount > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
