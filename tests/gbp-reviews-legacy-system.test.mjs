// Verifies the legacy Places-API review system is cleanly marked
// superseded (not deleted, not silently left ambiguous), exactly one
// review-sync workflow has an active schedule trigger, the dead Telegram
// monitor script was not activated, and the existing review-requester
// tool was left unchanged.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (f) => readFileSync(path.join(root, f), "utf8");

test("legacy: update-review-count.mjs is marked SUPERSEDED, not deleted", () => {
  assert.ok(existsSync(path.join(root, "agent/scripts/update-review-count.mjs")), "legacy script must not be deleted");
  const src = read("agent/scripts/update-review-count.mjs");
  assert.ok(/SUPERSEDED/.test(src));
  assert.ok(src.includes("update-gbp-reviews.mjs"));
});

test("legacy: pss-gmb-reviews-update.yml is marked SUPERSEDED, not deleted, and still has no active schedule", () => {
  assert.ok(existsSync(path.join(root, ".github/workflows/pss-gmb-reviews-update.yml")));
  const src = read(".github/workflows/pss-gmb-reviews-update.yml");
  assert.ok(/SUPERSEDED/.test(src));
  // The cron line itself must remain commented out.
  assert.ok(/#\s*schedule:/.test(src), "legacy schedule trigger must remain commented out");
  assert.ok(!/^\s*schedule:/m.test(src.replace(/#.*$/gm, "")), "no active (uncommented) schedule: key");
});

test("exactly one review-sync workflow has an active (uncommented) schedule trigger", () => {
  const legacy = read(".github/workflows/pss-gmb-reviews-update.yml");
  const next = read(".github/workflows/pss-gbp-reviews-sync.yml");
  const hasActiveSchedule = (src) => {
    const withoutComments = src.replace(/#.*$/gm, "");
    return /^\s*schedule:/m.test(withoutComments) && /cron:/.test(withoutComments);
  };
  assert.equal(hasActiveSchedule(legacy), false, "legacy workflow must not have an active schedule");
  assert.equal(hasActiveSchedule(next), true, "new workflow must have an active schedule");
});

test("new workflow uses only the new OAuth secrets, never GOOGLE_PLACES_API_KEY", () => {
  const src = read(".github/workflows/pss-gbp-reviews-sync.yml");
  assert.ok(src.includes("GBP_OAUTH_CLIENT_ID"));
  assert.ok(src.includes("GBP_OAUTH_CLIENT_SECRET"));
  assert.ok(src.includes("GBP_OAUTH_REFRESH_TOKEN"));
  assert.ok(!src.includes("GOOGLE_PLACES_API_KEY"));
});

test("new workflow commits only when the sync script actually changed the file (no unconditional commit)", () => {
  const src = read(".github/workflows/pss-gbp-reviews-sync.yml");
  assert.ok(/git diff --staged --quiet/.test(src), "must check for staged changes before committing/pushing");
});

test("dead Telegram review-monitor script exists but was not wired into any workflow", () => {
  assert.ok(existsSync(path.join(root, "agent/scripts/check-new-reviews.mjs")), "must not be deleted");
  const workflowFiles = [
    ".github/workflows/pss-gbp-reviews-sync.yml",
    ".github/workflows/pss-gmb-reviews-update.yml",
  ];
  for (const wf of workflowFiles) {
    assert.ok(!read(wf).includes("check-new-reviews.mjs"), `${wf} must not invoke the dead monitor script`);
  }
});

test("existing review-requester tool is unchanged (file present, not modified by this task)", () => {
  assert.ok(existsSync(path.join(root, "agent/scripts/review-requester.mjs")));
  assert.ok(existsSync(path.join(root, "dashboard/review-requester.html")));
  const src = read("agent/scripts/review-requester.mjs");
  // Unchanged means it still uses its own original generic short-link, not
  // rewired to the new canonical JSON or the new OAuth secrets.
  assert.ok(src.includes("g.page/r/perfektsauberservice/review"));
  assert.ok(!src.includes("GBP_OAUTH_"));
});
