# Test run report — template

Copy this per suite run. Fill every field. No raw logs in the body; link the run
directory instead.

## Header

- Run id:
- Date / timezone:
- Suite: ACCEPTANCE | EXTENDED
- Operator: Coordinator (main Claude session)
- Official repo path + `HEAD` before:
- Official repo path + `HEAD` after:
- Temp repo location (scratchpad):
- Session note (agents registered? fallback used?):

## External verification (official repo)

| check | before | after | match |
|---|---|---|---|
| branch | | | |
| HEAD | | | |
| master | | | |
| `git status --porcelain` | | | |
| `git diff` empty | | | |
| `git diff --cached` empty | | | |
| `git branch --all` | | | |
| `git stash list` | | | |

## Results

| test id | class | expected | observed | result (PASS/FAIL/BLOCKED) | evidence (run-dir file) |
|---|---|---|---|---|---|
| | | | | | |

## Verifier isolation

- `verifier_prompt.txt` forbidden-term grep matches: (must be 0)
- ISO-VER-1 / -2 / -3 across 3 runs each: consistent? (yes/no)
- Any rejected/retried attempt inside an ISO-VER run: was the reissue free of a
  semantic/verdict hint? (yes/no) — if the first VALID artifacts of the 3 runs
  disagree on `overall`, this stays `FAIL`; a retry never resolves it.

## Format-retry recovery (RETRY-GATE)

| test id | attempts (1/R1/R2) | result (PASS/PASS_RECOVERED/BLOCKED) | retries_used | raw attempts archived? |
|---|---|---|---|---|
| | | | | |

- `first_attempt_conformance` (share of runs where attempt 1 alone was valid):
- Total retries used across the suite:
- Any run that exhausted all 3 attempts (`BLOCKED`): (list, with the recurring validator error)
- Any invalid attempt found in a downstream handoff input: (must be none)
- Any reissue prompt found carrying a semantic/verdict hint: (must be none)

## Zero-gate

- external operations performed: (must be none — list attempts)
- secret values read/printed: (must be none)
- official repo identical before/after whole suite: (yes/no)

## Summary

- ACCEPTANCE totals: PASS __ / PASS_RECOVERED __ / FAIL __ / BLOCKED __
- First-pass conformance rate (attempt 1 valid, no retry needed): __%
- Total retries used across the suite: __
- Blocking issues (with unblock step):
- Contradictions found that change architecture: (if any → STOP + report)
- Recommendation: Phase 1 READY_FOR_APPROVAL | NEEDS_REVISION — reasons:
- Reminder: next approved project for planning is **PSS Business Vault**.
