#!/usr/bin/env node
// Partner pipeline — negative self-test for the schema-key gate (Phase 1
// authoring).
//
// F-4 fix: additionalProperties, properties, required, type, enum, $schema, $id
// are words of the JSON Schema itself, never fields of an artifact. Every
// handoff artifact branch in handoff.schema.json is additionalProperties:false,
// so check-fixtures.mjs (section 3) already rejects any top-level key that is
// not in the schema branch's properties — this negative test PROVES that gate
// catches each of the seven schema-keyword words specifically, by injecting all
// seven as top-level keys into a real artifact fixture COPY and asserting
// check-fixtures.mjs names every one as an unexpected key. The real fixture is
// never touched.
//
// Run: node agent/workflow/pipeline/tools/check-schema-key-negtest.mjs
// Exit 0 = every injected schema keyword was rejected; non-zero = it was not.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_FIXTURES = join(HERE, "..", "fixtures");
const CHECKER = join(HERE, "check-fixtures.mjs");

// A real artifact fixture with artifact_type set, so it hits check-fixtures.mjs
// section 3's additionalProperties:false schema-branch check.
const TARGET = "clean/f10-atomic-claims.json";

const SCHEMA_KEYWORDS = ["additionalProperties", "properties", "required", "type", "enum", "$schema", "$id"];

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
  tmp = mkdtempSync(join(tmpdir(), "pss-schema-key-negtest-"));
  const fx = join(tmp, "fixtures");
  cpSync(REAL_FIXTURES, fx, { recursive: true });

  // ---- control: the untouched copy must PASS -------------------------------
  {
    const res = run([`--fixtures-dir=${fx}`]);
    check("control: untouched fixture copy passes", res.code === 0, `exit ${res.code}`);
  }

  // ---- inject all seven schema keywords as top-level keys in one fixture ---
  const p = join(fx, TARGET);
  const original = JSON.parse(readFileSync(p, "utf8"));
  const tampered = { ...original };
  for (const kw of SCHEMA_KEYWORDS) tampered[kw] = kw === "type" ? "bogus" : kw === "required" ? [] : {};
  writeFileSync(p, JSON.stringify(tampered, null, 2) + "\n");
  console.log(`tampered copy: ${TARGET}  injected top-level keys: ${SCHEMA_KEYWORDS.join(", ")}`);

  // realign the copy's manifest to the tampered bytes, so sha256 passes and the
  // ONLY thing that can fail is the additionalProperties:false rejection
  const wm = run([`--fixtures-dir=${fx}`, "--write-manifest"]);
  if (wm.code !== 0) {
    console.error("SETUP FAIL: could not regenerate the temp manifest\n" + wm.out);
    process.exit(2);
  }

  const res = run([`--fixtures-dir=${fx}`]);
  for (const kw of SCHEMA_KEYWORDS) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`FAIL.*unexpected key "${escaped}"`);
    const named = re.test(res.out);
    check(`"${kw}" injected as a top-level artifact key is rejected`, res.code !== 0 && named);
  }
} finally {
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true });
    console.log(`  temp copy removed : ${tmp}`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(allOk ? "RESULT: PASS — every injected schema keyword was rejected before handoff" : "RESULT: FAIL — a schema keyword was not caught");
process.exit(allOk ? 0 : 1);
