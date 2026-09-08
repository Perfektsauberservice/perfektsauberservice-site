# Lead Click Ping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send Laura an instant Telegram notification whenever a visitor clicks the WhatsApp, phone, or email contact link on one of 8 pilot pages — independent of GA4/Ads consent gating.

**Architecture:** A new Netlify Function (`lead-click-ping.mjs`), modeled on the existing `submission-created.mjs` lead notifier and reusing its `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` env vars, receives a `navigator.sendBeacon` ping fired from the existing per-page click listener and forwards a formatted message to Telegram.

**Tech Stack:** Netlify Functions (Node.js ESM, `.mjs`), `navigator.sendBeacon` (browser), Telegram Bot API (`sendMessage`), existing `sessionStorage.ps_attribution` (gclid/UTM) already populated on all pilot pages.

**Spec:** `docs/superpowers/specs/2026-09-08-lead-click-ping-design.md`

**Branch:** `feat/lead-click-ping` (already created from `origin/master`; spec doc already committed there as `5ab33292`)

---

### Task 1: Create the `lead-click-ping` Netlify Function

**Files:**
- Create: `netlify/functions/lead-click-ping.mjs`

- [ ] **Step 1: Write the function**

```js
/**
 * Lead Click Ping — Netlify Function
 * Receives a sendBeacon ping when a visitor clicks a WhatsApp/phone/email
 * contact link, and sends an instant Telegram notification. First-party,
 * consent-independent signal — separate from GA4/Ads (see
 * docs/superpowers/specs/2026-09-08-lead-click-ping-design.md).
 *
 * Reuses the same env vars as netlify/functions/submission-created.mjs:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 */

const ALLOWED_TYPES = ['whatsapp', 'phone', 'email'];
const TYPE_LABELS = { whatsapp: 'WhatsApp', phone: 'Telefon', email: 'Email' };
const TYPE_EMOJI = { whatsapp: '📲', phone: '📞', email: '✉️' };

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const type = body.type;
    const page = body.page;

    if (!ALLOWED_TYPES.includes(type) || typeof page !== 'string' || !page.startsWith('/')) {
      return { statusCode: 200, body: 'ignored' };
    }

    const attribution = (body.attribution && typeof body.attribution === 'object') ? body.attribution : {};
    const gclid = attribution.gclid || '';
    const utm_source = attribution.utm_source || '';
    const utm_campaign = attribution.utm_campaign || '';
    const hasAttribution = Boolean(gclid || utm_source || utm_campaign);

    const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
    const text = [
      `${TYPE_EMOJI[type]} Click ${TYPE_LABELS[type]} — Perfekt Sauber Service`,
      `📅 ${now}`,
      `📄 Pagina: ${page}`,
      ...(hasAttribution ? [`🎯 Attribution: gclid=${gclid || '—'} utm_source=${utm_source || '—'} utm_campaign=${utm_campaign || '—'}`] : []),
      `ℹ️ Doar semnal de click — nu confirmă că a scris efectiv mesajul.`,
    ].join('\n');

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn('⚠️  TELEGRAM_BOT_TOKEN sau TELEGRAM_CHAT_ID lipsesc din env vars.');
      return { statusCode: 200, body: 'no-telegram-config' };
    }

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (res.ok) {
      console.log(`✅ Telegram trimis pentru click ${type} pe ${page}`);
    } else {
      const resJson = await res.json().catch(() => ({}));
      console.error('❌ Telegram eroare:', JSON.stringify(resJson));
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('❌ Eroare lead-click-ping:', err.message);
    return { statusCode: 200, body: 'error' };
  }
};
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check netlify/functions/lead-click-ping.mjs`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/lead-click-ping.mjs
git commit -m "feat(lead-click-ping): add Netlify Function for click-to-contact Telegram ping"
```

---

### Task 2: Local smoke test via `netlify dev`

No live `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` exist in the local environment (they're Netlify dashboard secrets, not committed). This step verifies the function's request parsing/validation logic runs correctly; it does not verify an actual Telegram message is sent — that's confirmed later, on the deploy preview, where the real secrets exist.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server in the background**

Run: `netlify dev --port 8888` (background)
Expected: log line `Server now ready on http://localhost:8888`

- [ ] **Step 2: Test an invalid payload is silently ignored**

Run:
```bash
curl -s -X POST http://localhost:8888/.netlify/functions/lead-click-ping \
  -d '{"type":"not-a-real-type","page":"/foo"}'
```
Expected: `ignored`

- [ ] **Step 3: Test a valid payload is accepted**

Run:
```bash
curl -s -X POST http://localhost:8888/.netlify/functions/lead-click-ping \
  -d '{"type":"whatsapp","page":"/bauschlussreinigung-karlsruhe","ts":"2026-09-08T12:00:00.000Z","attribution":{"gclid":"test123","utm_source":"google","utm_campaign":"PSS_Entrumpelung_Search"}}'
```
Expected: `no-telegram-config` (confirms the payload parsed and passed validation; no secrets locally so it stops before the Telegram call)

- [ ] **Step 4: Stop the dev server**

Stop the background `netlify dev` process.

---

### Task 3: Wire the ping into `index.html`

**Files:**
- Modify: `index.html:766-774`

- [ ] **Step 1: Replace the click listener**

Old:
```js
  // GA4 conversion event tracking
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a || typeof gtag !== 'function') return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) gtag('event', 'phone_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
    else if (href.indexOf('wa.me') > -1 || href.indexOf('api.whatsapp') > -1) gtag('event', 'whatsapp_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
    else if (href.indexOf('mailto:') === 0) gtag('event', 'email_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
  });
```

New:
```js
  // GA4 conversion event tracking
  function psLeadPing(type){
    try {
      var attr = JSON.parse(sessionStorage.getItem('ps_attribution') || '{}');
      var payload = JSON.stringify({ type: type, page: location.pathname, ts: new Date().toISOString(), attribution: attr });
      navigator.sendBeacon('/.netlify/functions/lead-click-ping', payload);
    } catch(e) {}
  }
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a || typeof gtag !== 'function') return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) { gtag('event', 'phone_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'}); psLeadPing('phone'); }
    else if (href.indexOf('wa.me') > -1 || href.indexOf('api.whatsapp') > -1) { gtag('event', 'whatsapp_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'}); psLeadPing('whatsapp'); }
    else if (href.indexOf('mailto:') === 0) { gtag('event', 'email_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'}); psLeadPing('email'); }
  });
```

- [ ] **Step 2: Verify the replacement landed correctly**

Run: `grep -c "psLeadPing" index.html`
Expected: `4` (1 function definition + 3 call sites)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(lead-click-ping): wire click ping into index.html"
```

---

### Task 4: Wire the ping into `kontakt.html`

**Files:**
- Modify: `kontakt.html:439-447`

- [ ] **Step 1: Replace the click listener**

Same old/new blocks as Task 3, Step 1 (identical code, different file).

- [ ] **Step 2: Verify**

Run: `grep -c "psLeadPing" kontakt.html`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add kontakt.html
git commit -m "feat(lead-click-ping): wire click ping into kontakt.html"
```

---

### Task 5: Wire the ping into `entruempelung-karlsruhe.html`

**Files:**
- Modify: `entruempelung-karlsruhe.html:613-621`

- [ ] **Step 1: Replace the click listener**

Same old/new blocks as Task 3, Step 1.

- [ ] **Step 2: Verify**

Run: `grep -c "psLeadPing" entruempelung-karlsruhe.html`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add entruempelung-karlsruhe.html
git commit -m "feat(lead-click-ping): wire click ping into entruempelung-karlsruhe.html"
```

---

### Task 6: Wire the ping into `hausmeisterservice.html`

**Files:**
- Modify: `hausmeisterservice.html:489-497`

- [ ] **Step 1: Replace the click listener**

Same old/new blocks as Task 3, Step 1.

- [ ] **Step 2: Verify**

Run: `grep -c "psLeadPing" hausmeisterservice.html`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add hausmeisterservice.html
git commit -m "feat(lead-click-ping): wire click ping into hausmeisterservice.html"
```

---

### Task 7: Wire the ping into `portfolio.html`

**Files:**
- Modify: `portfolio.html:473-481`

- [ ] **Step 1: Replace the click listener**

Same old/new blocks as Task 3, Step 1.

- [ ] **Step 2: Verify**

Run: `grep -c "psLeadPing" portfolio.html`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add portfolio.html
git commit -m "feat(lead-click-ping): wire click ping into portfolio.html"
```

---

### Task 8: Wire the ping into `bauschlussreinigung-karlsruhe.html`

**Files:**
- Modify: `bauschlussreinigung-karlsruhe.html:371-379`

- [ ] **Step 1: Replace the click listener**

Same old/new blocks as Task 3, Step 1.

- [ ] **Step 2: Verify**

Run: `grep -c "psLeadPing" bauschlussreinigung-karlsruhe.html`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add bauschlussreinigung-karlsruhe.html
git commit -m "feat(lead-click-ping): wire click ping into bauschlussreinigung-karlsruhe.html"
```

---

### Task 9: Wire the ping into `bauschlussreinigung-rastatt.html`

**Files:**
- Modify: `bauschlussreinigung-rastatt.html:371-379`

- [ ] **Step 1: Replace the click listener**

Same old/new blocks as Task 3, Step 1.

- [ ] **Step 2: Verify**

Run: `grep -c "psLeadPing" bauschlussreinigung-rastatt.html`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add bauschlussreinigung-rastatt.html
git commit -m "feat(lead-click-ping): wire click ping into bauschlussreinigung-rastatt.html"
```

---

### Task 10: Wire the ping into `reinigung.html`

This page uses a slightly different (brace-per-branch) formatting for the same listener, so it needs its own old/new block.

**Files:**
- Modify: `reinigung.html:568-580`

- [ ] **Step 1: Replace the click listener**

Old:
```js
  // GA4 conversion event tracking — phone/whatsapp/email clicks
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a || typeof gtag !== 'function') return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) {
      gtag('event', 'phone_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
    } else if (href.indexOf('wa.me') > -1 || href.indexOf('api.whatsapp') > -1) {
      gtag('event', 'whatsapp_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
    } else if (href.indexOf('mailto:') === 0) {
      gtag('event', 'email_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
    }
  });
```

New:
```js
  // GA4 conversion event tracking — phone/whatsapp/email clicks
  function psLeadPing(type){
    try {
      var attr = JSON.parse(sessionStorage.getItem('ps_attribution') || '{}');
      var payload = JSON.stringify({ type: type, page: location.pathname, ts: new Date().toISOString(), attribution: attr });
      navigator.sendBeacon('/.netlify/functions/lead-click-ping', payload);
    } catch(e) {}
  }
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a || typeof gtag !== 'function') return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) {
      gtag('event', 'phone_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
      psLeadPing('phone');
    } else if (href.indexOf('wa.me') > -1 || href.indexOf('api.whatsapp') > -1) {
      gtag('event', 'whatsapp_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
      psLeadPing('whatsapp');
    } else if (href.indexOf('mailto:') === 0) {
      gtag('event', 'email_click', {link_url: href, page_path: location.pathname, transport_type: 'beacon'});
      psLeadPing('email');
    }
  });
```

- [ ] **Step 2: Verify**

Run: `grep -c "psLeadPing" reinigung.html`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add reinigung.html
git commit -m "feat(lead-click-ping): wire click ping into reinigung.html"
```

---

### Task 11: Push the branch and get a Netlify deploy preview

**Files:** none

- [ ] **Step 1: Confirm all 8 pages + the function are committed**

Run: `git log --oneline origin/master..HEAD`
Expected: 9 commits (1 function + 8 pages) on top of the earlier spec-doc commit `5ab33292`, all with `feat(lead-click-ping)` or `docs(spec)` prefixes, nothing uncommitted.

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Push the branch (check in with Laura before running this — it publishes the branch to GitHub/Netlify, triggering a deploy preview; it does not touch `master` or production)**

```bash
git push -u origin feat/lead-click-ping
```
Expected: branch published; Netlify (already connected to this repo, per existing `netlify.toml`) starts a deploy-preview build automatically.

- [ ] **Step 3: Get the preview URL**

Run: `netlify status` or check the GitHub PR / Netlify dashboard for the deploy-preview link for `feat/lead-click-ping`.

---

### Task 12: Manual end-to-end verification on the deploy preview

**Files:** none — this is a manual verification checklist, to run once the preview URL from Task 11 is live.

- [ ] **Step 1:** Open `<preview-url>/bauschlussreinigung-karlsruhe?gclid=test123&utm_source=google&utm_campaign=PSS_Entrumpelung_Search` in a browser.
- [ ] **Step 2:** Click the WhatsApp button.
- [ ] **Step 3:** Confirm WhatsApp Web/app opens as normal (no visible change, no delay).
- [ ] **Step 4:** Confirm a Telegram message arrives within a few seconds, formatted as:
  ```
  📲 Click WhatsApp — Perfekt Sauber Service
  📅 08.09.2026, HH:MM
  📄 Pagina: /bauschlussreinigung-karlsruhe
  🎯 Attribution: gclid=test123 utm_source=google utm_campaign=PSS_Entrumpelung_Search
  ℹ️ Doar semnal de click — nu confirmă că a scris efectiv mesajul.
  ```
- [ ] **Step 5:** Repeat for the phone (`tel:`) button and the email link — confirm a Telegram message arrives for each, with the correct `Click Telefon` / `Click Email` label.
- [ ] **Step 6:** Repeat once more on a URL with no `?gclid=`/`utm_*` params — confirm the message arrives without the `🎯 Attribution:` line (not `gclid=— utm_source=—`, the whole line should be absent).
- [ ] **Step 7:** Report results back to Laura with the preview URL and confirmation that all 3 click types worked. Wait for her explicit go-ahead before merging `feat/lead-click-ping` into `master` — this plan does not include that merge step.

---

## Notes

- No task in this plan merges to `master` or otherwise touches production. The branch stops at a pushed, previewable state per the approved spec's rollout plan (steps 1-4); merge is a separate, explicit decision for Laura after reviewing Task 12's results.
- If Task 2's local smoke test fails in an unexpected way (not just missing Telegram config), stop and fix before proceeding to the page-wiring tasks — no point wiring 8 pages to a broken function.
