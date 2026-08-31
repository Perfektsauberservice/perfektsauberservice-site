#!/usr/bin/env node
// Partner pipeline — negative self-test for the sandbox-manifest gate
// (check-sandbox.mjs). Phase 1 authoring.
//
// Proves the gate REJECTS each of the four failure modes the Acceptance report
// requires it to catch:
//   A. an extra file in the built sandbox that the manifest does not list
//   B. a missing structural contract (a schema absent from the sandbox)
//   C. a wrong hash (a manifest file whose sandbox copy was altered)
//   D. a role that is handed a file it is not listed for
// plus a clean control that must PASS.
//
// Fully offline and read-only against the official repo: it builds a throwaway
// sandbox under the OS temp dir from the real manifest, tampers a COPY, asserts
// check-sandbox.mjs exits non-zero with the expected message, then deletes the
// temp tree unconditionally. This is harness code, not a pipeline agent — the
// read-only agents' zero-write contract does not apply to it.
//
// Run: node agent/workflow/pipeline/tools/check-sandbox-negtest.mjs
// Exit 0 = every failure mode was rejected and the control passed.

import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PIPELINE = join(HERE, "..");
const REPO_ROOT = join(PIPELINE, "..", "..", "..");
const CHECKER = join(HERE, "check-sandbox.mjs");
const MANIFEST = join(PIPELINE, "fixtures", "sandbox-manifest.json");

const run = (extra) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CHECKER, ...extra], { encoding: "utf8", stdio: "pipe" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` };
  }
};

let tmp;
let allOk = true;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) allOk = false;
};

try {
  tmp = mkdtempSync(join(tmpdir(), "pss-sandbox-negtest-"));
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

  // Build a clean sandbox from the real manifest.
  const buildSandbox = (dest) => {
    for (const f of manifest.files) {
      const src = join(REPO_ROOT, f.source_path);
      const out = join(dest, f.sandbox_path);
      mkdirSync(dirname(out), { recursive: true });
      cpSync(src, out);
    }
  };

  // ---- control: a clean sandbox must PASS ----------------------------------
  {
    const sb = join(tmp, "clean");
    buildSandbox(sb);
    const res = run([`--sandbox-dir=${sb}`]);
    check("control: clean built sandbox passes", res.code === 0, `exit ${res.code}`);
  }

  // ---- A. extra file -----------------------------------------------------
  {
    const sb = join(tmp, "extra");
    buildSandbox(sb);
    writeFileSync(join(sb, "findings", "f99-smuggled.json"), "{}\n");
    const res = run([`--sandbox-dir=${sb}`]);
    const named = /not in the manifest:\s*findings\/f99-smuggled\.json/.test(res.out);
    check("A. extra file rejected", res.code !== 0 && named, `exit ${res.code}, named=${named}`);
  }

  // ---- B. missing contract (schema) ------------------------------------
  {
    const sb = join(tmp, "noschema");
    buildSandbox(sb);
    rmSync(join(sb, "schema", "handoff.schema.json"));
    const res = run([`--sandbox-dir=${sb}`]);
    const named = /missing a manifest file:\s*schema\/handoff\.schema\.json/.test(res.out);
    check("B. missing schema rejected", res.code !== 0 && named, `exit ${res.code}, named=${named}`);

    // and: a manifest that drops the contract entry fails the head/contract gate
    const m2 = JSON.parse(readFileSync(MANIFEST, "utf8"));
    m2.files = m2.files.filter((f) => f.sandbox_path !== "schema/handoff.schema.json");
    m2.file_count = m2.files.length;
    m2.contract_count = m2.files.filter((f) => f.category === "contract").length;
    const m2path = join(tmp, "manifest-no-contract.json");
    writeFileSync(m2path, JSON.stringify(m2, null, 2));
    const res2 = run([`--manifest=${m2path}`]);
    const caught = res2.code !== 0 && /contract entries|expected 2 contract entries/.test(res2.out);
    check("B. manifest without a contract entry rejected", caught, `exit ${res2.code}`);
  }

  // ---- C. wrong hash ---------------------------------------------------
  {
    const sb = join(tmp, "badhash");
    buildSandbox(sb);
    const target = join(sb, "clean", "f09-verifier-input-ok.json");
    writeFileSync(target, readFileSync(target, "utf8") + "\n");
    const res = run([`--sandbox-dir=${sb}`]);
    const named = /sandbox copy of clean\/f09-verifier-input-ok\.json has sha256/.test(res.out);
    check("C. altered file (wrong hash) rejected", res.code !== 0 && named, `exit ${res.code}, named=${named}`);
  }

  // ---- D. role not allowed to receive a file --------------------------
  {
    const deny = run(["--role-check=analyst:findings/f06-high-risk-ads-budget.json"]);
    const allow = run(["--role-check=verifier:clean/f09-verifier-input-ok.json"]);
    check("D. disallowed role rejected", deny.code === 1 && /DENY/.test(deny.out), `exit ${deny.code}`);
    check("D. allowed role accepted", allow.code === 0 && /ALLOW/.test(allow.out), `exit ${allow.code}`);
  }
} finally {
  if (tmp && existsSync(tmp)) {
    rmSync(tmp, { recursive: true, force: true });
    console.log(`  temp sandbox removed : ${tmp}`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(allOk ? "RESULT: PASS — every sandbox failure mode was rejected" : "RESULT: FAIL — a failure mode was not caught");
process.exit(allOk ? 0 : 1);
