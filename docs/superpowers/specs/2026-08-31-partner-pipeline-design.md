# Partner pipeline — consolidated design (Phase 1)

**Date:** 2026-08-31
**Branch:** `setup/claude-partner-workflow`
**Status:** Phase 1 authoring approved (steps 1–10). Phase 1.5 and any real use of the
pipeline require a new explicit approval from Laura.

This is the reference design. It consolidates the earlier A–O plan and the six
correction rounds. The manual operating guide is
`agent/workflow/pipeline/README.md`; the machine-readable rules are
`agent/workflow/pipeline/pipeline-guardrails.json`.

## 1. Shape

Six real Claude Code subagents plus the **main-conversation Claude as Coordinator**
(there is no `coordinator` subagent).

```
Laura ──► Coordinator (main Claude): clarify · classify risk · isolate inputs · validate handoffs
   sources of findings: competitor-intelligence (stage 0) · L1 checks · opportunity-backlog
   REDUS:   Coordinator ─► implementer ─► qa
   MEDIU:   investigator ─► analyst ─► verifier ─► implementer ─► qa
   RIDICAT: investigator ─► analyst ─► verifier ─► plan+rollback
            ─► LAURA APPROVAL 1 ─► implementer ─► qa
            ─► LAURA APPROVAL 2 ─► the exact approved live op ─► post-execution check
   Coordinator decision: ARCHIVE (no Laura) | ROUTE_BACK | BLOCKED | ESCALATE (8-point brief)
```

In Phase 1 the Implementer writes **only** to an isolated temporary test repo
outside the official repo. No automation is touched.

## 2. The six agents

| Agent | Stage | In approval chain | Writes | File |
|---|---|---|---|---|
| competitor-intelligence | 0 | no (source) | no | `.claude/agents/competitor-intelligence.md` |
| investigator | 1 | yes | no | `.claude/agents/investigator.md` |
| analyst | 2 | yes | no | `.claude/agents/analyst.md` |
| verifier | 3 | yes | no | `.claude/agents/verifier.md` |
| implementer | 4 | yes | temp test repo only | `.claude/agents/implementer.md` |
| qa | 5 | yes | no | `.claude/agents/qa.md` |

## 3. Risk tiers

`REDUS` (Coordinator → Implementer → QA) only if **all 13 conditions** in
`CLAUDE.md` §5 hold and a deterministic success criterion exists; **any doubt,
missing fact, or plausible wider impact ⇒ MEDIU**. `MEDIU` runs the five-stage
chain. `RIDICAT` adds a written plan + rollback and **two** explicit Laura approvals
around the live operation, plus a post-execution check.

## 4. Evidence and handoffs

- Evidence-ledger entry per factual claim: `schema/evidence-ledger.schema.json`
  (17 fields; `status ∈ {CONFIRMED, INFERRED, UNVERIFIED, CONTRADICTED}`).
- Handoff artifacts: `schema/handoff.schema.json` — `competitor-observation` (15
  domain fields, `certainty` never `CONFIRMED`), `investigation`, `analysis` (with a
  separate `test_plan` object; `rationale` is never forwarded), `verification`,
  `implementation` (`target_repo` fixed to `isolated-temp-test-repo`, `pushed` and
  `merged` fixed to `false`), `qa-report` (includes the official-repo baseline
  check), `coordinator-decision` (`raw_logs_attached` fixed to `false`).
- **Verifier isolation:** input is exactly `atomic_claims`, `public_evidence`,
  `pss_data`, `period_filters`, `test_plan`. Any extra key is a context leak
  (`context_leak_detected: true`, `overall: INSUFFICIENT_DATA`).

## 5. Coordinator decisions

- **ARCHIVE without notifying Laura:** `IGNORE`; `MONITOR` **only** if low impact
  AND no urgent risk AND no near-term deadline AND no cost AND no external operation
  AND `review_date` set; `DUPLICATE`; `IRRELEVANT`.
- **Never auto-archived:** a QA `PASS` alone. If the next step is merge / push /
  deploy / publish / an external service / spend / a live change, the Coordinator
  `ESCALATE`s with `human_review_state` = `AWAITING_LAURA_APPROVAL` (external op
  next) or `READY_FOR_HUMAN_REVIEW` (strategic decision, no external op yet), and
  attaches the 8-point brief.
- `ROUTE_BACK` on `qa FAIL`, a failed handoff validation, or a Verifier
  `REFUTED` / `INSUFFICIENT_DATA`.
- `BLOCKED` on insufficient data, naming exactly what is missing.

## 6. Backlog and Growth Review

`agent/strategy/opportunity-backlog.json` is seeded from
`agent/seo/tiktok-inspiration-backlog.md`. Every seeded item has
`current_status: IMPORTED_UNVERIFIED`; `historical_status` (checkbox/prose-derived)
is separate and is **not** evidence of the current state. The Implementer never
receives a raw backlog idea — every item goes Investigator → Analyst → Verifier
first. `agent/strategy/growth-review.md` defines the 10-step manual review that
yields **at most three** verified priorities for Laura per cycle.

## 7. "Implemented" ≠ "effective"

Separate planes: fact verification / strategic decision / implementation correctness
/ later commercial result. A change is `IMPLEMENTED_EFFECTIVE` only with a metric
result over a defined `observation_window`. Metric priority, best first: profit →
job revenue → jobs won → valid leads → quotes → real calls/form submissions →
micro-conversions → traffic → impressions. Every experiment states baseline,
hypothesis, change, KPI, data source, period, success threshold, stop threshold,
rollback, and a `review_date`.

## 8. Testing

`agent/workflow/pipeline/TESTPLAN.md`. **ACCEPTANCE SUITE** (mandatory, must be
fully green before any real use) + **EXTENDED SUITE** (regression). All writing
tests run in the isolated temp repo (`agent/workflow/pipeline/testrepo/README.md`);
the official repo is read-only for the whole suite; an external verification block
(official + temp repo Git state) runs before and after every test. Report shape:
`agent/workflow/pipeline/report-template.md`.

## 9. What Phase 1 explicitly does not do

No `master` branch protection, no CODEOWNERS, no Node driver, no cloud-routine
change, no existing-automation change, no hooks activation, no deploy, no external
integration, no Telegram/email. Hooks (the TECHNICAL CONTROLS layer) and the Node
driver are designed and tested separately, later.

## 10. Files delivered in Phase 1

Created: `CLAUDE.md`; `.claude/agents/{competitor-intelligence,investigator,analyst,
verifier,implementer,qa}.md`; `agent/workflow/pipeline/{README.md,TESTPLAN.md,
report-template.md,pipeline-guardrails.json}`;
`agent/workflow/pipeline/schema/{evidence-ledger.schema.json,handoff.schema.json}`;
`agent/workflow/pipeline/testrepo/README.md`;
`agent/workflow/pipeline/fixtures/**`; `agent/strategy/opportunity-backlog.json`;
`agent/strategy/growth-review.md`; this file; `2026-08-31-coexistence-matrix.md`.
Modified: none (`.gitignore` left unchanged — run artifacts live outside the repo).
