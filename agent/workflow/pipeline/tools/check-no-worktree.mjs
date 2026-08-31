#!/usr/bin/env node
// Partner pipeline — worktree-isolation prohibition gate (Phase 1 authoring).
//
// Deterministic, offline, read-only against the official repo. No network, no
// secrets.
//
// F-5 fix: fixture-only tests and Phase 1 Acceptance never use
// isolation:"worktree" and never create a worktree or an auxiliary branch
// inside the official repo. This tool:
//   1. structurally scans pipeline-guardrails.json and
//      fixtures/expected/assertions.json (both JSON, so this is a real
//      structural check, not a text grep) for any object holding an
//      "isolation" key whose value mentions "worktree";
//   2. scans fenced code blocks in TESTPLAN.md, README.md, and
//      report-template.md for a literal isolation:"worktree" usage pattern —
//      prose OUTSIDE a fenced block may still discuss/forbid the pattern by
//      name without tripping this gate;
//   3. runs a positive/negative battery proving both scans catch an injected
//      occurrence, against synthetic in-memory documents (no repo files are
//      touched).
//
// Run: node agent/workflow/pipeline/tools/check-no-worktree.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PIPELINE = join(HERE, "..");
const REPO_ROOT = join(PIPELINE, "..", "..", "..");

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => console.log(`\n== ${m} ==`);

// ---------------------------------------------------------------------------
// Structural scan: walk any parsed JSON value for {"isolation": "...worktree..."}
// ---------------------------------------------------------------------------
export function findWorktreeIsolation(node, path = "$") {
  const hits = [];
  const walk = (n, p) => {
    if (Array.isArray(n)) { n.forEach((v, i) => walk(v, `${p}[${i}]`)); return; }
    if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) {
        if (k === "isolation" && typeof v === "string" && /worktree/i.test(v)) {
          hits.push(`${p}.isolation = "${v}"`);
        }
        walk(v, `${p}.${k}`);
      }
    }
  };
  walk(node, path);
  return hits;
}

// ---------------------------------------------------------------------------
// Fenced-code-block scan: find ```...``` blocks and check for a literal
// executable-looking isolation:"worktree" pattern inside them.
// ---------------------------------------------------------------------------
export function findWorktreeInFences(text) {
  const hits = [];
  const fenceRe = /```[a-zA-Z0-9]*\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(text))) {
    const block = m[1];
    const patRe = /isolation\s*:\s*["']worktree["']/i;
    if (patRe.test(block)) hits.push(block.match(patRe)[0]);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 1. structural scan of the real JSON config files
// ---------------------------------------------------------------------------
section("1. structural scan — pipeline-guardrails.json / assertions.json");
{
  const targets = [
    join(PIPELINE, "pipeline-guardrails.json"),
    join(PIPELINE, "fixtures", "expected", "assertions.json"),
  ];
  for (const p of targets) {
    if (!existsSync(p)) { fail(`missing: ${p}`); continue; }
    let obj;
    try { obj = JSON.parse(readFileSync(p, "utf8")); }
    catch (e) { fail(`${p}: does not parse: ${e.message}`); continue; }
    const hits = findWorktreeIsolation(obj);
    if (hits.length) hits.forEach((h) => fail(`${p}: ${h}`));
    else pass(`${p}: no isolation:"worktree" structural entry`);
  }
}

// ---------------------------------------------------------------------------
// 2. fenced-code-block scan of the real docs
// ---------------------------------------------------------------------------
section("2. fenced-code-block scan — TESTPLAN.md / README.md / report-template.md");
{
  const targets = [
    join(PIPELINE, "TESTPLAN.md"),
    join(PIPELINE, "README.md"),
    join(PIPELINE, "report-template.md"),
  ];
  for (const p of targets) {
    if (!existsSync(p)) { fail(`missing: ${p}`); continue; }
    const text = readFileSync(p, "utf8");
    const hits = findWorktreeInFences(text);
    if (hits.length) hits.forEach((h) => fail(`${p}: fenced code contains "${h}"`));
    else pass(`${p}: no isolation:"worktree" inside a fenced code block`);
  }
}

// ---------------------------------------------------------------------------
// 3. positive/negative battery — synthetic in-memory documents
// ---------------------------------------------------------------------------
section("3. detector battery (synthetic, no repo files touched)");
{
  const structCases = [
    { name: "clean guardrails-shaped object", obj: { roles: { implementer: { isolation: "temp-repo" } } }, expectHit: false },
    { name: "isolation:worktree nested three levels deep", obj: { a: { b: { c: { isolation: "worktree" } } } }, expectHit: true },
    { name: "isolation:WORKTREE (case-insensitive)", obj: { x: { isolation: "WORKTREE" } }, expectHit: true },
    { name: "unrelated key named isolation with unrelated value", obj: { isolation: "none" }, expectHit: false },
  ];
  let bad = 0;
  for (const c of structCases) {
    const hits = findWorktreeIsolation(c.obj);
    const got = hits.length > 0;
    if (got !== c.expectHit) { fail(`battery(struct) "${c.name}": expected hit=${c.expectHit}, got ${got}`); bad++; }
  }

  const fenceCases = [
    { name: "clean fenced bash block", text: "```bash\ngit status\n```", expectHit: false },
    { name: "isolation:\"worktree\" inside a fenced block", text: "```js\nAgent({ isolation: \"worktree\" })\n```", expectHit: true },
    { name: "isolation: 'worktree' single-quoted inside fence", text: "```js\n{ isolation: 'worktree' }\n```", expectHit: true },
    { name: "prose OUTSIDE a fence naming the forbidden pattern is not flagged", text: "Never use `isolation:\"worktree\"` in a fixture-only run.", expectHit: false },
  ];
  for (const c of fenceCases) {
    const hits = findWorktreeInFences(c.text);
    const got = hits.length > 0;
    if (got !== c.expectHit) { fail(`battery(fence) "${c.name}": expected hit=${c.expectHit}, got ${got}`); bad++; }
  }
  if (bad === 0) pass(`${structCases.length + fenceCases.length} battery cases behave as expected`);
}

console.log(`\n${"=".repeat(60)}`);
if (failures === 0) { console.log("RESULT: PASS — no isolation:\"worktree\" in the pipeline's own configuration/docs"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
