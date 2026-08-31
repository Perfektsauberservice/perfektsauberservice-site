#!/usr/bin/env node
// Partner pipeline — negative self-test for the §9 claim-text/evidence gate in
// check-fixtures.mjs (Phase 1 authoring).
//
// Proves that a claim whose wording contradicts its own evidence ledger is
// REJECTED by the static check. Fully offline and read-only against the real
// repo: it copies the fixtures tree to an OS temp dir, tampers exactly ONE claim
// in the COPY ("Six pages" -> "Four pages" in f09 C-004), realigns the copy's
// manifest so only §9 can fail, then asserts check-fixtures.mjs exits non-zero
// naming that contradiction. The temp copy is deleted unconditionally. The real
// fixture is never touched.
//
// Run: node agent/workflow/pipeline/tools/check-fixtures-negtest.mjs
// Exit 0 = the gate correctly rejected the tampered claim; non-zero = it did not.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_FIXTURES = join(HERE, "..", "fixtures");
const CHECKER = join(HERE, "check-fixtures.mjs");

const TARGET = "clean/f09-verifier-input-ok.json";
const GOOD = "Six pages sharing the identical 2026-08-17 shared-header change";
const BAD = "Four pages sharing the identical 2026-08-17 shared-header change";

const run = (extra) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CHECKER, ...extra], { encoding: "utf8", stdio: "pipe" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` };
  }
};

let tmp;
let ok = false;
try {
  tmp = mkdtempSync(join(tmpdir(), "pss-fixture-negtest-"));
  const fx = join(tmp, "fixtures");
  cpSync(REAL_FIXTURES, fx, { recursive: true });

  const p = join(fx, TARGET);
  const original = readFileSync(p, "utf8");
  if (!original.includes(GOOD)) {
    console.error(`SETUP FAIL: '${GOOD}' not present in ${TARGET} — is the P-1 correction applied?`);
    process.exit(2);
  }
  writeFileSync(p, original.replace(GOOD, BAD));
  console.log(`tampered copy: ${TARGET}  "Six pages" -> "Four pages" (C-004)`);

  // realign the copy's manifest to the tampered bytes, so the sha256 gate passes
  // and the ONLY thing that can fail is the §9 text/evidence contradiction
  const wm = run([`--fixtures-dir=${fx}`, "--write-manifest"]);
  if (wm.code !== 0) {
    console.error("SETUP FAIL: could not regenerate the temp manifest\n" + wm.out);
    process.exit(2);
  }

  const res = run([`--fixtures-dir=${fx}`]);
  const hit = res.out
    .split("\n")
    .find((l) => /FAIL/.test(l) && /f09/.test(l) && /control_page_count/.test(l));

  if (res.code !== 0 && hit) {
    ok = true;
    console.log("negative test PASS — the tampered claim was rejected");
    console.log(`  checker exit code : ${res.code}`);
    console.log(`  detecting line    : ${hit.trim()}`);
  } else {
    console.log("negative test FAIL — the tampered claim was NOT rejected as expected");
    console.log(`  checker exit code : ${res.code}`);
    console.log(res.out);
  }
} finally {
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true });
    console.log(`  temp copy removed : ${tmp}`);
  }
}

process.exit(ok ? 0 : 1);
