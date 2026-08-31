# Partner pipeline — manual run guide (Phase 1)

Six real Claude Code subagents plus the **main-conversation Claude as Coordinator**.
No Node driver, no cron, no GitHub workflow. Everything is started manually from a
Claude Code session. This document is the operating manual.

- Policy: `../../../CLAUDE.md`
- Machine-readable rules: `pipeline-guardrails.json`
- Schemas: `schema/evidence-ledger.schema.json`, `schema/handoff.schema.json`
- Tests: `TESTPLAN.md`, report shape in `report-template.md`
- Isolated test repo spec: `testrepo/README.md`

## 1. Roles

| Stage | Agent | In approval chain | Writes files |
|---|---|---|---|
| 0 | `competitor-intelligence` | no (source) | **no — zero writes anywhere, incl. OS temp** |
| 1 | `investigator` | yes | **no — zero writes anywhere, incl. OS temp** |
| 2 | `analyst` | yes | **no — zero writes anywhere, incl. OS temp** |
| 3 | `verifier` | yes | **no — zero writes anywhere, incl. OS temp** |
| 4 | `implementer` | yes | **only the isolated temp test repo** |
| 5 | `qa` | yes | **no — zero writes anywhere, incl. OS temp** |
| — | **Coordinator** = this Claude session | orchestrates | only pipeline artifacts, outside the repo — a harness write, never conflated with a subagent write |

**Read-only means zero writes, full stop.** Stages 0/1/2/3/5 never create, modify,
move, or delete a file — not in the official repo, not in the sandbox, not in the
isolated temp test repo, and not in OS temp (`%TEMP%`/`%TMP%`/`$TMPDIR`/`/tmp`); a
write under OS temp is not exempt. Each agent's `.md` carries a "Zero-write
contract" section; `agent/workflow/pipeline/tools/check-agent-writes.mjs` checks it
statically and, given `--events-dir=<run-dir>`, scans real per-stage tool events.
A violation is a deterministic `FAIL`, the pipeline is `BLOCKED`, and that stage's
artifact is not forwarded. Only the Implementer writes, and only inside the
isolated temp test repo. In **fixture-only-test mode**, stages 0/1/2/3/5 go
further than zero writes: **zero tool use of any kind** (`tool_uses == 0`) —
every fact and schema they need is inline in the prompt; `check-fixture-tooluse.mjs`
checks this statically and, given `--events-dir=<run-dir>`, behaviorally. None of
this uses `isolation:"worktree"` or creates a worktree/branch in the official
repo — see `TESTPLAN.md → Worktree prohibition (Phase 1)`.

## 2. Coordinator protocol

1. **Clarify.** If Laura's objective is ambiguous, ask exactly one question.
2. **Classify risk** (`REDUS | MEDIU | RIDICAT`) using the conditions in
   `CLAUDE.md` §5 and `pipeline-guardrails.json`. **Any doubt, any missing fact,
   any plausible wider impact ⇒ escalate one tier.**
3. **Pick the flow:**
   - `REDUS` → Coordinator → `implementer` → `qa`
   - `MEDIU` → `investigator` → `analyst` → `verifier` → `implementer` → `qa`
   - `RIDICAT` → `investigator` → `analyst` → `verifier` → plan+rollback →
     **LAURA APPROVAL 1** → `implementer` → `qa` → **LAURA APPROVAL 2** →
     the exact approved live op → post-execution verification
   - If Competitor Intelligence is the source, it runs as stage 0 before
     `investigator`, regardless of tier.
4. **Build isolated inputs.** Give each subagent only its allowed slice
   (`pipeline-guardrails.json` → `roles.<role>.input`). For the Verifier this is
   *exactly* `atomic_claims`, `public_evidence`, `pss_data`, `period_filters`,
   `test_plan` — nothing else. Build it with `jq` and assert the key set.
   In a **fixture-only test run**, build a sandbox **outside the official repo**
   from the `fixtures/fixture-manifest.json` allow-list (static copies only), and
   pass each agent sandbox paths / embedded `fixture://…` data only. For the five
   read-only agents this means **zero tool use of any kind**, not just no
   writes — the prompt must include `mode: "fixture-only-test"`, the sandbox path
   labelled for Coordinator-audit only (never as something to read), the fixture
   payload inline in full, the required schema/contract inline in full, and an
   explicit `DO NOT USE TOOLS` line; `tool_uses` for that stage must come back
   `0`. Never use `isolation:"worktree"` for a fixture-only run, and never create
   a worktree or auxiliary branch in the official repo — the Implementer's
   isolated temp test repo is a plain `git init` outside the official repo. The
   sandbox's
   **full declared inventory** — the same 18 fixtures plus the 2 structural
   contracts (the schemas) — lives in `fixtures/sandbox-manifest.json`; the
   sandbox must hold exactly those 20 files (verified by sha256 after copy), and
   an agent slice may include only the entries whose `roles` name that agent. An
   agent that reaches for anything off the allow-list, or for the network, returns
   `BLOCKED` and that test is `FAIL`; an undeclared sandbox file, a missing
   contract, a wrong hash, or a slice handing a role a file it is not listed for
   is the same failure. This restriction is test-mode only — it does not narrow
   an agent's authorised read-only access in a real task
   (`pipeline-guardrails.json → fixture_only_test_mode` /
   `→ read_only_zero_write` / `→ strict_json_output`). Confidential commercial
   data (real Ads spend/bids/budgets, revenue, conversions, absolute GA4/GSC
   figures) never enters a fixture, prompt, handoff, report, or log.
5. **Validate every handoff** against `schema/handoff.schema.json` before passing it
   on. Reject and route back on any schema failure. Before that: confirm the
   producing agent's reply was **exactly one JSON object** — no fence, no prose
   outside it (`check-json-output.mjs`) — and, for the five read-only stages, that
   no write of any kind was attempted, including under OS temp
   (`check-agent-writes.mjs`). Either failure means the artifact is **not
   forwarded** — instead apply the bounded format-retry protocol below (§ 2a).
   A format/schema failure is never silently corrected, fenced, stripped, or
   re-parsed by the Coordinator — see § 2a for the only recovery path. For a
   `verification` artifact specifically, schema-validity is not enough: run the
   Decision Engine (`check-verifier-decision-table.mjs → checkHandoff()`) on it
   before forwarding. A structurally invalid `alternative_explanations` entry,
   or a self-check `overall` that disagrees with the independently computed
   verdict, is a **semantic** rejection — route it back through the normal flow
   (never the format-retry protocol, which is reserved for parse/schema
   failures only).
6. **Decide** (produce a `coordinator-decision` artifact):
   - `ARCHIVE` — `IGNORE`; `MONITOR` only if **all** archive conditions hold
     (low impact, no urgent risk, no near-term deadline, no cost, no external op,
     `review_date` set); `DUPLICATE`; `IRRELEVANT`. Laura is **not** notified.
   - `ROUTE_BACK` — `qa.overall == FAIL`, or a handoff failed validation, or the
     Verifier's **official** verdict (computed by the Decision Engine,
     `agent/workflow/pipeline/tools/check-verifier-decision-table.mjs →
     computeOfficialVerdict()`, from the artifact's atomic fields — never from
     the Verifier's own self-check `overall`) is `REFUTED` / `INSUFFICIENT_DATA`.
     A Verifier artifact whose own `overall` disagrees with the computed
     official verdict, or whose `alternative_explanations` entries are
     structurally invalid, is rejected before it even reaches this decision —
     see step 5 and `TESTPLAN.md` § D.
   - `BLOCKED` — insufficient data; state exactly what is missing.
   - `ESCALATE` — one of the `laura_notify_when` conditions holds. Set
     `human_review_state` to `AWAITING_LAURA_APPROVAL` (a live op / spend / external
     change / merge / push / deploy / publish is the next step) or
     `READY_FOR_HUMAN_REVIEW` (a strategic decision is needed but no external op
     yet). Attach the 8-point `laura_report`. **A QA `PASS` alone never authorizes
     merge, push, deploy, publish, an external service, spend, or a live change.**
7. **Report to Laura** only on `ESCALATE`, using exactly the 8 parts:
   (1) opportunity confirmed, (2) evidence brief, (3) why it matters for PSS,
   (4) what the Analyst proposes, (5) what the Verifier confirmed/contested,
   (6) cost and risk, (7) approval needed, (8) what happens if we do nothing.
   No raw logs unless Laura asks.

**The Coordinator never** turns `UNVERIFIED` into `CONFIRMED`, overrides a QA
`FAIL`, substitutes for a Laura approval, extends an approval by interpretation,
sends Telegram/email in Phase 1, or reports a retry-recovered run as an
unqualified `PASS` (it is `PASS_RECOVERED` — see § 2a).

## 2a. Format-retry protocol (bounded)

Full machine-readable rule: `pipeline-guardrails.json → format_retry_policy`.
This is the **only** recovery path for a reply that fails `STRICT-JSON-GATE` or
schema validation. It never applies to a semantic outcome the Coordinator would
prefer different (a `qa.overall == FAIL`, a `verifier.overall` the Coordinator
dislikes, a `ROUTE_BACK` decision) — those are routed back through the normal
flow, never retried as if they were a format problem.

1. **Trigger.** Only a parse/format failure (`check-json-output.mjs`) or a schema
   failure (`handoff.schema.json`) on the agent's raw reply. Nothing else.
2. **Mark the attempt.** `REJECTED_FORMAT` (fails `STRICT-JSON-GATE`) or
   `REJECTED_SCHEMA` (parses, but fails schema validation).
3. **Archive raw evidence**, outside the official repo, for every rejected
   attempt: the raw output, its SHA-256, the exact validator error, the attempt
   number, and `usage.tool_uses`. This record is never discarded, even after a
   later attempt succeeds.
4. **Do not forward** the rejected artifact to the next stage, under any
   circumstance.
5. **Reissue** the same agent (same `subagent_type`) with:
   - the identical isolated input from the failed attempt, byte-for-byte;
   - the identical schema/contract;
   - the exact validator error text from step 2;
   - an instruction to re-emit the artifact correcting only that defect.
   The reissue prompt carries **no new fact, no new semantic information, and no
   hint at the expected verdict/value/decision** — the Coordinator is not allowed
   to nudge the agent toward a particular answer while asking it to fix its JSON.
6. **Re-validate from zero**: strict JSON, parse, schema, the semantic assertions
   for that test, role-boundary checks, and the zero-write/zero-tool-use gates —
   every gate runs again on the new reply, none is skipped because a prior
   attempt already passed it.
7. **Budget: at most two reissues** after the initial attempt —
   `attempt 1 + retry 1 + retry 2`, three tries total. The Coordinator never
   extends this budget and never changes scope mid-retry.
8. **Exhaustion.** If all three attempts fail format/schema validation, the
   pipeline stops as `BLOCKED` and Laura is told exactly which stage and which
   validator error recurred three times. No fourth attempt, no fallback parser,
   no manual repair of the reply.
9. **Recovery.** If a later attempt validates, the run is reported as
   `PASS_RECOVERED`, distinct from a clean `PASS` on the first try. The count and
   raw content of the invalid attempt(s) is never hidden from the report — a
   recovered pipeline is not the same claim as a pipeline that never failed.
10. **Verifier determinism is untouched by retries.** For `ISO-VER` (§ D in
    `TESTPLAN.md`), only the **first valid** artifact of each of the three
    independent runs is compared, and the comparison is on the **official**
    verdict (Decision Engine, `computeOfficialVerdict()`), never on a run's own
    self-check `overall` in isolation. Rejected attempts are excluded from the
    comparison and may be reissued per this protocol, but a reissue never carries
    the desired verdict — it receives only the structural/format/schema error. If
    the first valid artifacts of the three runs disagree on the computed official
    verdict, or if any of the three carries a self-check `overall` that disagrees
    with its own computed verdict, the test stays `FAIL`; the retry protocol
    cannot turn semantic non-determinism into a passing result, and a Decision
    Engine disagreement is never itself grounds for a format-retry reissue (it is
    a semantic outcome, not a parse/schema failure).

Reporting always separates: `first_attempt_conformance` (did attempt 1 alone
conform), `retries_used` (0, 1, or 2), `final_valid_artifact` (the one artifact
that was actually forwarded, if any), and `pipeline_safety` (did an invalid
artifact ever reach a handoff — must always be no).

## 3. How a subagent is started (Phase 1, manual)

- **Start:** the Coordinator invokes the subagent by its `name` (via the Task/Agent
  tool with `subagent_type: "<name>"`), or, if the agent is not yet registered in
  the running session, the Coordinator runs the same system prompt as a scoped
  instruction and records that fallback in the run log. Newly added
  `.claude/agents/*.md` files become selectable after the session reloads them.
- **Input:** passed as the task prompt — a single JSON object with only the allowed
  slice. Stored at `<run-dir>/<stage>-input.json`.
- **Output validation:** the returned artifact is written to
  `<run-dir>/<stage>-output.json` and validated against `schema/handoff.schema.json`
  before the next stage.
- **Context isolation:** each subagent call is stateless — it gets only its input
  file. Nothing from the Coordinator's conversation, and nothing from a sibling
  stage, is passed unless it is in the allowed slice.
- **Execution model:** Claude Code subagents (Sonnet). Cost = normal subagent token
  cost. Permissions = the tools in each agent's frontmatter, nothing more.
- **Stop on error:** a format/parse/schema failure on the agent's reply goes
  through the bounded format-retry protocol (§ 2a) first — at most two reissues —
  before it can become `BLOCKED`. Any other stop condition or tool denial halts
  that run immediately, records `BLOCKED` with the reason, and the Coordinator
  does not improvise past it.
- **Sequential transcript capture (behavioral Acceptance runs):** never invoke
  agents in parallel or in the background if the transcript could be emptied
  before inspection. One agent at a time, in the foreground: (1) invoke it,
  (2) wait for it to finish, (3) immediately capture the raw output,
  `usage.tool_uses`, and every available transcript/event record, (4) copy that
  evidence into the run-dir outside the official repo, (5) verify the file is
  non-empty and compute its SHA-256, (6) run the zero-write gate
  (`check-agent-writes.mjs --events-dir=<run-dir>`) and the strict-JSON gate
  (`check-json-output.mjs --file=<reply>`) against it, (7) only then start the
  next agent. A missing or 0-byte transcript makes that test `BLOCKED`, not
  `PASS` — do not continue the category, and report the harness limitation by
  name. A zero-write claim is never made from frontmatter alone.

## 4. Run directory (outside the official repo)

Each run uses a working directory in the session scratchpad, e.g.
`…/scratchpad/pipeline-runs/<run_id>/`:

```
<run_id>/
  00-request.md            # Laura's ask + Coordinator classification
  sandbox/                 # fixture-only test runs: static copies of the allow-listed
                           #   fixtures (per fixtures/fixture-manifest.json); the only
                           #   files an agent under test may read
  10-competitor-observation.json
  20-investigation.json
  30-analysis.json
  40-verifier-input.json   # exactly the 5 allowed keys
  40-verification.json
  50-implementation.json
  60-qa-report.json
  90-coordinator-decision.json
  git-baseline.txt         # official repo state before
  git-post.txt             # official repo state after (must match baseline)
```

**Nothing in this directory is committed to the official repo.** `.gitignore` is not
modified for it.

## 5. What Phase 1 does not do

No `master` branch protection, no CODEOWNERS, no Node driver, no cloud-routine
change, no existing-automation change, no deploy, no external integration, no
Telegram/email. The Ad Refresh Reminder is marked RETIRE in the design docs only.
