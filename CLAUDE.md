# CLAUDE.md — Policy for the Perfekt Sauber Service repository

**Status:** Phase 1 (authoring). This file is **policy only**. It is not a technical
control and does not enforce anything by itself. Enforcement lives in two other
layers (see below). If a policy here and an actual technical control ever disagree,
stop and report the contradiction — do not "route around" either one.

---

## 1. The three layers

| Layer | Where it lives | What it does | Status in Phase 1 |
|---|---|---|---|
| **POLICIES** | this file (`CLAUDE.md`) | States what is allowed, what is forbidden, who decides. Read by every Claude session. | **Created now.** |
| **TECHNICAL CONTROLS** | `~/.claude/settings.json` permissions, hooks, tool allow/deny lists, guardrail JSON | Actually blocks actions. | **Not changed in Phase 1.** Hooks are designed and tested separately, later. |
| **HUMAN APPROVALS** | Laura, in person / in chat | Authorizes every external operation and every high-risk change, one operation at a time. | **In force now.** |

A policy statement in this file never substitutes for a HUMAN APPROVAL. "The policy
allows it" is not authorization to run an external or high-risk operation.

---

## 2. Git identity (permanent rule)

Every commit for anything in this repository and its sibling PSS repositories MUST use:

- **Author name:** `Perfekt Sauber Service`
- **Author email:** `kontakt@perfektsauberservice.com`
- **Committer name:** `Perfekt Sauber Service`
- **Committer email:** `kontakt@perfektsauberservice.com`

Never use `laurentiualin2017@gmail.com`. Never use the machine's ambient Git identity.
Never modify global Git config. Set the identity **temporarily, per command**, via
environment variables:

```
GIT_AUTHOR_NAME="Perfekt Sauber Service" GIT_AUTHOR_EMAIL="kontakt@perfektsauberservice.com" \
GIT_COMMITTER_NAME="Perfekt Sauber Service" GIT_COMMITTER_EMAIL="kontakt@perfektsauberservice.com" \
git commit -m "…"
```

After every commit, verify with `git log -1 --format='%an <%ae> | %cn <%ce>'` that
both Author and Committer are `Perfekt Sauber Service <kontakt@perfektsauberservice.com>`.

---

## 3. Never push to `master` directly

Policy: no Claude session, no subagent, and no local routine pushes commits directly
to `master`, and no session performs `git merge` into `master`. A human performs the
merge. The pipeline stops at a committed branch (in Phase 1: a branch inside an
**isolated temporary test repo**, never this repo).

This is a policy. The technical mechanism that would also enforce it (branch
protection, controlled bypass for the snapshot workflows, or moving snapshots off
`master`) is **deferred to Phase 2** and is not designed or activated here. Until
Phase 2, the two daily snapshot workflows (`pss-gsc-delta-tracker`,
`pss-seo-daily-report`) and the Level 2 Investigator cloud routine continue to push
to `master` exactly as they do today; Phase 1 does not touch them.

**Exception, added 2026-09-01 by Laura, for named-PR merges:** Claude MAY merge one
specific, already-open pull request into `master` when Laura gives an explicit
approval naming that exact PR/branch. The exception holds only while the merged
diff and its previously-reported gates (file scope, test results, secret scan,
permissions/scope, and any other checks reported to her at approval time) remain
byte-for-byte unchanged from what she approved — Claude re-verifies this
immediately before merging. If the PR changes after her approval, even by one
additional commit, the exception lapses and a fresh approval is required before
any merge. This covers only the mechanical merge action for the one named PR; it
is not a standing or routine merge right, it does not authorize merging any other
PR, and it does not relax §2's git-identity requirement (the merge commit itself
must still carry `Perfekt Sauber Service <kontakt@perfektsauberservice.com>` as
both Author and Committer) or §9's requirement that every external operation or
live change name its own separate approval.

---

## 4. What Phase 1 must not touch

- No production/site files (`*.html`, `netlify.toml`, `generate-blog.js`, page
  generators, blog content, redirects).
- No existing automation: nothing under `.github/workflows/` (active or `_archived/`),
  no `netlify/functions/*`, no `agent/scripts/*`, no cron/scheduled task, no
  RemoteTrigger cloud routine.
- **One approved exception, plan only:** the Ad Refresh Reminder
  (`pss-ad-refresh-reminder.yml` + `agent/scripts/ad-refresh-reminder.mjs`, the
  Kleinanzeigen Monday/Thursday reminder) is **marked RETIRE** in the design docs.
  Phase 1 does **not** disable the workflow and does **not** delete any file. The
  file `agent/config/kleinanzeigen-ads.json` is shared with an archived workflow and
  is never deleted as part of this retirement.
- No external services: GitHub settings/tokens/branch protection, Netlify, Google
  (Ads, GA4, GTM, GBP, GSC, Indexing API), Telegram, email/Resend.
- No reading or printing of secret values (`.env`, `.env.local`, tokens, API keys,
  OAuth credentials). Not needed for any Phase 1 step.

**Exception mechanism, added 2026-09-02 by Laura, for separately-approved
workstreams:** The list above is the **default scope restriction for Phase 1
pipeline work**, not a blanket freeze on all future changes to the site. A
separate, non-Phase-1 workstream may touch files or services listed above —
including `netlify/functions/*`, `agent/scripts/*`, or production HTML — only
when **all** of the following hold together: (1) Laura gives an explicit
approval naming the concrete files or task, not a general go-ahead; (2) the
work happens on an isolated branch dedicated to that task, separate from
Phase 1 branches; (3) the diff stays scoped to the named task; (4) it passes
QA; (5) it passes Verifier; (6) a rollback is defined; (7) no further live
change beyond what was named is made without a new, separate approval. A
general or implied approval never satisfies condition (1). This exception
does not enlarge Phase 1's own scope — Phase 1 pipeline work still observes
the restrictions above unchanged — it only clarifies that other,
individually-approved workstreams are not blocked by this file simply
because they touch files this section lists.

**Documented prior exception:** `PSS_LEAD_ID_BUSINESS_SIDE_V1`
(client-generated `lead_id` on lead-capture forms, plus the matching
read/validate change in `netlify/functions/submission-created.mjs`) was
implemented on an isolated branch, QA'd, Laura-approved, and merged via
PR #26 into `master` as a workstream separate from Phase 1. It is recorded
here as an already-approved workstream under this exception mechanism,
not as a Phase 1 deliverable and not as a precedent that widens Phase 1
itself.

---

## 5. Risk classification and flows

The Coordinator (see §7) classifies every task before any subagent runs. **Any doubt,
any missing information, or any plausible wider impact ⇒ escalate one tier.**

### RISC REDUS — `Coordinator → Implementer → QA`

Allowed **only if every one of these is true**:

1. cause is evident and reproducible;
2. touches at most 1–2 files;
3. change is local (no cross-cutting effect);
4. fully reversible;
5. no tracking/analytics involved;
6. no forms involved;
7. not structural SEO;
8. does not touch canonical / sitemap / redirects;
9. no sensitive data involved;
10. no external service involved;
11. no direct production impact;
12. no bulk scripts, no multi-page generated output;
13. **a deterministic success criterion exists.**

If any item fails ⇒ treat as **RISC MEDIU**.

### RISC MEDIU — `Investigator → Analyst → Verifier → Implementer → QA`

Tracking; forms; structural SEO; canonical; sitemap; individual redirects; several
pages; internal automations; landing pages; structural changes; conversion logic.

### RISC RIDICAT — full chain + two human approvals

`Investigator → Analyst → Verifier → written plan + rollback →`
**`LAURA APPROVAL (1)`** `→ Implementer → QA →`
**`LAURA APPROVAL (2)`** `→ the exact approved live operation → post-execution verification`

Push/merge to `master`; deploy; live Google Ads / GA4 / GTM / GBP / GSC changes;
budgets; bidding; primary conversions; targeting; mass deletes/redirects; publishing
content; sending email/messages; financial operations; irreversible changes; access
to sensitive data.

In Phase 1 the Implementer only ever writes to the **isolated temporary test repo**,
regardless of tier.

---

## 6. Evidence standard

Every factual claim that enters the pipeline carries an evidence-ledger entry
(`agent/workflow/pipeline/schema/evidence-ledger.schema.json`): `evidence_id, claim,
source_type, source_path, source_timestamp, period_start, period_end, timezone,
filters, calculation, raw_result, status` (`CONFIRMED | INFERRED | UNVERIFIED |
CONTRADICTED`)`, confidence, alternative_explanations, falsification_test,
limitations`.

Keep four planes strictly separate and never let one substitute for another:

1. **fact verification** — is the claim true?
2. **strategic decision** — is it worth doing?
3. **implementation correctness** — was it built right?
4. **later commercial result** — did it actually help the business?

"Implemented" is not "effective". A change is only `IMPLEMENTED_EFFECTIVE` with a
result measurement over a defined observation window. Metric priority, best first:
profit → job revenue → jobs won → valid leads → quotes → real calls/form submissions
→ micro-conversions → traffic → impressions.

---

## 7. Coordinator protocol (summary)

The **main conversation Claude is the Coordinator**. There is no `coordinator`
subagent. The Coordinator:

1. clarifies the objective with Laura when ambiguous (one question);
2. classifies risk (§5); on any doubt, escalates a tier;
3. chooses which subagents run and in what order;
4. builds each subagent's **isolated input** (only the slice that role may see);
5. validates every handoff against `handoff.schema.json` before passing it on;
6. checks every artifact is valid JSON with required fields and valid enums;
7. on a **format/parse/schema-only** failure of an agent's reply (never a semantic
   disagreement, never a verdict the Coordinator would prefer different), applies
   the **bounded format-retry protocol** — at most two reissues of the same agent
   with the same isolated input, the same schema, and the exact validator error,
   with no new semantic information and no hint at the expected verdict; three
   consecutive failures (`attempt 1 + retry 1 + retry 2`) stop the pipeline as
   `BLOCKED`, never as a silently-forced `PASS`. Full protocol:
   `agent/workflow/pipeline/pipeline-guardrails.json → format_retry_policy` and
   `agent/workflow/pipeline/README.md § 2a`;
8. stops the pipeline (`BLOCKED`) when data is insufficient and states exactly what
   is missing;
9. **archives without notifying Laura**: `IGNORE`; `MONITOR` that meets every
   archive condition in §8; minor / duplicate / irrelevant observations;
10. **presents to Laura** only the cases in §8, as the 8-point brief;
11. never turns `UNVERIFIED` into `CONFIRMED`, never overrides a `qa.overall == FAIL`
    (that routes back), never substitutes for a Laura approval, never extends an
    approval by interpretation, and never turns a recovered-after-retry artifact
    into an unqualified `PASS` — a recovered pipeline run is reported as
    `PASS_RECOVERED`, with the invalid attempt count never hidden.

Full protocol: `agent/workflow/pipeline/README.md`.

---

## 8. When Laura is informed

The Coordinator informs Laura only when at least one is true:

- a verified opportunity with relevant business impact;
- a strategic decision is required;
- spend is required;
- an external-account change is required;
- the change is high risk;
- an urgent reputation or compliance problem;
- the pipeline is `BLOCKED` for lack of information;
- an approval is required before implementation or a live operation.

`AWAITING_LAURA_APPROVAL` / `READY_FOR_HUMAN_REVIEW`: a QA `PASS` alone never
authorizes merge, push, deploy, publish, an external service, spend, or a live
change. Any result whose next step is one of those is presented to Laura — it is
**not** auto-archived.

`MONITOR` may be archived without notifying Laura **only if all**: low impact; no
urgent risk; no near-term deadline; no cost; no external operation; `review_date`
set.

The report to Laura has exactly these parts: (1) what opportunity is confirmed;
(2) evidence brief; (3) why it matters for PSS; (4) what the Analyst proposes;
(5) what the Verifier confirmed or contested; (6) cost and risk; (7) what approval
is needed; (8) what happens if we do nothing. No raw logs unless Laura asks.

---

## 9. External operations — approval shape

Claude never initiates an external operation. Claude may **execute** one only after
Laura's explicit approval that names: the exact operation; the exact target; the
scope; the financial limit (if any); the rollback. The approval is not extended by
interpretation to anything adjacent. After execution Claude verifies the result and
reports. Owner of the decision and the approval is always Laura.

**Exception, added 2026-09-01 by Laura, for READ-ONLY Google Ads / GA4 / GSC (and
later GBP, once legitimate access exists) access:** Claude is permanently authorized
to use and reuse the existing PSS credentials for these services for READ-ONLY
operations, from whatever environment/secret store they are already legitimately
configured in, without a fresh Laura approval before each read. This exception is
scoped strictly to reads (queries, reports, inspections, log reads) — it grants
nothing else. Every WRITE-shaped operation on any of these services — budgets,
bids, campaigns, ad groups, keywords, negative keywords, ads/assets, geo,
schedules, bidding strategy, conversion actions (including flipping a conversion
action's status or primary/secondary goal configuration), GBP profile edits, or
any other mutation — is unaffected by this exception and still requires Laura's
specific, per-change approval under the normal shape above; this exception is never
read as covering anything adjacent to a read. This exception documents Laura's
authorization; it does not by itself change what any runtime permission system
(e.g. an auto-mode action classifier) will actually allow a given session to
execute — if a technical control still blocks a read despite this authorization,
that is the §1 "stop and report the contradiction" case, not something to route
around, and Claude reports the exact blocked action rather than assuming the
exception alone unblocks it.

---

## 10. Credentials policy

- Never read, print, echo, log, or paste the value of any secret.
- A file being in `.gitignore` does not prove it is safe; check what would be staged.
- Never stage `.env`, `.env.local`, `.data/`, token files, OAuth credentials, or
  `node_modules`.
- Real per-account values live only on the machine / in the CI secret store, never
  in the repo, prompts, handoffs, Telegram, or agent memory.
- Test environments use only fictional data and `*.invalid` identities.
- Under the §9 read-only exception, Claude may cause the already-configured Ads/
  GA4/GSC credentials to be *used* (e.g. by an authorized runner reading them from
  its own environment) without a fresh approval per read — but the never-print rule
  above is absolute and unaffected: the credential values themselves are never
  echoed into a report, evidence ledger, handoff, final output, or repo file,
  regardless of how routine the read has become. Only sanitized results (metrics,
  statuses, names, IDs that are not secrets) ever leave the read into pipeline
  evidence.
