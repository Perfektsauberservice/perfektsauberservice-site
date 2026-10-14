# PSS Anti-Click-Fraud V1 (shadow mode)

## Componente

| Fișier | Rol | Unde rulează |
|---|---|---|
| `netlify/edge-functions/af-capture.js` | captează fiecare vizită cu gclid/gbraid/wbraid; nu întârzie pagina (`waitUntil`) | Netlify Edge |
| `netlify/antifraud/engine.mjs` | scor + motive scrise; reguli 2/5 min → analiză, >3/10 min → evaluare; corelare IP, /24, ASN, amprentă, zile diferite | Edge + local |
| `netlify/antifraud/pipeline.mjs` | stocare (Netlify Blobs, append-only, SHA-256 pe fiecare eveniment), istoric, decizii, alerte Telegram | Edge |
| `agent/antifraud/ads-exclusions.mjs` | excludere IP/CIDR prin Google Ads API; gardă care refuză orice altă scriere; `validateOnly` fără `--enforce` + `AF_ENFORCE=1` | local |
| `agent/antifraud/runner.mjs` | preia propunerile, alerte de buget (pe oră), sănătate, ștergere după 30 de zile, raport | local (PC-ul Laurei) |
| `agent/antifraud/rotation.mjs` | plan de rotație pentru limita de 500 (doar raport) | local |
| `agent/antifraud/abuse-reporter.mjs` | dosar de dovezi + contact abuse RDAP + e-mail DE/EN (nu trimite nimic) | local |

## Comenzi
```
node agent/antifraud/runner.mjs loop --store prod --interval 15     # mod umbră (validateOnly)
node agent/antifraud/runner.mjs report --store prod --hours 24
node agent/antifraud/rotation.mjs --store prod
node agent/antifraud/abuse-reporter.mjs <ip> --store prod
node --test tests/antifraud-*.test.mjs
node agent/antifraud/e2e-test.mjs https://<draft>.netlify.app        # doar pe draft, niciodată pe producție
```

## Lista de activare (fiecare pas cere aprobarea Laurei)
1. Text GDPR aprobat și adăugat în Datenschutzerklärung (`docs/antifraud/gdpr-datenschutz-entwurf.md`).
2. Merge al ramurii `feat/antifraud-shadow-v1` în master → publicare live (captare în mod umbră, fără excluderi).
3. Pornirea runner-ului ca sarcină Windows (`--store prod`, fără `--enforce`), plus o săptămână de mod umbră: comparăm alertele cu clicurile invalide din Google.
4. Activarea excluderilor reale: `AF_ENFORCE=1` + `--enforce`.
5. Rotația (scoaterea de IP-uri când lista e plină) rămâne manuală, cu aprobare.
6. Revocarea ClickCease: `docs/antifraud/clickcease-connections.md`.
