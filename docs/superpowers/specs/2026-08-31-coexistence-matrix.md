# Coexistence matrix — partner pipeline vs existing automations

**Date:** 2026-08-31
**Status:** Phase 1 reference. No automation is modified in Phase 1. One approved
exception is **plan only**: the Ad Refresh Reminder is marked RETIRE; it is not
disabled and no file is deleted in this phase.

Per-system fields: id · current role · state · trigger · writes repo · commit+push ·
external service · Telegram · Telegram category · overlap with the pipeline ·
decision · transition timing · transition conditions · rollback · owner.

Decisions: `KEEP` (unchanged Phase 1) · `INTEGRATE` (pipeline consumes/feeds it
later) · `PAUSE_DURING_TESTING` · `REPLACE_LATER` · `REMAIN_SEPARATE` · `RETIRE`.

## Matrix

| id | state | writes repo / push | external | Telegram category | decision | timing | rollback |
|---|---|---|---|---|---|---|---|
| `pss-gsc-delta-tracker` | ACTIVE (cron ~05:45 UTC) | yes / push `master` (`agent/gsc-snapshots/*`) | GSC API (read) | — | **KEEP** | unchanged in Phase 1; push method revisited in Phase 2 | n/a |
| `pss-seo-daily-report` | ACTIVE (cron ~05:30 UTC) | yes / push `master` (`agent/state/seo-report-state.json`) | GSC/GA4 (read) | **daily operational SEO report** | **KEEP** | unchanged Phase 1 | n/a |
| `pss-site-health` | ACTIVE (cron ~06:13 UTC) | no (opens a `needs-investigation` issue) | GitHub Issues | — (surfaced via investigation-result) | **KEEP** → **INTEGRATE** (Phase 2: pipeline becomes the issue processor) | Phase 2, after Level 2 cloud is paused | revert the workflow file |
| `pss-competitor-monitor` | ACTIVE (cron Mon ~06:00) | yes / push `master` (`agent/state/keyword-rankings.json`) | serper.dev API | **periodic competitive-positioning report** (distinct category, *not* a weekly SEO report) | **KEEP** (collector + operational report) + **INTEGRATE** (competitor-intelligence *consumes* its data; no second monitor, no duplicate Telegram) | consume from Phase 1.5 onward | n/a |
| `pss-ad-refresh-reminder` | ACTIVE (cron `30 7 * * 1,4`) — Kleinanzeigen Mon/Thu reminder | no | — | operational reminder (to be removed) | **RETIRE** — plan only in Phase 1 (mark; do not disable; delete nothing) | Op A (disable workflow) after Phase 1, with Laura approval immediately before; Op B (code cleanup) later on branch `cleanup/retire-ad-refresh-reminder` | re-enable the workflow |
| `pss-forward-investigation` | ACTIVE (issues:closed + label) | no | GitHub API + Telegram | **investigation result** | **KEEP** Phase 1 → **REPLACE_LATER** (Phase 2: rewrite for the branch/QA/approval cycle) | Phase 2 | keep the current workflow until the replacement is proven |
| `pss-avatar-video` | PAUSED (schedule disabled 2026-04-29) | yes / push (`agent/state/avatar-video-state.json`) when run | video posting | — | **REMAIN_SEPARATE** (stays paused) | — | — |
| `pss-gmb-reviews-update` | PAUSED (2026-07-07; needs billing) | yes / `git add -A` + push when run | GBP API | yes when run | **REMAIN_SEPARATE** (stays paused) | — | — |
| `pss-submit-urls-indexing` | MANUAL_ONLY (`workflow_dispatch`) | yes / push (`agent/indexing-logs/*`) | **Google Indexing API (write)** | — | **REMAIN_SEPARATE** — treated as `RISC RIDICAT`; each run needs Laura approval | — | n/a |
| `.github/workflows/_archived/*` (22) | ARCHIVED (subdir; GitHub does not run it) | — | — | — | **KEEP as-is** (candidates for later physical removal, separate plan) | later | restore file |
| Level 2 Investigator cloud routine (RemoteTrigger, cron `17 7,15 * * *` UTC) | **UNKNOWN** — `enabled` state not established from read-only | **yes / can commit + push `master`** for "low-risk" fixes | GitHub Issues, repo | via forward-investigation | **PAUSE_DURING_TESTING** → **REPLACE_LATER** (the pipeline supersedes it) | after Phase 1 + Acceptance Suite: read-only status check → present to Laura → explicit approval **immediately before** disabling | reactivate from the saved config |
| Content Publishing Workflow (`netlify/functions/workflow-approve-publish`, `workflow-publish-approved`, `workflow-publish-preview`, `agent/state/pending-approvals.json`) | ACTIVE (on-demand, human approval) | yes (publishes pages) | Netlify | — | **REMAIN_SEPARATE** Phase 1 → **INTEGRATE** Phase 2 (receives tasks only after Analyst → Verifier; publish stays human-approved + QA) | Phase 2 | n/a |
| Content Orchestrator — formerly "Agent Zero" (`agent/prompts/orchestrator-agent.md`) | MANUAL_ONLY (content workflow) | via content scripts | — | — | **KEEP** + rename **conceptually** to "Content Orchestrator" (not "Coordinator"); `REMAIN_SEPARATE` | rename in docs now; file rename optional, later | n/a |
| Netlify `*-preview.mjs` (11) + `pss-auto-content` + `pss-site-audit` | ACTIVE (on-demand) | no (preview) | Netlify | — | **REMAIN_SEPARATE** | — | — |
| `netlify/functions/submission-created.mjs` | ACTIVE (Netlify Forms event) | no | Telegram + Resend email | **new lead** — sole source | **KEEP** | — | n/a |
| `netlify/functions/telegram-bot.mjs` | ACTIVE (Telegram webhook) | no | Telegram | bot commands | **KEEP** | — | n/a |
| Max animation agent + `max-*` skills | ACTIVE (separate) | doc/media only | — | — | **REMAIN_SEPARATE** (mascot only) | — | — |
| **partner pipeline (6 agents + Coordinator)** | to install (manual) | temp test repo only in Phase 1 | — | — | install now (authoring); use later only with new approval | Phase 1 now; Phase 1.5 later | delete the added files |

## Rules

- **A.** GSC Delta Tracker, SEO Daily Report, Site Health: not modified in Phase 1.
- **B.** Competitor Monitor stays the deterministic collector and operational
  report; `competitor-intelligence` *consumes and interprets* its data. No second
  monitor. No duplicate Telegram message. Any strategic opportunity from competitor
  data reaches Laura **only** via the Coordinator, after Investigator → Analyst →
  Verifier.
- **C.** Content Publishing stays the specialised executor. It receives pipeline
  tasks only after Analyst → Verifier; publishing stays human-approved and passes QA.
- **D.** "Agent Zero" is referred to as **Content Orchestrator**. The main Claude
  session is the **Coordinator**. Two different things; the names no longer collide.
- **E.** Max is fully separate.
- **F.** Level 2 Investigator cloud is the **critical overlap** (it can push to
  `master`). It is paused before the pipeline processes any real issue, with Laura's
  explicit approval immediately before, and its config saved for rollback. The
  pipeline and Level 2 must never process the same issue at the same time.
- **G.** Forward Investigation is not modified in Phase 1.
- **H.** Telegram has one source per category (below). Phase 1 sends nothing to
  Telegram at all.

## Telegram — one source per category

| category | sole source | note |
|---|---|---|
| new lead | `submission-created.mjs` (operational chat) | + Resend email |
| technical alert (site health) | `pss-site-health` → GitHub issue (no direct Telegram) | visible through the investigation-result message |
| daily operational SEO report | `pss-seo-daily-report` | operational chat |
| periodic competitive-positioning report | `pss-competitor-monitor` | **distinct category** — not "the weekly SEO report" |
| investigation result | `pss-forward-investigation` | Phase 2: adapted to the branch/QA cycle |
| strategic opportunity | Coordinator brief only, after Investigator → Analyst → Verifier | never from `competitor-intelligence` directly |
| urgent problem (reputation / compliance) | Coordinator escalation | — |
| approval needed | Coordinator escalation | — |
| never on Telegram | minor competitor observations, raw logs, pipeline artifacts, any Coordinator ARCHIVE | — |

## Old vs new flow

**Old:** cron workflows push snapshots to `master`; `site-health` opens an issue;
the **Level 2 cloud routine** diagnoses it and commits/pushes "low-risk" fixes
directly to `master`; `forward-investigation` posts the closed issue to Telegram.
Content is published on demand via the Content Orchestrator + Netlify approval
functions. `submission-created` posts leads. Max is separate.

**New:** Laura → Coordinator (clarify, classify risk, isolate inputs, validate
handoffs) → the risk-tiered chain → Coordinator decision (`ARCHIVE` without Laura /
`ROUTE_BACK` / `BLOCKED` / `ESCALATE` with the 8-point brief). Sources of findings:
`competitor-intelligence`, L1 checks, `opportunity-backlog`. In Phase 1 the
Implementer writes only to the isolated temp repo and no automation is touched.

## Transition without overlap

| step | action | touches automation? | Laura approval |
|---|---|---|---|
| T0 | create the Phase 1 files on `setup/claude-partner-workflow` | no | start approval (given) |
| T1 | run the Acceptance Suite in the isolated temp repo | no | — |
| T2 | Laura signs off Phase 1 | no | yes |
| T3 | read-only check of the Level 2 cloud routine (id, `enabled`, active runs); save config | read only | — |
| T4 | disable the Level 2 cloud routine temporarily; confirm it can no longer process an issue | yes (external) | **yes, immediately before** |
| T5 | dry-run the pipeline on one real issue (no push, no merge) | reads the issue | — |
| T6 | if good: the pipeline becomes the sole processor of `needs-investigation` issues — the two never run together on real issues | — | yes |
| T7+ | Phase 2 items, each on its own branch with its own plan, QA and rollback: retire Ad Refresh Reminder (Op A + Op B), adapt Forward Investigation, integrate Content Publishing, design hooks, build the Node driver, `master` push/branch-protection compatibility, repo cleanup | per item | per item |

## Systems active per phase

- **Phase 1:** everything as today (GSC, SEO, Site Health, Competitor Monitor, Ad
  Refresh Reminder, Forward Investigation active; avatar-video and gmb-reviews
  paused; submit-urls manual; **Level 2 cloud still active**). The pipeline runs
  only in isolated tests.
- **Phase 1.5:** Level 2 cloud **temporarily disabled**; everything else unchanged;
  the pipeline processes issues manually.
- **Phase 2:** Ad Refresh Reminder retired; Forward Investigation adapted; Content
  Publishing integrated after Analyst → Verifier; Level 2 cloud **replaced**
  (stays off). GSC, SEO, Site Health, Competitor Monitor, submit-urls unchanged
  until each has its own plan.
