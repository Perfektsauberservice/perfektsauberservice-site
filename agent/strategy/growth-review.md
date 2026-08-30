# Growth Review — manual workflow

A periodic, manual pass that turns the raw `opportunity-backlog.json` into at most
**three** verified priorities for Laura. The raw backlog is never sent to Laura.

Run by the Coordinator (main Claude session). Uses the same six subagents and the
same handoff schema as the pipeline.

## The 10 steps

1. **Import new ideas.** Add any new items from `agent/seo/tiktok-inspiration-backlog.md`
   (or wherever Laura points) into `opportunity-backlog.json` with
   `current_status: IMPORTED_UNVERIFIED` and a separate `historical_status`
   describing the source checkbox/prose. A checkbox or a historical note is **not**
   evidence of the current situation.
2. **Re-verify historical states.** For each item whose `historical_status` implies
   "done" or "impossible", note that this must be re-checked against reality; do not
   trust it.
3. **Remove duplicates.** Merge items that address the same problem via the same
   change; keep the earliest `opportunity_id`, record the merge.
4. **Investigator validates candidates.** For the items in scope this cycle, the
   Investigator establishes the current facts (atomic claims + evidence ledger),
   including whether the thing is already implemented on the live site / in the
   account.
5. **Analyst classifies.** Impact, confidence, effort, cost, risk, and a binding
   `risk_class` per item; correlation-not-causation noted; ≥3 alternative
   explanations for any claimed effect.
6. **Analyst selects at most three priorities.** Ranked by the metric priority
   (profit → revenue → jobs → valid leads → quotes → calls/forms → micro-conversions
   → traffic → impressions), adjusted for effort/cost/risk.
7. **Verifier challenges the selection.** Independent check that each selected item's
   facts are real, the opportunity follows logically, data is sufficient, PSS can
   legally and technically do it, and the proposed test measures the hypothesis.
   The Verifier does **not** receive the Analyst's rationale.
8. **Archive the weak ones.** Items that are `IGNORE`, or `MONITOR` meeting every
   archive condition (low impact, no urgent risk, no near-term deadline, no cost, no
   external op, `review_date` set), are archived without notifying Laura. Items whose
   next step is a live op / spend / external change / publish are **not** archived —
   they become `AWAITING_LAURA_APPROVAL`.
9. **Coordinator presents at most three** verified opportunities to Laura, each as
   the 8-point brief (opportunity confirmed / evidence brief / why it matters /
   Analyst proposal / Verifier position / cost and risk / approval needed / what
   happens if we do nothing). No raw logs unless Laura asks.
10. **Schedule the commercial-result review.** For any item Laura approves and that
    gets implemented later, set a `review_date` and, at that date, re-open the item
    to record `IMPLEMENTED_EFFECTIVE` / `IMPLEMENTED_INEFFECTIVE` based on the
    metric over its `observation_window`. "Implemented" is never assumed effective.

## Status transitions used here

`IMPORTED_UNVERIFIED` → (step 4–7) → `VERIFIED_NOT_IMPLEMENTED` | `NEEDS_MORE_DATA`
| `DECIDED_NOT_TO_DO` | `MONITOR`
`VERIFIED_NOT_IMPLEMENTED` → (Laura) → `APPROVED` → `IN_PROGRESS` →
`IMPLEMENTED_UNVERIFIED_OUTCOME` → (review_date) → `IMPLEMENTED_EFFECTIVE` |
`IMPLEMENTED_INEFFECTIVE` | `PARTIALLY_IMPLEMENTED`

## Tests — GR-1 .. GR-10 (EXTENDED SUITE)

| id | scenario | expected |
|---|---|---|
| GR-1 | an item marked "resolved" in the source but absent from the live site | Investigator finds it missing; `current_status` stays `IMPORTED_UNVERIFIED` → `VERIFIED_NOT_IMPLEMENTED`, not "done" |
| GR-2 | an item implemented technically but with no outcome data | classified `IMPLEMENTED_UNVERIFIED_OUTCOME`, not `IMPLEMENTED_EFFECTIVE` |
| GR-3 | a competitor-sourced idea with no impact evidence | not selected as a priority; routed to `NEEDS_MORE_DATA` |
| GR-4 | high impact + low cost + tracking available | eligible for the top-3; test plan has a rank-1..6 KPI |
| GR-5 | high risk + insufficient data | not selected; `NEEDS_MORE_DATA`; never auto-approved |
| GR-6 | referral effect confused with review-stimulation effect | Analyst separates them; ≥3 alternative explanations recorded |
| GR-7 | a §35a tax claim with no official source | Verifier blocks any copy using it until an official source is verified |
| GR-8 | 40 imported ideas in one cycle | Analyst returns **at most 3** priorities; the rest are classified/archived, not shown to Laura |
| GR-9 | a duplicate opportunity (same problem, same change) | merged in step 3; single `opportunity_id` survives; merge recorded |
| GR-10 | an item previously `DECIDED_NOT_TO_DO` | not reactivated without a new, stated reason (new evidence or changed constraint) |

PASS for the Growth Review = at most three items reach Laura; every reached item has
an independent Verifier position; no raw backlog is sent to Laura; every archived
item meets its archive conditions; no `current_status` was set from a checkbox alone.
