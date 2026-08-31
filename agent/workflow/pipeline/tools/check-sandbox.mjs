#!/usr/bin/env node
// Partner pipeline — sandbox-manifest static check (Phase 1 authoring).
//
// Deterministic, offline, read-only against the official repo. No network, no
// secrets, no external calls.
//
// Run (static, against the repo):
//   node agent/workflow/pipeline/tools/check-sandbox.mjs
// Regenerate the manifest (role decisions preserved by sandbox_path):
//   node agent/workflow/pipeline/tools/check-sandbox.mjs --write-manifest
// Verify an actually-built sandbox directory against the manifest:
//   node agent/workflow/pipeline/tools/check-sandbox.mjs --sandbox-dir=<path>
// Ask whether a role may receive a file (exit 0 = yes, non-zero = no):
//   node agent/workflow/pipeline/tools/check-sandbox.mjs --role-check=<role>:<sandbox_path>
// Use an alternate manifest (negative tests):
//   node agent/workflow/pipeline/tools/check-sandbox.mjs --manifest=<path> ...
//
// What the static check proves (all must hold before any ACCEPTANCE / EXTENDED run):
//   1. sandbox-manifest.json parses and its head counters are self-consistent
//   2. every entry is well-formed: exact key set, category in {fixture,contract},
//      roles a subset of the six pipeline roles, sha256 is 64 lowercase hex,
//      sandbox_path is repo-relative and normalised, source_path is under the
//      pipeline root
//   3. no duplicate sandbox_path / source_path
//   4. every source_path exists on disk and its LF-normalised sha256 matches
//   5. the 18 `fixture` entries are exactly fixture-manifest.json's 18 files, byte
//      for byte (same sha256 in both manifests)
//   6. exactly 2 `contract` entries, and they are the two schema files
//   7. the schemas (structural contracts) carry a non-empty roles list
//   8. no real-PSS identifier / secret / absolute path in the manifest text

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PIPELINE = join(HERE, "..");
const REPO_ROOT = resolve(PIPELINE, "..", "..", "..");
const FIXTURES = join(PIPELINE, "fixtures");

const ROLES = ["competitor-intelligence", "investigator", "analyst", "verifier", "implementer", "qa"];
const CONTRACT_PATHS = ["schema/evidence-ledger.schema.json", "schema/handoff.schema.json"];
const ENTRY_KEYS = ["sandbox_path", "source_path", "category", "roles", "sha256"];
const OPTIONAL_ENTRY_KEYS = ["purpose"];

const args = process.argv.slice(2);
const WRITE = args.includes("--write-manifest");
const manifestArg = args.find((a) => a.startsWith("--manifest="));
const sandboxArg = args.find((a) => a.startsWith("--sandbox-dir="));
const roleCheckArg = args.find((a) => a.startsWith("--role-check="));
const MANIFEST = manifestArg ? resolve(manifestArg.slice("--manifest=".length)) : join(FIXTURES, "sandbox-manifest.json");

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => console.log(`\n== ${m} ==`);

const MANDATED_IDENTITY = /Perfekt Sauber Service <kontakt@perfektsauberservice\.com>/g;
const sha256LF = (abs) =>
  createHash("sha256").update(readFileSync(abs, "utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");
const readJSON = (abs) => JSON.parse(readFileSync(abs, "utf8"));
const HEX64 = /^[0-9a-f]{64}$/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// ---- the source list the sandbox is composed from ---------------------------
// 18 fixtures = every file under fixtures/ except the two manifests.
// 2 contracts = the two schema files.
function sourceInventory() {
  const fx = walk(FIXTURES)
    .map((p) => relative(FIXTURES, p).split("\\").join("/"))
    .filter((r) => r !== "fixture-manifest.json" && r !== "sandbox-manifest.json")
    .sort((a, b) => a.localeCompare(b));
  const entries = [];
  for (const rel of fx) {
    entries.push({
      sandbox_path: rel,
      source_path: `agent/workflow/pipeline/fixtures/${rel}`,
      category: "fixture",
      abs: join(FIXTURES, rel),
    });
  }
  for (const rel of CONTRACT_PATHS) {
    entries.push({
      sandbox_path: rel,
      source_path: `agent/workflow/pipeline/${rel}`,
      category: "contract",
      abs: join(PIPELINE, rel),
    });
  }
  return entries.sort((a, b) => a.sandbox_path.localeCompare(b.sandbox_path));
}

// ------------------------------------------------------------ --write-manifest
if (WRITE) {
  let prevRoles = new Map(), prevPurpose = new Map();
  if (existsSync(MANIFEST)) {
    try {
      for (const f of readJSON(MANIFEST).files || []) {
        if (Array.isArray(f.roles)) prevRoles.set(f.sandbox_path, f.roles);
        if (typeof f.purpose === "string") prevPurpose.set(f.sandbox_path, f.purpose);
      }
    } catch { /* regenerate from scratch */ }
  }
  const inv = sourceInventory();
  const files = inv.map((e) => {
    const row = {
      sandbox_path: e.sandbox_path,
      source_path: e.source_path,
      category: e.category,
      roles: prevRoles.get(e.sandbox_path) ?? [],
      sha256: sha256LF(e.abs),
    };
    if (prevPurpose.has(e.sandbox_path)) row.purpose = prevPurpose.get(e.sandbox_path);
    return row;
  });
  const manifest = {
    note:
      "Full declared inventory of the fixture-only test SANDBOX. The Coordinator/harness builds the " +
      "sandbox OUTSIDE the official repo by copying EXACTLY the files listed here — the 18 fixtures " +
      "(also in fixture-manifest.json) plus the 2 structural contracts (the schemas) — and nothing " +
      "else. After copying, every sha256 is re-verified. Each agent under test receives ONLY the " +
      "subset of entries whose `roles` array contains that agent's name; an entry with `roles: []` " +
      "stays in the Coordinator/harness workspace and is never placed in an agent slice. An extra " +
      "file in the sandbox, a missing contract, a sha256 mismatch, or a slice that hands a role a " +
      "file it is not listed for -> the run is FAIL and the pipeline is BLOCKED. sha256 is over " +
      "LF-normalised content. Regenerate with: node agent/workflow/pipeline/tools/check-sandbox.mjs " +
      "--write-manifest (role decisions are preserved by sandbox_path).",
    schema_version: "1.0.0-phase1",
    official_repo_root: "agent/workflow/pipeline",
    roles: ROLES,
    file_count: files.length,
    fixture_count: files.filter((f) => f.category === "fixture").length,
    contract_count: files.filter((f) => f.category === "contract").length,
    files,
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${relative(REPO_ROOT, MANIFEST).split("\\").join("/")} with ${files.length} entries`);
  process.exit(0);
}

// ------------------------------------------------------------------ load
let manifest;
try {
  manifest = readJSON(MANIFEST);
} catch (e) {
  console.log(`  FAIL  sandbox-manifest.json does not parse or is missing: ${e.message}`);
  process.exit(1);
}
const files = Array.isArray(manifest.files) ? manifest.files : [];
const bySandboxPath = new Map(files.map((f) => [f.sandbox_path, f]));

// ------------------------------------------------------------ --role-check
if (roleCheckArg) {
  const spec = roleCheckArg.slice("--role-check=".length);
  const idx = spec.indexOf(":");
  const role = spec.slice(0, idx);
  const sp = spec.slice(idx + 1);
  const entry = bySandboxPath.get(sp);
  if (!ROLES.includes(role)) { console.log(`unknown role "${role}"`); process.exit(2); }
  if (!entry) { console.log(`sandbox_path not in manifest: ${sp}`); process.exit(2); }
  if (Array.isArray(entry.roles) && entry.roles.includes(role)) {
    console.log(`ALLOW  role "${role}" may receive ${sp}`);
    process.exit(0);
  }
  console.log(`DENY   role "${role}" may NOT receive ${sp} (roles: [${(entry.roles || []).join(", ")}])`);
  process.exit(1);
}

// ------------------------------------------------------------ 1. head counters
section("1. manifest head");
if (manifest.schema_version !== "1.0.0-phase1") fail(`schema_version "${manifest.schema_version}" != "1.0.0-phase1"`);
if (manifest.file_count !== files.length) fail(`file_count ${manifest.file_count} != files.length ${files.length}`);
const nFixture = files.filter((f) => f.category === "fixture").length;
const nContract = files.filter((f) => f.category === "contract").length;
if (manifest.fixture_count !== nFixture) fail(`fixture_count ${manifest.fixture_count} != ${nFixture}`);
if (manifest.contract_count !== nContract) fail(`contract_count ${manifest.contract_count} != ${nContract}`);
if (nFixture !== 18) fail(`expected 18 fixture entries, found ${nFixture}`);
if (nContract !== 2) fail(`expected 2 contract entries, found ${nContract}`);
if (failures === 0) pass(`head consistent: ${files.length} files = ${nFixture} fixture + ${nContract} contract`);

// ------------------------------------------------------------ 2. entry shape
section("2. entry shape");
{
  let bad = 0;
  const seenS = new Set(), seenSrc = new Set();
  for (const f of files) {
    const label = f.sandbox_path || "(no sandbox_path)";
    for (const k of ENTRY_KEYS) if (!(k in f)) { fail(`${label}: missing "${k}"`); bad++; }
    for (const k of Object.keys(f))
      if (!ENTRY_KEYS.includes(k) && !OPTIONAL_ENTRY_KEYS.includes(k)) { fail(`${label}: unexpected key "${k}"`); bad++; }
    if (f.category !== "fixture" && f.category !== "contract") { fail(`${label}: category "${f.category}" not fixture|contract`); bad++; }
    if (!Array.isArray(f.roles)) { fail(`${label}: roles is not an array`); bad++; }
    else for (const r of f.roles) if (!ROLES.includes(r)) { fail(`${label}: role "${r}" not one of ${ROLES.join(", ")}`); bad++; }
    if (typeof f.sha256 !== "string" || !HEX64.test(f.sha256)) { fail(`${label}: sha256 not 64 lowercase hex`); bad++; }
    if (typeof f.sandbox_path !== "string" || f.sandbox_path.includes("\\") || f.sandbox_path.startsWith("/") || f.sandbox_path.split("/").includes("..")) {
      fail(`${label}: sandbox_path must be a normalised repo-relative POSIX path`); bad++;
    }
    if (typeof f.source_path !== "string" || !f.source_path.startsWith("agent/workflow/pipeline/")) {
      fail(`${label}: source_path must be under agent/workflow/pipeline/`); bad++;
    }
    if (seenS.has(f.sandbox_path)) { fail(`duplicate sandbox_path ${f.sandbox_path}`); bad++; } else seenS.add(f.sandbox_path);
    if (seenSrc.has(f.source_path)) { fail(`duplicate source_path ${f.source_path}`); bad++; } else seenSrc.add(f.source_path);
  }
  if (bad === 0) pass(`all ${files.length} entries well-formed, no duplicates`);
}

// ------------------------------------------------------------ 3. source sha256
section("3. source files present, sha256 matches");
{
  let bad = 0;
  for (const f of files) {
    const abs = join(REPO_ROOT, f.source_path);
    if (!existsSync(abs)) { fail(`${f.sandbox_path}: source_path not on disk (${f.source_path})`); bad++; continue; }
    const got = sha256LF(abs);
    if (got !== f.sha256) { fail(`${f.sandbox_path}: sha256 ${f.sha256.slice(0, 12)}… != disk ${got.slice(0, 12)}… (run --write-manifest if intended)`); bad++; }
  }
  if (bad === 0) pass("every source_path exists and its LF-normalised sha256 matches the manifest");
}

// ------------------------------------------------------------ 4. exact inventory
section("4. sandbox composition is exactly 18 fixtures + 2 contracts");
{
  const inv = sourceInventory();
  const want = new Set(inv.map((e) => e.sandbox_path));
  const got = new Set(files.map((f) => f.sandbox_path));
  for (const p of got) if (!want.has(p)) fail(`manifest lists a file that is not a valid sandbox source: ${p}`);
  for (const p of want) if (!got.has(p)) fail(`sandbox source missing from manifest: ${p}`);
  for (const e of inv) {
    const f = bySandboxPath.get(e.sandbox_path);
    if (f && f.category !== e.category) fail(`${e.sandbox_path}: category "${f.category}" should be "${e.category}"`);
    if (f && f.source_path !== e.source_path) fail(`${e.sandbox_path}: source_path "${f.source_path}" should be "${e.source_path}"`);
  }
  if (failures === 0 || got.size === want.size) pass(`composition matches: ${want.size} declared sources, no more, no fewer`);
}

// ------------------------------------------------------------ 5. fixture cross-check
section("5. the 18 fixture entries == fixture-manifest.json, byte for byte");
{
  let fm;
  try { fm = readJSON(join(FIXTURES, "fixture-manifest.json")); }
  catch (e) { fail(`fixture-manifest.json unreadable: ${e.message}`); fm = { files: [] }; }
  const fmMap = new Map((fm.files || []).map((x) => [x.path, x.sha256]));
  const sandboxFixtures = files.filter((f) => f.category === "fixture");
  if (sandboxFixtures.length !== fmMap.size) fail(`fixture count ${sandboxFixtures.length} != fixture-manifest ${fmMap.size}`);
  for (const f of sandboxFixtures) {
    if (!fmMap.has(f.sandbox_path)) { fail(`fixture ${f.sandbox_path} not in fixture-manifest.json`); continue; }
    if (fmMap.get(f.sandbox_path) !== f.sha256) fail(`fixture ${f.sandbox_path}: sha256 disagrees with fixture-manifest.json`);
  }
  for (const p of fmMap.keys()) if (!bySandboxPath.has(p)) fail(`fixture-manifest.json has ${p} but sandbox-manifest.json does not`);
  if (failures === 0) pass(`all 18 fixture entries agree with fixture-manifest.json`);
}

// ------------------------------------------------------------ 6/7. contracts
section("6. contracts are exactly the two schemas, with a non-empty roles list");
{
  const contracts = files.filter((f) => f.category === "contract").map((f) => f.sandbox_path).sort();
  if (JSON.stringify(contracts) !== JSON.stringify(CONTRACT_PATHS))
    fail(`contract entries ${JSON.stringify(contracts)} != ${JSON.stringify(CONTRACT_PATHS)}`);
  for (const f of files.filter((f) => f.category === "contract")) {
    if (!Array.isArray(f.roles) || f.roles.length === 0) fail(`${f.sandbox_path}: a contract must list at least one role`);
  }
  if (failures === 0) pass("both schemas present as contracts with non-empty roles");
}

// ------------------------------------------------------------ 8. no real-PSS ref
section("8. fictional-only — no real-PSS reference in the manifest");
{
  const forbidden = [
    /loffenau/i, /perfektsauberservice/i, /laurentiualin/i,
    /C:\\\\Users/i, /\.env(\.local)?\b/, /\bAW-\d/, /\bGTM-[A-Z0-9]/, /\bG-[A-Z0-9]{8,}/,
  ];
  const raw = readFileSync(MANIFEST, "utf8").replace(MANDATED_IDENTITY, "<mandated-git-identity>");
  let hit = false;
  for (const re of forbidden) { const m = raw.match(re); if (m) { fail(`real-PSS reference "${m[0]}"`); hit = true; } }
  if (!hit) pass("no real-PSS identifiers, secrets, tag ids, or absolute paths");
}

// ------------------------------------------------------------ optional: built sandbox
if (sandboxArg) {
  section("9. built sandbox directory matches the manifest exactly");
  const dir = resolve(sandboxArg.slice("--sandbox-dir=".length));
  if (!existsSync(dir)) {
    fail(`--sandbox-dir does not exist: ${dir}`);
  } else {
    const onDisk = walk(dir).map((p) => relative(dir, p).split("\\").join("/")).sort();
    const listed = new Set(files.map((f) => f.sandbox_path));
    for (const rel of onDisk) if (!listed.has(rel)) fail(`sandbox contains a file not in the manifest: ${rel}`);
    for (const f of files) {
      const abs = join(dir, f.sandbox_path);
      if (!existsSync(abs)) { fail(`sandbox is missing a manifest file: ${f.sandbox_path}`); continue; }
      const got = sha256LF(abs);
      if (got !== f.sha256) fail(`sandbox copy of ${f.sandbox_path} has sha256 ${got.slice(0, 12)}… != manifest ${f.sha256.slice(0, 12)}…`);
    }
    if (failures === 0) pass(`sandbox holds exactly the ${files.length} manifest files, all hashes verified`);
  }
}

console.log(`\n${"=".repeat(60)}`);
if (failures === 0) { console.log("RESULT: PASS — sandbox manifest is complete and consistent"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
