#!/usr/bin/env node
// Partner pipeline — Verifier-prompt leak check without false positives
// (Phase 1 authoring).
//
// Deterministic, offline. No network, no secrets.
//
// F-7 fix: the old test dumped the whole Verifier prompt to text and ran a raw
// `grep -iE 'priorit|impact|strateg|recommend|...'` over it. That raw substring
// match on the WHOLE prompt false-positives on legitimate structural key names —
// e.g. `kpi_priority_rank` (a real, always-present test_plan field) contains the
// substring "priorit" and would trip a bare 'priorit' grep, forcing whoever
// maintains the fixture to reword it just to dodge the checker. This tool
// replaces that with two checks:
//   A. structural — the built Verifier input has exactly the five allowed
//      top-level keys, and none of rationale/priority/decision.
//   B. semantic — scans only STRING VALUES (never JSON key names) for
//      persuasive/forbidden phrasing, using word-boundary regexes so
//      "priority" as a whole word is caught but a key name substring never
//      is (moot anyway, since key names are never scanned).
//
// Run: node agent/workflow/pipeline/tools/check-verifier-leak.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PIPELINE = join(HERE, "..");
const FIXTURES = join(PIPELINE, "fixtures");

const ALLOWED_KEYS = ["atomic_claims", "public_evidence", "pss_data", "period_filters", "test_plan"];
const FORBIDDEN_TOP_LEVEL = ["rationale", "priority", "decision"];

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => console.log(`\n== ${m} ==`);

// ---------------------------------------------------------------------------
// Part A — structural key-set check
// ---------------------------------------------------------------------------
export function checkVerifierInputKeys(obj) {
  const keys = Object.keys(obj);
  const missing = ALLOWED_KEYS.filter((k) => !keys.includes(k));
  const forbidden = FORBIDDEN_TOP_LEVEL.filter((k) => keys.includes(k));
  const extra = keys.filter((k) => !ALLOWED_KEYS.includes(k));
  return { ok: missing.length === 0 && extra.length === 0, missing, forbidden, extra };
}

// ---------------------------------------------------------------------------
// Part B — semantic scan of string VALUES only, word-boundary matching
// ---------------------------------------------------------------------------
const FORBIDDEN_PHRASING = /\b(priorit\w*|impact\w*|strateg\w*|recommend\w*|clearly|obvious(?:ly)?|we must|huge opportunity|root[_ -]?cause|mechanism)\b/i;

export function scanValuesForPersuasion(node, path = "$", hits = []) {
  if (typeof node === "string") {
    const m = node.match(FORBIDDEN_PHRASING);
    if (m) hits.push({ path, token: m[0] });
    return hits;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanValuesForPersuasion(v, `${path}[${i}]`, hits));
    return hits;
  }
  if (node && typeof node === "object") {
    // deliberately iterate VALUES only — key names are never regex-scanned,
    // which is what makes `kpi_priority_rank` (a key) harmless by construction.
    for (const [k, v] of Object.entries(node)) scanValuesForPersuasion(v, `${path}.${k}`, hits);
  }
  return hits;
}

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));

// ---------------------------------------------------------------------------
// 1. real fixtures — FX-09 clean must pass both parts; FX-08 must fail both
// ---------------------------------------------------------------------------
section("1. FX-09 (clean) vs FX-08 (contaminated) — real fixtures");
{
  const f09p = join(FIXTURES, "clean", "f09-verifier-input-ok.json");
  const f08p = join(FIXTURES, "contaminated", "f08-verifier-input-leaked.json");
  if (!existsSync(f09p) || !existsSync(f08p)) {
    fail("FX-09 or FX-08 fixture missing");
  } else {
    const f09 = readJSON(f09p);
    const f08 = readJSON(f08p);

    const a09 = checkVerifierInputKeys(f09);
    if (a09.ok) pass("FX-09: structural check — exactly the five allowed keys, no rationale/priority/decision");
    else fail(`FX-09 structural: missing=${a09.missing} forbidden=${a09.forbidden} extra=${a09.extra}`);

    const a08 = checkVerifierInputKeys(f08);
    if (!a08.ok && a08.forbidden.length > 0) pass(`FX-08: structural check correctly flags the contamination (forbidden keys present: ${a08.forbidden.join(", ")})`);
    else fail("FX-08 structural: expected the contamination (rationale/priority/decision) to be flagged");

    // regression proof: the OLD raw-text approach would false-positive on FX-09
    // because 'kpi_priority_rank' (a legitimate key) contains 'priorit'.
    const rawText09 = JSON.stringify(f09);
    const oldStyleWouldFlagF09 = /priorit/i.test(rawText09);
    if (oldStyleWouldFlagF09) pass("confirmed regression case: old raw-substring grep on the whole prompt text WOULD have flagged FX-09 (via the key name 'kpi_priority_rank')");
    else fail("expected FX-09's raw text to contain 'priorit' via kpi_priority_rank — fixture may have changed");

    const b09 = scanValuesForPersuasion(f09);
    if (b09.length === 0) pass("FX-09: semantic value-only scan — zero hits (the legitimate key name never trips it)");
    else fail(`FX-09 semantic scan unexpectedly hit: ${JSON.stringify(b09)}`);

    const b08 = scanValuesForPersuasion(f08);
    if (b08.length > 0) pass(`FX-08: semantic value-only scan still catches the leaked rationale text (${b08.map((h) => h.token).join(", ")})`);
    else fail("FX-08 semantic scan found nothing — expected the rationale's persuasive language to be caught");
  }
}

// ---------------------------------------------------------------------------
// 2. battery — word-boundary correctness
// ---------------------------------------------------------------------------
section("2. word-boundary battery — structural key names never trip the semantic scan");
{
  const CASES = [
    { name: "kpi_priority_rank as a NUMBER value (not scanned as a key)", obj: { test_plan: { kpi_priority_rank: 6 } }, expectHits: 0 },
    { name: "value containing the whole word 'priority' IS caught", obj: { note: "this is a high priority item" }, expectHits: 1 },
    { name: "value containing 'clearly' IS caught", obj: { rationale: "this is clearly the strongest option" }, expectHits: 1 },
    { name: "value containing an unrelated word with 'strat' as a substring is NOT caught", obj: { note: "the stratum of soil here is rocky" }, expectHits: 0 },
    { name: "value containing 'strategy' IS caught", obj: { note: "our strategy here is simple" }, expectHits: 1 },
    { name: "key named 'priority' with a boolean value never matches (values are strings only)", obj: { priority: true }, expectHits: 0 },
  ];
  let bad = 0;
  for (const c of CASES) {
    const hits = scanValuesForPersuasion(c.obj);
    if (hits.length !== c.expectHits) { fail(`battery "${c.name}": expected ${c.expectHits} hits, got ${hits.length} (${JSON.stringify(hits)})`); bad++; }
  }
  if (bad === 0) pass(`${CASES.length} word-boundary cases behave as expected`);
}

console.log(`\n${"=".repeat(60)}`);
if (failures === 0) { console.log("RESULT: PASS — Verifier leak check is structural + semantic, value-only, word-boundary"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
