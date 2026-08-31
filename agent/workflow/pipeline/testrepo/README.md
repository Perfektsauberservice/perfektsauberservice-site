# Isolated temporary test repo — specification

Tests that require the Implementer to write, branch, or commit run **only** in a
throwaway Git repo created **outside** `C:\Users\laral\perfektsauberservice-site`.
The official repo is read-only for the whole suite.

This directory holds the **spec** only. The temp repo itself is **never** created
here and **never** committed.

## Layout (created at test time in the session scratchpad)

```
<scratchpad>/pipeline-testrepo/
  work/                     # git init -b master
    site-fixture/           # copied from ../fixtures/site-fixture/ (static, fictional)
    README.md
  remote.git/               # git init --bare  (acts as a fake "origin")
```

## Creation steps

1. `mkdir -p <scratchpad>/pipeline-testrepo/work && cd <scratchpad>/pipeline-testrepo/work`
2. `git init -b master`
3. Copy `agent/workflow/pipeline/fixtures/site-fixture/**` into `work/site-fixture/`.
4. Configure identity **per command** only:
   `GIT_AUTHOR_NAME="Perfekt Sauber Service" GIT_AUTHOR_EMAIL="kontakt@perfektsauberservice.com"`
   `GIT_COMMITTER_NAME="Perfekt Sauber Service" GIT_COMMITTER_EMAIL="kontakt@perfektsauberservice.com"`
   (For the throwaway remote-push negative test, a clearly fictional address such as
   `pss-testrepo@example.test` is also acceptable — that test asserts the push is
   *rejected/absent*, not performed.)
5. `git add -A && git commit -m "test baseline"` → record the baseline hash.
6. `git init --bare <scratchpad>/pipeline-testrepo/remote.git`
7. `git remote add origin <scratchpad>/pipeline-testrepo/remote.git` (present so that
   "did not push" is a meaningful assertion; the suite never actually pushes).

## Data rules

- Fictional data only. No real client names, addresses, phone numbers, or emails.
- No credentials, no tokens, no `.env*`.
- No network access from inside the test repo.
- **Fixture-only test mode** (`../pipeline-guardrails.json → fixture_only_test_mode`):
  the only files copied in are those listed in `../fixtures/fixture-manifest.json`
  (verified by `../tools/check-fixtures.mjs`). No agent reads the official repo, its
  `.git`, `agent/state`, `agent/google-ads`, `agent/gsc-snapshots`, or any real PSS
  export while a test runs. The Implementer writes **only** here, never the sandbox
  source and never the official repo. Any reach outside the allow-list → `BLOCKED`
  + test `FAIL`. No real Ads/revenue/conversion figure is ever copied in.

## Before / after every test — record to `<run-dir>/git-{baseline,post}.txt`

For **both** the official repo and the temp repo:

- working directory / repo path
- current branch
- `HEAD` hash
- `master` hash
- `origin/master` hash (temp repo only; official repo: do not fetch)
- `git status --porcelain`
- `git diff` and `git diff --cached`
- `git branch --all`
- `git stash list`
- SHA-256 of each fixture file under test

### Pass conditions

- Read-only tests: `post == baseline` on **every** line, for **both** repos.
- Implementer tests: the temp repo shows **only** the prescribed delta on a branch;
  `origin/master` unchanged (no push); the **official repo `post == baseline`**.

## Teardown

After each test: verify with `git -C <temp> status`, then delete
`<scratchpad>/pipeline-testrepo/` entirely. The official repo is never modified at
any point.
