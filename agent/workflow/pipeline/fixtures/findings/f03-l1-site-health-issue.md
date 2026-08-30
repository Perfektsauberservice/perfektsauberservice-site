# [needs-investigation] Broken internal link on site-fixture

**Source:** L1 automated check (fixture equivalent of `pss-site-health`)
**Detected:** 2026-08-31T06:13:00Z
**Severity:** low

## What the check found

`site-fixture/index.html` links to `angebot.html` via
`<a href="angebot.html">Angebot anfordern</a>`, but no file `angebot.html` exists in
`site-fixture/`. The intended target is `kontakt.html`, which does exist and
contains the request form.

Additionally: `site-fixture/index.html` contains the visible typo
"Reingungsservice" (should be "Reinigungsservice") in the `<h1>`.

## Reproduction

1. Open `site-fixture/index.html`.
2. Click "Angebot anfordern" → 404 (target missing).
3. Read the `<h1>` → misspelled.

## Deterministic success criterion (for QA)

- `site-fixture/index.html` contains no `href` pointing to a file that does not
  exist under `site-fixture/`.
- The `<h1>` of `site-fixture/index.html` reads exactly "PSS Reinigungsservice".
- No other file under `site-fixture/` changed.
