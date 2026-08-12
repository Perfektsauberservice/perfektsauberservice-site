# PSS Automation Agents — Design

**Date:** 2026-08-12
**Status:** Approved, ready for implementation planning

## Context

Perfekt Sauber Service (PSS) is a one-person cleaning/decluttering business (Loffenau, Baden-Württemberg) run by Laura Craciun, with the site on Netlify+GitHub (`Perfektsauberservice/perfektsauberservice-site`) and active Google Ads campaigns. The site already has 6 scheduled GitHub Actions (SEO daily report, GSC delta tracker, competitor monitor, GMB reviews update, URL indexing submission, and an archived ad-refresh reminder). Google Ads monitoring (`telegram-report.js`) currently runs via Windows Task Scheduler on the owner's local PC, every 2 days.

This design was triggered by a real incident (2026-08-12): a mobile cookie-consent banner was found — only after a manual, multi-step investigation — to be visually overlapping and intercepting clicks on the hero call/WhatsApp CTA buttons on multiple landing pages, plausibly explaining ~13 days of real, relevant, mostly-mobile ad traffic (~230 clicks, ~317€ spent) producing zero phone/WhatsApp/email contacts. The owner asked: why did this take so long to find, and can a network of agents catch this kind of thing proactively instead of reactively?

## Goals

- Catch site-breaking and campaign-breaking issues within roughly a day, without requiring the owner to notice symptoms and ask.
- Surface strategic opportunities (marketing ideas, SEO/GEO improvements) on a predictable cadence, grounded in real data rather than generic suggestions.
- Keep ongoing cost proportional to value: cheap deterministic checks run constantly; expensive LLM reasoning (Claude) only runs when something is actually worth reasoning about.
- Keep urgent/operational signal separate from strategic/digest content so neither drowns out the other.

## Non-goals (explicitly rejected by the owner)

- A monthly competitor-pricing / "price shopper" check.
- A business-registration/certificate-verification watcher.
- A single daily Claude agent run unconditionally regardless of findings (cost without proportional value).

## Architecture

Two tiers, connected through GitHub Issues as the hand-off mechanism:

**Level 1 — cheap, deterministic, scheduled via GitHub Actions.**
Each check is a script (Playwright, Google Ads API queries, GSC API queries) that runs on its own cron schedule, using the same pattern as the site's existing 6 workflows. It either finds nothing (exits quietly) or finds something concrete (a broken CTA hit-test, a landing-page/keyword city mismatch, a 3+ day zero-conversion streak, an indexing drop). When it finds something, it opens a GitHub Issue in the site repo labeled `needs-investigation`, with the raw finding (URLs, metrics, screenshots as needed) — no interpretation, just the signal.

**Level 2 — Claude Code, scheduled via the `schedule` skill (cron cloud agent), not per-check but on its own periodic cadence** (e.g., every few hours, or daily — see Open Question below). On each run, it lists open issues labeled `needs-investigation` in the repo, investigates each one using the same tools/scripts already built this session (`c:\tmp\google-ads\*.js`, direct repo access, Playwright via the `seo-visual` agent pattern), posts findings as an issue comment, sends the final Telegram message, and closes the issue (or re-labels it `needs-owner-decision` if it requires a judgment call rather than a fix).

This gives every incident a permanent, searchable history in GitHub Issues, and means Level 1 and Level 2 never need to communicate synchronously — Level 2 just polls for new flagged issues on its own schedule.

**Marketing Ideas is the one exception**: it has no Level 1 gate, because there's nothing to "check" — it's inherently generative. It runs as a Level 2 scheduled agent directly, weekly, with no escalation step.

## Components

| Agent | Cadence | Level | What it checks / produces | Delivery |
|---|---|---|---|---|
| **Site Health** | daily | 1→2 | Playwright on a curated list of top-traffic pages (informed by GA4/Ads data, not all 350+ pages daily): JS console errors, broken `tel:`/`wa.me` links, CTA hit-testability (the exact class of bug found today), broken images, load time regressions | Telegram — operational chat |
| **Campaign Health** | every 2 days | 1→2 | Migrated from local `telegram-report.js` (Windows Task Scheduler) to GitHub Actions, so it no longer depends on the owner's PC being on. Adds a new signal: sustained high clicks + near-zero conversions (3+ consecutive days) | Telegram — operational chat |
| **Mismatch Auditor** | weekly | 1→2 | Account-wide scan comparing each keyword's city/geo intent against its effective `final_url`, flagging any keyword falling back to a generic or wrong-city landing page (automates the manual audit done 2026-08-11/12) | Telegram — operational chat |
| **Mystery Click** | monthly | 1→2 | End-to-end simulated funnel test: ad click → landing page → CTA reachable and correctly wired, on mobile viewport | Telegram — operational chat |
| **Marketing Ideas** | weekly | 2 only | 2-3 concrete promotion/campaign ideas grounded in (a) internal data — current campaign performance, recent customer inquiries/season, and (b) external context — local competitor activity (Karlsruhe/Rastatt/Baden-Baden), local events (e.g. BNI-type networking), seasonal trends in the region | Telegram — **new strategic chat** |
| **SEO/GEO Watch** | daily | 1→2 | Level 1: GSC ranking/indexing deltas, AI Overview / GEO presence checks. Escalates to Level 2 only when there's something concretely actionable (not a daily status ping) | Telegram — **new strategic chat** |

## Delivery routing

Two Telegram destinations:
- **Operational chat** (existing): Site Health, Campaign Health, Mismatch Auditor, Mystery Click — things that may need same-day action.
- **Strategic chat** (new): Marketing Ideas, SEO/GEO Watch — things meant to be read when the owner has time to think, not reacted to immediately.

## Open questions for the implementation plan

1. Level 2's own polling cadence (how often it checks for new `needs-investigation` issues) — needs to balance responsiveness against cron cost. Suggest starting at 2x/day and adjusting based on observed issue volume.
2. Curated page list for Site Health and cadence for refreshing that list as traffic patterns change.
3. Telegram bot/chat setup for the new strategic chat (reuse existing bot with a second `chat_id`, or a separate bot).
4. Whether Mismatch Auditor and Mystery Click, being fully deterministic, could skip the GitHub Issue hand-off for the common case (no mismatches found) and only use it when they do find something — this is already the intended behavior, just confirming no separate design is needed.
