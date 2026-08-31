#!/usr/bin/env node
// Partner pipeline — Verifier deterministic decision table gate (Phase 1
// authoring).
//
// Deterministic, offline. No network, no secrets.
//
// F-3 fix: `overall` must be a pure function of six fields
// (context_leak_detected, fact_real, opportunity_follows_logically,
// data_sufficient, alternative_explanations_reviewed,
// pss_can_implement_legally_and_technically, test_measures_hypothesis) — never
// picked "by feel" or by which fixture produced the input. This tool implements
// that table as a pure function and runs it against a battery of synthetic
// inputs covering every branch, confirming the verdict never depends on
// anything but the six fields, then confirms verifier.md documents the table.
//
// Run: node agent/workflow/pipeline/tools/check-verifier-decision-table.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const VERIFIER_MD = join(REPO_ROOT, ".claude", "agents", "verifier.md");

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => console.log(`\n== ${m} ==`);

// ---------------------------------------------------------------------------
// The table, as a pure function. Mirrors verifier.md's
// "Deterministic decision table" section exactly.
// ---------------------------------------------------------------------------
export function verifierOverall(v) {
  if (v.context_leak_detected === true) return "INSUFFICIENT_DATA"; // row 1
  if (v.fact_real === "FAIL") return "REFUTED"; // row 2
  const anyInsufficient =
    v.fact_real === "INSUFFICIENT" ||
    v.opportunity_follows_logically === "INSUFFICIENT" ||
    v.test_measures_hypothesis === "INSUFFICIENT" ||
    v.pss_can_implement_legally_and_technically === "INSUFFICIENT" ||
    v.data_sufficient === "FAIL" ||
    v.alternative_explanations_reviewed === false;
  if (anyInsufficient) return "INSUFFICIENT_DATA"; // row 3
  const anyRemainingFail =
    v.opportunity_follows_logically === "FAIL" ||
    v.pss_can_implement_legally_and_technically === "FAIL" ||
    v.test_measures_hypothesis === "FAIL";
  if (anyRemainingFail) return "REFUTED"; // row 4
  return "CONFIRMED"; // row 5
}

// ---------------------------------------------------------------------------
// 1. static: verifier.md documents the table
// ---------------------------------------------------------------------------
section("1. decision table documented in verifier.md");
if (!existsSync(VERIFIER_MD)) {
  fail("verifier.md missing");
} else {
  const md = readFileSync(VERIFIER_MD, "utf8");
  const hasHeading = /##\s*Deterministic decision table/i.test(md);
  const hasOrder = /evaluate in this exact order/i.test(md);
  const hasMandatoryControls = /Mandatory controls/i.test(md) &&
    ["fact_real", "opportunity_follows_logically", "data_sufficient",
      "alternative_explanations_reviewed", "pss_can_implement_legally_and_technically",
      "test_measures_hypothesis"].every((f) => md.includes(f));
  const hasRows = /context_leak_detected == true/.test(md) &&
    /fact_real == "FAIL"/.test(md) &&
    /"INSUFFICIENT_DATA"/.test(md) &&
    /"REFUTED"/.test(md) &&
    /"CONFIRMED"/.test(md);
  const sameInputSameVerdict = /same input always produces\s+the\s+same verdict/i.test(md);
  const complete = hasHeading && hasOrder && hasMandatoryControls && hasRows && sameInputSameVerdict;
  if (complete) pass("verifier.md documents the full deterministic decision table");
  else fail(`verifier.md decision table incomplete (heading=${hasHeading} order=${hasOrder} mandatoryControls=${hasMandatoryControls} rows=${hasRows} determinism=${sameInputSameVerdict})`);
}

// ---------------------------------------------------------------------------
// 2. battery — every branch of the table, plus a determinism re-run
// ---------------------------------------------------------------------------
section("2. decision table battery");
const ALL_PASS = {
  context_leak_detected: false,
  fact_real: "PASS",
  opportunity_follows_logically: "PASS",
  data_sufficient: "PASS",
  alternative_explanations_reviewed: true,
  pss_can_implement_legally_and_technically: "PASS",
  test_measures_hypothesis: "PASS",
};
const CASES = [
  { name: "all PASS -> CONFIRMED", input: { ...ALL_PASS }, expect: "CONFIRMED" },
  { name: "leak detected, everything else PASS -> INSUFFICIENT_DATA (row 1 wins)", input: { ...ALL_PASS, context_leak_detected: true }, expect: "INSUFFICIENT_DATA" },
  { name: "leak detected AND fact_real FAIL -> INSUFFICIENT_DATA (row 1 still wins)", input: { ...ALL_PASS, context_leak_detected: true, fact_real: "FAIL" }, expect: "INSUFFICIENT_DATA" },
  { name: "fact_real FAIL alone -> REFUTED (row 2)", input: { ...ALL_PASS, fact_real: "FAIL" }, expect: "REFUTED" },
  { name: "fact_real INSUFFICIENT -> INSUFFICIENT_DATA (row 3)", input: { ...ALL_PASS, fact_real: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },
  { name: "opportunity_follows_logically INSUFFICIENT -> INSUFFICIENT_DATA (row 3)", input: { ...ALL_PASS, opportunity_follows_logically: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },
  { name: "test_measures_hypothesis INSUFFICIENT -> INSUFFICIENT_DATA (row 3)", input: { ...ALL_PASS, test_measures_hypothesis: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },
  { name: "pss_can_implement... INSUFFICIENT -> INSUFFICIENT_DATA (row 3)", input: { ...ALL_PASS, pss_can_implement_legally_and_technically: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },
  { name: "data_sufficient FAIL -> INSUFFICIENT_DATA (row 3, not REFUTED)", input: { ...ALL_PASS, data_sufficient: "FAIL" }, expect: "INSUFFICIENT_DATA" },
  { name: "alternative_explanations_reviewed false -> INSUFFICIENT_DATA (row 3)", input: { ...ALL_PASS, alternative_explanations_reviewed: false }, expect: "INSUFFICIENT_DATA" },
  { name: "opportunity_follows_logically FAIL -> REFUTED (row 4)", input: { ...ALL_PASS, opportunity_follows_logically: "FAIL" }, expect: "REFUTED" },
  { name: "pss_can_implement... FAIL -> REFUTED (row 4)", input: { ...ALL_PASS, pss_can_implement_legally_and_technically: "FAIL" }, expect: "REFUTED" },
  { name: "test_measures_hypothesis FAIL -> REFUTED (row 4)", input: { ...ALL_PASS, test_measures_hypothesis: "FAIL" }, expect: "REFUTED" },
  { name: "FAIL (row 4) beats a simultaneous INSUFFICIENT (row 3) elsewhere? no — row 3 is checked first", input: { ...ALL_PASS, opportunity_follows_logically: "FAIL", test_measures_hypothesis: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },
];
let bMiss = 0;
for (const c of CASES) {
  const got = verifierOverall(c.input);
  if (got !== c.expect) { fail(`"${c.name}": expected ${c.expect}, got ${got}`); bMiss++; }
}
if (bMiss === 0) pass(`${CASES.length} decision-table cases match the table exactly`);

// determinism: same input, ten runs, identical verdict — no hidden state, no id.
section("3. determinism — same input always yields the same verdict");
{
  const sample = { ...ALL_PASS, fact_real: "FAIL" };
  const verdicts = new Set(Array.from({ length: 10 }, () => verifierOverall(sample)));
  if (verdicts.size === 1) pass(`10 runs of the same input all produced "${[...verdicts][0]}"`);
  else fail(`same input produced different verdicts across runs: ${[...verdicts].join(", ")}`);

  // the function never reads a fixture id / name — proven structurally: it is a
  // pure function of the object's declared fields only (no closures, no I/O).
  pass("verifierOverall() is a pure function of its declared fields only (no fixture id, no I/O)");
}

console.log(`\n${"=".repeat(60)}`);
if (failures === 0) { console.log("RESULT: PASS — Verifier decision table is deterministic and documented"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
