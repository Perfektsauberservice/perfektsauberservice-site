#!/usr/bin/env node
// Partner pipeline — strict single-JSON-object output gate (Phase 1 authoring).
//
// Deterministic, offline. No network, no secrets.
//
// Run (static contract check + built-in parser battery):
//   node agent/workflow/pipeline/tools/check-json-output.mjs
// Validate one real agent reply before handoff:
//   node agent/workflow/pipeline/tools/check-json-output.mjs --file=<path>
//   cat reply.txt | node agent/workflow/pipeline/tools/check-json-output.mjs --stdin
//
// Rule (all six agents): the reply is EXACTLY one JSON object — no preamble, no
// trailing text, no Markdown fence, no second object, and no artificial
// HTML-escaping of <, >, or & in string values (explanations belong in approved
// schema fields, not in escaped punctuation). A reply that fails this gate is
// rejected BEFORE handoff and is not forwarded to the next stage.
//
// F-9 fix (SMK-ANA RETRY_EXHAUSTED incident, 2026-08-31): a reproducer proved
// ASCII <, >, & in agent-authored prose get HTML-entity-encoded by a systemic
// platform/transport behavior, 100% of the time, for ANY agent, regardless of
// an explicit "do not escape" instruction (the rule above was already present
// verbatim and still failed 3 consecutive attempts) — while Unicode ≥/≤ and
// word form ("at least") pass through unescaped. The checker's escape-detection
// (findHtmlEscaping) is NOT weakened or taught to normalize &gt;/&lt;/&amp; —
// that would mask a real STRICT-JSON-GATE violation. Instead each agent's
// contract now requires Unicode ≥/≤/≠ or word form for freshly-composed
// comparison language, and section 1 below checks that guidance is present.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");
const ALL_AGENTS = ["competitor-intelligence", "investigator", "analyst", "verifier", "implementer", "qa"];

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => console.log(`\n== ${m} ==`);

// ---------------------------------------------------------------------------
// The parser: returns { ok: true, value } or { ok: false, reason }.
// ---------------------------------------------------------------------------
export function parseStrictAgentJson(raw) {
  if (typeof raw !== "string") return { ok: false, reason: "not a string" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty output" };
  if (/`/.test(trimmed)) return { ok: false, reason: "backtick character present (fence or inline code)" };
  if (!trimmed.startsWith("{")) return { ok: false, reason: "does not start with '{' (preamble, bare word 'json', or wrong type)" };
  if (!trimmed.endsWith("}")) return { ok: false, reason: "does not end with '}' (trailing text)" };

  let value;
  try {
    value = JSON.parse(trimmed);
  } catch (e) {
    // JSON.parse rejects any trailing/leading junk, a second object, or a bare
    // fragment, so a parse failure here covers "prose + JSON", "two objects",
    // and "trailing prose" alike.
    return { ok: false, reason: `not a single valid JSON value: ${e.message}` };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { ok: false, reason: "top level is not a JSON object" };

  const escapeHit = findHtmlEscaping(value);
  if (escapeHit) return { ok: false, reason: `artificial HTML-escaping in ${escapeHit.path}: "${escapeHit.token}"` };

  return { ok: true, value };
}

function findHtmlEscaping(node, path = "$") {
  if (typeof node === "string") {
    const m = node.match(/&lt;|&gt;|&amp;|&quot;|&#39;|&#x27;|&#x2F;|&apos;/);
    return m ? { path, token: m[0] } : null;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const hit = findHtmlEscaping(node[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const hit = findHtmlEscaping(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// CLI entry point only — importing parseStrictAgentJson from another tool
// (e.g. check-retry-policy.mjs) must never trigger this script's own checks,
// output, or process.exit.
// ---------------------------------------------------------------------------
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {

// ---------------------------------------------------------------------------
// 1. static: every agent's body carries the strict-output contract
// ---------------------------------------------------------------------------
section("1. strict-output contract text present in each agent");
for (const role of ALL_AGENTS) {
  const p = join(AGENTS_DIR, `${role}.md`);
  if (!existsSync(p)) { fail(`${role}.md missing`); continue; }
  const md = readFileSync(p, "utf8");
  const hasHeading = /##\s*Output format \(strict/i.test(md);
  const oneObject = /exactly one JSON object/i.test(md);
  const noFence = /no (markdown )?(code )?fences?/i.test(md) || /no.*```json/i.test(md);
  const noEscape = /HTML[- ]escap/i.test(md);
  const rejectedPreHandoff = /rejected\s+before\s+handoff/i.test(md);
  const firstLastChar = /first character/i.test(md) && /last character/i.test(md);
  const noBacktickAnywhere = /backtick/i.test(md);
  const noBareJson = /word `json`/i.test(md);
  const noSchemaRepeat = /do not repeat.{0,20}schema/i.test(md);
  const noExamples = /worked examples/i.test(md);
  const finalRuleHeading = /##\s*Final output rule/i.test(md);
  const finalSelfCheckOrder = /Final self-check, in this exact order/i.test(md);
  // F-9/F-9b: comparison-notation guidance (Unicode ≥/≤/≠ or word form instead
  // of ASCII >=/<=/!= in freshly-composed prose), broadened after a second
  // incident (SMK-ANA post-fix validation) showed the same escaping bug also
  // hits HTML/XML tag-name references (e.g. "<title>") — not just comparisons.
  const comparisonNotation = /when composing new prose/i.test(md) &&
    /≥/.test(md) && /≤/.test(md) &&
    /never the ASCII operators/i.test(md) &&
    /HTML\/XML tag or markup element/i.test(md);
  // F-9c, root-caused from a real E2E-LOW QA run, 2026-08-31: a tag-name
  // reference copied VERBATIM from fixture-provided prose (a success
  // criterion containing literal "<h1>") still trips the platform's
  // escaping bug even though the agent never deviated from its input -
  // the "copy literal values as-is" rule and the "avoid the character in
  // fresh prose" rule collided. Fix: carve out tag-name references
  // specifically (never exact expected strings or hrefs) as safe to
  // retell in word form even when otherwise transcribing verbatim.
  const tagNameCarveOut = /retell that tag-name portion in word form/i.test(md);
  const complete = hasHeading && oneObject && noFence && noEscape && rejectedPreHandoff &&
    firstLastChar && noBacktickAnywhere && noBareJson && noSchemaRepeat && noExamples &&
    finalRuleHeading && finalSelfCheckOrder && comparisonNotation && tagNameCarveOut;
  if (complete) pass(`${role}: strict-output contract complete (incl. first/last-char rule, comparison-notation guidance, tag-name carve-out, + final self-check)`);
  else fail(`${role}: strict-output contract incomplete (heading=${hasHeading} oneObject=${oneObject} noFence=${noFence} noEscape=${noEscape} rejected=${rejectedPreHandoff} firstLastChar=${firstLastChar} noBacktickAnywhere=${noBacktickAnywhere} noBareJson=${noBareJson} noSchemaRepeat=${noSchemaRepeat} noExamples=${noExamples} finalRuleHeading=${finalRuleHeading} finalSelfCheckOrder=${finalSelfCheckOrder} comparisonNotation=${comparisonNotation} tagNameCarveOut=${tagNameCarveOut})`);
}

// ---------------------------------------------------------------------------
// 2. parser battery — positive and negative cases
// ---------------------------------------------------------------------------
section("2. strict-JSON parser battery");
const CASES = [
  { name: "single object", input: '{"a":1,"b":"ok"}', expect: true },
  { name: "surrounding whitespace only", input: '\n\n  {"a":1}\n  \n', expect: true },
  { name: "literal < > & preserved", input: '{"note":"x < y & z > w"}', expect: true },
  { name: "nested object/array, still one root", input: '{"a":{"b":[1,2,3]},"c":null}', expect: true },

  { name: "fenced ```json", input: '```json\n{"a":1}\n```', expect: false },
  { name: "bare ``` fence", input: '```\n{"a":1}\n```', expect: false },
  { name: "prose before", input: 'Here is the result:\n{"a":1}', expect: false },
  { name: "prose after", input: '{"a":1}\nHope this helps!', expect: false },
  { name: "two objects", input: '{"a":1}\n{"b":2}', expect: false },
  { name: "trailing comma junk", input: '{"a":1},', expect: false },
  { name: "top-level array, not object", input: '[1,2,3]', expect: false },
  { name: "truncated / invalid JSON", input: '{"a":1,', expect: false },
  { name: "empty output", input: '', expect: false },
  { name: "unjustified HTML-escaped <", input: '{"note":"x &lt; y"}', expect: false },
  { name: "unjustified HTML-escaped > (SMK-ANA regression)", input: '{"test_plan":{"success_threshold":"CTR rises to &gt;= 2.50%"}}', expect: false },
  { name: "Unicode ≥ instead of ASCII >= (workaround, must pass)", input: '{"test_plan":{"success_threshold":"CTR rises to ≥ 2.50%"}}', expect: true },
  { name: "unjustified HTML-escaped tag name (SMK-ANA post-fix regression)", input: '{"test_plan":{"change":"Rewrite the &lt;title&gt; tag"}}', expect: false },
  { name: "word-form tag reference (workaround, must pass)", input: '{"test_plan":{"change":"Rewrite the title tag"}}', expect: true },
  { name: "unjustified HTML-escaped &", input: '{"note":"Tom &amp; Jerry"}', expect: false },
  { name: "unjustified HTML-escaped quote", input: '{"note":"say &quot;hi&quot;"}', expect: false },
  { name: "single inline backtick, no fence", input: '{"note":"see `x.js` for details"}', expect: false },
  { name: "bare word json prefix, no fence", input: 'json\n{"a":1}', expect: false },
  { name: "backtick inside value, otherwise clean", input: '{"a":"it`s fine"}', expect: false },
];
let bMiss = 0;
for (const c of CASES) {
  const r = parseStrictAgentJson(c.input);
  const got = r.ok;
  if (got !== c.expect) { fail(`battery "${c.name}": expected ${c.expect ? "PASS" : "FAIL"}, got ${got ? "PASS" : "FAIL"} (${r.reason || ""})`); bMiss++; }
}
if (bMiss === 0) pass(`${CASES.length} parser cases behave as expected (${CASES.filter((c) => c.expect).length} pass / ${CASES.filter((c) => !c.expect).length} reject)`);

// ---------------------------------------------------------------------------
// 3. optional: validate one real reply before handoff
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith("--file="));
const useStdin = args.includes("--stdin");
if (fileArg || useStdin) {
  section("3. handoff gate on a real reply");
  const raw = fileArg ? readFileSync(fileArg.slice("--file=".length), "utf8") : readFileSync(0, "utf8");
  const r = parseStrictAgentJson(raw);
  if (r.ok) pass("reply is exactly one JSON object — forwarded to the next stage");
  else fail(`reply rejected before handoff: ${r.reason}`);
}

console.log(`\n${"=".repeat(60)}`);
if (failures === 0) { console.log("RESULT: PASS — strict single-JSON-object output gate holds"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);

} // isMainModule
