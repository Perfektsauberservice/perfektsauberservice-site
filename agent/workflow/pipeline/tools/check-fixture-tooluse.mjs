#!/usr/bin/env node
// Partner pipeline — fixture-only-test-mode ZERO TOOL USE gate (Phase 1 authoring).
//
// Deterministic, offline. No network, no secrets.
//
// F-2 fix: in fixture-only-test mode the five read-only agents must make ZERO
// tool calls of any kind — not just zero writes. Everything they need (facts,
// schema/contract) is inline in the prompt. A sandbox path in the input is for
// the Coordinator's audit trail only, never an invitation for the agent to read
// it.
//
// Run (static contract check):
//   node agent/workflow/pipeline/tools/check-fixture-tooluse.mjs
// Scan a real run's per-stage tool-event logs (fixture-only-test category):
//   node agent/workflow/pipeline/tools/check-fixture-tooluse.mjs --events-dir=<run-dir>
//     expects <run-dir>/<stage>-events.json — a JSON array of tool-call records —
//     for each read-only stage. tool_uses must be exactly 0; ANY entry at all is
//     a FAIL, and the pipeline is BLOCKED. A missing or 0-byte events file is
//     BLOCKED, not PASS (see check-agent-writes.mjs for the same distinction).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");

const READ_ONLY = ["competitor-intelligence", "investigator", "analyst", "verifier", "qa"];

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => console.log(`\n== ${m} ==`);

// ---------------------------------------------------------------------------
// 1. static: each read-only agent's body carries the zero-tool-use section
// ---------------------------------------------------------------------------
section("1. fixture-only-test zero-tool-use section present in each read-only agent");
for (const role of READ_ONLY) {
  const p = join(AGENTS_DIR, `${role}.md`);
  if (!existsSync(p)) { fail(`${role}.md missing`); continue; }
  const md = readFileSync(p, "utf8");
  const hasHeading = /##\s*Fixture-only test mode\s*—\s*zero tool use/i.test(md);
  const namesMode = /mode:\s*"fixture-only-test"/i.test(md);
  const forbidsTools = /do \*\*not\*\* call `Read`.*`Grep`.*`Glob`.*`Bash`.*`WebFetch`.*`WebSearch`/is.test(md) ||
    (/`Read`/.test(md) && /`Grep`/.test(md) && /`Glob`/.test(md) && /`Bash`/.test(md) && /`WebFetch`/.test(md) && /`WebSearch`/.test(md) && /Fixture-only test mode/i.test(md));
  const auditOnly = /Coordinator's audit trail only/i.test(md);
  const toolUsesZero = /`tool_uses`/i.test(md) && /exactly `0`/i.test(md);
  const notNarrowed = /never narrows your authorised.*read-only access/i.test(md);
  const complete = hasHeading && namesMode && forbidsTools && auditOnly && toolUsesZero;
  if (complete) pass(`${role}: zero-tool-use section complete`);
  else fail(`${role}: zero-tool-use section incomplete (heading=${hasHeading} namesMode=${namesMode} forbidsTools=${forbidsTools} auditOnly=${auditOnly} toolUsesZero=${toolUsesZero} notNarrowed=${notNarrowed})`);
}

// ---------------------------------------------------------------------------
// 2. behavioral: scan a real run's per-stage event logs for tool_uses == 0
// ---------------------------------------------------------------------------
const evDirArg = process.argv.slice(2).find((a) => a.startsWith("--events-dir="));
let blocked = 0;
if (evDirArg) {
  section("2. per-stage tool_uses == 0 scan (fixture-only-test category)");
  const dir = evDirArg.slice("--events-dir=".length);
  for (const role of READ_ONLY) {
    const p = join(dir, `${role}-events.json`);
    if (!existsSync(p)) {
      console.log(`  BLOCKED  ${role}: no ${role}-events.json captured — cannot confirm tool_uses==0 from a real transcript; category is BLOCKED, not PASS`);
      blocked++;
      continue;
    }
    const raw = readFileSync(p, "utf8");
    if (raw.trim().length === 0) {
      console.log(`  BLOCKED  ${role}: ${role}-events.json is 0 bytes — harness failed to capture the transcript; category is BLOCKED, not PASS`);
      blocked++;
      continue;
    }
    let events;
    try { events = JSON.parse(raw); }
    catch (e) { fail(`${role}: events log unparseable: ${e.message}`); continue; }
    if (!Array.isArray(events)) { fail(`${role}: events log is not an array`); continue; }
    if (events.length !== 0) {
      fail(`${role}: tool_uses == ${events.length}, expected 0 in fixture-only-test mode -> FAIL, pipeline BLOCKED, artifact not forwarded`);
    } else {
      pass(`${role}: tool_uses == 0`);
    }
  }
}

console.log(`\n${"=".repeat(60)}`);
if (blocked > 0) { console.log(`RESULT: BLOCKED — ${blocked} stage(s) had no usable captured transcript (harness limitation, not a pass)`); process.exit(2); }
if (failures === 0) { console.log("RESULT: PASS — fixture-only-test zero-tool-use gate holds"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
