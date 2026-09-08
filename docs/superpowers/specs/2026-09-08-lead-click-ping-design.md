# Lead Click Ping — Design

**Date:** 2026-09-08
**Status:** Approved by Laura, pilot scope
**Author:** Claude (session with Laura Craciun)

## Problem

WhatsApp/phone/email clicks on the site are not reliably visible in GA4 or
Google Ads. Root cause (confirmed 2026-09-08, see conversation): the site's
Consent Mode v2 defaults `analytics_storage`/`ad_storage` to `denied` until
the visitor explicitly accepts the cookie banner. Events from visitors who
don't accept become "cookieless pings" that GA4 only surfaces through
behavioral modeling — which requires ≥1,000 events/day with consent denied
and ≥1,000 daily users with consent granted, for 7 consecutive days. This
site gets 3–11 visits/day total, so that threshold is structurally
unreachable. Confirmed directly: the Google Ads conversion actions for
`whatsapp_click`, `phone_click`, and `form_submit` are all
`GOOGLE_ANALYTICS_4_CUSTOM` type (imported from GA4), so they inherit the
same gap. This is not a misconfiguration — it cannot be fixed by changing a
setting.

Separately, the site already has a working, live, first-party lead
notifier: `netlify/functions/submission-created.mjs` ("Agent 8"), which
fires automatically on every Netlify Forms submission (the `kontakt.html`
contact form) and sends an instant Telegram message + Resend email,
independent of consent/GA4/ad-blockers, using `TELEGRAM_BOT_TOKEN` /
`TELEGRAM_CHAT_ID` already configured in Netlify. This works because a
native form POST is a first-party request Netlify intercepts server-side —
no client JS or consent needed.

There is no equivalent for WhatsApp/phone/email link clicks, because
clicking a `wa.me`/`tel:`/`mailto:` link is just an outbound navigation —
there's no form submission for Netlify to hook into.

## Goal

Give Laura a real-time, consent-independent signal ("someone just clicked
WhatsApp/phone/email on page X") for the three click-to-contact channels,
mirroring the reliability the contact form already has — without changing
anything the visitor sees or does.

## Non-goals

- Does not replace GA4/Ads reporting or attempt to fix their consent
  gating (structurally not fixable, see Problem).
- Does not confirm the visitor actually completed a WhatsApp
  message/call — only that they clicked the link. Same limitation the
  existing Ads Dynamic Number Insertion tracking already has.
- Does not add authentication/rate-limiting to the new endpoint (accepted
  limitation for pilot, see Security below).
- Does not touch the existing `submission-created.mjs` form-notifier flow.

## Architecture

```
Visitor clicks WhatsApp/tel/mailto link
        │
        ▼
existing click listener (per-page inline <script>)
  ├─ gtag('event', 'whatsapp_click'|'phone_click'|'email_click', ...)  [unchanged]
  └─ navigator.sendBeacon('/.netlify/functions/lead-click-ping', payload)  [new]
        │
        ▼
netlify/functions/lead-click-ping.mjs
  ├─ validate type ∈ {whatsapp, phone, email}
  ├─ build Telegram message (page, time, type, attribution)
  └─ POST https://api.telegram.org/bot<token>/sendMessage
```

The beacon and the page navigation to `wa.me`/`tel:`/`mailto:` happen in
the same click handler tick; `sendBeacon` is designed specifically to
survive the page unloading immediately after, so no `await`/blocking is
needed or possible.

## Components

### 1. Click listener changes (8 pilot pages)

Each pilot page already has this inline script (example from
[bauschlussreinigung-karlsruhe.html:372-379](../../../bauschlussreinigung-karlsruhe.html#L372-L379)):

```js
document.addEventListener('click', function(e){
  var a = e.target && e.target.closest && e.target.closest('a');
  if (!a || typeof gtag !== 'function') return;
  var href = a.getAttribute('href') || '';
  if (href.indexOf('tel:') === 0) gtag('event', 'phone_click', {...});
  else if (href.indexOf('wa.me') > -1 || href.indexOf('api.whatsapp') > -1) gtag('event', 'whatsapp_click', {...});
  else if (href.indexOf('mailto:') === 0) gtag('event', 'email_click', {...});
});
```

Add one small helper, called alongside each existing `gtag('event', ...)`
call (not replacing it):

```js
function psLeadPing(type, href){
  try {
    var attr = JSON.parse(sessionStorage.getItem('ps_attribution') || '{}');
    var payload = JSON.stringify({
      type: type,
      page: location.pathname,
      ts: new Date().toISOString(),
      attribution: attr
    });
    navigator.sendBeacon('/.netlify/functions/lead-click-ping', payload);
  } catch(e) {}
}
```

Called as `psLeadPing('whatsapp', href)`, `psLeadPing('phone', href)`,
`psLeadPing('email', href)` in the three branches. The existing
`typeof gtag !== 'function'` guard and `if (!a...) return` stay exactly as
they are — this is additive only, wrapped in its own `try/catch` so it can
never break the existing click-tracking or the link navigation itself.

### 2. New Netlify Function: `netlify/functions/lead-click-ping.mjs`

Modeled directly on `submission-created.mjs`'s Telegram-sending block
(same env vars, same `fetch` call shape). Responsibilities:

- Parse `event.body` as JSON (matches how `submission-created.mjs` already
  handles Netlify's body regardless of declared content-type —
  `sendBeacon` sends `text/plain` by default, which is fine since we
  `JSON.parse` the raw body either way).
- Validate `type` is one of `whatsapp` / `phone` / `email`; validate
  `page` is a non-empty string starting with `/`. Reject anything else
  with a `200` (never give a scraping/abuse script a signal that
  validation failed — same "fail quiet, don't block" posture as
  `submission-created.mjs`'s outer catch).
- Build and send one Telegram message via the existing
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` env vars:

  ```
  📲 Click {WhatsApp|Telefon|Email} — Perfekt Sauber Service
  📅 {DD.MM.YYYY, HH:mm, Europe/Berlin}
  📄 Pagina: {page}
  🎯 Attribution: gclid=… utm_source=… utm_campaign=…   (only if present)
  ℹ️ Doar semnal de click — nu confirmă că a scris efectiv mesajul.
  ```
- No Resend email for this ping (Telegram alone matches the urgency use
  case; the form notifier's email channel is unaffected and unchanged).
- Always return `{statusCode: 200}` — `sendBeacon` callers never read the
  response, and a non-200 would only cost a retry the browser doesn't
  perform anyway.

## Data flow / attribution

Reuses the existing `ps_attribution` sessionStorage object (gclid, gbraid,
wbraid, utm_source, utm_medium, utm_campaign), already populated by the
attribution-capture script present on all pilot pages (built for the
contact form, PR #30). No new capture logic — read-only reuse.

## Error handling

- Client: the whole ping call is wrapped in `try/catch` with an empty
  catch — if `sessionStorage` is unavailable (e.g. private browsing edge
  cases) or `sendBeacon` throws, the click and navigation to
  WhatsApp/phone/email proceed completely unaffected.
- Server: malformed/missing fields → `200` with no Telegram send (silent
  reject, not a crash). Telegram API failure → logged via
  `console.error` (visible in Netlify function logs) exactly like
  `submission-created.mjs` already does; no retry, no user-facing effect
  either way since the visitor already navigated away.

## Security / known limitation (accepted for pilot)

`lead-click-ping` is a public, unauthenticated endpoint — anyone who
inspects the page source could script requests directly to it and
generate fake Telegram messages. Same exposure class as any public Netlify
Function invoked from client JS. Accepted for the pilot given current
traffic volume (3–11 visits/day, i.e. Laura would notice a sudden flood of
fake messages immediately). Revisit (e.g. simple shared-secret query
param, or basic per-IP throttling) only if this becomes an actual problem.

## Rollout

1. Build on a new branch (`feat/lead-click-ping`).
2. Netlify auto-generates a deploy preview for the branch.
3. Manually click WhatsApp/phone/email on the preview for at least one
   pilot page; confirm the Telegram message arrives correctly formatted,
   including attribution when a `?gclid=`/`utm_*` param is present in the
   test URL.
4. Show Laura the working preview + a sample Telegram message.
5. Laura gives separate, explicit go-ahead to merge to `master` (per
   established project pattern — build approval ≠ deploy approval).
6. After a few days live on the 8 pilot pages with no issues, revisit
   whether to extend to the remaining ~250 pages (separate decision, not
   part of this spec).

## Testing

No existing unit/integration test framework covers this site's inline
per-page JS or Netlify Functions (verified: `submission-created.mjs` and
siblings have no test files). Verification is manual, via the deploy
preview, consistent with how `submission-created.mjs` itself was
originally validated. If useful, a small `curl` smoke test against the
deployed preview function (valid payload → expect Telegram message; empty
tel: payload → expect no message) can be run as a manual check before
asking for merge approval — not an automated suite.

## Rollback

Single new file (`lead-click-ping.mjs`) + additive-only lines on 8 pages,
each wrapped in its own `try/catch`. Revert is either `git revert` the
merge commit, or (if only the Function needs to be disabled) removing the
`TELEGRAM_BOT_TOKEN` check is unnecessary — simply reverting the commit is
simpler and sufficient.
