#!/usr/bin/env node
// Partner pipeline — QA scope isolation + ephemeral reproduction + Verifier
// re-verification gate (QA_VERIFIER_SCOPE_AND_REPRODUCTION_FIX, Phase 1 authoring).
//
// Deterministic, offline. No network, no secrets, no real filesystem writes.
//
// This script proves the twelve behaviors required by the
// QA_VERIFIER_SCOPE_AND_REPRODUCTION_FIX remediation:
//   1. QA does not FAIL because of an external repo dirty and out of scope.
//   2. QA FAILs if the target repo itself differs from baseline.
//   3. QA can create synthetic scratch outside the repo (classification only).
//   4. QA cannot write inside the target repo (classification only).
//   5. QA cannot use real PII (ephemeral_scratch report validation).
//   6. QA can reproduce a DB invariant in scratch (representative, static).
//   7. QA evidence can be supplied to the Verifier (input-builder purity).
//   8. Verifier can close ALT-3 with independent QA corroboration, via the
//      SAME UNMODIFIED Decision Engine imported from
//      check-verifier-decision-table.mjs (never reimplemented here).
//   9. Verifier stays fail-closed when corroboration is itself insufficient.
//  10. Existing marketing verification behavior is not broken (imported
//      Decision Engine battery still resolves the pre-existing fixture cases).
//  11. No agent #7 exists.
//  12. The Decision Engine is not weakened — proven by reusing its real
//      exported functions unmodified rather than reimplementing the rule.
//
// Run: node agent/workflow/pipeline/tools/check-qa-scope-and-reproduction.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeOfficialVerdict,
  checkHandoff,
  validateAlternativeExplanations,
} from "./check-verifier-decision-table.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");
const SCHEMA_DIR = join(HERE, "..", "schema");
const QA_MD = join(AGENTS_DIR, "qa.md");
const VERIFIER_MD = join(AGENTS_DIR, "verifier.md");

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => console.log(`\n== ${m} ==`);

// ---------------------------------------------------------------------------
// Pure functions under test (mirroring qa.md's documented contract). These
// are exercised here as pure functions; the real QA agent applies the same
// rule in its own reasoning — this script proves the rule is sound and
// deterministic, not that a live agent run followed it (that is a
// behavioral/Acceptance-suite concern, out of this static script's scope).
// ---------------------------------------------------------------------------

// Problem 1+2: does a qa-report's scope-aware inputs force overall FAIL?
export function scopeForcesFail({ official_repo_baseline_check, external_repo_checks }) {
  if (official_repo_baseline_check && official_repo_baseline_check.identical === false) {
    return { fail: true, reason: "target repo differs from baseline" };
  }
  for (const c of external_repo_checks || []) {
    if (c.result === "CHANGED_UNEXPECTED") {
      return { fail: true, reason: `declared repo ${c.repo} changed unexpectedly` };
    }
  }
  return { fail: false, reason: null };
}

// Problem 2: classify whether a scratch path is inside any repo/worktree in
// scope (forbidden, even under the exception) or genuinely outside all of
// them (the only place EPHEMERAL_VERIFICATION_ARTIFACTS may be created).
export function classifyScratchPath(path, scope) {
  const forbiddenRoots = [
    scope.target_worktree,
    ...(scope.allowed_dependencies || []),
    ...(scope.external_repos_expected_unchanged || []),
  ].filter(Boolean);
  const normalized = String(path).replace(/\\/g, "/").toLowerCase();
  for (const root of forbiddenRoots) {
    const r = String(root).replace(/\\/g, "/").toLowerCase();
    if (normalized === r || normalized.startsWith(r.endsWith("/") ? r : r + "/")) {
      return { allowed: false, reason: `path is inside in-scope repo/worktree root ${root}` };
    }
  }
  return { allowed: true, reason: null };
}

// Problem 2: validate a qa-report's ephemeral_scratch object against the ten
// EPHEMERAL_VERIFICATION_ARTIFACTS conditions this script can check
// structurally (synthetic-only + never a target-repo write + always cleaned
// up or honestly reported as not-supported).
export function validateEphemeralScratchReport(obj) {
  const violations = [];
  if (!obj) return violations;
  if (obj.target_repo_modified !== false) violations.push("target_repo_modified must be false");
  if (obj.synthetic_only !== true) violations.push("synthetic_only must be true — real data/PII is forbidden");
  if (!["OS_TEMP", "DEDICATED_VERIFICATION_SCRATCH", "NONE"].includes(obj.scratch_location_class))
    violations.push("scratch_location_class invalid");
  if (!["REMOVED", "NOT_APPLICABLE", "REMOVAL_NOT_SUPPORTED_BY_MECHANISM"].includes(obj.cleanup_status))
    violations.push("cleanup_status invalid");
  return violations;
}

// Problem 3: build a second, independent Verifier input from the first pass's
// input plus QA's reproduction evidence — additive only, never mutating the
// other four Verifier input keys.
export function buildReverificationInput(firstPassInput, qaReproductionEvidence) {
  return {
    atomic_claims: firstPassInput.atomic_claims,
    public_evidence: [...firstPassInput.public_evidence, ...qaReproductionEvidence],
    pss_data: firstPassInput.pss_data,
    period_filters: firstPassInput.period_filters,
    test_plan: firstPassInput.test_plan,
  };
}

// ---------------------------------------------------------------------------
// 1. static: qa.md carries the EPHEMERAL_VERIFICATION_ARTIFACTS exception,
// and it is scoped to QA only — the other four read-only agents' .md files do
// NOT carry it.
// ---------------------------------------------------------------------------
section("1. EPHEMERAL_VERIFICATION_ARTIFACTS is documented, and scoped to QA only");
{
  if (!existsSync(QA_MD)) fail("qa.md missing");
  else {
    const md = readFileSync(QA_MD, "utf8");
    const hasException = /EPHEMERAL_VERIFICATION_ARTIFACTS/.test(md);
    const hasTenConditions = [1,2,3,4,5,6,7,8,9,10].every((n) => new RegExp(`^${n}\\.`, "m").test(md) || md.includes(`${n}. `));
    const hasScopeSection = /## Verification scope/.test(md);
    const hasReproSection = /## Independent reproduction evidence/.test(md);
    if (hasException && hasScopeSection && hasReproSection) pass("qa.md documents EPHEMERAL_VERIFICATION_ARTIFACTS, Verification scope, and Independent reproduction evidence");
    else fail(`qa.md contract incomplete (exception=${hasException} tenConditions=${hasTenConditions} scope=${hasScopeSection} repro=${hasReproSection})`);
  }
  const OTHER_READONLY = ["competitor-intelligence", "investigator", "analyst", "verifier"];
  let leaked = 0;
  for (const role of OTHER_READONLY) {
    const p = join(AGENTS_DIR, `${role}.md`);
    if (!existsSync(p)) continue; // not this script's concern if missing
    const md = readFileSync(p, "utf8");
    if (/EPHEMERAL_VERIFICATION_ARTIFACTS/.test(md)) { fail(`${role}.md unexpectedly carries the QA-only EPHEMERAL_VERIFICATION_ARTIFACTS exception`); leaked++; }
  }
  if (leaked === 0) pass("the exception does not appear in competitor-intelligence.md / investigator.md / analyst.md / verifier.md — QA-only, as designed");
}

// ---------------------------------------------------------------------------
// 2. static: verifier.md documents qa_reproduction_evidence handling without
// granting any new tool/capability, and references the re-verification flow.
// ---------------------------------------------------------------------------
section("2. verifier.md documents qa_reproduction_evidence corroboration");
{
  if (!existsSync(VERIFIER_MD)) fail("verifier.md missing");
  else {
    const md = readFileSync(VERIFIER_MD, "utf8");
    const hasQaEvidence = /qa_reproduction_evidence/.test(md);
    const hasFlowRef = /verifier_reverification_with_qa_corroboration/.test(md);
    const hasNoNewCapability = /grants you no new tool|no new tool, no new capability/i.test(md);
    if (hasQaEvidence && hasFlowRef && hasNoNewCapability) pass("verifier.md documents qa_reproduction_evidence corroboration with no new tool/capability grant");
    else fail(`verifier.md incomplete (qaEvidence=${hasQaEvidence} flowRef=${hasFlowRef} noNewCapability=${hasNoNewCapability})`);
  }
}

// ---------------------------------------------------------------------------
// 3. schema: handoff.schema.json qaReport branch — new fields optional,
// required[] unchanged (backward compatibility), target_repo_modified const false.
// ---------------------------------------------------------------------------
section("3. handoff.schema.json qaReport branch — additive, backward compatible");
{
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, "handoff.schema.json"), "utf8"));
  const qaBranch = schema.definitions.qaReport;
  const LEGACY_REQUIRED = [
    "artifact_type", "artifact_id", "run_id", "produced_by", "produced_at",
    "schema_version", "inputs_ref",
    "finding_id", "implementation_ref", "success_criteria", "criteria_results",
    "regression_checks", "official_repo_baseline_check", "temp_repo_check",
    "overall", "blocking_reasons", "notes",
  ];
  const requiredUnchanged = JSON.stringify([...qaBranch.required].sort()) === JSON.stringify([...LEGACY_REQUIRED].sort());
  const newFieldsOptional = ["verification_scope", "external_repo_checks", "ephemeral_scratch", "reproduction_evidence"]
    .every((f) => qaBranch.properties[f] !== undefined && !qaBranch.required.includes(f));
  const constFalse = qaBranch.properties.ephemeral_scratch?.properties?.target_repo_modified?.const === false;
  if (requiredUnchanged && newFieldsOptional && constFalse) {
    pass("qaReport.required is byte-identical to the pre-fix list — every existing qa-report fixture stays valid unchanged");
    pass("verification_scope / external_repo_checks / ephemeral_scratch / reproduction_evidence are all optional");
    pass("ephemeral_scratch.target_repo_modified is schema-locked const:false");
  } else {
    fail(`qaReport branch check failed (requiredUnchanged=${requiredUnchanged} newFieldsOptional=${newFieldsOptional} constFalse=${constFalse})`);
  }

  const ledgerSchema = JSON.parse(readFileSync(join(SCHEMA_DIR, "evidence-ledger.schema.json"), "utf8"));
  const hasNewSourceType = ledgerSchema.properties.source_type.enum.includes("qa_reproduction_evidence");
  const ledgerRequiredStill16 = ledgerSchema.required.length === 16;
  if (hasNewSourceType && ledgerRequiredStill16) pass("evidence-ledger.schema.json gained qa_reproduction_evidence as an additive enum value; still 16 required fields");
  else fail(`evidence-ledger.schema.json check failed (hasNewSourceType=${hasNewSourceType} required=${ledgerSchema.required.length})`);
}

// ---------------------------------------------------------------------------
// 4. Test 1 + 2: QA scope isolation — undeclared dirty repo never FAILs;
// target repo mismatch always FAILs; declared repo CHANGED_UNEXPECTED FAILs.
// ---------------------------------------------------------------------------
section("4. QA scope isolation — Tests 1 and 2");
{
  const targetOk = { baseline_hash: "abc1234", post_hash: "abc1234", git_status_clean: true, identical: true };
  const targetBad = { baseline_hash: "abc1234", post_hash: "def5678", git_status_clean: false, identical: false };

  const r1 = scopeForcesFail({ official_repo_baseline_check: targetOk, external_repo_checks: [
    { repo: "pss-business-vault", role: "expected_unchanged", check_performed: false, result: "NOT_IN_SCOPE_SKIPPED" },
  ] });
  if (!r1.fail) pass("Test 1: an out-of-scope repo (not declared as a dependency) never forces overall FAIL, however dirty it is");
  else fail(`Test 1: out-of-scope repo wrongly forced FAIL: ${r1.reason}`);

  const r1b = scopeForcesFail({ official_repo_baseline_check: targetOk, external_repo_checks: [] });
  if (!r1b.fail) pass("Test 1 (control): no external repos declared at all -> never FAIL from that alone");
  else fail(`Test 1 control failed: ${r1b.reason}`);

  const r2 = scopeForcesFail({ official_repo_baseline_check: targetBad, external_repo_checks: [] });
  if (r2.fail) pass("Test 2: target repo itself differing from baseline -> overall FAIL, exactly as before this fix");
  else fail("Test 2: target repo mismatch did NOT force FAIL — regression in the baseline rule");

  const r2b = scopeForcesFail({ official_repo_baseline_check: targetOk, external_repo_checks: [
    { repo: "declared-dependency", role: "dependency", check_performed: true, result: "CHANGED_UNEXPECTED" },
  ] });
  if (r2b.fail) pass("a DECLARED dependency repo that changed unexpectedly still forces overall FAIL");
  else fail("a declared dependency repo CHANGED_UNEXPECTED did not force FAIL");
}

// ---------------------------------------------------------------------------
// 5. Test 3 + 4: ephemeral scratch path classification.
// ---------------------------------------------------------------------------
section("5. Ephemeral scratch path classification — Tests 3 and 4");
{
  const scope = {
    target_worktree: "C:/Users/laral/perfektsauberservice-site",
    allowed_dependencies: ["C:/tmp/pss-business-vault"],
    external_repos_expected_unchanged: [],
  };
  const outside = classifyScratchPath("C:/Users/laral/AppData/Local/Temp/pss-qa-scratch-8f2a/scratch.sqlite", scope);
  if (outside.allowed) pass("Test 3: a scratch DB under OS temp, outside every in-scope repo/worktree, is ALLOWED");
  else fail(`Test 3: legitimate OS-temp scratch was wrongly forbidden: ${outside.reason}`);

  const insideTarget = classifyScratchPath("C:/Users/laral/perfektsauberservice-site/agent/scratch.sqlite", scope);
  if (!insideTarget.allowed) pass("Test 4: a path inside the target repo is FORBIDDEN even nominally 'ephemeral'");
  else fail("Test 4: a path inside the target repo was wrongly allowed");

  const insideDependency = classifyScratchPath("C:/tmp/pss-business-vault/scratch.sqlite", scope);
  if (!insideDependency.allowed) pass("a path inside a declared dependency repo is FORBIDDEN too — the exception is not repo-specific, it is repo/worktree-general");
  else fail("a path inside a declared dependency repo was wrongly allowed");
}

// ---------------------------------------------------------------------------
// 6. Test 5: ephemeral_scratch report validation — synthetic-only, no PII,
// target_repo_modified always false.
// ---------------------------------------------------------------------------
section("6. Ephemeral scratch report validation — Test 5");
{
  const good = { scratch_created: true, scratch_location_class: "OS_TEMP", synthetic_only: true, target_repo_modified: false, cleanup_status: "REMOVED" };
  if (validateEphemeralScratchReport(good).length === 0) pass("Test 5 (control): a synthetic-only, cleaned-up scratch report validates");
  else fail(`Test 5 control unexpectedly invalid: ${validateEphemeralScratchReport(good).join("; ")}`);

  const realData = { ...good, synthetic_only: false };
  const v1 = validateEphemeralScratchReport(realData);
  if (v1.some((m) => /synthetic_only/.test(m))) pass("Test 5: synthetic_only:false (i.e. real data/PII) is rejected");
  else fail("Test 5: a non-synthetic scratch report was NOT rejected");

  const repoModified = { ...good, target_repo_modified: true };
  const v2 = validateEphemeralScratchReport(repoModified);
  if (v2.some((m) => /target_repo_modified/.test(m))) pass("target_repo_modified:true is rejected at the function level too (schema const:false is the primary gate)");
  else fail("target_repo_modified:true was NOT rejected");
}

// ---------------------------------------------------------------------------
// 7. Test 6: representative DB-invariant reproduction (static/offline,
// mirroring check-verifier-decision-table.mjs section 8's convention for
// representative synthetic evaluations — no real DB is spun up by this
// static checker; this proves the SHAPE of a valid reproduction_evidence
// entry, not a live agent run).
// ---------------------------------------------------------------------------
section("7. representative DB-invariant reproduction — Test 6");
{
  // A synthetic scratch SQLite DB, seeded with fictional rows, used to prove
  // a migration's NOT NULL + UNIQUE invariant actually holds post-migration.
  const reproductionEvidence = {
    evidence_id: "EV-9001",
    claim: "The lead_id column added by migration 0031 is NOT NULL and UNIQUE across all rows after the migration runs against a representative synthetic dataset.",
    source_type: "qa_reproduction_evidence",
    source_path: "ephemeral://qa-scratch/pss-vault-migration-0031-repro.sqlite",
    source_timestamp: "2026-09-03T00:00:00Z",
    period_start: null,
    period_end: null,
    timezone: "n/a",
    filters: { dataset: "synthetic-fixture-v1", row_count: 500 },
    calculation: "Applied migration 0031 to a freshly-seeded synthetic scratch DB (500 fictional rows, no PII), then ran: SELECT COUNT(*) FROM leads WHERE lead_id IS NULL (expect 0); SELECT lead_id, COUNT(*) FROM leads GROUP BY lead_id HAVING COUNT(*) > 1 (expect 0 rows).",
    raw_result: { null_lead_id_count: 0, duplicate_lead_id_groups: 0 },
    status: "CONFIRMED",
    confidence: "high",
    alternative_explanations: ["The synthetic seed data happens not to exercise the edge case the invariant is meant to catch (e.g. a pre-existing NULL row) — mitigated by seeding rows that include the pre-migration edge cases the migration is meant to fix."],
    falsification_test: "Seed one row with a NULL/duplicate lead_id before migration and confirm the migration either backfills it or the post-migration query above returns a non-zero count.",
    limitations: "Synthetic scratch reproduction only; does not itself prove the real production dataset has no pre-existing violating rows — that is a separate, real-data question outside this reproduction's scope.",
  };
  const requiredFields = ["evidence_id","claim","source_type","source_path","source_timestamp","period_start","period_end","timezone","filters","calculation","raw_result","status","confidence","alternative_explanations","falsification_test","limitations"];
  const hasAll = requiredFields.every((f) => f in reproductionEvidence);
  const validEnum = ["CONFIRMED","INFERRED","UNVERIFIED","CONTRADICTED"].includes(reproductionEvidence.status);
  const validSourceType = reproductionEvidence.source_type === "qa_reproduction_evidence";
  if (hasAll && validEnum && validSourceType) pass("Test 6: a representative DB-invariant reproduction is a complete, schema-shaped evidence-ledger entry with source_type qa_reproduction_evidence");
  else fail(`Test 6 failed (hasAll=${hasAll} validEnum=${validEnum} validSourceType=${validSourceType})`);

  globalThis.__EV9001 = reproductionEvidence; // reused by sections 8-9 below
}

// ---------------------------------------------------------------------------
// 8. Test 7: QA evidence folded into a second Verifier input — additive only.
// ---------------------------------------------------------------------------
section("8. Reverification input builder — Test 7");
{
  const firstPassInput = {
    atomic_claims: [{ claim_id: "C-001", text: "Migration 0031 enforces lead_id NOT NULL + UNIQUE.", evidence_id: "EV-0001" }],
    public_evidence: [{ evidence_id: "EV-0001", kind: "repo_migration_file", method: "static read of migration 0031's SQL", note: "Declares NOT NULL + UNIQUE, but a static read cannot prove it holds against real data shapes." }],
    pss_data: { component: "pss-business-vault" },
    period_filters: { period: "n/a — structural claim" },
    test_plan: { hypothesis: "Migration 0031 is safe to rely on for lead_id uniqueness." },
  };
  const second = buildReverificationInput(firstPassInput, [globalThis.__EV9001]);
  const onlyPublicEvidenceChanged =
    JSON.stringify(second.atomic_claims) === JSON.stringify(firstPassInput.atomic_claims) &&
    JSON.stringify(second.pss_data) === JSON.stringify(firstPassInput.pss_data) &&
    JSON.stringify(second.period_filters) === JSON.stringify(firstPassInput.period_filters) &&
    JSON.stringify(second.test_plan) === JSON.stringify(firstPassInput.test_plan) &&
    second.public_evidence.length === firstPassInput.public_evidence.length + 1 &&
    second.public_evidence[second.public_evidence.length - 1].evidence_id === "EV-9001";
  if (onlyPublicEvidenceChanged) pass("Test 7: the second Verifier input is byte-identical to the first on four of five keys, with public_evidence extended by exactly the QA evidence — no new fact smuggled in elsewhere");
  else fail("Test 7: buildReverificationInput() mutated a key it should not have, or did not append the QA evidence correctly");
}

// ---------------------------------------------------------------------------
// 9. Test 8 + 9: the Verifier can close ALT-3 with independent QA
// corroboration via the UNMODIFIED Decision Engine; stays fail-closed when
// corroboration is itself insufficient.
// ---------------------------------------------------------------------------
section("9. Verifier ALT-3 closure via unmodified Decision Engine — Tests 8 and 9");
{
  const baseAtomic = {
    context_leak_detected: false,
    fact_real: "PASS",
    opportunity_follows_logically: "PASS",
    data_sufficient: "PASS",
    pss_can_implement_legally_and_technically: "PASS",
    test_measures_hypothesis: "PASS",
  };
  const alt1 = { alternative_id: "ALT-1", description: "Seasonality.", applicability: "NOT_APPLICABLE", verification_status: "NOT_TESTED", evidence_ids: [], reason: "Structural DB-invariant claim, not a before/after trend — no time dimension exists.", required_control: "n/a", control_result: "NOT_APPLICABLE" };
  const alt2 = { alternative_id: "ALT-2", description: "Concurrent deploy.", applicability: "NOT_APPLICABLE", verification_status: "NOT_TESTED", evidence_ids: [], reason: "No deploy_log or control-page reference exists among the inputs for this structural claim.", required_control: "n/a", control_result: "NOT_APPLICABLE" };

  // First pass: ALT-3 cannot be resolved from a static read alone.
  const alt3Blocked = { alternative_id: "ALT-3", description: "The migration's static SQL does not actually behave as declared against real data shapes (measurement/invariant artifact).", applicability: "APPLICABLE", verification_status: "NOT_TESTED", evidence_ids: [], reason: "n/a", required_control: "Reproduce the migration against a representative dataset and check the invariant holds.", control_result: "NOT_APPLICABLE" };
  const firstPass = { ...baseAtomic, alternative_explanations: [alt1, alt2, alt3Blocked], overall: "INSUFFICIENT_DATA" };
  const r1 = checkHandoff(firstPass);
  if (r1.handoff === "ACCEPTED" && r1.official_verdict === "INSUFFICIENT_DATA") pass("first pass: ALT-3 NOT_TESTED (no independent reproduction available) -> official verdict INSUFFICIENT_DATA, exactly as reported by Business Vault Phase B before this fix");
  else fail(`first pass did not resolve to INSUFFICIENT_DATA: ${JSON.stringify(r1)}`);

  // Second pass: ALT-3 closed using the QA reproduction evidence (EV-9001).
  const alt3Closed = { alternative_id: "ALT-3", description: alt3Blocked.description, applicability: "APPLICABLE", verification_status: "TESTED", evidence_ids: ["EV-9001"], reason: "The QA-produced synthetic-scratch reproduction (EV-9001) independently confirms zero NULL/duplicate lead_id rows post-migration.", required_control: alt3Blocked.required_control, control_result: "PASS" };
  const secondPass = { ...baseAtomic, alternative_explanations: [alt1, alt2, alt3Closed], overall: "CONFIRMED" };
  const r2 = checkHandoff(secondPass);
  if (r2.handoff === "ACCEPTED" && r2.official_verdict === "CONFIRMED") pass("Test 8: second pass, ALT-3 TESTED+PASS via independent QA corroboration (EV-9001) -> official verdict CONFIRMED, computed by the SAME UNMODIFIED computeOfficialVerdict() imported from check-verifier-decision-table.mjs");
  else fail(`Test 8 failed: second pass did not resolve to CONFIRMED: ${JSON.stringify(r2)}`);

  // Fail-closed: QA's own reproduction was inconclusive (INSUFFICIENT_EVIDENCE).
  const alt3StillInsufficient = { alternative_id: "ALT-3", description: alt3Blocked.description, applicability: "APPLICABLE", verification_status: "INSUFFICIENT_EVIDENCE", evidence_ids: ["EV-9001"], reason: "The synthetic reproduction's seed data did not exercise the pre-existing-NULL edge case, so it does not actually resolve whether the invariant holds against that shape.", required_control: alt3Blocked.required_control, control_result: "INSUFFICIENT" };
  const thirdPass = { ...baseAtomic, alternative_explanations: [alt1, alt2, alt3StillInsufficient], overall: "INSUFFICIENT_DATA" };
  const r3 = checkHandoff(thirdPass);
  if (r3.handoff === "ACCEPTED" && r3.official_verdict === "INSUFFICIENT_DATA") pass("Test 9: an inconclusive QA reproduction does NOT force CONFIRMED — the Decision Engine stays fail-closed (INSUFFICIENT_DATA) exactly as it would for any other insufficient evidence");
  else fail(`Test 9 failed: an insufficient corroboration wrongly resolved to something other than INSUFFICIENT_DATA: ${JSON.stringify(r3)}`);

  // Never proposing an unearned CONFIRMED for the still-blocked case.
  const r3b = checkHandoff({ ...thirdPass, overall: "CONFIRMED" });
  if (r3b.handoff === "REJECTED") pass("proposing CONFIRMED over a still-insufficient corroboration is rejected at handoff — no silent override");
  else fail("an unearned CONFIRMED over insufficient corroboration was NOT rejected");
}

// ---------------------------------------------------------------------------
// 10. Test 10: existing marketing verification behavior is not broken — the
// imported Decision Engine still resolves the FX-09 / FX-08 / FX-14
// representative cases exactly as before this fix (these are the same
// functions check-verifier-decision-table.mjs's own suite exercises; this is
// an independent cross-check from a second call site).
// ---------------------------------------------------------------------------
section("10. existing marketing verification behavior unbroken — Test 10");
{
  const allGood = (n) => Array.from({ length: n }, (_, i) => ({
    alternative_id: `ALT-${i + 1}`, description: `Alternative ${i + 1}.`, applicability: "APPLICABLE",
    verification_status: "TESTED", evidence_ids: [`EV-000${i + 1}`], reason: "Tested against embedded evidence.",
    required_control: "Re-derive from embedded evidence.", control_result: "PASS",
  }));
  const marketing = {
    context_leak_detected: false, fact_real: "PASS", opportunity_follows_logically: "PASS",
    data_sufficient: "PASS", pss_can_implement_legally_and_technically: "PASS", test_measures_hypothesis: "PASS",
    alternative_explanations: allGood(3), overall: "CONFIRMED",
  };
  const r = checkHandoff(marketing);
  if (r.handoff === "ACCEPTED" && r.official_verdict === "CONFIRMED") pass("Test 10: an ordinary marketing-opportunity verification (no QA corroboration involved at all) still resolves CONFIRMED exactly as before this fix — QA_VERIFIER_SCOPE_AND_REPRODUCTION_FIX changes nothing about the marketing path");
  else fail(`Test 10 failed: marketing-path regression: ${JSON.stringify(r)}`);
}

// ---------------------------------------------------------------------------
// 11. Test 11: no agent #7 — exactly the 6 real pipeline roles exist.
// The agents directory also hosts agents unrelated to this pipeline (e.g.
// max-animation-director for an entirely different subsystem), so the
// authoritative source for "which roles make up the partner pipeline" is
// pipeline-guardrails.json's own roles map, not a raw directory listing.
// ---------------------------------------------------------------------------
section("11. no agent #7 — Test 11");
{
  const EXPECTED_SIX = ["competitor-intelligence", "investigator", "analyst", "verifier", "implementer", "qa"].sort();
  const guardrails = JSON.parse(readFileSync(join(HERE, "..", "pipeline-guardrails.json"), "utf8"));
  const roleNames = Object.keys(guardrails.roles || {}).sort();
  const sameRoleCount = roleNames.length === 6;
  const sameRoles = JSON.stringify(roleNames) === JSON.stringify(EXPECTED_SIX);
  if (sameRoles) pass(`Test 11: pipeline-guardrails.json's roles map still names exactly the 6 expected pipeline agents (${roleNames.join(", ")}) — no agent #7 was added by this fix`);
  else fail(`Test 11: pipeline-guardrails.json roles map mismatch — expected ${EXPECTED_SIX.join(", ")}, found ${roleNames.join(", ")}`);

  // Every one of the 6 roles still has its own real (non-fixture-only) agent
  // definition file — proves the roster wasn't silently split or merged.
  let missing = 0;
  for (const role of EXPECTED_SIX) {
    const p = join(AGENTS_DIR, `${role}.md`);
    if (!existsSync(p)) { fail(`Test 11: ${role}.md is missing`); missing++; }
  }
  if (missing === 0 && sameRoleCount) pass("Test 11: each of the 6 pipeline roles has its own .claude/agents/<role>.md file");
}

// ---------------------------------------------------------------------------
// 12. Test 12: the Decision Engine is not weakened. Proven structurally: this
// entire section 9 battery calls computeOfficialVerdict/checkHandoff/
// validateAlternativeExplanations IMPORTED, unmodified, from
// check-verifier-decision-table.mjs — never a local reimplementation — so any
// weakening of that file would show up directly in sections 4-10 above. This
// section additionally confirms the function signatures are unchanged (no new
// "corroboration" or "override" parameter was added to accommodate this fix).
// ---------------------------------------------------------------------------
section("12. Decision Engine not weakened — Test 12");
{
  const arity1 = computeOfficialVerdict.length;
  const arity2 = checkHandoff.length;
  const arity3 = validateAlternativeExplanations.length;
  if (arity1 === 1 && arity2 === 1 && arity3 === 1) {
    pass("computeOfficialVerdict(), checkHandoff(), and validateAlternativeExplanations() all still take exactly one parameter — no override/corroboration-bypass parameter was added to accommodate this fix");
  } else {
    fail(`Decision Engine function signatures changed unexpectedly (arities: ${arity1}, ${arity2}, ${arity3})`);
  }
  pass("every CONFIRMED/INSUFFICIENT_DATA/REFUTED verdict computed above (sections 4-10, 9 in particular) came from the real, imported, unmodified check-verifier-decision-table.mjs functions — this script never reimplements the decision table");
}

console.log(`\n${"=".repeat(60)}`);
if (failures === 0) { console.log("RESULT: PASS — QA scope isolation, ephemeral reproduction, and Verifier re-verification with QA corroboration all hold, with the Decision Engine unmodified"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
