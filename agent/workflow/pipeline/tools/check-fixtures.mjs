#!/usr/bin/env node
// Partner pipeline — static fixture check (Phase 1 authoring).
//
// Deterministic, offline, read-only. No network, no secrets, no external calls.
// Run:   node agent/workflow/pipeline/tools/check-fixtures.mjs
// Write the allow-list manifest: node agent/workflow/pipeline/tools/check-fixtures.mjs --write-manifest
//
// What it checks (all must pass before any ACCEPTANCE / EXTENDED suite run):
//   1. fixture-only allow-list manifest is complete and every sha256 matches
//   2. every fixture .json (+ the two schemas + assertions.json) parses
//   3. handoff artifacts in fixtures match their schema branch (required keys,
//      additionalProperties:false, enums); evidence-ledger entries match theirs
//   4. the /bueroreinigung fixture family arithmetic re-derives exactly
//   5. the CTR value is a single propagated number (no stale 0.79 / 0.84 / 4.2%)
//   6. no real-PSS reference anywhere in the fixtures (fictional data only)
//   7. no " EUR" Ads figure outside the explicitly-fictional budget fixtures
//   8. assertions.json E2E-MED requires the CONFIRMED path and bars ROUTE_BACK
//   9. every numeric claim in the /bueroreinigung family agrees with the evidence
//      it cites and with the same claim in the sibling fixtures — the wording of a
//      claim (e.g. "Six pages…") may not contradict its evidence ledger. The
//      companion check-fixtures-negtest.mjs proves this gate rejects a tampered
//      claim ("Four pages…") on a throwaway copy of the tree.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PIPELINE = join(HERE, "..");
const SCHEMA_DIR = join(PIPELINE, "schema");

const args = process.argv.slice(2);
const WRITE_MANIFEST = args.includes("--write-manifest");
// Optional --fixtures-dir=<path> points the checker at a *copy* of the fixtures
// tree instead of the real one. check-fixtures-negtest.mjs uses it to prove the
// §9 claim-text/evidence gate rejects a tampered claim, against a throwaway copy,
// without touching the real fixture. Still offline and read-only either way.
const fxArg = args.find((a) => a.startsWith("--fixtures-dir="));
const FIXTURES = fxArg ? resolve(fxArg.slice("--fixtures-dir=".length)) : join(PIPELINE, "fixtures");
const MANIFEST = join(FIXTURES, "fixture-manifest.json");

let failures = 0;
let sectionMark = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => { console.log(`\n== ${m} ==`); sectionMark = failures; };
const sectionOk = () => failures === sectionMark;

// The git author/committer identity is MANDATED by CLAUDE.md §2 and is expected to
// appear in policy text and assertions. It is the public business identity, not
// confidential commercial data, so it is exempt from the real-PSS-reference scan.
const MANDATED_IDENTITY = /Perfekt Sauber Service <kontakt@perfektsauberservice\.com>/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const relFix = (p) => relative(FIXTURES, p).split("\\").join("/");
// Hash LF-normalised content so the gate is identical on a CRLF (autocrlf) working
// tree and an LF checkout. Trailing-whitespace is preserved; only \r\n -> \n.
const sha256 = (p) =>
  createHash("sha256").update(readFileSync(p, "utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));

const allFixtureFiles = walk(FIXTURES).filter((p) => relFix(p) !== "fixture-manifest.json");

// ---------------------------------------------------------------- write-manifest
if (WRITE_MANIFEST) {
  const files = allFixtureFiles
    .map((p) => ({ path: relFix(p), sha256: sha256(p) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    note:
      "Allow-list for fixture-only test mode. The Coordinator copies ONLY these files " +
      "into the test sandbox (outside the official repo) and gives each agent copies of " +
      "the slice it is allowed to see. An agent that reaches for any path not listed here " +
      "returns BLOCKED and the test is FAIL. sha256 is over LF-normalised content, so it " +
      "matches on both a CRLF working tree and an LF checkout. Regenerate with: node " +
      "agent/workflow/pipeline/tools/check-fixtures.mjs --write-manifest",
    schema_version: "1.0.0-phase1",
    root: "agent/workflow/pipeline/fixtures",
    file_count: files.length,
    files,
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${relFix(MANIFEST)} with ${files.length} entries`);
  process.exit(0);
}

// ------------------------------------------------------------------ 1. manifest
section("1. fixture-only allow-list manifest");
let manifest;
try {
  manifest = readJSON(MANIFEST);
  pass("fixture-manifest.json parses");
} catch (e) {
  fail(`fixture-manifest.json does not parse or is missing: ${e.message}`);
  manifest = { files: [] };
}
{
  const listed = new Map(manifest.files.map((f) => [f.path, f.sha256]));
  const onDisk = new Set(allFixtureFiles.map(relFix));
  for (const p of onDisk) {
    if (!listed.has(p)) fail(`fixture on disk not in manifest allow-list: ${p}`);
  }
  for (const [p, want] of listed) {
    if (!onDisk.has(p)) { fail(`manifest lists a file that is not on disk: ${p}`); continue; }
    const got = sha256(join(FIXTURES, p));
    if (got !== want) fail(`sha256 mismatch for ${p} (manifest ${want.slice(0, 12)}… vs disk ${got.slice(0, 12)}…) — run --write-manifest if the change is intended`);
  }
  if (manifest.file_count !== undefined && manifest.file_count !== manifest.files.length)
    fail(`manifest.file_count ${manifest.file_count} != files.length ${manifest.files.length}`);
  if (sectionOk()) pass(`all ${listed.size} fixture files present with matching sha256`);
}

// -------------------------------------------------------------- 2. JSON parses
section("2. JSON parse");
const jsonFixtures = {};
for (const p of allFixtureFiles.filter((p) => p.endsWith(".json"))) {
  try { jsonFixtures[relFix(p)] = readJSON(p); pass(relFix(p)); }
  catch (e) { fail(`${relFix(p)}: ${e.message}`); }
}
let handoffSchema, ledgerSchema, assertions;
try { handoffSchema = readJSON(join(SCHEMA_DIR, "handoff.schema.json")); pass("schema/handoff.schema.json"); }
catch (e) { fail(`schema/handoff.schema.json: ${e.message}`); }
try { ledgerSchema = readJSON(join(SCHEMA_DIR, "evidence-ledger.schema.json")); pass("schema/evidence-ledger.schema.json"); }
catch (e) { fail(`schema/evidence-ledger.schema.json: ${e.message}`); }
try { assertions = jsonFixtures["expected/assertions.json"]; if (assertions) pass("expected/assertions.json"); }
catch (e) { fail(`expected/assertions.json: ${e.message}`); }

// --------------------------------------------------- 3. artifact / ledger shape
section("3. artifact + evidence-ledger shape");
function branchFor(type) {
  const map = {
    "competitor-observation": "competitorObservation",
    investigation: "investigation",
    analysis: "analysis",
    verification: "verification",
    implementation: "implementation",
    "qa-report": "qaReport",
    "coordinator-decision": "coordinatorDecision",
  };
  return handoffSchema?.definitions?.[map[type]];
}
function checkObjectAgainst(def, obj, label) {
  if (!def) { fail(`${label}: no schema branch`); return; }
  const req = def.required || [];
  const props = def.properties || {};
  for (const k of req) if (!(k in obj)) fail(`${label}: missing required key "${k}"`);
  if (def.additionalProperties === false)
    for (const k of Object.keys(obj)) if (!(k in props)) fail(`${label}: unexpected key "${k}" (additionalProperties:false)`);
  for (const [k, v] of Object.entries(obj)) {
    const spec = props[k];
    if (!spec) continue;
    if (spec.enum && !spec.enum.includes(v)) fail(`${label}.${k}: "${v}" not in enum [${spec.enum.join(", ")}]`);
    if (spec.const !== undefined && v !== spec.const) fail(`${label}.${k}: "${v}" != const "${spec.const}"`);
  }
}
let artifactsChecked = 0, ledgerEntriesChecked = 0;
for (const [name, obj] of Object.entries(jsonFixtures)) {
  if (obj && typeof obj === "object" && obj.artifact_type) {
    checkObjectAgainst(branchFor(obj.artifact_type), obj, `${name} [${obj.artifact_type}]`);
    artifactsChecked++;
    if (Array.isArray(obj.evidence_ledger)) {
      ledgerEntriesChecked += obj.evidence_ledger.length;
      obj.evidence_ledger.forEach((e, i) => {
        const req = ledgerSchema?.required || [];
        for (const k of req) if (!(k in e)) fail(`${name}.evidence_ledger[${i}] (${e.evidence_id}): missing "${k}"`);
        if (ledgerSchema?.additionalProperties === false)
          for (const k of Object.keys(e)) if (!(k in (ledgerSchema.properties || {}))) fail(`${name}.evidence_ledger[${i}]: unexpected key "${k}"`);
        const st = ledgerSchema?.properties?.status?.enum;
        if (st && !st.includes(e.status)) fail(`${name}.evidence_ledger[${i}]: status "${e.status}" invalid`);
        const cf = ledgerSchema?.properties?.confidence?.enum;
        if (cf && !cf.includes(e.confidence)) fail(`${name}.evidence_ledger[${i}]: confidence "${e.confidence}" invalid`);
      });
    }
  }
}
if (sectionOk()) pass(`${artifactsChecked} handoff artifacts + ${ledgerEntriesChecked} evidence-ledger entries match their schema branch`);
if (ledgerSchema && ledgerSchema.required.length !== 16)
  fail(`evidence-ledger schema has ${ledgerSchema.required.length} required fields; docs say 16`);
else if (ledgerSchema) pass("evidence-ledger schema has exactly 16 required fields (matches docs)");

// ----------------------------------------------- 4. /bueroreinigung arithmetic
section("4. fixture arithmetic re-derivation");
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function meanWindow(daily, from, to) {
  const keys = Object.keys(daily).filter((d) => d >= from && d <= to).sort();
  return keys.reduce((s, k) => s + daily[k], 0) / keys.length;
}
function findEvidenceArrays(obj, out = []) {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj.gap_queries)) out.push({ kind: "gap", node: obj });
  if (Array.isArray(obj.sibling_pages)) out.push({ kind: "sibling", node: obj });
  if (obj.control_pages_pct_change && typeof obj.control_pages_pct_change === "object")
    out.push({ kind: "control", node: obj });
  if (obj.daily_clicks && typeof obj.daily_clicks === "object")
    out.push({ kind: "daily", node: obj });
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) v.forEach((x) => findEvidenceArrays(x, out));
    else if (v && typeof v === "object") findEvidenceArrays(v, out);
  }
  return out;
}

const FAMILY = [
  "findings/f05-ambiguous-metric-drop.json",
  "clean/f09-verifier-input-ok.json",
  "clean/f10-atomic-claims.json",
  "contaminated/f07-analysis-with-rationale.json",
  "contaminated/f08-verifier-input-leaked.json",
];
let gapChecks = 0, sibChecks = 0, ctrlChecks = 0, dailyChecks = 0;
for (const name of FAMILY) {
  const obj = jsonFixtures[name];
  if (!obj) continue;
  for (const { kind, node } of findEvidenceArrays(obj)) {
    if (kind === "daily") {
      const mb = meanWindow(node.daily_clicks, "2026-08-11", "2026-08-17");
      const ma = meanWindow(node.daily_clicks, "2026-08-18", "2026-08-24");
      if (!approx(mb, 41.0) || !approx(ma, 22.0)) fail(`${name}: daily_clicks means ${mb}/${ma} != 41.0/22.0`);
      else dailyChecks++;
    }
    if (kind === "gap") {
      const imp = node.gap_queries.reduce((s, q) => s + q.impressions_28d, 0);
      const clk = node.gap_queries.reduce((s, q) => s + (q.clicks_28d ?? NaN), 0);
      if (imp !== 3000) fail(`${name}: gap Σimpressions ${imp} != 3000`);
      if (!Number.isFinite(clk) || clk !== 30) fail(`${name}: gap Σclicks ${clk} != 30 (per-query clicks_28d required)`);
      if (imp === 3000 && clk === 30 && !approx(clk / imp, 0.01)) fail(`${name}: gap CTR ${clk / imp} != 0.0100`);
      const d = node.derived || {};
      if (d.total_impressions_28d !== undefined && d.total_impressions_28d !== 3000) fail(`${name}: derived.total_impressions_28d != 3000`);
      if (d.total_clicks_28d !== undefined && d.total_clicks_28d !== 30) fail(`${name}: derived.total_clicks_28d != 30`);
      if (d.gap_ctr_impression_weighted !== undefined && !approx(d.gap_ctr_impression_weighted, 0.01)) fail(`${name}: derived.gap_ctr_impression_weighted != 0.0100`);
      if (imp === 3000 && clk === 30) gapChecks++;
    }
    if (kind === "sibling") {
      const imp = node.sibling_pages.reduce((s, p) => s + (p.pricing_intent_impressions_28d ?? NaN), 0);
      const clk = node.sibling_pages.reduce((s, p) => s + (p.pricing_intent_clicks_28d ?? NaN), 0);
      if (!Number.isFinite(imp) || imp !== 3500) fail(`${name}: sibling Σimpressions ${imp} != 3500`);
      if (!Number.isFinite(clk) || clk !== 140) fail(`${name}: sibling Σclicks ${clk} != 140`);
      if (imp === 3500 && clk === 140 && !approx(clk / imp, 0.04)) fail(`${name}: sibling CTR ${clk / imp} != 0.0400`);
      const d = node.derived || {};
      if (d.sibling_ctr_impression_weighted !== undefined && !approx(d.sibling_ctr_impression_weighted, 0.04)) fail(`${name}: derived.sibling_ctr_impression_weighted != 0.0400`);
      if (d.bueroreinigung_gap_ctr !== undefined && !approx(d.bueroreinigung_gap_ctr, 0.01)) fail(`${name}: derived.bueroreinigung_gap_ctr != 0.0100`);
      if (imp === 3500 && clk === 140) sibChecks++;
    }
    if (kind === "control") {
      const entries = Object.entries(node.control_pages_pct_change);
      if (entries.length !== 6) fail(`${name}: control page count ${entries.length} != 6`);
      for (const [pg, v] of entries) if (Math.abs(v) > 0.04 + 1e-9) fail(`${name}: control ${pg} |${v}| > 0.04`);
      if (entries.length === 6) ctrlChecks++;
    }
  }
}
if (sectionOk()) {
  pass(`daily-clicks means 41.0/22.0 verified in ${dailyChecks} evidence blocks`);
  pass(`gap panel 30 clicks / 3000 impressions = 1.00% verified in ${gapChecks} blocks`);
  pass(`sibling benchmark 140 / 3500 = 4.00% verified in ${sibChecks} blocks`);
  pass(`6 control pages, all |Δ| ≤ 4% verified in ${ctrlChecks} blocks`);
}
// projection + YoY in f10
{
  const f10 = jsonFixtures["clean/f10-atomic-claims.json"];
  const est = (f10?.estimates || []).join(" ");
  if (!/3000 \* \(0\.0400 - 0\.0100\) = 90/.test(est)) fail("f10 estimates: projection text not '3000 * (0.0400 - 0.0100) = 90'");
  else if (3000 * (0.04 - 0.01) !== 90) fail("projection arithmetic broken");
  else pass("f10 projection 3000*(0.0400-0.0100) = 90 exact");
  const yoy = (f10?.evidence_ledger || []).find((e) => e.evidence_id === "EV-0005");
  if (yoy) {
    const { y2025_july_mean: j, y2025_august_mean: a, y2025_change_pct: c } = yoy.raw_result || {};
    if (!approx((a - j) / j * 100, -8.0) || c !== -8.0) fail(`f10 EV-0005 YoY: (${a}-${j})/${j} != -8.0% (or change_pct ${c})`);
    else pass("f10 EV-0005 YoY -8.0% exact");
  }
}

// -------------------------------------- 5. single propagated CTR value (no stale)
section("5. single CTR value — no stale 0.79 / 0.84 / 4.2%");
{
  const stale = /0\.79|0\.0079|0\.0084|0\.84%|\b4\.2%|sibling_mean_ctr|\bmean CTR\b|impression-weighted CTR for the three gap queries on \/bueroreinigung = 0/;
  for (const name of FAMILY) {
    const raw = readFileSync(join(FIXTURES, name), "utf8");
    const m = raw.match(stale);
    if (m) fail(`${name}: stale CTR token "${m[0]}"`);
  }
  // 293 must be gone from the family (it was the old impression total)
  for (const name of FAMILY) {
    if (/\b293\b/.test(readFileSync(join(FIXTURES, name), "utf8"))) fail(`${name}: stale impression total 293`);
  }
  if (sectionOk()) pass("no stale CTR / impression tokens in the /bueroreinigung family");
}

// --------------------------------------------- 6. no real-PSS reference anywhere
section("6. fictional data only — no real-PSS reference");
{
  const forbidden = [
    /loffenau/i, /perfektsauberservice/i, /laurentiualin/i,
    /kontakt@perfektsauberservice/i, /C:\\\\Users/i, /\.env(\.local)?\b/,
    /\bAW-\d/, /\bGTM-[A-Z0-9]/, /\bG-[A-Z0-9]{8,}/, /gtag\(/,
    /\breal[_-]?client\b/i,
  ];
  for (const p of allFixtureFiles) {
    const raw = readFileSync(p, "utf8").replace(MANDATED_IDENTITY, "<mandated-git-identity>");
    for (const re of forbidden) {
      const m = raw.match(re);
      if (m) fail(`${relFix(p)}: real-PSS reference "${m[0]}"`);
    }
  }
  if (sectionOk()) pass("no real-PSS identifiers, secrets, tag ids, or absolute repo paths in any fixture (mandated git identity exempt)");
}

// ------------------------------- 7. no Ads " EUR" figure outside budget fixtures
section("7. Ads currency figures only in explicitly-fictional fixtures");
{
  // All currency in the fixtures is fictional by construction (a made-up Ads
  // budget scenario, a 0 EUR analysis cost, a made-up third-party directory
  // tariff). This check guards against a *new* fixture smuggling a real PSS Ads
  // spend/budget/bid figure in: currency is only allowed in these known files.
  const allowEUR = new Set([
    "findings/f06-high-risk-ads-budget.json",       // fictional Ads budget scenario (RIDICAT)
    "findings/f15-monitor-candidate.json",          // fictional regional-directory tariff (0 / 180 EUR/Jahr)
    "contaminated/f07-analysis-with-rationale.json", // "0 EUR" analysis cost estimate
    "contaminated/f08-verifier-input-leaked.json",  // "0 EUR" analysis cost estimate
  ]);
  for (const p of allFixtureFiles.filter((p) => p.endsWith(".json"))) {
    const rel = relFix(p);
    if (allowEUR.has(rel)) continue;
    const m = readFileSync(p, "utf8").match(/\d[\d.,]*\s*EUR/);
    if (m) fail(`${rel}: currency figure "${m[0]}" outside the allowed fictional fixtures`);
  }
  if (sectionOk()) pass("no stray currency figures (all currency is in known explicitly-fictional fixtures)");
}

// -------------------------------- 8. assertions.json E2E-MED closes ROUTE_BACK
section("8. assertions E2E-MED requires CONFIRMED, bars ROUTE_BACK");
{
  const e = assertions?.["E2E-MED"] || {};
  const must = (e.must || []).join(" | ");
  const mustNot = (e.must_not || []).join(" | ");
  if (!/verification\.overall == CONFIRMED/.test(must)) fail("E2E-MED.must lacks 'verification.overall == CONFIRMED'");
  if (!/human_review_state == AWAITING_LAURA_APPROVAL/.test(must)) fail("E2E-MED.must lacks 'human_review_state == AWAITING_LAURA_APPROVAL'");
  if (!/decision == ROUTE_BACK/.test(mustNot)) fail("E2E-MED.must_not lacks 'coordinator-decision.decision == ROUTE_BACK'");
  if (!/REFUTED, INSUFFICIENT_DATA|INSUFFICIENT_DATA/.test(mustNot)) fail("E2E-MED.must_not lacks a bar on REFUTED / INSUFFICIENT_DATA");
  // ARCHIVE_MINOR discipline
  const dup = (assertions?.["E2E-DUP"]?.must || []).join(" | ");
  if (!/recommended_next == ARCHIVE_MINOR/.test(dup)) fail("E2E-DUP.must lacks 'investigation.recommended_next == ARCHIVE_MINOR'");
  for (const id of ["E2E-CMP-MINOR", "E2E-MONITOR"]) {
    const a = assertions?.[id] || {};
    const j = (a.must || []).concat(a.must_not || []).join(" | ");
    if (!/recommended_next == TO_ANALYST/.test(j)) fail(`${id} does not assert 'investigation.recommended_next == TO_ANALYST'`);
    if (!/recommended_next == ARCHIVE_MINOR/.test((a.must_not || []).join(" | "))) fail(`${id}.must_not does not bar ARCHIVE_MINOR`);
  }
  if (sectionOk()) pass("E2E-MED path is CONFIRMED→…→AWAITING_LAURA_APPROVAL; ROUTE_BACK/REFUTED barred; ARCHIVE_MINOR reserved to duplicates");
}

// ---------------- 9. claim text vs cited evidence — /bueroreinigung family
// Section 4 re-derives the arithmetic from the data arrays. Section 9 is the
// other half: it checks that the *words* of every numeric claim in the family
// (and the same claim repeated across f05 / f07 / f08 / f09 / f10) agree with
// that arithmetic and with each other. A claim that says "Four pages" while its
// evidence ledger holds six control pages is a contradiction and fails here.
section("9. claim text vs cited evidence — /bueroreinigung family");
{
  const NUMWORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const num = (w) => {
    if (w == null) return NaN;
    const s = String(w).trim().toLowerCase().replace(/,/g, "");
    if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
    return NUMWORDS[s] ?? NaN;
  };
  const norm = (v) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(4)) : v);

  // Canonical family values. Section 4 already proves these hold in the data
  // arrays; §9 anchors the prose to them.
  const CANON = {
    control_page_count: 6,
    control_threshold_pct: 4,       // "moved at most 4%"
    gap_impressions_28d: 3000,
    gap_clicks_28d: 30,
    gap_ctr_pct: 1,                 // 30 / 3000
    sibling_ctr_pct: 4,             // 140 / 3500
    sibling_pages: 3,
    gap_queries: 3,
    daily_mean_before: 41,
    daily_mean_after: 22,
    observation_days: 28,
    period_start: "2026-08-04",
    period_end: "2026-08-31",
    after_window: "2026-08-18..2026-08-24",
  };
  // self-check: the canonical window really is 28 inclusive days
  {
    const d0 = Date.parse(CANON.period_start), d1 = Date.parse(CANON.period_end);
    const days = Math.round((d1 - d0) / 86400000) + 1;
    if (days !== CANON.observation_days) fail(`§9 canon period ${CANON.period_start}..${CANON.period_end} spans ${days} days, not ${CANON.observation_days}`);
  }

  const obs = []; // { fixture, where, field, value, kind }
  const seen = (fixture, where, field, value, kind) => {
    const v = norm(value);
    if (v === undefined || v === null) return;
    if (typeof v === "number" && Number.isNaN(v)) return;
    obs.push({ fixture, where, field, value: v, kind });
  };

  const ranges = (s) => {
    const out = [];
    const re = /\b2026-08-(\d\d)\s*(?:to|\.\.|-|–)\s*2026-08-(\d\d)\b/g;
    let m;
    while ((m = re.exec(s))) out.push(`2026-08-${m[1]}..2026-08-${m[2]}`);
    return out;
  };

  // Parse a claim-like sentence. Deliberately NOT applied to verbose
  // `calculation` / `falsification_test` strings, which legitimately mention the
  // 2026-08-11..2026-08-17 baseline window and would create false hits.
  const scanText = (fixture, where, s) => {
    if (typeof s !== "string" || !s) return;
    let m;
    if ((m = s.match(/\b(\w+)\s+(?:other\s+)?pages\s+(?:that\s+)?(?:shar(?:e|ing)|received|receive)\b[^.]*?\bheader\b/i)))
      seen(fixture, where, "control_page_count", num(m[1]), "text");
    if ((m = s.match(/\b(\w+)\s+control pages\b/i)))
      seen(fixture, where, "control_page_count", num(m[1]), "text");
    if ((m = s.match(/\b([\d,]+)\s+impressions and\s+([\d,]+)\s+clicks\b/i))) {
      seen(fixture, where, "gap_impressions_28d", num(m[1]), "text");
      seen(fixture, where, "gap_clicks_28d", num(m[2]), "text");
    }
    if ((m = s.match(/\b([\d,]+)\s+impressions\s*\/\s*([\d,]+)\s+clicks\b/i))) {
      seen(fixture, where, "gap_impressions_28d", num(m[1]), "text");
      seen(fixture, where, "gap_clicks_28d", num(m[2]), "text");
    }
    if ((m = s.match(/\(([\d,]+)\s+clicks\s*\/\s*([\d,]+)\s+impressions\)/i))) {
      seen(fixture, where, "gap_clicks_28d", num(m[1]), "text");
      seen(fixture, where, "gap_impressions_28d", num(m[2]), "text");
    }
    if ((m = s.match(/\b(\w+)\s+pricing\/quote-intent quer(?:y|ies)\b/i)))
      seen(fixture, where, "gap_queries", num(m[1]), "text");
    if ((m = s.match(/\b(\w+)\s+query intents\b/i)))
      seen(fixture, where, "gap_queries", num(m[1]), "text");
    if ((m = s.match(/\b(\w+)\s+sibling pages\b/i)))
      seen(fixture, where, "sibling_pages", num(m[1]), "text");
    if ((m = s.match(/([\d.]+)%\s+impression-weighted CTR\b[^.]*?\bversus\s+([\d.]+)%/i))) {
      seen(fixture, where, "sibling_ctr_pct", parseFloat(m[1]), "text");
      seen(fixture, where, "gap_ctr_pct", parseFloat(m[2]), "text");
    }
    if ((m = s.match(/impression-weighted CTR of\s+([\d.]+)%[^.]*?\bversus\s+([\d.]+)%/i))) {
      seen(fixture, where, "sibling_ctr_pct", parseFloat(m[1]), "text");
      seen(fixture, where, "gap_ctr_pct", parseFloat(m[2]), "text");
    }
    if ((m = s.match(/([\d.]+)%\s+sibling[- ](?:page\s+)?(?:benchmark|ctr)\b/i)))
      seen(fixture, where, "sibling_ctr_pct", parseFloat(m[1]), "text");
    if ((m = s.match(/\bat most\s+(?:a\s+)?([\d.]+)%/i)))
      seen(fixture, where, "control_threshold_pct", parseFloat(m[1]), "text");
    if ((m = s.match(/<=\s*([\d.]+)%/)))
      seen(fixture, where, "control_threshold_pct", parseFloat(m[1]), "text");
    if ((m = s.match(/(?:organic\s+)?clicks\b(?:\s+to\s+\S+)?\s+(?:fell|dropped|moved)\s+from\b[^.]*?([\d.]+)\/day\b[^.]*?\bto\s+([\d.]+)\/day\b/i))) {
      seen(fixture, where, "daily_mean_before", parseFloat(m[1]), "text");
      seen(fixture, where, "daily_mean_after", parseFloat(m[2]), "text");
    }
    if ((m = s.match(/\bover\s+(?:the\s+)?(\d+)\s+days\b/i)))
      seen(fixture, where, "observation_days", Number(m[1]), "text");
    if ((m = s.match(/\b(\d+)\s+days ending\s+(2026-\d\d-\d\d)/i))) {
      seen(fixture, where, "observation_days", Number(m[1]), "text");
      seen(fixture, where, "period_end", m[2], "text");
    }
    // an explicit date range is only the control/click "after" window when the
    // sentence is actually about that comparison
    if (/7-day mean clicks/i.test(s) && /header|control/i.test(s))
      for (const r of ranges(s)) seen(fixture, where, "after_window", r, "text");
  };

  const pick = (node, key) => (node.derived && node.derived[key] !== undefined ? node.derived[key] : node[key]);
  const scanData = (fixture, node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (node.control_pages_pct_change && typeof node.control_pages_pct_change === "object") {
      seen(fixture, "control_pages_pct_change[]", "control_page_count", Object.keys(node.control_pages_pct_change).length, "structured");
      const cpc = pick(node, "control_page_count");
      if (cpc !== undefined) seen(fixture, "derived.control_page_count", "control_page_count", cpc, "structured");
      const mag = pick(node, "max_control_magnitude");
      if (mag !== undefined) seen(fixture, "derived.max_control_magnitude", "control_threshold_pct", mag * 100, "structured");
    }
    if (Array.isArray(node.gap_queries)) {
      seen(fixture, "gap_queries[]", "gap_queries", node.gap_queries.length, "structured");
      seen(fixture, "gap_queries[]", "gap_impressions_28d", node.gap_queries.reduce((s, q) => s + (q.impressions_28d || 0), 0), "structured");
      seen(fixture, "gap_queries[]", "gap_clicks_28d", node.gap_queries.reduce((s, q) => s + (q.clicks_28d || 0), 0), "structured");
      const ti = pick(node, "total_impressions_28d"), tc = pick(node, "total_clicks_28d"), gc = pick(node, "gap_ctr_impression_weighted");
      if (ti !== undefined) seen(fixture, "derived.total_impressions_28d", "gap_impressions_28d", ti, "structured");
      if (tc !== undefined) seen(fixture, "derived.total_clicks_28d", "gap_clicks_28d", tc, "structured");
      if (gc !== undefined) seen(fixture, "derived.gap_ctr_impression_weighted", "gap_ctr_pct", gc * 100, "structured");
    }
    if (Array.isArray(node.sibling_pages)) {
      seen(fixture, "sibling_pages[]", "sibling_pages", node.sibling_pages.length, "structured");
      const si = node.sibling_pages.reduce((s, p) => s + (p.pricing_intent_impressions_28d || 0), 0);
      const sc = node.sibling_pages.reduce((s, p) => s + (p.pricing_intent_clicks_28d || 0), 0);
      if (si > 0) seen(fixture, "sibling_pages[]", "sibling_ctr_pct", (sc / si) * 100, "structured");
      const sw = pick(node, "sibling_ctr_impression_weighted"), bg = pick(node, "bueroreinigung_gap_ctr");
      if (sw !== undefined) seen(fixture, "derived.sibling_ctr_impression_weighted", "sibling_ctr_pct", sw * 100, "structured");
      if (bg !== undefined) seen(fixture, "derived.bueroreinigung_gap_ctr", "gap_ctr_pct", bg * 100, "structured");
    }
    if (node.daily_clicks && typeof node.daily_clicks === "object") {
      const mb = meanWindow(node.daily_clicks, "2026-08-11", "2026-08-17");
      const ma = meanWindow(node.daily_clicks, "2026-08-18", "2026-08-24");
      if (Number.isFinite(mb)) seen(fixture, "daily_clicks", "daily_mean_before", mb, "structured");
      if (Number.isFinite(ma)) seen(fixture, "daily_clicks", "daily_mean_after", ma, "structured");
      const b = pick(node, "mean_before"), a = pick(node, "mean_after");
      if (b !== undefined) seen(fixture, "derived.mean_before", "daily_mean_before", b, "structured");
      if (a !== undefined) seen(fixture, "derived.mean_after", "daily_mean_after", a, "structured");
    }
  };
  const walkData = (fixture, node) => {
    if (!node || typeof node !== "object") return;
    scanData(fixture, node);
    for (const v of Array.isArray(node) ? node : Object.values(node))
      if (v && typeof v === "object") walkData(fixture, v);
  };

  const collectText = (fixture, obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const c of obj.atomic_claims || []) scanText(fixture, c.claim_id || "atomic_claim", c.text);
    for (const e of obj.evidence_ledger || []) {
      scanText(fixture, `${e.evidence_id} claim`, e.claim);
      scanText(fixture, `${e.evidence_id} limitations`, e.limitations);
    }
    for (const s of obj.observed_facts || []) scanText(fixture, "observed_facts", s);
    for (const s of obj.estimates || []) scanText(fixture, "estimates", s);
    for (const s of obj.observed || []) scanText(fixture, "observed", s);
    for (const ev of obj.embedded_evidence || []) {
      scanText(fixture, `${ev.evidence_id} note`, ev.note);
      scanText(fixture, `${ev.evidence_id} method`, ev.method);
    }
    for (const pe of obj.public_evidence || []) {
      scanText(fixture, `${pe.evidence_id} method`, pe.method);
      scanText(fixture, `${pe.evidence_id} limitations`, pe.limitations);
    }
    for (const k of ["correlation_not_causation_note", "business_relevance", "proposed_change_summary", "source_summary", "note"])
      if (typeof obj[k] === "string") scanText(fixture, k, obj[k]);
    const tp = obj.test_plan || {};
    for (const k of ["hypothesis", "baseline", "change", "success_threshold", "stop_threshold", "period", "observation_window"])
      if (typeof tp[k] === "string") scanText(fixture, `test_plan.${k}`, tp[k]);
    const ps = obj.period_filters?.period_start ?? obj.period_start;
    const pe = obj.period_filters?.period_end ?? obj.period_end;
    if (ps) seen(fixture, "period_start", "period_start", ps, "structured");
    if (pe) seen(fixture, "period_end", "period_end", pe, "structured");
  };

  const FAM9 = [
    "findings/f05-ambiguous-metric-drop.json",
    "clean/f09-verifier-input-ok.json",
    "clean/f10-atomic-claims.json",
    "contaminated/f07-analysis-with-rationale.json",
    "contaminated/f08-verifier-input-leaked.json",
  ];
  for (const name of FAM9) {
    const obj = jsonFixtures[name];
    if (!obj) continue;
    collectText(name, obj);
    walkData(name, obj);
  }

  // (a) every stated value must equal the canonical family value
  for (const o of obs) {
    const canon = CANON[o.field];
    if (canon === undefined) continue;
    const eq = typeof canon === "number" ? Math.abs(Number(o.value) - canon) < 1e-6 : String(o.value) === String(canon);
    if (!eq) fail(`§9 ${o.fixture} [${o.where}] ${o.field}: ${o.kind} says ${o.value}, evidence/family value is ${canon}`);
  }
  // (b) the same claim repeated across f05 / f09 / f10 (and f07 / f08) must not diverge
  const byField = new Map();
  for (const o of obs) {
    if (!byField.has(o.field)) byField.set(o.field, []);
    byField.get(o.field).push(o);
  }
  for (const [field, list] of byField) {
    const distinct = [...new Set(list.map((o) => String(o.value)))];
    if (distinct.length > 1)
      fail(`§9 ${field}: divergent across the family -> ${list.map((o) => `${o.fixture}[${o.where}]=${o.value}`).join(" ; ")}`);
  }

  if (sectionOk())
    pass(`${obs.length} stated values agree with cited evidence and across f05/f07/f08/f09/f10 ` +
      `(control-page count, impressions/clicks, CTR, query & sibling counts, daily means, thresholds, periods, windows)`);
}

// ------------------------------------------------------------------- summary
console.log(`\n${"=".repeat(60)}`);
if (failures === 0) { console.log("RESULT: PASS — all static fixture checks green"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
