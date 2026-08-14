# PSS Automation — Foundation + Site Health Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the two-tier automation foundation (GitHub Actions cheap checks → GitHub Issues hand-off → a persistent Claude Code cloud routine that investigates and reports to Telegram) and ship the first real check on top of it: a daily mobile site-health scan that would have caught the 2026-08-12 cookie-banner-blocking-CTA bug automatically.

**Architecture:** A GitHub Actions workflow (`pss-site-health.yml`) runs a Playwright script daily against a curated list of top-traffic pages at mobile viewport. On any finding, it opens a GitHub Issue labeled `needs-investigation` with the raw findings embedded. A Claude Code cloud routine (created via the `schedule`/RemoteTrigger mechanism, running independently of any local session) polls for open `needs-investigation` issues on its own schedule, investigates each using repo access + public web access, posts its findings as an issue comment, and closes the issue. A second GitHub Actions workflow (`pss-forward-investigation.yml`), triggered on issue-closed, forwards that final comment to the existing operational Telegram chat.

**Tech Stack:** Node.js 20, Playwright (Chromium), GitHub Actions, GitHub CLI (`gh`), GitHub Issues/Labels, Telegram Bot API, Claude Code cloud routine (RemoteTrigger).

---

## Prerequisites (already done)

- [x] 9 GitHub Actions repository secrets configured: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `GOOGLE_ADS_CUSTOMER_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (operational), `TELEGRAM_STRATEGIC_CHAT_ID` (strategic, `-5469752037`, group "PSS Strategic").
- [x] Telegram bot `@perfektsauberbot` confirmed able to send messages to both chats.

---

### Task 1: Create the `needs-investigation` label

**Files:** none (GitHub repo metadata only)

- [ ] **Step 1: Create the label via GitHub CLI**

Run (requires `gh auth login` to have been done once locally, or do this manually in the GitHub UI under Issues → Labels → New label):

```bash
gh label create needs-investigation --repo Perfektsauberservice/perfektsauberservice-site --color D93F0B --description "Opened by an automated check; awaiting Level 2 investigation" --force
```

Expected output: `✓ Label "needs-investigation" created` (or updated, since `--force` overwrites if it already exists).

If `gh` is not authenticated in the local shell, create the label manually instead: go to `https://github.com/Perfektsauberservice/perfektsauberservice-site/labels`, click "New label", name it exactly `needs-investigation`, pick any color, save.

- [ ] **Step 2: Verify the label exists**

```bash
gh label list --repo Perfektsauberservice/perfektsauberservice-site | grep needs-investigation
```

Expected output: a line containing `needs-investigation`.

---

### Task 2: Curated page list for the health check

**Files:**
- Create: `agent/scripts/site-health/pages.json`

- [ ] **Step 1: Write the page list**

```json
[
  "https://perfektsauberservice.com/",
  "https://perfektsauberservice.com/entruempelung-rastatt",
  "https://perfektsauberservice.com/grundreinigung",
  "https://perfektsauberservice.com/haushaltsaufloesung-rastatt",
  "https://perfektsauberservice.com/bueroreinigung-karlsruhe",
  "https://perfektsauberservice.com/bueroreinigung-baden-baden",
  "https://perfektsauberservice.com/wohnungsaufloesung-baden-baden",
  "https://perfektsauberservice.com/hausmeisterservice-karlsruhe"
]
```

This list covers both service lines (Entrümpelung, Reinigung), the homepage, and the two pages directly implicated in the 2026-08-12 and 2026-08-14 incidents. Revisit this list quarterly as traffic patterns shift (tracked as an open question in the design doc, not part of this plan).

- [ ] **Step 2: Commit**

```bash
git add agent/scripts/site-health/pages.json
git commit -m "Add curated page list for site health check"
```

---

### Task 3: Write the Playwright health-check script

**Files:**
- Create: `agent/scripts/site-health/check.mjs`
- Create: `agent/scripts/site-health/package.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "pss-site-health",
  "private": true,
  "type": "module",
  "dependencies": {
    "playwright": "1.48.0"
  }
}
```

- [ ] **Step 2: Write check.mjs**

```javascript
import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages.json'), 'utf8'));
const EXPECTED_PHONE = '+491639087197';
const EXPECTED_WA = 'wa.me/491639087197';
const SLOW_LOAD_MS = 8000;

async function checkPage(browser, url) {
  const issues = [];
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const failedRequests = [];
  page.on('response', res => {
    const type = res.request().resourceType();
    if (res.status() >= 400 && (type === 'image' || type === 'document')) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  const start = Date.now();
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  } catch (e) {
    issues.push(`PAGE_LOAD_FAILED: ${e.message}`);
    await context.close();
    return { url, issues, loadTimeMs: null };
  }
  const loadTimeMs = Date.now() - start;

  if (!response || response.status() >= 400) {
    issues.push(`HTTP_ERROR: status=${response ? response.status() : 'none'}`);
  }
  if (loadTimeMs > SLOW_LOAD_MS) {
    issues.push(`SLOW_LOAD: ${loadTimeMs}ms`);
  }
  if (consoleErrors.length) {
    issues.push(`CONSOLE_ERRORS: ${consoleErrors.slice(0, 3).join(' | ')}`);
  }
  if (failedRequests.length) {
    issues.push(`FAILED_REQUESTS: ${failedRequests.slice(0, 5).join(' | ')}`);
  }

  const telHref = await page.locator('a[href^="tel:"]').first().getAttribute('href').catch(() => null);
  const waHref = await page.locator('a[href*="wa.me"]').first().getAttribute('href').catch(() => null);
  if (!telHref) issues.push('NO_TEL_LINK_FOUND');
  else if (!telHref.includes(EXPECTED_PHONE)) issues.push(`WRONG_TEL_NUMBER: ${telHref}`);
  if (!waHref) issues.push('NO_WHATSAPP_LINK_FOUND');
  else if (!waHref.includes(EXPECTED_WA)) issues.push(`WRONG_WHATSAPP_NUMBER: ${waHref}`);

  const heroTel = page.locator('.cta-row a[href^="tel:"]').first();
  const heroWa = page.locator('.cta-row a[href*="wa.me"]').first();
  for (const [label, locator] of [['phone', heroTel], ['whatsapp', heroWa]]) {
    const count = await locator.count();
    if (count === 0) { issues.push(`HERO_CTA_MISSING: ${label}`); continue; }
    const box = await locator.boundingBox();
    if (!box) { issues.push(`HERO_CTA_NOT_VISIBLE: ${label}`); continue; }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const hitOk = await page.evaluate(({ cx, cy }) => {
      const el = document.elementFromPoint(cx, cy);
      if (!el) return false;
      const link = el.closest('a');
      return !!(link && (link.href.startsWith('tel:') || link.href.includes('wa.me')));
    }, { cx, cy });
    if (!hitOk) issues.push(`HERO_CTA_BLOCKED: ${label} at (${Math.round(cx)},${Math.round(cy)}) is covered by another element`);
  }

  await context.close();
  return { url, issues, loadTimeMs };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  for (const url of PAGES) {
    console.log(`Checking ${url}...`);
    results.push(await checkPage(browser, url));
  }
  await browser.close();

  const withIssues = results.filter(r => r.issues.length > 0);
  console.log(`\n=== ${withIssues.length} of ${results.length} pages have issues ===`);
  for (const r of withIssues) {
    console.log(`\n${r.url}`);
    r.issues.forEach(i => console.log(`  - ${i}`));
  }

  if (withIssues.length > 0) {
    let body = `Automated daily site health check found problems on ${withIssues.length} of ${results.length} checked pages.\n\n`;
    for (const r of withIssues) {
      body += `### ${r.url}\n`;
      for (const i of r.issues) body += `- ${i}\n`;
      body += '\n';
    }
    fs.writeFileSync(path.join(__dirname, 'site-health-issue-body.md'), body);
  }

  fs.writeFileSync(path.join(__dirname, 'site-health-results.json'), JSON.stringify(results, null, 2));
  process.exit(withIssues.length > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
```

- [ ] **Step 3: Install dependencies locally and run**

```bash
cd agent/scripts/site-health
npm install
npx playwright install --with-deps chromium
node check.mjs
```

Expected: a per-page `Checking ...` line for each of the 8 URLs, then either `=== 0 of 8 pages have issues ===` (if the site is currently healthy — expected, since both known bugs were already fixed on 2026-08-12/14), and exit code `0`.

- [ ] **Step 4: Verify the script correctly detects a real problem**

Temporarily edit `pages.json` to add a page that doesn't exist, to confirm the failure path works:

```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('pages.json')); p.push('https://perfektsauberservice.com/this-page-does-not-exist-12345'); fs.writeFileSync('pages.json', JSON.stringify(p, null, 2));"
node check.mjs; echo "exit code: $?"
```

Expected: the added URL shows an `HTTP_ERROR: status=404` (or similar) issue, `site-health-issue-body.md` is created and contains that URL, and the process exits with code `1`.

- [ ] **Step 5: Revert the temporary test change**

```bash
git checkout pages.json
rm -f site-health-results.json site-health-issue-body.md
```

- [ ] **Step 6: Commit**

```bash
cd ../../..
git add agent/scripts/site-health/check.mjs agent/scripts/site-health/package.json
git commit -m "Add Playwright mobile site health check script"
```

---

### Task 4: GitHub Actions workflow to run the check daily

**Files:**
- Create: `.github/workflows/pss-site-health.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: PSS Site Health Check

on:
  schedule:
    - cron: '13 6 * * *'
  workflow_dispatch:

permissions:
  issues: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: agent/scripts/site-health
        run: |
          npm install
          npx playwright install --with-deps chromium

      - name: Run health check
        id: check
        working-directory: agent/scripts/site-health
        run: node check.mjs
        continue-on-error: true

      - name: Ensure needs-investigation label exists
        if: steps.check.outcome == 'failure'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh label create needs-investigation --color D93F0B --description "Opened by an automated check; awaiting Level 2 investigation" --force

      - name: Open issue with findings
        if: steps.check.outcome == 'failure'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh issue create \
            --title "Site Health: $(date -u +%Y-%m-%d) — issues found" \
            --body-file agent/scripts/site-health/site-health-issue-body.md \
            --label needs-investigation

      - name: Fail the job if issues were found
        if: steps.check.outcome == 'failure'
        run: exit 1
```

Note: `cron: '13 6 * * *'` runs at 06:13 UTC daily (~08:13 Europe/Berlin in summer) — an off-the-hour minute, per the same "avoid :00/:30" convention used for the cloud routine.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/pss-site-health.yml
git commit -m "Add daily site health check GitHub Actions workflow"
```

- [ ] **Step 3: Push and manually trigger a run**

```bash
git push
gh workflow run pss-site-health.yml --repo Perfektsauberservice/perfektsauberservice-site
```

- [ ] **Step 4: Watch the run and verify it passes**

```bash
gh run watch --repo Perfektsauberservice/perfektsauberservice-site
```

Expected: the run completes with a green checkmark (site is currently healthy, no issue should be opened). Confirm no new issue appeared at `https://github.com/Perfektsauberservice/perfektsauberservice-site/issues`.

---

### Task 5: Telegram-forwarding workflow (Level 2 → operational chat)

**Files:**
- Create: `.github/workflows/pss-forward-investigation.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: PSS Forward Investigation to Telegram

on:
  issues:
    types: [closed]

jobs:
  forward:
    if: contains(github.event.issue.labels.*.name, 'needs-investigation')
    runs-on: ubuntu-latest
    steps:
      - name: Send last comment to Telegram
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          ISSUE_TITLE: ${{ github.event.issue.title }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
          REPO: ${{ github.repository }}
        run: |
          COMMENT=$(gh api "repos/${REPO}/issues/${ISSUE_NUMBER}/comments" --jq '.[-1].body // "(no investigation comment found)"')
          curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
            --data-urlencode "text=Investigated: ${ISSUE_TITLE}

${COMMENT}

https://github.com/${REPO}/issues/${ISSUE_NUMBER}"
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/pss-forward-investigation.yml
git commit -m "Add workflow to forward closed investigations to Telegram"
git push
```

(End-to-end verification of this workflow happens in Task 7, once the Level 2 routine exists to actually close an issue.)

---

### Task 6: Create the Level 2 investigation routine

**Files:**
- Create: `agent/routines/level2-investigator-prompt.md` (documentation copy of the routine's prompt, for version control — the routine itself is created via the `RemoteTrigger` tool, not a repo file)

- [ ] **Step 1: Write the prompt documentation file**

```markdown
# Level 2 Investigator — Routine Prompt

Cloud routine created via RemoteTrigger. Cron: `17 7,15 * * *` (UTC) — runs twice daily, ~09:17 and 17:17 Europe/Berlin.

## Prompt

You are the Level 2 investigator for the Perfekt Sauber Service site/campaign automation system. Your job runs on a schedule against the repo `Perfektsauberservice/perfektsauberservice-site`.

1. Run `gh issue list --repo Perfektsauberservice/perfektsauberservice-site --label needs-investigation --state open --json number,title,body,url` to find issues awaiting investigation.
2. If there are none, stop — do nothing else.
3. For each open issue:
   a. Read the issue title and body carefully — it contains raw findings from an automated check (e.g. specific URLs, error messages, metrics). Do not re-derive what the check already found; investigate *why* it happened and what the fix is.
   b. You have read access to this repository's full source (already cloned into your environment) and to the public internet (the live site at perfektsauberservice.com). Use both: read the relevant HTML/CSS/JS source for any URL mentioned, and fetch the live page if useful to confirm current behavior.
   c. Form a concrete diagnosis: root cause, not just symptoms.
   d. If the fix is a small, clearly-scoped, low-risk code/content change (e.g. a broken link, a CSS overlap, a wrong URL) — make the fix directly in the repo, commit, and push to master. If the fix is risky, requires a business decision, or you are not confident, do NOT change code — just document your findings and a recommended next step instead.
   e. Post a comment on the issue with: your diagnosis, what you changed (if anything, with a link to the commit), and what the owner should verify or decide next.
   f. Close the issue. Keep the `needs-investigation` label on it when closing (do not remove it) — a separate workflow uses that label to forward your comment to Telegram.
4. Never delete anything, never force-push, never touch Google Ads campaign settings (budgets, bids, pausing) directly — for anything involving the ad account, only recommend in your comment what a human should check or run.
```

- [ ] **Step 2: Commit**

```bash
git add agent/routines/level2-investigator-prompt.md
git commit -m "Document Level 2 investigator routine prompt"
git push
```

- [ ] **Step 3: Create the routine**

Load the routine tool if not already loaded (`ToolSearch select:RemoteTrigger`), then call:

```json
{
  "action": "create",
  "body": {
    "name": "PSS Level 2 Investigator",
    "cron_expression": "17 7,15 * * *",
    "enabled": true,
    "job_config": {
      "ccr": {
        "environment_id": "env_01GA4WDZXzxQYCXnRS1JtPAV",
        "session_context": {
          "model": "claude-sonnet-5",
          "sources": [
            {"git_repository": {"url": "https://github.com/Perfektsauberservice/perfektsauberservice-site"}}
          ],
          "allowed_tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
        },
        "events": [
          {"data": {
            "uuid": "<generate a fresh lowercase v4 uuid — cannot be pre-specified, must be unique per call>",
            "session_id": "",
            "type": "user",
            "parent_tool_use_id": null,
            "message": {"content": "You are the Level 2 investigator for the Perfekt Sauber Service site/campaign automation system. Your job runs on a schedule against the repo Perfektsauberservice/perfektsauberservice-site.\n\n1. Run `gh issue list --repo Perfektsauberservice/perfektsauberservice-site --label needs-investigation --state open --json number,title,body,url` to find issues awaiting investigation.\n2. If there are none, stop — do nothing else.\n3. For each open issue:\n   a. Read the issue title and body carefully — it contains raw findings from an automated check (e.g. specific URLs, error messages, metrics). Do not re-derive what the check already found; investigate why it happened and what the fix is.\n   b. You have read access to this repository's full source (already cloned into your environment) and to the public internet (the live site at perfektsauberservice.com). Use both: read the relevant HTML/CSS/JS source for any URL mentioned, and fetch the live page if useful to confirm current behavior.\n   c. Form a concrete diagnosis: root cause, not just symptoms.\n   d. If the fix is a small, clearly-scoped, low-risk code/content change (e.g. a broken link, a CSS overlap, a wrong URL) — make the fix directly in the repo, commit, and push to master. If the fix is risky, requires a business decision, or you are not confident, do NOT change code — just document your findings and a recommended next step instead.\n   e. Post a comment on the issue with: your diagnosis, what you changed (if anything, with a link to the commit), and what the owner should verify or decide next.\n   f. Close the issue. Keep the needs-investigation label on it when closing (do not remove it) — a separate workflow uses that label to forward your comment to Telegram.\n4. Never delete anything, never force-push, never touch Google Ads campaign settings (budgets, bids, pausing) directly — for anything involving the ad account, only recommend in your comment what a human should check or run.", "role": "user"}
          }}
        ]
      }
    }
  }
}
```

- [ ] **Step 4: Confirm creation**

```
RemoteTrigger {"action": "list"}
```

Expected: "PSS Level 2 Investigator" appears, enabled, with the correct cron schedule. Note the returned routine ID for later reference (e.g. for `list_runs` / `get_run_log` debugging), and share the link `https://claude.ai/code/routines/{ROUTINE_ID}`.

---

### Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Force a synthetic failure**

Temporarily break something harmless and easy to detect/revert — e.g. add a page to `pages.json` that 404s (same as Task 3 Step 4), commit, push.

```bash
cd agent/scripts/site-health
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('pages.json')); p.push('https://perfektsauberservice.com/this-page-does-not-exist-12345'); fs.writeFileSync('pages.json', JSON.stringify(p, null, 2));"
cd ../../..
git add agent/scripts/site-health/pages.json
git commit -m "TEST: temporarily add broken URL to verify site health pipeline"
git push
```

- [ ] **Step 2: Trigger the health check workflow and confirm an issue opens**

```bash
gh workflow run pss-site-health.yml --repo Perfektsauberservice/perfektsauberservice-site
gh run watch --repo Perfektsauberservice/perfektsauberservice-site
gh issue list --repo Perfektsauberservice/perfektsauberservice-site --label needs-investigation
```

Expected: a new open issue titled `Site Health: <today> — issues found`, body mentioning the 404 URL.

- [ ] **Step 3: Run the Level 2 routine on demand**

```
RemoteTrigger {"action": "run", "trigger_id": "<routine id from Task 6 Step 4>"}
```

Wait a few minutes, then:

```bash
gh issue list --repo Perfektsauberservice/perfektsauberservice-site --state closed --label needs-investigation --limit 1
```

Expected: the issue is now closed, with a comment explaining the 404 is caused by the intentionally-added test URL.

- [ ] **Step 4: Confirm the Telegram message arrived**

Check the operational Telegram chat for a message starting with "Investigated: Site Health: ...".

- [ ] **Step 5: Revert the synthetic failure**

```bash
git revert --no-edit HEAD~1
git push
```

(Adjust `HEAD~1` if other commits landed in between — target specifically the "TEST: temporarily add broken URL..." commit.)

- [ ] **Step 6: Re-run the health check once more to confirm it's clean**

```bash
gh workflow run pss-site-health.yml --repo Perfektsauberservice/perfektsauberservice-site
gh run watch --repo Perfektsauberservice/perfektsauberservice-site
```

Expected: green run, no new issue opened.

---

## Explicitly out of scope for this plan

- Campaign Health migration, Mismatch Auditor, Mystery Click, Marketing Ideas, SEO/GEO Watch, and the pricing-discrepancy checks — each gets its own plan, reusing this same Foundation (label, Level 2 routine, Telegram-forward workflow) without modification.
- Expanding the curated page list beyond the 8 initial URLs.
- Any change to Google Ads campaigns, budgets, or bids by the Level 2 routine — explicitly forbidden in its prompt (Task 6).
