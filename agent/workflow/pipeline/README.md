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
| 0 | `competitor-intelligence` | no (source) | no |
| 1 | `investigator` | yes | no |
| 2 | `analyst` | yes | no |
| 3 | `verifier` | yes | no |
| 4 | `implementer` | yes | **only the isolated temp test repo** |
| 5 | `qa` | yes | no |
| — | **Coordinator** = this Claude session | orchestrates | only pipeline artifacts, outside the repo |

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
   pass each agent sandbox paths / embedded `fixture://…` data only. An agent that
   reaches for anything off the allow-list, or for the network, returns `BLOCKED`
   and that test is `FAIL`. This restriction is test-mode only — it does not narrow
   an agent's authorised read-only access in a real task
   (`pipeline-guardrails.json → fixture_only_test_mode`). Confidential commercial
   data (real Ads spend/bids/budgets, revenue, conversions, absolute GA4/GSC
   figures) never enters a fixture, prompt, handoff, report, or log.
5. **Validate every handoff** against `schema/handoff.schema.json` before passing it
   on. Reject and route back on any schema failure.
6. **Decide** (produce a `coordinator-decision` artifact):
   - `ARCHIVE` — `IGNORE`; `MONITOR` only if **all** archive conditions hold
     (low impact, no urgent risk, no near-term deadline, no cost, no external op,
     `review_date` set); `DUPLICATE`; `IRRELEVANT`. Laura is **not** notified.
   - `ROUTE_BACK` — `qa.overall == FAIL`, or a handoff failed validation, or the
     Verifier returned `REFUTED` / `INSUFFICIENT_DATA`.
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
`FAIL`, substitutes for a Laura approval, extends an approval by interpretation, or
sends Telegram/email in Phase 1.

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
- **Stop on error:** any schema failure, any stop condition, any tool denial →
  the Coordinator halts that run, records `BLOCKED` with the reason, and does not
  improvise past it.

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
