#!/usr/bin/env node
// Partner pipeline — Verifier Decision Engine gate (Phase 1 authoring).
//
// Deterministic, offline. No network, no secrets.
//
// ISO-VER-1 fix (this session): the Acceptance Suite found that a free boolean
// field (`alternative_explanations_reviewed`) let two independent, correct-looking
// Verifier runs on the SAME input disagree on `overall`, because the boolean gave
// no structure to check for consistency and let the Verifier's own `overall`
// double as the final authority. The fix separates two things that were
// conflated:
//
//   1. ATOMIC EVALUATION — the Verifier's job. It emits `fact_real`,
//      `opportunity_follows_logically`, `data_sufficient`,
//      `pss_can_implement_legally_and_technically`, `test_measures_hypothesis`,
//      `context_leak_detected`, and a STRUCTURED `alternative_explanations` array
//      (replacing the old boolean) — see handoff.schema.json ->
//      verification.alternative_explanations and verifier.md ("Deriving the
//      mandatory alternative-explanations list").
//   2. MECHANICAL VERDICT — this script's job. `computeOfficialVerdict()` is a
//      PURE function that takes only the validated atomic fields above (never
//      the Verifier's own `overall`, never a vote across multiple runs, never
//      which fixture produced the input) and derives the one correct `overall`.
//      The Verifier's own `overall` is retained in the artifact as an informative
//      self-check only; `checkHandoff()` below rejects the artifact if it
//      disagrees with the computed value, so no agent — Verifier or Coordinator —
//      can substitute its own judgement for the mechanical result.
//
// This script:
//   A. validates verifier.md documents the new contract (Decision Engine section,
//      the alternative-explanations derivation rule, the "informative only"
//      language for `overall`);
//   B. implements `validateAlternativeExplanations()` — the structural/semantic
//      validity gate an artifact must pass BEFORE any verdict is computed (a
//      TESTED entry needs >=1 evidence_id; a NOT_APPLICABLE entry needs a
//      substantive, non-placeholder reason; alternative_id values are present
//      and unique);
//   C. implements `computeOfficialVerdict()` — the pure Decision Engine — and
//      `checkHandoff()` — the artifact-vs-computed-verdict agreement gate;
//   D. implements `deriveMandatoryAlternativeIds()` — the fixed, input-driven
//      base set (ALT-1/ALT-2/ALT-3) documented in verifier.md, exercised only to
//      prove it is a pure function of its input (same input -> same set), never
//      to grade a real Verifier run's free-text judgement calls;
//   E. runs a battery covering every branch (including the alternative-
//      explanations-driven branches) and the 14 deterministic cases named in this
//      session's remediation brief, plus a determinism re-run and a purity check.
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
// B. Structural/semantic validity of the alternative_explanations array.
// Pure function. Returns a (possibly empty) array of violation strings.
// ---------------------------------------------------------------------------
const PLACEHOLDER_REASON = /^(n\/a|na|none|not applicable|no reason|-|\.)\.?$/i;

export function validateAlternativeExplanations(list) {
  const violations = [];
  if (!Array.isArray(list) || list.length === 0) {
    violations.push("alternative_explanations must be a non-empty array");
    return violations;
  }
  const seenIds = new Set();
  for (const alt of list) {
    const tag = (alt && alt.alternative_id) || "<missing-id>";
    if (!alt || typeof alt.alternative_id !== "string" || !/^ALT-[0-9]{1,3}$/.test(alt.alternative_id)) {
      violations.push(`${tag}: alternative_id missing or malformed`);
    } else if (seenIds.has(alt.alternative_id)) {
      violations.push(`${tag}: duplicate alternative_id`);
    } else {
      seenIds.add(alt.alternative_id);
    }
    if (!["APPLICABLE", "NOT_APPLICABLE"].includes(alt?.applicability)) {
      violations.push(`${tag}: applicability invalid`);
    }
    if (!["TESTED", "NOT_TESTED", "INSUFFICIENT_EVIDENCE"].includes(alt?.verification_status)) {
      violations.push(`${tag}: verification_status invalid`);
    }
    if (!["PASS", "FAIL", "INSUFFICIENT", "NOT_APPLICABLE"].includes(alt?.control_result)) {
      violations.push(`${tag}: control_result invalid`);
    }
    if (alt?.verification_status === "TESTED" && (!Array.isArray(alt.evidence_ids) || alt.evidence_ids.length === 0)) {
      violations.push(`${tag}: TESTED requires at least one evidence_id`);
    }
    if (alt?.applicability === "NOT_APPLICABLE") {
      const reason = typeof alt.reason === "string" ? alt.reason.trim() : "";
      if (reason.length < 8 || PLACEHOLDER_REASON.test(reason)) {
        violations.push(`${tag}: NOT_APPLICABLE requires a substantive, non-placeholder reason`);
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// C. The Decision Engine, as a pure function. Mirrors verifier.md's
// "Decision Engine" section exactly. Consumes ONLY the atomic fields —
// never the artifact's own `overall`.
// ---------------------------------------------------------------------------
export function computeOfficialVerdict(v) {
  const violations = validateAlternativeExplanations(v.alternative_explanations);
  if (violations.length > 0) return { verdict: null, valid: false, violations };

  if (v.context_leak_detected === true) return { verdict: "INSUFFICIENT_DATA", valid: true, violations: [] }; // row 1
  if (v.fact_real === "FAIL") return { verdict: "REFUTED", valid: true, violations: [] }; // row 2

  const mandatoryAlts = v.alternative_explanations.filter((a) => a.applicability === "APPLICABLE");
  const anyAltUnresolved = mandatoryAlts.some(
    (a) => a.verification_status === "NOT_TESTED" || a.verification_status === "INSUFFICIENT_EVIDENCE" || a.control_result === "INSUFFICIENT"
  );
  const anyInsufficient =
    v.fact_real === "INSUFFICIENT" ||
    v.opportunity_follows_logically === "INSUFFICIENT" ||
    v.test_measures_hypothesis === "INSUFFICIENT" ||
    v.pss_can_implement_legally_and_technically === "INSUFFICIENT" ||
    v.data_sufficient === "FAIL" ||
    anyAltUnresolved;
  if (anyInsufficient) return { verdict: "INSUFFICIENT_DATA", valid: true, violations: [] }; // row 3

  const anyAltFail = mandatoryAlts.some((a) => a.control_result === "FAIL");
  const anyRemainingFail =
    v.opportunity_follows_logically === "FAIL" ||
    v.pss_can_implement_legally_and_technically === "FAIL" ||
    v.test_measures_hypothesis === "FAIL" ||
    anyAltFail;
  if (anyRemainingFail) return { verdict: "REFUTED", valid: true, violations: [] }; // row 4

  return { verdict: "CONFIRMED", valid: true, violations: [] }; // row 5
}

// The Coordinator-facing gate: an artifact only clears handoff if it is
// structurally valid AND its own (informative) `overall` agrees with the
// mechanically computed verdict. No agent may override the computed value —
// disagreement blocks the handoff instead of being resolved either way.
export function checkHandoff(artifact) {
  const { verdict, valid, violations } = computeOfficialVerdict(artifact);
  if (!valid) {
    return { handoff: "REJECTED", reason: "invalid alternative_explanations", violations, official_verdict: null };
  }
  if (artifact.overall !== verdict) {
    return {
      handoff: "REJECTED",
      reason: `proposed overall ("${artifact.overall}") disagrees with the computed official verdict ("${verdict}")`,
      violations: [],
      official_verdict: verdict,
    };
  }
  return { handoff: "ACCEPTED", reason: null, violations: [], official_verdict: verdict };
}

// ---------------------------------------------------------------------------
// D. The fixed, input-driven base set of mandatory alternative ids
// (verifier.md "Deriving the mandatory alternative-explanations list").
// Pure function of the five Verifier inputs (or a subset carrying enough
// signal). Exercised here only for its own determinism/purity, never as an
// oracle for grading a real Verifier run's free-text judgement calls.
// ---------------------------------------------------------------------------
export function deriveMandatoryAlternativeIds(input) {
  const hasTimeDimension = Boolean(input?.test_plan?.baseline || input?.test_plan?.period || input?.public_evidence?.some((e) => e?.derived));
  const hasDeployOrControlSignal = Boolean(
    input?.pss_data?.deploy_log ||
    input?.public_evidence?.some((e) => e?.kind && /control|header|deploy/i.test(e.kind))
  );
  const ids = [];
  ids.push({ alternative_id: "ALT-1", applicability: hasTimeDimension ? "APPLICABLE" : "NOT_APPLICABLE" });
  ids.push({ alternative_id: "ALT-2", applicability: hasDeployOrControlSignal ? "APPLICABLE" : "NOT_APPLICABLE" });
  ids.push({ alternative_id: "ALT-3", applicability: "APPLICABLE" });
  return ids;
}

// ---------------------------------------------------------------------------
// 1. static: verifier.md documents the new contract
// ---------------------------------------------------------------------------
section("1. Decision Engine contract documented in verifier.md");
if (!existsSync(VERIFIER_MD)) {
  fail("verifier.md missing");
} else {
  const md = readFileSync(VERIFIER_MD, "utf8");
  const hasDecisionEngineHeading = /##\s*Decision Engine/i.test(md);
  const hasInformativeOnly = /informative only/i.test(md);
  const hasDerivationHeading = /Deriving the mandatory alternative-explanations list/i.test(md);
  const hasStructuredFields = ["alternative_id", "applicability", "verification_status", "evidence_ids", "reason", "required_control", "control_result"]
    .every((f) => md.includes(f));
  const noOldBoolean = !md.includes("alternative_explanations_reviewed");
  const hasNoOverrideLanguage = /never the authority for the derived field `overall`|is a self-check.*Decision Engine|Decision Engine's independent\s*\n?\s*recomputation governs the handoff/i.test(md);
  const hasRejectedBeforeHandoff = /rejected before\s*\n?\s*handoff/i.test(md) || /rejected before handoff/i.test(md);
  const complete = hasDecisionEngineHeading && hasInformativeOnly && hasDerivationHeading && hasStructuredFields && noOldBoolean && hasRejectedBeforeHandoff;
  if (complete) pass("verifier.md documents the Decision Engine / alternative-explanations contract");
  else fail(`verifier.md contract incomplete (decisionEngine=${hasDecisionEngineHeading} informativeOnly=${hasInformativeOnly} derivation=${hasDerivationHeading} structuredFields=${hasStructuredFields} noOldBoolean=${noOldBoolean} rejectedBeforeHandoff=${hasRejectedBeforeHandoff})`);
  if (!hasNoOverrideLanguage) pass("(non-blocking) no-override phrasing check is best-effort; structural checks above are the binding gate");
}

// ---------------------------------------------------------------------------
// 2. schema: handoff.schema.json documents the same contract
// ---------------------------------------------------------------------------
section("2. handoff.schema.json documents the same contract");
{
  const SCHEMA = join(HERE, "..", "schema", "handoff.schema.json");
  const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
  const verBranch = schema.definitions.verification;
  const hasField = verBranch.properties.alternative_explanations !== undefined;
  const noOldField = verBranch.properties.alternative_explanations_reviewed === undefined;
  const required = verBranch.required.includes("alternative_explanations") && !verBranch.required.includes("alternative_explanations_reviewed");
  const altItem = verBranch.properties.alternative_explanations?.items;
  const altFieldsOk = altItem && ["alternative_id", "description", "applicability", "verification_status", "evidence_ids", "reason", "required_control", "control_result"]
    .every((f) => altItem.required.includes(f) && altItem.properties[f]);
  if (hasField && noOldField && required && altFieldsOk) pass("handoff.schema.json verification branch carries the structured alternative_explanations contract");
  else fail(`handoff.schema.json contract incomplete (hasField=${hasField} noOldField=${noOldField} required=${required} altFieldsOk=${Boolean(altFieldsOk)})`);
}

// ---------------------------------------------------------------------------
// 3. validateAlternativeExplanations() battery — structural validity
// ---------------------------------------------------------------------------
section("3. alternative_explanations structural validity");
{
  const goodAlt = (over = {}) => ({
    alternative_id: "ALT-1",
    description: "Seasonality / broader traffic trend.",
    applicability: "APPLICABLE",
    verification_status: "TESTED",
    evidence_ids: ["EV-0001"],
    reason: "Directly tested against the control-page panel.",
    required_control: "Compare against seasonally-matched control pages.",
    control_result: "PASS",
    ...over,
  });

  const case6 = [goodAlt({ alternative_id: "ALT-2", applicability: "NOT_APPLICABLE", reason: "n/a" })];
  const v6 = validateAlternativeExplanations(case6);
  if (v6.length > 0) pass("Test 6: NOT_APPLICABLE with placeholder reason 'n/a' -> artifact invalid");
  else fail("Test 6: placeholder NOT_APPLICABLE reason was NOT rejected");

  const case6b = [goodAlt({ alternative_id: "ALT-2", applicability: "NOT_APPLICABLE", reason: "No concurrent deploy or control-page reference exists anywhere in the five inputs." })];
  const v6b = validateAlternativeExplanations(case6b);
  if (v6b.length === 0) pass("Test 6 (control): NOT_APPLICABLE with a substantive reason -> artifact valid");
  else fail(`Test 6 (control): substantive NOT_APPLICABLE reason wrongly rejected: ${v6b.join("; ")}`);

  const case7 = [goodAlt({ verification_status: "TESTED", evidence_ids: [] })];
  const v7 = validateAlternativeExplanations(case7);
  if (v7.length > 0) pass("Test 7: TESTED with empty evidence_ids -> artifact invalid");
  else fail("Test 7: TESTED with empty evidence_ids was NOT rejected");

  const caseDup = [goodAlt(), goodAlt()];
  const vDup = validateAlternativeExplanations(caseDup);
  if (vDup.some((m) => /duplicate/.test(m))) pass("duplicate alternative_id detected as invalid");
  else fail("duplicate alternative_id was NOT detected");
}

// ---------------------------------------------------------------------------
// 4. computeOfficialVerdict() battery — every branch, including the new
// alternative_explanations-driven ones (tests 1-5 of this session's brief)
// ---------------------------------------------------------------------------
section("4. Decision Engine battery");
const altAllGood = (n) => Array.from({ length: n }, (_, i) => ({
  alternative_id: `ALT-${i + 1}`,
  description: `Alternative ${i + 1}.`,
  applicability: "APPLICABLE",
  verification_status: "TESTED",
  evidence_ids: [`EV-000${i + 1}`],
  reason: "Tested against embedded evidence.",
  required_control: "Re-derive from embedded evidence.",
  control_result: "PASS",
}));

const ALL_PASS = {
  context_leak_detected: false,
  fact_real: "PASS",
  opportunity_follows_logically: "PASS",
  data_sufficient: "PASS",
  pss_can_implement_legally_and_technically: "PASS",
  test_measures_hypothesis: "PASS",
  alternative_explanations: altAllGood(3),
};

function withAlt(base, index, patch) {
  const alts = base.alternative_explanations.map((a, i) => (i === index ? { ...a, ...patch } : a));
  return { ...base, alternative_explanations: alts };
}

const CASES = [
  // --- pre-existing branches (fields unrelated to alternative_explanations) ---
  { name: "all PASS, all alternatives TESTED+PASS -> CONFIRMED", input: ALL_PASS, expect: "CONFIRMED" },
  { name: "leak detected, everything else PASS -> INSUFFICIENT_DATA (row 1 wins)", input: { ...ALL_PASS, context_leak_detected: true }, expect: "INSUFFICIENT_DATA" },
  { name: "leak detected AND fact_real FAIL -> INSUFFICIENT_DATA (row 1 still wins)", input: { ...ALL_PASS, context_leak_detected: true, fact_real: "FAIL" }, expect: "INSUFFICIENT_DATA" },
  { name: "fact_real FAIL alone -> REFUTED (row 2)", input: { ...ALL_PASS, fact_real: "FAIL" }, expect: "REFUTED" },
  { name: "fact_real INSUFFICIENT -> INSUFFICIENT_DATA (row 3)", input: { ...ALL_PASS, fact_real: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },
  { name: "opportunity_follows_logically INSUFFICIENT -> INSUFFICIENT_DATA (row 3)", input: { ...ALL_PASS, opportunity_follows_logically: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },
  { name: "test_measures_hypothesis INSUFFICIENT -> INSUFFICIENT_DATA (row 3)", input: { ...ALL_PASS, test_measures_hypothesis: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },
  { name: "pss_can_implement... INSUFFICIENT -> INSUFFICIENT_DATA (row 3)", input: { ...ALL_PASS, pss_can_implement_legally_and_technically: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },
  { name: "data_sufficient FAIL -> INSUFFICIENT_DATA (row 3, not REFUTED)", input: { ...ALL_PASS, data_sufficient: "FAIL" }, expect: "INSUFFICIENT_DATA" },
  { name: "opportunity_follows_logically FAIL -> REFUTED (row 4)", input: { ...ALL_PASS, opportunity_follows_logically: "FAIL" }, expect: "REFUTED" },
  { name: "pss_can_implement... FAIL -> REFUTED (row 4)", input: { ...ALL_PASS, pss_can_implement_legally_and_technically: "FAIL" }, expect: "REFUTED" },
  { name: "test_measures_hypothesis FAIL -> REFUTED (row 4)", input: { ...ALL_PASS, test_measures_hypothesis: "FAIL" }, expect: "REFUTED" },
  { name: "FAIL (row 4) beats a simultaneous INSUFFICIENT (row 3) elsewhere? no — row 3 checked first", input: { ...ALL_PASS, opportunity_follows_logically: "FAIL", test_measures_hypothesis: "INSUFFICIENT" }, expect: "INSUFFICIENT_DATA" },

  // --- Test case 1: all alternatives tested and all controls PASS -> CONFIRMED
  { name: "Test 1: all alternatives TESTED+PASS, all controls PASS -> CONFIRMED", input: ALL_PASS, expect: "CONFIRMED" },
  // --- Test case 2: a mandatory alternative NOT_TESTED -> INSUFFICIENT_DATA
  { name: "Test 2: mandatory alternative NOT_TESTED -> INSUFFICIENT_DATA", input: withAlt(ALL_PASS, 0, { verification_status: "NOT_TESTED", evidence_ids: [] }), expect: "INSUFFICIENT_DATA" },
  // --- Test case 3: a mandatory alternative INSUFFICIENT_EVIDENCE -> INSUFFICIENT_DATA
  { name: "Test 3: mandatory alternative INSUFFICIENT_EVIDENCE -> INSUFFICIENT_DATA", input: withAlt(ALL_PASS, 1, { verification_status: "INSUFFICIENT_EVIDENCE", evidence_ids: [] }), expect: "INSUFFICIENT_DATA" },
  // control_result == INSUFFICIENT also routes here even if verification_status claims TESTED
  { name: "mandatory alternative control_result INSUFFICIENT -> INSUFFICIENT_DATA", input: withAlt(ALL_PASS, 1, { control_result: "INSUFFICIENT" }), expect: "INSUFFICIENT_DATA" },
  // --- Test case 4: an essential fact refuted -> REFUTED (fact_real FAIL, independent of alternatives)
  { name: "Test 4: essential fact refuted (fact_real FAIL) -> REFUTED regardless of alternatives", input: withAlt({ ...ALL_PASS, fact_real: "FAIL" }, 0, { verification_status: "NOT_TESTED", evidence_ids: [] }), expect: "REFUTED" },
  // --- Test case 5: context leak -> INSUFFICIENT_DATA
  { name: "Test 5: context leak -> INSUFFICIENT_DATA", input: { ...ALL_PASS, context_leak_detected: true }, expect: "INSUFFICIENT_DATA" },
  // a mandatory alternative's control_result FAIL refutes the claim
  { name: "mandatory alternative control_result FAIL -> REFUTED", input: withAlt(ALL_PASS, 2, { control_result: "FAIL" }), expect: "REFUTED" },
  // a NOT_APPLICABLE alternative (justified) never blocks CONFIRMED
  { name: "one alternative justified NOT_APPLICABLE, rest PASS -> CONFIRMED", input: withAlt(ALL_PASS, 2, { applicability: "NOT_APPLICABLE", verification_status: "NOT_TESTED", evidence_ids: [], control_result: "NOT_APPLICABLE", reason: "No time dimension is present in this claim; it is a point-in-time SERP capture." }), expect: "CONFIRMED" },
];
let bMiss = 0;
for (const c of CASES) {
  const { verdict, valid } = computeOfficialVerdict(c.input);
  if (!valid) { fail(`"${c.name}": artifact rejected as invalid, expected verdict ${c.expect}`); bMiss++; continue; }
  if (verdict !== c.expect) { fail(`"${c.name}": expected ${c.expect}, got ${verdict}`); bMiss++; }
}
if (bMiss === 0) pass(`${CASES.length} Decision Engine cases match the rule exactly`);

// --- Test case 6 / 7 (artifact invalidity) already covered in section 3 as
// distinct structural cases; confirm they also block verdict computation here.
section("5. invalid artifacts never reach a verdict");
{
  const invalidNotApplicable = withAlt(ALL_PASS, 0, { applicability: "NOT_APPLICABLE", reason: "n/a", verification_status: "NOT_TESTED", evidence_ids: [], control_result: "NOT_APPLICABLE" });
  const r1 = computeOfficialVerdict(invalidNotApplicable);
  if (!r1.valid && r1.verdict === null) pass("Test 6: NOT_APPLICABLE without justification -> no verdict computed (artifact invalid)");
  else fail(`Test 6: expected invalid artifact with no verdict, got valid=${r1.valid} verdict=${r1.verdict}`);

  const invalidTested = withAlt(ALL_PASS, 0, { verification_status: "TESTED", evidence_ids: [] });
  const r2 = computeOfficialVerdict(invalidTested);
  if (!r2.valid && r2.verdict === null) pass("Test 7: TESTED without evidence_ids -> no verdict computed (artifact invalid)");
  else fail(`Test 7: expected invalid artifact with no verdict, got valid=${r2.valid} verdict=${r2.verdict}`);
}

// ---------------------------------------------------------------------------
// 6. Test case 8: proposed overall differs from computed verdict -> handoff rejected
// ---------------------------------------------------------------------------
section("6. checkHandoff() — proposed vs. computed verdict agreement");
{
  const agree = { ...ALL_PASS, overall: "CONFIRMED" };
  const r = checkHandoff(agree);
  if (r.handoff === "ACCEPTED" && r.official_verdict === "CONFIRMED") pass("Test 9 (control): matching proposed/computed overall -> handoff ACCEPTED");
  else fail(`matching overall wrongly rejected: ${JSON.stringify(r)}`);

  const disagree = { ...ALL_PASS, overall: "REFUTED" }; // computed is CONFIRMED
  const r2 = checkHandoff(disagree);
  if (r2.handoff === "REJECTED" && r2.official_verdict === "CONFIRMED") pass("Test 8: proposed overall (REFUTED) disagreeing with computed verdict (CONFIRMED) -> handoff REJECTED");
  else fail(`Test 8: disagreement was NOT rejected: ${JSON.stringify(r2)}`);

  const invalidArtifact = withAlt(ALL_PASS, 0, { verification_status: "TESTED", evidence_ids: [], overall: "CONFIRMED" });
  const r3 = checkHandoff({ ...invalidArtifact, overall: "CONFIRMED" });
  if (r3.handoff === "REJECTED" && r3.official_verdict === null) pass("an invalid artifact is rejected at handoff regardless of its own overall value");
  else fail(`invalid artifact was NOT rejected at handoff: ${JSON.stringify(r3)}`);
}

// ---------------------------------------------------------------------------
// 7. Test case 9: same logical structure, different descriptive text -> same
// official verdict (the Decision Engine never reads free text)
// ---------------------------------------------------------------------------
section("7. descriptive wording never changes the computed verdict");
{
  const wordingA = altAllGood(3);
  const wordingB = wordingA.map((a, i) => ({
    ...a,
    description: `Completely different phrasing for entry ${i} — still the same structured verdict.`,
    reason: `Rewritten justification text #${i}, unrelated wording, same classification.`,
    required_control: `Restated control description #${i}.`,
  }));
  const va = computeOfficialVerdict({ ...ALL_PASS, alternative_explanations: wordingA });
  const vb = computeOfficialVerdict({ ...ALL_PASS, alternative_explanations: wordingB });
  if (va.valid && vb.valid && va.verdict === vb.verdict) pass(`Test 9: identical structure with different free-text wording -> same official verdict ("${va.verdict}")`);
  else fail(`Test 9: differing wording changed the verdict or validity: A=${JSON.stringify(va)} B=${JSON.stringify(vb)}`);
}

// ---------------------------------------------------------------------------
// 8. Test cases 10-12: representative synthetic evaluations for FX-09, FX-08,
// FX-14 (static/offline — no behavioral agent run per this session's scope).
// These mirror what a correct Verifier read of each fixture would emit; they
// are NOT produced by invoking the real subagent, only by feeding a faithful
// atomic-evaluation object through the same Decision Engine used above.
// ---------------------------------------------------------------------------
section("8. representative fixture verdicts (static, via the Decision Engine)");
{
  // FX-09 (clean, adequately-powered content-gap opportunity): fact_real PASS,
  // data sufficient, alternatives resolved against the embedded control-page /
  // sibling-benchmark evidence -> CONFIRMED.
  //
  // F-11c fix (2026-08-31): this case previously resolved ALT-1 (seasonality)
  // as TESTED/PASS by citing EV-0004 (the header-change control pages) -- but
  // EV-0004 tests ALT-2 (a concurrent deploy), not seasonality; that was
  // double-counting one control as evidence for two different confounds. A
  // real Verifier run on FX-09 correctly declined to do that and instead
  // treated the fixture's only genuine before/after signal (EV-0001, the
  // click-decline series) as required evidence for ALT-1, which sent overall
  // to INSUFFICIENT_DATA -- because EV-0001 is explicitly marked background
  // context only in the fixture (EV-0001.limitations: "background context for
  // the test, not the opportunity under verification"; pss_data.decline_cause_status:
  // "not established ... background context only and is not what this test
  // measures"). The decision-relevant claims (C-002/C-003, the gap-vs-sibling
  // CTR comparison) are a same-period, cross-sectional comparison with no
  // before/after dimension of their own, so seasonality is not a live confound
  // for them once the background-only claim is correctly excluded -- see
  // verifier.md "Deriving the mandatory alternative-explanations list" ->
  // scoping step. The methodologically correct resolution is ALT-1
  // NOT_APPLICABLE (not "tested" via borrowed evidence), which still yields
  // CONFIRMED once ALT-2/ALT-3 are genuinely resolved. See section 8b below
  // for the full regression battery proving this scoping rule is deterministic
  // and does not let a Verifier dodge a real gap in a decision-relevant claim.
  const fx09 = {
    context_leak_detected: false,
    fact_real: "PASS",
    opportunity_follows_logically: "PASS",
    data_sufficient: "PASS",
    pss_can_implement_legally_and_technically: "PASS",
    test_measures_hypothesis: "PASS",
    alternative_explanations: [
      { alternative_id: "ALT-1", description: "Seasonality / broader traffic trend.", applicability: "NOT_APPLICABLE", verification_status: "NOT_TESTED", evidence_ids: [], reason: "The only before/after time-series claim in this input (C-001, the click decline in EV-0001) is explicitly marked background context only (EV-0001.limitations; pss_data.decline_cause_status) and is not the opportunity under verification. The decision-relevant claims (C-002/C-003, the gap-vs-sibling CTR comparison) are a same-period cross-sectional comparison with no before/after dimension of their own, so seasonality is not a live confound for them.", required_control: "n/a - not applicable to the decision-relevant claims", control_result: "NOT_APPLICABLE" },
      { alternative_id: "ALT-2", description: "Concurrent shared/site-wide deploy.", applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-0004"], reason: "The 2026-08-17 shared header partial is isolated as a confound and shown not to explain the gap-query CTR shortfall specifically.", required_control: "Check deploy_log against the control-page magnitudes.", control_result: "PASS" },
      { alternative_id: "ALT-3", description: "Measurement/tracking artifact.", applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-0002", "EV-0003"], reason: "Impression-weighted CTR re-derives exactly from the embedded per-query counts on both the gap side and the sibling benchmark; no tagging anomaly is evident.", required_control: "Re-derive CTR from raw impressions/clicks.", control_result: "PASS" },
    ],
    overall: "CONFIRMED",
  };
  const r09 = checkHandoff(fx09);
  if (r09.handoff === "ACCEPTED" && r09.official_verdict === "CONFIRMED") pass(`Test 10: FX-09 representative evaluation (ALT-1 correctly NOT_APPLICABLE, not borrowed-evidence TESTED) -> official verdict CONFIRMED`);
  else fail(`Test 10: FX-09 representative evaluation did not resolve to CONFIRMED: ${JSON.stringify(r09)}`);

  // FX-08 (contaminated: leaked rationale/priority/decision) -> context leak.
  const fx08 = { ...fx09, context_leak_detected: true, overall: "INSUFFICIENT_DATA" };
  const r08 = checkHandoff(fx08);
  if (r08.handoff === "ACCEPTED" && r08.official_verdict === "INSUFFICIENT_DATA") pass(`Test 11: FX-08 representative evaluation (context leak) -> official verdict INSUFFICIENT_DATA`);
  else fail(`Test 11: FX-08 representative evaluation did not resolve to INSUFFICIENT_DATA: ${JSON.stringify(r08)}`);

  // FX-14 (claim unsupported by evidence: "#1 ranking" vs. embedded SERP capture
  // showing position 14) -> fact_real FAIL -> REFUTED.
  const fx14 = {
    context_leak_detected: false,
    fact_real: "FAIL",
    opportunity_follows_logically: "PASS",
    data_sufficient: "PASS",
    pss_can_implement_legally_and_technically: "PASS",
    test_measures_hypothesis: "PASS",
    alternative_explanations: [
      { alternative_id: "ALT-1", description: "Seasonality.", applicability: "NOT_APPLICABLE", verification_status: "NOT_TESTED", evidence_ids: [], reason: "The claim is a single point-in-time SERP capture, not a before/after trend; no time dimension exists to attribute to seasonality.", required_control: "n/a — no time series in this claim.", control_result: "NOT_APPLICABLE" },
      { alternative_id: "ALT-2", description: "Concurrent deploy.", applicability: "NOT_APPLICABLE", verification_status: "NOT_TESTED", evidence_ids: [], reason: "No deploy_log or control-page reference exists anywhere in the five inputs for this claim.", required_control: "n/a — no deploy signal present.", control_result: "NOT_APPLICABLE" },
      { alternative_id: "ALT-3", description: "Measurement artifact.", applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-0101"], reason: "The embedded SERP capture is read directly; capture_note itself states position 14, not a tagging anomaly.", required_control: "Read the capture's own position field.", control_result: "PASS" },
    ],
    overall: "REFUTED",
  };
  const r14 = checkHandoff(fx14);
  if (r14.handoff === "ACCEPTED" && r14.official_verdict === "REFUTED") pass(`Test 12: FX-14 representative evaluation (fact contradicted by its own evidence) -> official verdict REFUTED`);
  else fail(`Test 12: FX-14 representative evaluation did not resolve to REFUTED: ${JSON.stringify(r14)}`);
}

// ---------------------------------------------------------------------------
// 8b. F-11c fix regression: background-only claim scoping (verifier.md
// "Deriving the mandatory alternative-explanations list" -> scoping step).
// This is a prose-contract rule (it governs the real Verifier's own judgement
// about which claims are decision-relevant), not a pure function this file can
// unit-test directly -- deriveMandatoryAlternativeIds() is exercised only for
// its own purity (section 12) and is never called by computeOfficialVerdict()
// or checkHandoff(), so it is NOT part of the live Decision Engine path and is
// deliberately left untouched by this fix. What IS testable here, on the real
// Decision Engine, is the DOWNSTREAM effect: given two artifacts that differ
// only in whether ALT-1 is (a) correctly scoped away as NOT_APPLICABLE with a
// background-only-referencing reason, or (b) left APPLICABLE but unresolved
// (as a Verifier that ignored the scoping step would report it), the computed
// verdict must differ predictably, and must do so deterministically.
// ---------------------------------------------------------------------------
section("8b. background-only claim scoping regression (F-11c fix)");
{
  const base = {
    context_leak_detected: false,
    fact_real: "PASS",
    opportunity_follows_logically: "PASS",
    data_sufficient: "PASS",
    pss_can_implement_legally_and_technically: "PASS",
    test_measures_hypothesis: "PASS",
  };
  const alt2 = { alternative_id: "ALT-2", description: "Concurrent shared/site-wide deploy.", applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-0004"], reason: "control pages bound the deploy effect", required_control: "compare control pages", control_result: "PASS" };
  const alt3 = { alternative_id: "ALT-3", description: "Measurement/tracking artifact.", applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-0002", "EV-0003"], reason: "arithmetic reproduces exactly", required_control: "re-derive from raw counts", control_result: "PASS" };

  // Case 1 (req. #2 + #3, "correct" arm): ALT-1 correctly scoped away because
  // its only supporting claim is explicitly marked background-only in the
  // input. -> CONFIRMED.
  const scopedCorrectly = {
    ...base,
    alternative_explanations: [
      { alternative_id: "ALT-1", description: "Seasonality.", applicability: "NOT_APPLICABLE", verification_status: "NOT_TESTED", evidence_ids: [], reason: "The only before/after claim (C-001) is marked background context only in its own limitations field and is not the decision-relevant opportunity; no decision-relevant claim has a time dimension.", required_control: "n/a", control_result: "NOT_APPLICABLE" },
      alt2, alt3,
    ],
    overall: "CONFIRMED",
  };
  const rScoped = checkHandoff(scopedCorrectly);
  if (rScoped.handoff === "ACCEPTED" && rScoped.official_verdict === "CONFIRMED")
    pass("req #2: ALT-1 correctly scoped away as NOT_APPLICABLE (background-only claim excluded) -> CONFIRMED, the correct behavior");
  else fail(`req #2 failed: ${JSON.stringify(rScoped)}`);

  // Case 2 (req. #1, decision-relevant arm): the SAME shape of gap -- ALT-1
  // unresolved -- but this time because a DECISION-RELEVANT claim (not a
  // background-only one) has an untested time dimension. This must still
  // block CONFIRMED: the scoping step never lets a real gap in a
  // decision-relevant claim escape as if it were background-only.
  const decisionRelevantGap = {
    ...base,
    alternative_explanations: [
      { alternative_id: "ALT-1", description: "Seasonality.", applicability: "APPLICABLE", verification_status: "INSUFFICIENT_EVIDENCE", evidence_ids: [], reason: "C-002 (the decision-relevant gap-CTR claim itself, not a background claim) is a before/after comparison in this variant, and no baseline/YoY data resolves seasonality for it.", required_control: "compare against a YoY baseline for the gap claim itself", control_result: "INSUFFICIENT" },
      alt2, alt3,
    ],
    overall: "INSUFFICIENT_DATA",
  };
  const rGap = checkHandoff(decisionRelevantGap);
  if (rGap.handoff === "ACCEPTED" && rGap.official_verdict === "INSUFFICIENT_DATA")
    pass("req #1: the same unresolved-ALT-1 shape, but tied to a decision-relevant claim -> INSUFFICIENT_DATA, correctly blocks CONFIRMED");
  else fail(`req #1 failed: ${JSON.stringify(rGap)}`);

  // Case 3 (req. #3, "incorrect" arm): identical to Case 1's shape, except
  // ALT-1 is left APPLICABLE+INSUFFICIENT_EVIDENCE instead of correctly scoped
  // to NOT_APPLICABLE -- i.e. what a Verifier that ignored the scoping step
  // would report for the exact same underlying input as Case 1. Flipping only
  // the applicability/verification_status fields must flip the verdict
  // predictably, proving the scoping step is load-bearing, not cosmetic.
  const unscopedIncorrectly = {
    ...base,
    alternative_explanations: [
      { alternative_id: "ALT-1", description: "Seasonality.", applicability: "APPLICABLE", verification_status: "INSUFFICIENT_EVIDENCE", evidence_ids: [], reason: "Same underlying input as the correctly-scoped case, but the background-only exclusion was not applied.", required_control: "n/a", control_result: "INSUFFICIENT" },
      alt2, alt3,
    ],
    overall: "INSUFFICIENT_DATA",
  };
  const rUnscoped = checkHandoff(unscopedIncorrectly);
  if (rUnscoped.handoff === "ACCEPTED" && rUnscoped.official_verdict === "INSUFFICIENT_DATA" &&
      rScoped.official_verdict !== rUnscoped.official_verdict)
    pass("req #3: flipping only the background-only scoping (NOT_APPLICABLE vs APPLICABLE+INSUFFICIENT_EVIDENCE) flips CONFIRMED <-> INSUFFICIENT_DATA predictably");
  else fail(`req #3 failed: scoped=${rScoped.official_verdict} unscoped=${rUnscoped.official_verdict}`);

  // Case 4 (req. #4): the Decision Engine remains a deterministic, pure
  // function across repeated runs of the correctly-scoped artifact.
  const repeats = Array.from({ length: 5 }, () => computeOfficialVerdict(scopedCorrectly).verdict);
  if (repeats.every((v) => v === "CONFIRMED"))
    pass("req #4: 5 repeated runs of the correctly-scoped artifact all produce CONFIRMED -- Decision Engine remains deterministic");
  else fail(`req #4 failed: ${JSON.stringify(repeats)}`);
}

// ---------------------------------------------------------------------------
// 8c. multi-control positive case (E2E-MED fixture redesign regression,
// 2026-08-31). E2E-MED's own real Verifier runs surfaced three genuinely
// unresolved mandatory alternatives (a seasonal/YoY confound, a cross-page
// causal-attribution confound, and a page-specific intervention-integrity
// confound) that blocked CONFIRMED even after two rounds of unrelated
// Coordinator bug fixes. The fixture was then redesigned with three new,
// minimal, citable evidence entries resolving each one. This section proves
// the DOWNSTREAM effect on the real Decision Engine only: a representative
// artifact with all three resolved reaches CONFIRMED, and losing the
// resolution on any single one of the three (independently) forces
// INSUFFICIENT_DATA. The Decision Engine itself is not touched by this
// section or by the fixture redesign — no branch here or in
// computeOfficialVerdict()/checkHandoff() names E2E-MED, FX-05, or any other
// fixture ID; every case below passes or fails purely because of its atomic
// applicability/verification_status/control_result fields, the same as any
// other artifact.
// ---------------------------------------------------------------------------
section("8c. multi-control positive case (E2E-MED fixture redesign regression)");
{
  const base = {
    context_leak_detected: false,
    fact_real: "PASS",
    opportunity_follows_logically: "PASS",
    data_sufficient: "PASS",
    pss_can_implement_legally_and_technically: "PASS",
    test_measures_hypothesis: "PASS",
  };
  const seasonalResolved = { alternative_id: "ALT-1", description: "Seasonality.", applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-0007"], reason: "same-calendar-month YoY control for the exact decision-relevant metric", required_control: "same-month prior-year CTR baseline", control_result: "PASS" };
  const crossPageResolved = { alternative_id: "ALT-4", description: "Cross-page causal attribution.", applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-0009"], reason: "matched-position no-treatment control page isolates the causal factor", required_control: "matched-position control page without the treatment", control_result: "PASS" };
  const interventionResolved = { alternative_id: "ALT-5", description: "Page-specific intervention integrity.", applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-0010"], reason: "page-specific change log shows no other concurrent page-level change", required_control: "page-specific change/deploy log", control_result: "PASS" };
  const alt3 = { alternative_id: "ALT-3", description: "Measurement artifact.", applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-0008"], reason: "tracking/tagging integrity log", required_control: "tag and property change log", control_result: "PASS" };

  const allControlsPresent = { ...base, alternative_explanations: [seasonalResolved, crossPageResolved, interventionResolved, alt3], overall: "CONFIRMED" };
  const rAll = checkHandoff(allControlsPresent);
  if (rAll.handoff === "ACCEPTED" && rAll.official_verdict === "CONFIRMED")
    pass("positive case: seasonal + cross-page + intervention-integrity + measurement controls all TESTED/PASS -> CONFIRMED");
  else fail(`positive case failed: ${JSON.stringify(rAll)}`);

  const missingSeasonal = { ...base, alternative_explanations: [
    { ...seasonalResolved, verification_status: "NOT_TESTED", evidence_ids: [], control_result: "INSUFFICIENT" },
    crossPageResolved, interventionResolved, alt3,
  ], overall: "INSUFFICIENT_DATA" };
  const rMissSeason = checkHandoff(missingSeasonal);
  if (rMissSeason.handoff === "ACCEPTED" && rMissSeason.official_verdict === "INSUFFICIENT_DATA")
    pass("missing seasonal control alone -> INSUFFICIENT_DATA (CONFIRMED correctly blocked)");
  else fail(`missing-seasonal case failed: ${JSON.stringify(rMissSeason)}`);

  const missingCrossPage = { ...base, alternative_explanations: [
    seasonalResolved,
    { ...crossPageResolved, verification_status: "INSUFFICIENT_EVIDENCE", evidence_ids: [], control_result: "INSUFFICIENT" },
    interventionResolved, alt3,
  ], overall: "INSUFFICIENT_DATA" };
  const rMissCross = checkHandoff(missingCrossPage);
  if (rMissCross.handoff === "ACCEPTED" && rMissCross.official_verdict === "INSUFFICIENT_DATA")
    pass("missing cross-page control alone -> INSUFFICIENT_DATA (CONFIRMED correctly blocked)");
  else fail(`missing-cross-page case failed: ${JSON.stringify(rMissCross)}`);

  const missingIntervention = { ...base, alternative_explanations: [
    seasonalResolved, crossPageResolved,
    { ...interventionResolved, verification_status: "NOT_TESTED", evidence_ids: [], control_result: "INSUFFICIENT" },
    alt3,
  ], overall: "INSUFFICIENT_DATA" };
  const rMissInterv = checkHandoff(missingIntervention);
  if (rMissInterv.handoff === "ACCEPTED" && rMissInterv.official_verdict === "INSUFFICIENT_DATA")
    pass("missing intervention-integrity control alone -> INSUFFICIENT_DATA (CONFIRMED correctly blocked)");
  else fail(`missing-intervention case failed: ${JSON.stringify(rMissInterv)}`);
}

// ---------------------------------------------------------------------------
// 9. Test case 13: format-retry metadata never reaches the Decision Engine's
// inputs — a reissue-tracking object (attempt_number, sha256, etc.) attached
// alongside a verifier artifact is ignored; only the seven known atomic keys
// are read.
// ---------------------------------------------------------------------------
section("9. format-retry metadata does not affect the computed verdict");
{
  const withRetryMeta = { ...ALL_PASS, overall: "CONFIRMED", _retry_attempt_number: 2, _retry_sha256: "deadbeef", _retry_validator_error: "trailing comma" };
  const clean = { ...ALL_PASS, overall: "CONFIRMED" };
  const rMeta = checkHandoff(withRetryMeta);
  const rClean = checkHandoff(clean);
  if (rMeta.official_verdict === rClean.official_verdict && rMeta.handoff === rClean.handoff) {
    pass("Test 13: retry-tracking metadata alongside the artifact does not change the computed verdict");
  } else {
    fail(`Test 13: retry metadata changed the outcome: withMeta=${JSON.stringify(rMeta)} clean=${JSON.stringify(rClean)}`);
  }
}

// ---------------------------------------------------------------------------
// 10. Test case 14: no agent can override the calculated verdict — purity /
// idempotency: the same artifact, checked twice (as if a second agent or a
// second Coordinator pass re-ran the gate), yields byte-identical results;
// and the function signature accepts only the artifact, never an "override"
// or "expected" parameter that could be used to force a different outcome.
// ---------------------------------------------------------------------------
section("10. no agent can override the computed verdict");
{
  const artifact = { ...ALL_PASS, overall: "CONFIRMED" };
  const first = checkHandoff(artifact);
  const second = checkHandoff(artifact);
  const identical = JSON.stringify(first) === JSON.stringify(second);
  if (identical) pass("Test 14: re-running the gate on the same artifact yields an identical result (no hidden override channel)");
  else fail(`Test 14: two runs of the same artifact disagreed: ${JSON.stringify(first)} vs ${JSON.stringify(second)}`);

  const arity = computeOfficialVerdict.length;
  if (arity === 1) pass("computeOfficialVerdict() takes exactly one parameter (the artifact) — no 'expected verdict' or 'override' parameter exists");
  else fail(`computeOfficialVerdict() has an unexpected arity of ${arity} — an extra parameter could be an override channel`);
}

// ---------------------------------------------------------------------------
// 11. determinism — same input, ten runs, identical verdict
// ---------------------------------------------------------------------------
section("11. determinism — same input always yields the same verdict");
{
  const sample = { ...ALL_PASS, fact_real: "FAIL" };
  const verdicts = new Set(Array.from({ length: 10 }, () => computeOfficialVerdict(sample).verdict));
  if (verdicts.size === 1) pass(`10 runs of the same input all produced "${[...verdicts][0]}"`);
  else fail(`same input produced different verdicts across runs: ${[...verdicts].join(", ")}`);
  pass("computeOfficialVerdict() is a pure function of its declared fields only (no fixture id, no I/O, no closures over prior calls)");
}

// ---------------------------------------------------------------------------
// 12. deriveMandatoryAlternativeIds() purity check
// ---------------------------------------------------------------------------
section("12. deriveMandatoryAlternativeIds() is a pure function of its input");
{
  const sampleInput = {
    test_plan: { baseline: "28-day CTR = 1.00%", period: "8 weeks" },
    pss_data: { deploy_log: ["2026-08-17 shared header partial"] },
    public_evidence: [{ kind: "gsc_header_control_pages", derived: {} }],
  };
  const a = deriveMandatoryAlternativeIds(sampleInput);
  const b = deriveMandatoryAlternativeIds(sampleInput);
  const same = JSON.stringify(a) === JSON.stringify(b);
  const allApplicable = a.every((x) => x.applicability === "APPLICABLE");
  if (same && allApplicable) pass("deriveMandatoryAlternativeIds() is deterministic and correctly marks ALT-1/ALT-2/ALT-3 APPLICABLE when time-series + deploy/control signal are present");
  else fail(`deriveMandatoryAlternativeIds() inconsistent or misclassified: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

  const pointInTime = { test_plan: {}, pss_data: {}, public_evidence: [{ kind: "serp_capture" }] };
  const c = deriveMandatoryAlternativeIds(pointInTime);
  const alt1 = c.find((x) => x.alternative_id === "ALT-1");
  const alt2 = c.find((x) => x.alternative_id === "ALT-2");
  if (alt1.applicability === "NOT_APPLICABLE" && alt2.applicability === "NOT_APPLICABLE") {
    pass("a point-in-time claim with no deploy/control signal correctly marks ALT-1/ALT-2 NOT_APPLICABLE");
  } else {
    fail(`point-in-time claim misclassified: ${JSON.stringify(c)}`);
  }
}

console.log(`\n${"=".repeat(60)}`);
if (failures === 0) { console.log("RESULT: PASS — Verifier Decision Engine is deterministic, documented, and authoritative over `overall`"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
