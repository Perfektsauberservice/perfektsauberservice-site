# ClickCease / CHEQ — conexiuni și plan de revocare (PREGĂTIT, NEEXECUTAT)

Stare: 14.10.2026. Nimic nu a fost revocat. Fiecare pas de mai jos are nevoie de aprobarea Laurei.

## 1. Conexiuni găsite

| # | Unde | Ce | Dovadă | Poate modifica excluderile IP? |
|---|---|---|---|---|
| 1 | Contul Google al kontakt@perfektsauberservice.com | Acces OAuth la Google Ads (permisiunea „Ads accounts and data”, acordată la reconectare pe 07.10) | Istoricul Google Ads: ~2.500 de modificări IP_BLOCK, autor kontakt@, canal **GOOGLE_ADS_API**, 07.10 10:11 → 14.10 02:16. Pe calculator nu există niciun cod care scrie IP_BLOCK și nicio sarcină programată la aceste ore. | **DA** (foarte probabil; Google nu arată numele aplicației) |
| 2 | Google Ads → Audiențe | Listă „CHEQ - Invalid Users” (ID 9480476266, 540 de zile) | user_list | nu; e exclusă doar pe cele 2 campanii vechi, oprite |
| 3 | Google Ads → Conversii | „CHEQ for PPC - Invalid Users” (ID 7811839608, WEBPAGE, secundară) | conversion_action | nu |
| 4 | Site (353 de fișiere HTML) | Script `ob.brilliantlocco.com/i/5d9de8db…js` + noscript | grep `brilliantlocco` | nu (inactiv după încheierea perioadei de probă) |
| 5 | netlify.toml CSP | `ob.brilliantlocco.com` / `obs.brilliantlocco.com` în script-src, connect-src, img-src, frame-src | netlify.toml | nu |

## 2. Alte căi care pot modifica excluderile IP

| Cine/ce | Cale | Observație |
|---|---|---|
| Mădălina (amgads.online@gmail.com) | interfața web, prin managerul 733-989-2919 (legătură ACTIVĂ) | 13.10 22:06: a copiat 500 de IP-uri pe campania nouă Loffenau |
| Managerul PSS 241-696-8847 | API, cu credențialele din `C:\tmp\google-ads\.env` | scripturile vechi nu conțin cod IP_BLOCK; noul modul PSS Anti-Fraud rulează doar `validateOnly` |
| Google Ads Scripts / Reguli automate | nu se pot lista prin API | **de verificat manual:** Instrumente → Acțiuni în bloc → Scripturi / Reguli |

## 3. Copie de siguranță (făcută înainte de orice intervenție)

`C:\tmp\pss-antifraud-data\backup-2026-10-14\`, cu `manifest.sha256`:
- `ip-exclusions-now.json`: toate excluderile IP actuale (741 de rânduri, toate campaniile);
- `change-history-30d.json`: tot istoricul modificărilor 16.09–14.10 (4.879 de evenimente);
- `ip_backup_*`: listele complete dinaintea scoaterii IP-urilor din Singapore (1.999 de rânduri);
- `ce_crit.json`, `geo_all.json`, `cheq_connections.json`: istoricul IP_BLOCK, clasificarea rețelelor, conexiunile CHEQ.

## 4. Plan de revocare (de executat doar după aprobare)

1. **Dovada înainte de revocare:** în ClickCease → Settings → Integrations, captură de ecran cu Google Ads „Connected” + exportul „Blocked IPs” cu ore. Le comparăm cu istoricul API.
2. **Revocare OAuth:** myaccount.google.com → Securitate → Conexiuni cu aplicații și servicii terțe → ClickCease / CHEQ → **Elimină tot accesul**.
3. **În ClickCease:** Disconnect Google Ads (dacă se mai poate intra în cont).
4. **Verificare (citire):** după 24 h, istoricul Google Ads nu trebuie să mai aibă modificări GOOGLE_ADS_API făcute de altcineva decât PSS Anti-Fraud. Rotația de seară (~22:15) nu mai apare.
5. **Opțional:** scoaterea scriptului de pe cele 353 de pagini și a intrărilor CSP. E o publicare pe site, deci are nevoie de o aprobare separată.

## 5. Ce rămâne neconfirmat

Google Ads nu dezvăluie aplicația din spatele unui token OAuth. Autorul rămâne „foarte probabil ClickCease”, până la pașii 1 sau 4.
