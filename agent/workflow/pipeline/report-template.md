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

## Zero-gate

- external operations performed: (must be none — list attempts)
- secret values read/printed: (must be none)
- official repo identical before/after whole suite: (yes/no)

## Summary

- ACCEPTANCE totals: PASS __ / FAIL __ / BLOCKED __
- Blocking issues (with unblock step):
- Contradictions found that change architecture: (if any → STOP + report)
- Recommendation: Phase 1 READY_FOR_APPROVAL | NEEDS_REVISION — reasons:
- Reminder: next approved project for planning is **PSS Business Vault**.
