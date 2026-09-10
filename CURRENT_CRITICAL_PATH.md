# CURRENT CRITICAL PATH

Governed by [PSS_MASTER_EXECUTION_POLICY_V1.md](PSS_MASTER_EXECUTION_POLICY_V1.md). Last updated: 2026-09-10 (reconciled against PSS Weekly Execution Rules, valid 2026-09-10 through 2026-09-17).

CURRENT_LOOP_CLOSED = NO

```
[x] 1. REAL MEASUREMENT
[ ] 2. CREDIBLE ATTRIBUTION
[ ] 3. RELEASE READY BACKLOG
[ ] 4. REAL COMMERCIAL OUTCOMES
[ ] 5. EVIDENCE-BASED ADS/SEO DECISIONS
[ ] 6. WON JOB / REVENUE / MARGIN FEEDBACK
[ ] 7. FIRST LEARNING DECISION EXECUTED
```

## STEP 1 — REAL MEASUREMENT

STEP_1_STATUS = DONE

Evidence:
- the real 2026-09-10 early Measurement checkpoint was executed
- live Google Ads data was successfully collected
- live GA4 data was successfully collected
- live GSC data was successfully collected
- Ads fresh through 2026-09-10
- GA4 fresh through 2026-09-09
- GSC fresh through 2026-09-04
- remaining GSC lag classified EXPECTED_ACCEPTABLE_FOR_EARLY_CHECKPOINT
- real ga4_form_submits became measurable
- real breakdowns became measurable
- no source is currently missing

The early checkpoint remained INSUFFICIENT_DATA because of GSC freshness lag, not because real Measurement is non-functional. Therefore Step 1 is DONE.

## CURRENT STEP

CURRENT_STEP = 2. CREDIBLE ATTRIBUTION

CURRENT_STATUS = WAIT_UNTIL_2026_09_17

Reason — the 2026-09-10 real attribution investigation found:
- PSS_Entrumpelung_Search ratio approximately stable
- PSS_Reinigung_Search ratio materially worse in the early window
- only 3 GA4 Reinigung sessions in the 8-day window
- no demonstrated campaign/device/redirect/Ads-configuration/consent-code defect explaining the degradation
- no demonstrated fixable blocker
- a small new google/cpc sessionCampaignName=(not set) anomaly exists, but sample size is too small for causation
- existing long-tail GA4 tracking gaps are pre-existing and are not to be changed during the current measurement window

ATTRIBUTION_CREDIBILITY = PARTIALLY_CREDIBLE
CAN_CLOSE_CRITICAL_PATH_STEP_2 = NO
IS_THERE_A_DEMONSTRATED_FIXABLE_BLOCKER = NO
CRITICAL_PATH_CLASSIFICATION = WAIT_UNTIL_2026_09_17

CURRENT_BLOCKER =
No demonstrated fixable technical blocker. Current limitation is insufficient sample size for a reliable attribution judgment before the 2026-09-17 main checkpoint.

NEXT_ACTION =
On 2026-09-17, BEFORE any production mutation:
1. Run the scheduled MAIN real Measurement checkpoint.
2. Preserve the real MR artifact.
3. Review attribution credibility with the larger window.
4. Re-evaluate:
   - PSS_Reinigung_Search Ads/GA4 discrepancy
   - google/cpc sessionCampaignName=(not set)
   - form_submit results
   - campaign/device/landing-page/date evidence
5. Decide CAN_CLOSE_CRITICAL_PATH_STEP_2 = YES / NO.

Until then, follow PSS WEEKLY EXECUTION RULES.

ACTIVE_WRITER = NONE

WAITING_EXTERNAL =
- 2026-09-17 main Measurement checkpoint
- Laura IMPLEMENTATION_DECISION signature for SEO Tier B
- Laura RELEASE signature for Loffenau
- 2026-09-17 Ads decision window

## ALLOWED WORK BEFORE 2026-09-17

Per PSS Weekly Execution Rules (unchanged):
- SEO Tier B release preparation
- Lead Click Ping Stage 1 release preparation
- Entsorgungskosten-Rechner release preparation
- real commercial outcome capture
- release queue preparation

No production deployment before the main checkpoint review.

## READY_TO_SHIP_QUEUE

**SEO Tier B**
- PR #34
- feature HEAD `1c62e6fc773c282477fc66e1835430b2151dd0f7`
- code/QA/formal unsigned decision artifacts complete
- Laura IMPLEMENTATION_DECISION signature pending
- not merged/deployed

**Loffenau SERP CTR**
- source commit `df4cfd09f5adbc011ac691eb4f6f2afd443793dc`
- implementation/QA complete
- new target-head-bound RELEASE signature pending Laura
- WAIT until close to actual release (do not bind signature to a target HEAD that may still move)
- not deployed

**Entsorgungskosten-Rechner**
- feature commit `db856fde598b1015b9d74e3b8d67f80c9f68917b`
- implementation complete
- server-side internal role enforcement PASS
- Laura manually assigned Netlify role "internal"
- PR/release pending
- not deployed

**Lead Click Ping Stage 1**
- prerequisite commit `8b856ce1ad8c885b87e60057b46e0cbd9e3ef81d`
- feature HEAD `a33faed560fab6500354fd432ff7c0e9513670d8`
- exact four new pages:
  - entruempelung-rastatt.html
  - wohnungsaufloesung-rastatt.html
  - grundreinigung.html
  - preisrechner.html
- 90/90 tests
- formal authorization/release pending
- not deployed

Intended release order: SEO Tier B → Loffenau SERP CTR → Entsorgungskosten-Rechner → Lead Click Ping Stage 1. Production release frozen until after the 2026-09-17 checkpoint is reviewed.

## DEFERRED_TECHNICAL_WORK

**Real Data Gate Vault Integration**
- feature HEAD `a5abcbc2ffde739d82355f8c7aff2c647385b157`
- feature complete locally
- 266/266 gate tests
- 597/597 Vault regression
- REAL_DATA_GATE remains CLOSED

Do not continue: Step C REAL_DATA_READ signer, executor, key/domain provisioning, real-data access, canonical merge — until it returns to the critical path.
