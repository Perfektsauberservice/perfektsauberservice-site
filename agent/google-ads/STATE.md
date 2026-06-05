# Google Ads PSS — STATE

> **Cum se folosește acest fișier:**
> - Secțiunea **VOLATIL** se schimbă des (bugete, conversii, performance). Verifică UI înainte să iei decizii.
> - Secțiunea **STABIL** rar/niciodată (account ID, link-uri, decizii arhitecturale).
> - Backlog-ul e listă de TODO-uri ordonate după prioritate.

---

## 🔴 VOLATIL — verifică în UI înainte de a acționa

**Last verified:** 2026-06-05 (Consent Mode v2 deploy — fix tracking conversii pierdute). Performanță 30z (May 5–Jun 4): 317 clicks · €414.84 · 3 conv. Entrümpelung €232.54/0 conv (cauză: tracking, NU cerere — user confirmă apeluri reale). NU schimba bidding strategy până nu se adună conversii reale post-fix (~2 săpt).

### Campanii ENABLED

| Campanie | Tip | Buget/zi | Bidding | Status |
|---|---|---|---|---|
| **PSS_Reinigung_Search** | Search | €7 | Manual CPC | Enabled, ad groups Eligible |
| **PSS_Entrumpelung_Search** | Search | €10 (era €20) | Manual CPC | Enabled, ad groups Eligible |
| ~~Entrümpelung Rastatt~~ | ~~PMax~~ | ~~€0.54~~ | ~~Max conversions~~ | **REMOVED 2026-05-07** |

**Total:** €17/zi (≈€510/lună). Era €27/zi înainte.

### Ad Groups (7 total, toate Eligible)

**În PSS_Reinigung_Search (3):**
- AG1_Bueroreinigung — €1.20 max CPC
- AG2_Endreinigung — €1.20 max CPC
- AG3_Grundreinigung — €1.20 max CPC ← câștigătoare CTR 20.83%

**În PSS_Entrumpelung_Search (4):**
- AG1_Entrumpelung_Core — €1.50 max CPC ← cel mai mult trafic
- AG2_Wohnungsaufloesung — €1.50 max CPC
- AG3_Haushalts_Nachlass — €1.50 max CPC
- AG4_Gewerbe_Akut — €1.80 max CPC

### Conversion Actions (DONE 2026-05-08 01:30)

| Goal | Conversion Action | Source | Value | Count | Window | Type |
|---|---|---|---|---|---|---|
| **Phone call lead** | phone_click (web) | GA4 import | €60 | One | 30d | Primary |
| **Submit lead form** | whatsapp_click (web) | GA4 import | €25 | One | 30d | Primary |
| **Contact** | email_click (web) | GA4 import | €15 | One | 30d | Primary* |
| Phone call lead | Calls from ads | Auto-detected | — | Every | 30d | Primary (auto) |
| Phone call lead | Call clicks from ads | Auto-detected | — | One | 30d | Primary (auto) |
| Contact | Clicks to call | Google hosted | — | Every | 30d | Primary (auto) |

*email_click forțat Primary de Google (Contact goal cu un singur action). Va fi schimbat Secondary când adăugăm un al doilea Contact action (ex: form submission).

**Status:** „There is no results data available yet" — normal, data 0. Primele conversii: 24-48h.

### Settings cont (verificate)

- ✅ Negative keywords list `PSS Master Negatives` (178 termeni) aplicată pe ambele Search la nivel cont
- ✅ GA4 ↔ Google Ads linking activ (Property ID 531103504, Measurement ID `G-BMC32KSYKF`)
- ✅ Import app/web metrics + Import audiences ON
- ✅ Schedule Mo-Fr 07-19, Sa 09-13, no Sunday
- ✅ Geo targeting Presence only
- ✅ Search Partners + Display = OFF
- ✅ Mobile +100% bid adjustment

### Site (LIVE, verificat)

- GA4 events `phone_click` / `whatsapp_click` / `email_click` wired pe handler-ul global din [index.html:967-977](../../index.html#L967-L977) și pe paginile de campanie
- **Consent Mode v2 (2026-06-05):** GA4 se încarcă pe TOATE cele 457 pagini cu consimțământ default `denied` (cookieless pings → conversion modeling). La „Alle akzeptieren" → `psGrantConsent()` trece pe `granted`. ÎNAINTE: GA4 se încărca DOAR după accept → pierdea conversiile celor ~50%+ care sună direct fără accept (Entrümpelung arăta fals 0 conversii deși existau lead-uri reale confirmate de user). danke.html: `form_submit` (25€) acum nu se mai pierde.
- Hero photos Reinigung fixate 2026-05-07 (commit `051f7025`):
  - endreinigung-{rastatt, baden-baden, karlsruhe} → cleaning-endreinigung-800.webp
  - bueroreinigung-rastatt → cleaning-bueroreinigung-800.webp
  - unterhaltsreinigung-region → cleaning-unterhaltsreinigung-800.webp

---

## 🟢 STABIL

### Cont
- **Email:** kontakt@perfektsauberservice.com
- **Customer ID:** 984-766-7839
- **Site promovat:** perfektsauberservice.com (Netlify + repo `Perfektsauberservice/perfektsauberservice-site`)

### GA4
- **Property ID:** 531103504
- **Measurement ID:** G-BMC32KSYKF
- **Property name:** www.perfektsauberservice.com

### Strategie
- Manual CPC primele 14 zile / până avem 30+ conversions cumulate
- Apoi → switch la Smart Bidding (Maximize Conversions sau tCPA)
- Bid caps: AG-uri Reinigung €1.20, Entrumpelung Core/Wohnung/Haushalts €1.50, Gewerbe_Akut €1.80
- Predicție realistă (€17/zi):
  - Săpt 1-2: ~€238 cost, 5-10 leads, CPL 25-50€
  - Săpt 3-4: ~€476 cost, 12-18 leads, CPL 20-35€
  - Săpt 5-8: ~€680/lună, 15-25 leads, CPL 20-30€
- ROI estimat: 7-10x (ticket mediu Entrümpelung €1500, profit per job ~€600)

### Decision triggers (când să acționăm)
- AG3_Haushalts_Nachlass + AG4_Gewerbe_Akut la 0% CTR după 7 zile → pause
- Reinigung continuă CTR > 15% după 14 zile → adaugă AG-uri Endreinigung Karlsruhe + Bauendreinigung
- CPL > €50 la fine săpt 2 → STOP, investigăm tracking + landing
- Switch la Smart Bidding (Maximize Conversions) doar după 30+ conversions cumulate

### Resurse repo
- `agent/google-ads/STATUS-REAL.md` — istorie 2026-05-07 (snapshot, NU mai update aici, folosește acest STATE.md)
- `agent/google-ads/README.md` — plan original Flo (istoric, NU live)
- `agent/google-ads/ACTIVARE-AZI.md` — plan original activare (istoric)
- `agent/google-ads/{01-04}-*.csv` — blueprint original CSV (necesită update)
- `agent/google-ads/negative-keywords.txt` — sursa lista master (255 linii, 178 active)

---

## 🟡 Backlog — TODO ordonat după prioritate

### Imediat (24-72h)
- [ ] Verifică în 24-48h: Tools → Conversions → Summary — apare numere ≠ 0 la cele 3 goals?
- [ ] Dacă DA → continuă rularea, monitorizează săptămânal
- [ ] Dacă NU în 5 zile la rate normale de cheltuieli → investigăm consent gate / blocaj tehnic

### Săpt 1 (08-14 mai)
- [ ] Search Terms Report săptămânal pe PSS_Entrumpelung_Search → adaugă negatives noi
- [ ] Pause AG3_Haushalts_Nachlass / AG4_Gewerbe_Akut dacă rămân 0% CTR

### Săpt 2-4 (15 mai - 4 iunie)
- [ ] Date pentru CPL real per ad group
- [ ] Decizie scalare bugete (+50% dacă CPL < €30)
- [ ] Switch Smart Bidding după 30+ conversions
- [ ] Adaugă AG-uri Endreinigung Karlsruhe + Bauendreinigung dacă Reinigung CTR rămâne > 15%
- [ ] Adaugă form submission ca al doilea Contact action → mută email_click la Secondary

### Backlog (low-priority)
- [ ] Port designul React „premium" din `Downloads/reinigung/` la static HTML (Lighthouse + SEO)
- [ ] Update CSV-uri (`01-campaigns.csv`, `02-ad-groups.csv`) ca să reflecte Reinigung_Search activ în Faza 1

### Avertismente Google active
- „Call-Only ads are being deprecated — Update to call assets by February 2027"

---

## 📜 Lecții învățate

1. **Bugetul nu e o intenție, e plafonul real.** €20/zi alocat dar 7% utilizat = bugetul de €10/zi e mai onest.
2. **CTR 19% nu se ignoră** — chiar dacă nu era în plan, e semnal că ad copy + landing aliniate.
3. **Tracking blocant** — toate optimizările sunt teorie fără conversion data.
4. **PMax sub €30/zi e ban aruncat** — algoritmul nu poate învăța sub minimum.
5. **Consent gate reduce volumul tracking-ului ~40-70%** — dar e necesar legal (DSGVO/TTDSG). Impact: conversiile vor părea mai puține decât click-urile reale, dar Google folosește datele pentru optimizare.

---

**Ultimul update STATE:** 2026-05-08 01:37 EEST (post-wizard conversion actions)
**Următoarea revizuire:** 2026-05-09 (verificare prime conversii)
