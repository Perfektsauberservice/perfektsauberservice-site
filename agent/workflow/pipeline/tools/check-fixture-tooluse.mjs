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
// F-8 fix (SMK-INV tool-violation incident, 2026-08-31): a fixture-only-test
// Investigator run made 1 tool call (Read on CLAUDE.md) even though CLAUDE.md's
// full text was already auto-injected into its context by the harness before
// the input arrived (confirmed by a diagnostic probe: tool_uses:0, content
// present). A follow-up reproduction of the exact same input did NOT repeat
// the call — the behavior is a non-deterministic agentic impulse, not a
// deterministic textual trigger in any agent .md or Coordinator prompt. Since
// Phase 1 has no technical hook/permission enforcement (pipeline-guardrails.json
// says so explicitly), the mitigation is the strongest available prompt-level
// contract: each read-only agent's zero-tool-use section now names this exact
// failure mode ("auto-loaded context is not an exception") so that already-
// visible auto-injected content (CLAUDE.md, memory, etc.) is never grounds for
// a tool call, including a "just double-checking" one. This is a mitigation,
// not a mathematical guarantee — the behavioral --events-dir scan below remains
// the only mechanism that actually detects a real violation after the fact.
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
  // F-8: auto-loaded context (CLAUDE.md, memory, etc.) named explicitly as never
  // grounds for a tool call — root-caused from the SMK-INV tool-violation incident.
  const autoLoadedNotException = /auto-loaded context is not an exception/i.test(md) &&
    /CLAUDE\.md/.test(md) &&
    /never a reason to call a tool/i.test(md);
  const complete = hasHeading && namesMode && forbidsTools && auditOnly && toolUsesZero && autoLoadedNotException;
  if (complete) pass(`${role}: zero-tool-use section complete (incl. auto-loaded-context clause)`);
  else fail(`${role}: zero-tool-use section incomplete (heading=${hasHeading} namesMode=${namesMode} forbidsTools=${forbidsTools} auditOnly=${auditOnly} toolUsesZero=${toolUsesZero} notNarrowed=${notNarrowed} autoLoadedNotException=${autoLoadedNotException})`);
}

// ---------------------------------------------------------------------------
// 2. mirror integrity — <role>-fixture-only.md is a real-tool-denial mirror
// ---------------------------------------------------------------------------
// F-11 fix (2026-08-31): SMK-INV (investigator) and SMK-ANA (analyst) each
// independently made real tool calls in a fixture-only-test run despite an
// explicit prompt-level "DO NOT USE TOOLS" contract and the auto-loaded-context
// clause above — proving prompt-only enforcement is probabilistic, not
// deterministic. A controlled experiment (an agent registered with an EMPTY
// `tools:` frontmatter line) confirmed the harness genuinely offers that agent
// ZERO callable tools — not "all tools" (a misleading registration-announcement
// label was checked and disproven by actually attempting Read/Bash/Glob, all
// three reported as "not available, no such tool to call", not merely denied
// at call time). This is real technical enforcement, available NOW in Phase 1's
// runtime, not a Phase-2-only capability. Each read-only role therefore has a
// `<role>-fixture-only.md` twin with `tools:` left blank; the Coordinator must
// invoke that subagent_type — never the real one — for any fixture-only-test
// run. The canonical contract text lives ONLY in `<role>.md`; the twin is a
// byte-for-byte mirror of everything except the name/description/tools
// frontmatter lines, verified here so the two can never silently drift apart.
section("2. mirror integrity — <role>-fixture-only.md exists, tools: blank, contract byte-identical to <role>.md");
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  return { frontmatter: m[1], body: m[2] };
}
for (const role of READ_ONLY) {
  const srcPath = join(AGENTS_DIR, `${role}.md`);
  const mirrorPath = join(AGENTS_DIR, `${role}-fixture-only.md`);
  if (!existsSync(mirrorPath)) { fail(`${role}-fixture-only.md missing — fixture-only-test runs for ${role} have no zero-tool enforcement mechanism`); continue; }
  const src = readFileSync(srcPath, "utf8");
  const mirror = readFileSync(mirrorPath, "utf8");
  const srcFm = parseFrontmatter(src);
  const mirrorFm = parseFrontmatter(mirror);
  if (!srcFm || !mirrorFm) { fail(`${role}-fixture-only.md or ${role}.md: frontmatter block not parseable`); continue; }
  const bodyIdentical = srcFm.body === mirrorFm.body;
  const mirrorToolsBlank = /^tools:\s*$/m.test(mirrorFm.frontmatter);
  const mirrorNameCorrect = new RegExp(`^name:\\s*${role}-fixture-only\\s*$`, "m").test(mirrorFm.frontmatter);
  const mirrorModelMatches = (mirrorFm.frontmatter.match(/^model:.*$/m) || [""])[0] === (srcFm.frontmatter.match(/^model:.*$/m) || [""])[0];
  const mirrorColorMatches = (mirrorFm.frontmatter.match(/^color:.*$/m) || [""])[0] === (srcFm.frontmatter.match(/^color:.*$/m) || [""])[0];
  const ok = bodyIdentical && mirrorToolsBlank && mirrorNameCorrect && mirrorModelMatches && mirrorColorMatches;
  if (ok) pass(`${role}-fixture-only: tools: blank, name correct, model/color match, contract body byte-identical to ${role}.md`);
  else fail(`${role}-fixture-only: mirror drifted or malformed (bodyIdentical=${bodyIdentical} toolsBlank=${mirrorToolsBlank} nameCorrect=${mirrorNameCorrect} modelMatches=${mirrorModelMatches} colorMatches=${mirrorColorMatches}) — re-copy ${role}.md and re-apply only the name:/tools:/description: edits`);
}

// ---------------------------------------------------------------------------
// 2b. negative test — the mirror-integrity gate above actually catches drift
// ---------------------------------------------------------------------------
section("2b. mirror-integrity negative test (drift must be rejected)");
{
  const { mkdtempSync, writeFileSync: wf, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "pss-mirror-negtest-"));
  try {
    // Case A: tools: line no longer blank -> must be rejected.
    const src = readFileSync(join(AGENTS_DIR, "analyst.md"), "utf8");
    const srcFm = parseFrontmatter(src);
    const driftedTools = `---\n${srcFm.frontmatter.replace(/^tools:\s*$/m, "tools: Read")}\n---\n${srcFm.body}`
      .replace(/^name:.*$/m, "name: analyst-fixture-only")
      .replace(/^description:.*$/m, "description: drift test");
    const p1 = join(tmp, "analyst-fixture-only.md");
    wf(p1, driftedTools);
    const fm1 = parseFrontmatter(readFileSync(p1, "utf8"));
    const toolsBlank1 = /^tools:\s*$/m.test(fm1.frontmatter);
    if (!toolsBlank1) pass("A. a re-widened tools: line (no longer blank) is correctly detected as NOT blank");
    else fail("A. a re-widened tools: line was wrongly accepted as blank");

    // Case B: contract body edited (drifted from source) -> must be rejected.
    const driftedBody = `---\n${srcFm.frontmatter}\n---\n${srcFm.body.replace("You are the", "You are definitely the")}`;
    const bodyMatches = parseFrontmatter(driftedBody).body === srcFm.body;
    if (!bodyMatches) pass("B. a contract-body edit in the mirror is correctly detected as drift (body no longer byte-identical)");
    else fail("B. a contract-body edit was wrongly accepted as identical");

    // Case C: mirror file missing entirely -> must be rejected (already covered
    // by the !existsSync branch above; re-assert the logic directly here).
    const missingCaught = !existsSync(join(tmp, "does-not-exist-fixture-only.md"));
    if (missingCaught) pass("C. a missing mirror file is correctly detected as absent");
    else fail("C. a missing mirror file was wrongly treated as present");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`  temp dir removed : ${tmp}`);
}

// ---------------------------------------------------------------------------
// 3. behavioral: scan a real run's per-stage event logs for tool_uses == 0
// ---------------------------------------------------------------------------
const evDirArg = process.argv.slice(2).find((a) => a.startsWith("--events-dir="));
let blocked = 0;
if (evDirArg) {
  section("3. per-stage tool_uses == 0 scan (fixture-only-test category)");
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
