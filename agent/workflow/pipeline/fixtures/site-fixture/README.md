# site-fixture

Tiny static site used as the Implementer target in tests. Fictional data only.

**Injected defects (for FX-03 / E2E-LOW / SMK-IMP):**
1. `index.html` links to `angebot.html`, which does not exist. Intended target:
   `kontakt.html`.
2. `index.html` `<h1>` reads "PSS Reingungsservice" (typo; should be "PSS
   Reinigungsservice").

**Prescribed minimal fix:** in `index.html`, change the `angebot.html` href to
`kontakt.html`, and fix the `<h1>` spelling. Touch nothing else.

This directory is copied into the isolated temp test repo at test time. It is never
edited in place in the official repo.
