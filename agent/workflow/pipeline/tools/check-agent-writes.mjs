#!/usr/bin/env node
// Partner pipeline — read-only agents must make ZERO writes (Phase 1 authoring).
//
// Deterministic, offline, read-only against the official repo.
//
// Run (static contract check + built-in detector battery):
//   node agent/workflow/pipeline/tools/check-agent-writes.mjs
// Scan a real run's per-stage tool-event logs during an ACCEPTANCE run:
//   node agent/workflow/pipeline/tools/check-agent-writes.mjs --events-dir=<run-dir>
//     expects <run-dir>/<stage>-events.json — a JSON array of tool-call records
//     { "tool": "...", "command": "...", "file_path": "...", "path": "..." }
//     for each read-only stage (competitor-intelligence, investigator, analyst,
//     verifier, qa). Any write vector -> that stage FAILS and the pipeline is
//     BLOCKED; the stage artifact is not forwarded. A missing or 0-byte event
//     log for a role is reported as BLOCKED (exit 2), never as a silent skip or
//     an implicit PASS — a zero-write claim always requires a real, captured,
//     non-empty transcript, never frontmatter alone.
//
// The five read-only stages may not create, modify, move, rename, or delete any
// file ANYWHERE — official repo, sandbox, isolated temp test repo, %TEMP% / %TMP%
// / $TMPDIR / /tmp, via a helper script, or as a command side effect. A write
// under OS temp is a violation like any other. Only the Implementer writes, and
// only inside the isolated temporary test repo.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");

// Line-ending-tolerant read for agent .md files. A CRLF checkout (Windows,
// core.autocrlf=true) is semantically identical content to an LF checkout,
// but frontmatter()'s `^---\n` anchor is LF-only, so an unnormalised CRLF
// read silently produces an empty frontmatter match -> toolList() reads as
// [] for every role, which happened to still read as "no write tool" for
// the five read-only roles (a false negative that was accidentally safe)
// but as a hard FAIL for the Implementer's "keeps Write + Edit" check (a
// false positive, and the actual symptom that surfaced this bug). This
// mirrors the existing LF-normalisation convention already used by
// check-fixtures.mjs's sha256() for the same reason. Only the read used for
// *parsing* is normalised — nothing about detectWriteVector() or the write-
// vector battery in section 3 (the actual security-relevant logic) changes.
const readNormalized = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const READ_ONLY = ["competitor-intelligence", "investigator", "analyst", "verifier", "qa"];
const WRITER = "implementer";
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Artifact"]);

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const section = (m) => console.log(`\n== ${m} ==`);

// ---------------------------------------------------------------------------
// The detector: given one tool-call record, return null (allowed for a
// read-only stage) or a string naming the write vector.
// ---------------------------------------------------------------------------
export function detectWriteVector(rec) {
  const tool = String(rec.tool || rec.name || "");
  if (WRITE_TOOLS.has(tool)) return `${tool} tool (file mutation)`;

  const isShell = /^(Bash|PowerShell|Shell|Sh)$/i.test(tool);
  const cmd = String(rec.command || rec.cmd || rec.input || "");
  if (!isShell || !cmd) return null;

  // 1. raw-command checks (before quote stripping)
  if (/<<-?\s*['"]?[A-Za-z_]/.test(cmd)) return "heredoc file creation";
  if (/@['"]\s*$/m.test(cmd) || /@['"][\s\S]*?['"]@/.test(cmd)) return "PowerShell here-string file creation";

  // 2. quote-stripped checks
  let s = cmd
    .replace(/'[^']*'/g, " Q ")
    .replace(/"(?:[^"\\]|\\.)*"/g, " Q ");

  // neutralise the only redirections a read-only stage may use
  const sNoNull = s
    .replace(/\d?>&\d/g, " ")
    .replace(/\d?>>?\s*(\/dev\/null|\$null|NUL|nul)\b/gi, " ");
  if (/>>?/.test(sNoNull)) return "shell output redirection to a file";
  if (/\|\s*tee\b/.test(s)) return "pipe to tee (writes a file)";
  if (/\|\s*(Out-File|Set-Content|Add-Content|Export-Csv|Export-Clixml|Tee-Object)\b/i.test(s))
    return "pipe to a PowerShell file-writing cmdlet";

  if (/\b(Set-Content|Add-Content|Out-File|New-Item|Export-Csv|Export-Clixml|Tee-Object|New-TemporaryFile)\b/i.test(s))
    return "PowerShell file-writing cmdlet";
  if (/\b(Copy-Item|Move-Item|Remove-Item|Rename-Item|Clear-Content)\b/i.test(s))
    return "PowerShell file mutation cmdlet";

  if (/(^|[\s;&|(])(cp|mv|rm|ln|dd|touch|mkdir|rmdir|truncate|install|shred|unlink)(\s|$)/.test(s))
    return "filesystem-mutating shell command (cp/mv/rm/ln/touch/mkdir/…)";
  if (/(^|[\s;&|(])(copy|move|ren|rename|del|erase|md|rd|xcopy|robocopy)(\s|$)/i.test(s) && /(^|[\s;&|(])(copy|move|ren|del|erase|xcopy|robocopy)\b/i.test(s))
    return "filesystem-mutating cmd.exe command (copy/move/del/…)";

  if (/%TEMP%|%TMP%|\$env:TE?MP\b|\$TMPDIR\b|\bmktemp\b|\bmkdtemp\b|GetTempFileName|GetTempPath/i.test(s))
    return "write into an OS temp location";
  if (/(^|[\s"'(])(\/tmp|\/var\/tmp)(\/|\s|$)/.test(cmd) || /\\AppData\\Local\\Temp/i.test(cmd))
    return "write into an OS temp location";

  if (/\bgit\s+(add|commit|stash|apply|am|reset|clean|rm|mv|tag\b|push|init|merge|rebase|cherry-pick|revert|restore|worktree)\b/.test(s))
    return "git write operation";
  if (/\bgit\s+(checkout|switch)\s+-[bc]\b/.test(s)) return "git branch creation";

  if (/\b(writeFileSync|writeFile|appendFileSync|appendFile|mkdirSync|cpSync|copyFileSync|rmSync|rmdirSync|renameSync|createWriteStream|truncateSync|writeSync)\b/.test(cmd))
    return "inline script filesystem write (node fs.*)";
  if (/\bopen\s*\(\s*[^,)]+,\s*['"][awx][bt+]*['"]/.test(cmd)) return "inline script file open for writing (python)";

  return null;
}

// ---------------------------------------------------------------------------
// 1. static: read-only agent frontmatter must not grant a write tool
// ---------------------------------------------------------------------------
section("1. agent frontmatter tool grants");
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : "";
}
function toolList(fm) {
  const m = fm.match(/^tools:\s*(.+)$/m);
  return m ? m[1].split(/[,\s]+/).map((t) => t.trim()).filter(Boolean) : [];
}
for (const role of READ_ONLY) {
  const p = join(AGENTS_DIR, `${role}.md`);
  if (!existsSync(p)) { fail(`${role}.md missing`); continue; }
  const tools = toolList(frontmatter(readNormalized(p)));
  const bad = tools.filter((t) => WRITE_TOOLS.has(t));
  if (bad.length) fail(`${role}: grants write tool(s) ${bad.join(", ")}`);
  else pass(`${role}: tools = [${tools.join(", ")}] — no write tool`);
}
{
  const p = join(AGENTS_DIR, `${WRITER}.md`);
  const tools = toolList(frontmatter(readNormalized(p)));
  if (tools.includes("Write") && tools.includes("Edit")) pass(`${WRITER}: retains Write + Edit (sole writer, temp repo only)`);
  else fail(`${WRITER}: expected to keep Write + Edit`);
}

// ---------------------------------------------------------------------------
// 2. static: each read-only agent body carries the zero-write contract
// ---------------------------------------------------------------------------
section("2. zero-write contract text present in each read-only agent");
for (const role of READ_ONLY) {
  const md = readNormalized(join(AGENTS_DIR, `${role}.md`));
  const hasHeading = /##\s*Zero-write contract/i.test(md);
  const namesTemp = /%TEMP%|OS temp/i.test(md);
  const namesVectors = /Set-Content/i.test(md) && /Out-File/i.test(md) && /New-Item/i.test(md) &&
    /heredoc|here-string/i.test(md) && /redirect/i.test(md);
  const namesConsequence = /BLOCKED/.test(md) && /not\s+forwarded/i.test(md);
  if (hasHeading && namesTemp && namesVectors && namesConsequence) pass(`${role}: zero-write contract complete`);
  else fail(`${role}: zero-write contract incomplete (heading=${hasHeading} temp=${namesTemp} vectors=${namesVectors} consequence=${namesConsequence})`);
}

// ---------------------------------------------------------------------------
// 3. detector battery — synthetic tool calls, each with a known verdict
// ---------------------------------------------------------------------------
section("3. write-vector detector battery");
const REJECT = [
  { tool: "Write", file_path: "x.txt" },
  { tool: "Edit", file_path: "x.txt" },
  { tool: "MultiEdit", file_path: "x.txt" },
  { tool: "NotebookEdit", file_path: "x.ipynb" },
  { tool: "Bash", command: "echo hi > out.txt" },
  { tool: "Bash", command: "cat a.json >> combined.log" },
  { tool: "Bash", command: "cat <<'EOF' > note.txt\nhi\nEOF" },
  { tool: "Bash", command: "printf '%s' hi | tee capture.txt" },
  { tool: "PowerShell", command: "Set-Content -Path x.txt -Value 'hi'" },
  { tool: "PowerShell", command: "'hi' | Out-File -FilePath x.txt" },
  { tool: "PowerShell", command: "New-Item -ItemType File -Path foo.txt" },
  { tool: "PowerShell", command: "@'\nline\n'@ | Set-Content y.txt" },
  { tool: "Bash", command: "cp fixtures/a.json /tmp/a.json" },
  { tool: "Bash", command: "mv a.json b.json" },
  { tool: "Bash", command: "rm -f scratch.json" },
  { tool: "Bash", command: "mkdir -p build/out" },
  { tool: "Bash", command: "D=$(mktemp) && echo x > \"$D\"" },
  { tool: "Bash", command: "echo cache > \"$TMPDIR/pipeline-cache.json\"" },
  { tool: "Bash", command: "echo x > %TEMP%\\note.txt" },
  { tool: "Bash", command: "node -e \"require('fs').writeFileSync('o.json','{}')\"" },
  { tool: "Bash", command: "python -c \"open('o.txt','w').write('x')\"" },
  { tool: "Bash", command: "git add -A" },
  { tool: "Bash", command: "git commit -m 'x'" },
  { tool: "Bash", command: "git switch -c scratch" },
];
const ALLOW = [
  { tool: "Bash", command: "git status --porcelain" },
  { tool: "Bash", command: "git log -1 --format='%H %an <%ae> | %cn <%ce>'" },
  { tool: "Bash", command: "git diff --cached" },
  { tool: "Bash", command: "git rev-parse HEAD" },
  { tool: "Bash", command: "git branch -a" },
  { tool: "Bash", command: "git show HEAD:agent/workflow/pipeline/README.md" },
  { tool: "Bash", command: "cat agent/workflow/pipeline/TESTPLAN.md" },
  { tool: "Bash", command: "rg -n 'recommended_next' agent/workflow/pipeline" },
  { tool: "Bash", command: "grep -rn 'CONFIRMED' ." },
  { tool: "Bash", command: "ls -la agent/workflow/pipeline/fixtures" },
  { tool: "Bash", command: "node --check agent/workflow/pipeline/tools/check-sandbox.mjs 2>&1" },
  { tool: "Bash", command: "node -e \"console.log(require('crypto').createHash('sha256').update('x').digest('hex'))\"" },
  { tool: "Bash", command: "wc -l agent/workflow/pipeline/fixtures/expected/assertions.json" },
  { tool: "Bash", command: "head -20 README.md" },
  { tool: "Bash", command: "git status 2>/dev/null" },
  { tool: "Read", file_path: "agent/workflow/pipeline/README.md" },
  { tool: "Grep", pattern: "foo" },
  { tool: "Glob", pattern: "**/*.json" },
];
let bMiss = 0;
for (const r of REJECT) {
  const v = detectWriteVector(r);
  if (!v) { fail(`battery: NOT rejected -> ${JSON.stringify(r)}`); bMiss++; }
}
for (const r of ALLOW) {
  const v = detectWriteVector(r);
  if (v) { fail(`battery: wrongly rejected (${v}) -> ${JSON.stringify(r)}`); bMiss++; }
}
if (bMiss === 0) pass(`${REJECT.length} write vectors rejected, ${ALLOW.length} read-only calls allowed`);

// ---------------------------------------------------------------------------
// 4. optional: scan a real run's per-stage event logs
// ---------------------------------------------------------------------------
const evDirArg = process.argv.slice(2).find((a) => a.startsWith("--events-dir="));
let blocked = 0;
if (evDirArg) {
  section("4. per-stage event scan");
  const dir = evDirArg.slice("--events-dir=".length);
  for (const role of READ_ONLY) {
    const p = join(dir, `${role}-events.json`);
    // F-6: a missing or empty transcript/event log is a harness limitation, not a
    // pass. "Zero-write" is never claimed from frontmatter alone — only from an
    // actually-captured, non-empty transcript scanned by this gate.
    if (!existsSync(p)) {
      console.log(`  BLOCKED  ${role}: no ${role}-events.json captured — cannot confirm zero-write from a real transcript; category is BLOCKED, not PASS`);
      blocked++;
      continue;
    }
    const raw = readFileSync(p, "utf8");
    if (raw.trim().length === 0) {
      console.log(`  BLOCKED  ${role}: ${role}-events.json is 0 bytes — harness failed to capture the transcript; category is BLOCKED, not PASS`);
      blocked++;
      continue;
    }
    let events;
    try { events = JSON.parse(raw); }
    catch (e) { fail(`${role}: events log unparseable: ${e.message}`); continue; }
    if (!Array.isArray(events)) { fail(`${role}: events log is not an array`); continue; }
    let hits = 0;
    events.forEach((rec, i) => {
      const v = detectWriteVector(rec);
      if (v) { fail(`${role} event[${i}]: ${v} -> stage FAIL, pipeline BLOCKED, artifact not forwarded`); hits++; }
    });
    if (hits === 0) pass(`${role}: ${events.length} events, no write vector`);
  }
}

console.log(`\n${"=".repeat(60)}`);
if (blocked > 0) { console.log(`RESULT: BLOCKED — ${blocked} stage(s) had no usable captured transcript (harness limitation, not a pass)`); process.exit(2); }
if (failures === 0) { console.log("RESULT: PASS — read-only stages carry a zero-write contract and the detector holds"); process.exit(0); }
console.log(`RESULT: FAIL — ${failures} check(s) failed`);
process.exit(1);
