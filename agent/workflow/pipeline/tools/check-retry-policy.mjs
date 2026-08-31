#!/usr/bin/env node
// Partner pipeline — bounded format-retry gate (Phase 1 authoring).
//
// Deterministic, offline. No network, no secrets, no real agent invocation.
//
// Rule (pipeline-guardrails.json -> format_retry_policy): a reply that fails
// STRICT-JSON-GATE (parse/format) or handoff.schema.json (schema) is REJECTED
// before handoff and never forwarded. The SAME agent may be reissued at most
// twice with the byte-identical original input, the same schema, and the exact
// validator error — no new fact, no new semantic information, no hint at the
// expected verdict. Recovery within budget is reported as PASS_RECOVERED,
// distinct from a clean first-try PASS. Exhausting all three attempts
// (attempt_1 + retry_1 + retry_2) is BLOCKED, never a forced PASS. This never
// applies to a semantic outcome (qa FAIL, verifier REFUTED, ...) — those route
// back through the normal Coordinator decision flow instead.
//
// Run: node agent/workflow/pipeline/tools/check-retry-policy.mjs

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictAgentJson } from "./check-json-output.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const PIPELINE = join(HERE, "..");
const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");
const GUARDRAILS = join(PIPELINE, "pipeline-guardrails.json");
const ALL_AGENTS = ["competitor-intelligence", "investigator", "analyst", "verifier", "implementer", "qa"];

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => console.log(`\n== ${m} ==`);

// ---------------------------------------------------------------------------
// 1. static: pipeline-guardrails.json carries the format_retry_policy contract
// ---------------------------------------------------------------------------
section("1. format_retry_policy documented in pipeline-guardrails.json");
let guardrails;
try {
  guardrails = JSON.parse(readFileSync(GUARDRAILS, "utf8"));
  pass("pipeline-guardrails.json parses");
} catch (e) {
  fail(`pipeline-guardrails.json does not parse: ${e.message}`);
  guardrails = {};
}
{
  const p = guardrails.format_retry_policy;
  if (!p) {
    fail("pipeline-guardrails.json missing top-level key 'format_retry_policy'");
  } else {
    if (p.max_attempts_total !== 3) fail(`max_attempts_total is ${p.max_attempts_total}, expected 3`);
    else pass("max_attempts_total == 3");
    if (!Array.isArray(p.attempt_labels) || p.attempt_labels.length !== 3)
      fail("attempt_labels is not a 3-element array");
    else pass("attempt_labels has 3 entries (attempt_1, retry_1, retry_2)");
    const trigger = String(p.trigger || "");
    if (!/format\/parse/i.test(trigger) || !/schema/i.test(trigger) || !/NEVER/i.test(trigger))
      fail("trigger text does not clearly restrict to format/parse/schema failures only");
    else pass("trigger restricted to format/parse/schema failures, semantic outcomes explicitly excluded");
    const mustNot = p.reissue_rule?.must_not_include || [];
    const hasNoNewFact = mustNot.some((s) => /new fact/i.test(s));
    const hasNoHint = mustNot.some((s) => /hint/i.test(s) && /verdict|value|decision/i.test(s));
    if (!hasNoNewFact) fail("reissue_rule.must_not_include lacks a 'no new fact' clause");
    if (!hasNoHint) fail("reissue_rule.must_not_include lacks a 'no hint at the expected verdict' clause");
    if (hasNoNewFact && hasNoHint) pass("reissue_rule bars new facts and verdict/value/decision hints");
    if (p.on_exhaustion?.result !== "BLOCKED") fail("on_exhaustion.result is not 'BLOCKED'");
    else pass("on_exhaustion.result == BLOCKED");
    if (p.on_recovery?.result_label !== "PASS_RECOVERED") fail("on_recovery.result_label is not 'PASS_RECOVERED'");
    else pass("on_recovery.result_label == PASS_RECOVERED");
  }
}

// ---------------------------------------------------------------------------
// 2. static: each agent's body carries the format-retry reissue contract
// ---------------------------------------------------------------------------
section("2. format-retry reissue note present in each agent");
for (const role of ALL_AGENTS) {
  const p = join(AGENTS_DIR, `${role}.md`);
  if (!existsSync(p)) { fail(`${role}.md missing`); continue; }
  const md = readFileSync(p, "utf8");
  const hasHeading = /##\s*Format-retry reissue/i.test(md);
  const namesTrigger = /STRICT-JSON-GATE.*schema validation|schema validation.*STRICT-JSON-GATE/is.test(md);
  const neverSemantic = /never\s+for a semantic disagreement/i.test(md);
  const byteIdentical = /byte-identical/i.test(md);
  const budget = /at most two such reissues/i.test(md);
  const blockedOnExhaustion = /the run is\s+`BLOCKED`/i.test(md);
  const complete = hasHeading && namesTrigger && neverSemantic && byteIdentical && budget && blockedOnExhaustion;
  if (complete) pass(`${role}: format-retry reissue note complete`);
  else fail(`${role}: format-retry reissue note incomplete (heading=${hasHeading} trigger=${namesTrigger} neverSemantic=${neverSemantic} byteIdentical=${byteIdentical} budget=${budget} blocked=${blockedOnExhaustion})`);
}

// ---------------------------------------------------------------------------
// The protocol as a pure function.
// ---------------------------------------------------------------------------
const TEST_SCHEMA = {
  required: ["artifact_type", "value"],
  properties: { artifact_type: { const: "test-artifact" }, value: { type: "number" } },
  additionalProperties: false,
};

function validateAgainstTestSchema(value) {
  for (const k of TEST_SCHEMA.required) if (!(k in value)) return { ok: false, reason: `missing required key "${k}"` };
  for (const k of Object.keys(value)) if (!(k in TEST_SCHEMA.properties)) return { ok: false, reason: `unexpected key "${k}" (additionalProperties:false)` };
  if (value.artifact_type !== "test-artifact") return { ok: false, reason: `artifact_type "${value.artifact_type}" != const "test-artifact"` };
  if (typeof value.value !== "number") return { ok: false, reason: `value is not a number` };
  return { ok: true };
}

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// Runs the bounded retry protocol over a sequence of raw reply strings
// (attempt 1, then up to two retries), in order. Returns a result object; never
// mutates its input, never forwards a rejected reply.
export function runRetryProtocol(rawAttempts) {
  if (rawAttempts.length < 1 || rawAttempts.length > 3)
    throw new Error("runRetryProtocol expects 1..3 raw attempts");
  const rejected = [];
  for (let i = 0; i < rawAttempts.length; i++) {
    const raw = rawAttempts[i];
    const parsed = parseStrictAgentJson(raw);
    if (!parsed.ok) {
      rejected.push({ attempt_number: i + 1, label: "REJECTED_FORMAT", raw, sha256: sha256(raw), error: parsed.reason });
      continue;
    }
    const schemaCheck = validateAgainstTestSchema(parsed.value);
    if (!schemaCheck.ok) {
      rejected.push({ attempt_number: i + 1, label: "REJECTED_SCHEMA", raw, sha256: sha256(raw), error: schemaCheck.reason });
      continue;
    }
    // Valid — this is the final artifact. Never look at further attempts.
    return {
      overall: i === 0 ? "PASS" : "PASS_RECOVERED",
      retries_used: i,
      final_valid_artifact: parsed.value,
      first_attempt_conformance: i === 0,
      rejected,
      pipeline_safety: rejected.every((r) => r.raw !== raw),
    };
  }
  // Every attempt in the budget failed.
  return {
    overall: "BLOCKED",
    retries_used: rawAttempts.length - 1,
    final_valid_artifact: null,
    first_attempt_conformance: false,
    rejected,
    pipeline_safety: true,
  };
}

// Builds the reissue prompt for one retry: original input unchanged, the
// schema/contract, the exact validator error, and a fixed reissue instruction —
// nothing else. No branch of this function may add a fact, a hint, or a
// suggested value.
export function buildReissuePrompt(originalInputObj, schemaDescription, exactValidatorError) {
  return [
    "MODE: format-retry-reissue",
    "ORIGINAL_INPUT (byte-identical to your previous attempt):",
    JSON.stringify(originalInputObj),
    "SCHEMA:",
    schemaDescription,
    "VALIDATOR_ERROR (the exact and only reason your previous reply was rejected):",
    exactValidatorError,
    "INSTRUCTION: Re-emit the artifact, correcting only the defect named above. Do not change any semantic field, verdict, or value.",
  ].join("\n");
}

const FORBIDDEN_HINT_PATTERNS = [
  /\bthe correct (value|answer|verdict) is\b/i,
  /\bwe expect\b/i,
  /\bshould be\b/i,
  /\bthe right (answer|value)\b/i,
  /\bhint\b/i,
  /\bexpected verdict\b/i,
  /\bsuggested (value|verdict|decision)\b/i,
];
function findForbiddenHint(text) {
  for (const re of FORBIDDEN_HINT_PATTERNS) if (re.test(text)) return re.source;
  return null;
}

// ---------------------------------------------------------------------------
// 3. behavioral: retry-protocol battery (RETRY-1..10)
// ---------------------------------------------------------------------------
section("3. retry-protocol battery (RETRY-1..10)");

const VALID = '{"artifact_type":"test-artifact","value":1}';
const TRAILING_COMMA = '{"artifact_type":"test-artifact","value":1},';
const FENCED = '```json\n{"artifact_type":"test-artifact","value":1}\n```';
const EXTRA_KEY = '{"artifact_type":"test-artifact","value":1,"extra":true}';

// RETRY-1: attempt 1 trailing comma -> REJECTED_FORMAT, never forwarded
{
  const r = runRetryProtocol([TRAILING_COMMA]);
  if (r.rejected.length === 1 && r.rejected[0].label === "REJECTED_FORMAT" && r.overall === "BLOCKED")
    pass("RETRY-1: trailing comma at attempt 1 -> REJECTED_FORMAT, not forwarded (single-attempt budget exhausted -> BLOCKED)");
  else fail(`RETRY-1: unexpected result ${JSON.stringify(r)}`);
}

// RETRY-2: attempt 1 fenced -> REJECTED_FORMAT
{
  const r = runRetryProtocol([FENCED]);
  if (r.rejected.length === 1 && r.rejected[0].label === "REJECTED_FORMAT")
    pass("RETRY-2: fenced reply at attempt 1 -> REJECTED_FORMAT, not forwarded");
  else fail(`RETRY-2: unexpected result ${JSON.stringify(r)}`);
}

// RETRY-3: attempt 1 extra key -> REJECTED_SCHEMA
{
  const r = runRetryProtocol([EXTRA_KEY]);
  if (r.rejected.length === 1 && r.rejected[0].label === "REJECTED_SCHEMA")
    pass("RETRY-3: extra top-level key at attempt 1 -> REJECTED_SCHEMA, not forwarded");
  else fail(`RETRY-3: unexpected result ${JSON.stringify(r)}`);
}

// RETRY-4: attempt 1 rejected, retry 1 valid -> PASS_RECOVERED, retries_used==1
{
  const r = runRetryProtocol([TRAILING_COMMA, VALID]);
  if (r.overall === "PASS_RECOVERED" && r.retries_used === 1 && r.final_valid_artifact?.value === 1)
    pass("RETRY-4: attempt 1 rejected, retry 1 valid -> PASS_RECOVERED, retries_used == 1");
  else fail(`RETRY-4: unexpected result ${JSON.stringify(r)}`);
}

// RETRY-5: attempt 1 + retry 1 rejected, retry 2 valid -> PASS_RECOVERED, retries_used==2
{
  const r = runRetryProtocol([TRAILING_COMMA, FENCED, VALID]);
  if (r.overall === "PASS_RECOVERED" && r.retries_used === 2 && r.final_valid_artifact?.value === 1)
    pass("RETRY-5: attempt 1 + retry 1 rejected, retry 2 valid -> PASS_RECOVERED, retries_used == 2");
  else fail(`RETRY-5: unexpected result ${JSON.stringify(r)}`);
}

// RETRY-6: all three attempts rejected -> BLOCKED, no 4th attempt possible
{
  const r = runRetryProtocol([TRAILING_COMMA, FENCED, EXTRA_KEY]);
  if (r.overall === "BLOCKED" && r.rejected.length === 3 && r.final_valid_artifact === null)
    pass("RETRY-6: attempt 1, retry 1, retry 2 all rejected -> BLOCKED, no 4th attempt (function accepts at most 3)");
  else fail(`RETRY-6: unexpected result ${JSON.stringify(r)}`);
  try {
    runRetryProtocol([TRAILING_COMMA, FENCED, EXTRA_KEY, VALID]);
    fail("RETRY-6: a 4th attempt was accepted instead of rejected by construction");
  } catch {
    pass("RETRY-6: a 4th attempt is rejected by construction (function throws on >3 attempts)");
  }
}

// RETRY-7: a rejected attempt's raw output never appears as the forwarded artifact
{
  const r = runRetryProtocol([TRAILING_COMMA, VALID]);
  const forwarded = JSON.stringify(r.final_valid_artifact);
  const leaked = r.rejected.some((rej) => forwarded.includes(rej.raw));
  if (!leaked && r.final_valid_artifact !== null)
    pass("RETRY-7: no rejected attempt's raw content appears in the forwarded artifact");
  else fail("RETRY-7: a rejected attempt's raw content leaked into the forwarded artifact");
}

// RETRY-8: reissue prompt carries only input+schema+error+instruction, no hint
{
  const original = { atomic_claims: ["C-001"], public_evidence: [] };
  const err = 'not a single valid JSON value: trailing comma';
  const prompt = buildReissuePrompt(original, "verification (handoff.schema.json)", err);
  const hasOriginal = prompt.includes(JSON.stringify(original));
  const hasError = prompt.includes(err);
  const hit = findForbiddenHint(prompt);
  if (hasOriginal && hasError && !hit)
    pass("RETRY-8: reissue prompt contains only original input + schema + exact error + reissue instruction, no verdict/value hint");
  else fail(`RETRY-8: reissue prompt malformed or carries a hint (hasOriginal=${hasOriginal} hasError=${hasError} forbiddenHit=${hit})`);
}

// RETRY-9: control case — clean first attempt -> PASS, not PASS_RECOVERED
{
  const r = runRetryProtocol([VALID]);
  if (r.overall === "PASS" && r.retries_used === 0 && r.first_attempt_conformance === true)
    pass("RETRY-9: clean attempt 1 -> PASS (not PASS_RECOVERED), retries_used == 0");
  else fail(`RETRY-9: unexpected result ${JSON.stringify(r)}`);
}

// RETRY-10: raw output + sha256 retained for every rejected attempt, even after recovery
{
  const r = runRetryProtocol([TRAILING_COMMA, FENCED, VALID]);
  const archiveComplete = r.rejected.length === 2 &&
    r.rejected.every((rej) => typeof rej.raw === "string" && rej.raw.length > 0 && /^[0-9a-f]{64}$/.test(rej.sha256) && rej.error && rej.attempt_number);
  if (archiveComplete && r.overall === "PASS_RECOVERED")
    pass("RETRY-10: raw output + sha256 + exact error + attempt number retained for every rejected attempt, even after recovery");
  else fail(`RETRY-10: incomplete archive on recovery ${JSON.stringify(r)}`);
}

// ---------------------------------------------------------------------------
// 4. never route a semantic outcome through this protocol
// ---------------------------------------------------------------------------
section("4. semantic outcomes are excluded from the retry trigger");
{
  const trigger = String(guardrails.format_retry_policy?.trigger || "");
  const excludesSemantic = /semantic disagreement/i.test(trigger) &&
    /qa\.overall == FAIL/.test(trigger) &&
    /verifier\.overall/i.test(trigger);
  if (excludesSemantic) pass("format_retry_policy.trigger explicitly excludes qa.overall==FAIL / verifier.overall disagreement");
  else fail("format_retry_policy.trigger does not explicitly name and exclude qa.overall==FAIL / verifier.overall disagreement");
}

console.log(`\n${"=".repeat(60)}`);
if (failures === 0) { console.log("RESULT: PASS — bounded format-retry gate holds"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
