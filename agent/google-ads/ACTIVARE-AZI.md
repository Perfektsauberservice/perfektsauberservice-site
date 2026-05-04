# Google Ads — Activare Soft Launch (PSS)

**Data:** 2026-05-04
**Plan:** Activare graduală în 3 etape. Risc minim, beneficiu maxim, bonus 400€ folosit, sezon prins.

---

## ⚠️ Reguli absolute (NU negociabile)

1. **NU activezi nicio campanie până conversion tracking nu funcționează 100%.** Linia roșie absolută. Fără asta, Smart Bidding e orb și arzi bani.
2. **NU schimbi setările in primele 14 zile** (decât negative keywords). Algoritmul Google are nevoie de date stabile ca să învețe.
3. **NU urci bugetul "fiindcă merge bine"** în prima săptămână. Așteaptă date de min. 7-10 zile.
4. **NU oprești campaniile dacă primele 5 zile nu aduc lead-uri.** Asta e learning phase normal.

---

## Faza A — Săptămâna 1 (SETUP, fără click-uri plătite)

### Pas 1: Cont Google Ads cu bonus 400€ (15 min)

1. Mergi la **https://ads.google.com/intl/de/home/get-started/**
2. Click "Jetzt starten" / "Get started"
3. **Skip "Smart Mode" → Switch to Expert Mode** (jos pe pagină) — important! Smart Mode te limitează.
4. Introduce business info:
   - Business name: `Perfekt Sauber Service`
   - Website: `https://perfektsauberservice.com`
5. Skip prima campanie sugerată ("Create campaign without goals")
6. **Apply bonus 400€:**
   - În GBP Manager dacă apare buton "Get €400 in ad credit" → Click
   - Sau caută "google ads spend 400 get 400 promo code germany" → introduce code la **Tools → Billing → Promotions**
   - Validity: 60-90 zile, trebuie să cheltui 400€ ca să primești 400€ credit
7. **Setup Billing:**
   - Tools → Billing → Settings
   - Adaugă card / SEPA
   - Pre-paid balance: încarcă 100-200€ pentru început (poți crește oricând)

**Verificare:** vezi în Account-ul tău Customer ID (format `123-456-7890`) — îl notezi.

### Pas 2: Verifică conversion tracking (CRITIC, 30 min)

Asta e linia roșie. **Dacă tracking-ul nu merge, NU activezi nicio campanie.**

1. **Verifică GA4 e activ** pe site:
   - Deschide `https://perfektsauberservice.com` în Chrome
   - F12 → Network tab → Filter "collect"
   - Ar trebui să vezi request-uri către `google-analytics.com/g/collect`
   - Click pe orice link tel:/wa.me/mailto: → ar trebui să vezi event `phone_click`/`whatsapp_click`/`email_click` în request

2. **Importă GA4 conversions în Google Ads:**
   - În Google Ads: Tools → **Conversions** → "+ New conversion action"
   - Source: **"Import"** → "Google Analytics 4 properties"
   - Conectează GA4 property (`G-BMC32KSYKF`)
   - Selectează evenimentele: `phone_click`, `whatsapp_click`, `email_click`, `form_submit_kontakt` (dacă există), `preisrechner_complete`
   - Click "Import and continue"

3. **Setează valori per conversion** (per `conversion-tracking.md`):
   - phone_click: 60€ (PRIMARY)
   - whatsapp_click: 25€ (PRIMARY)
   - form_submit_kontakt: 80€ (PRIMARY)
   - preisrechner_complete: 45€ (Secondary)

4. **Test final:** click pe propriul tău tel link pe site (din contul Google Ads logat). În 1-3 ore ar trebui să apară 1 conversion în Google Ads → Tools → Conversions.

**Dacă nu apare după 24h:** STOP. Sună-mă (figurativ — semnalează aici pe chat). Tracking nu merge → NU activăm nimic.

### Pas 3: Import cele 9 fișiere ca PAUSED (45 min)

1. **Descarcă Google Ads Editor** (desktop app gratis): https://ads.google.com/intl/de/home/tools/ads-editor/
2. Login cu același cont Google Ads
3. Get Recent Changes → Download
4. **Account → Import → From File:**
   - Importă **în această ordine** (ordinea contează):
     1. `agent/google-ads/01-campaigns.csv`
     2. `agent/google-ads/02-ad-groups.csv`
     3. `agent/google-ads/03-keywords.csv`
     4. `agent/google-ads/04-ads.csv`
5. **Verifică în Editor (CRITICAL):**
   - **Networks:** doar "Google search" — Search Partners + Display = ❌ OFF
   - **Locations:** "Presence" only (NU "Presence or interest")
   - **Schedule:** Mo-Fr 07:00-19:00 + Sa 09:00-13:00 (NU Duminica)
   - **Status:** toate `PAUSED` (NU `ENABLED`)
6. **Aplică Negative Keywords list la nivel cont:**
   - Tools → **Negative keyword lists** → "+" → New
   - Name: `PSS Master Negatives`
   - Paste tot conținutul din `negative-keywords.txt`
   - Apply to: All campaigns (after import)
7. **Device bid modifier (manual, NOT in CSV):**
   - Pentru fiecare Anzeigengruppe → Devices tab
   - **Mobile: +100% bid adjustment** (Flo Video #7561127370032188694)
   - Tablets: -30% (mai puține conversii pentru lokale services)
8. **Post Changes** (sus dreapta în Editor) → toate intră ca `PAUSED` în contul live

### Pas 4: Verificare Preview (10 min)

1. Tools → **Ad Preview and Diagnosis**
2. Search: `entrümpelung rastatt`
3. Location override: **Rastatt, Germany**
4. Device: Mobile
5. Verifică că ad-ul tău apare → click pe el → aterizezi pe pagina corectă

**Dacă ad-ul nu apare în Preview:** ceva e greșit cu schedule/location/keywords. Verificăm împreună.

### Pas 5: Stadtteile pages indexate (background, 7-14 zile)
- Submit sitemap în GSC ✓ (deja făcut)
- Request Indexing pe cele 7 Stadtteile (10/zi limit) — în 1-2 zile
- Așteaptă 7-14 zile ca Google să crawl-eze și să indexeze
- **Doar după indexare** → activăm campania Entrümpelung

---

## Faza B — Săptămâna 2 (LIVE, conservativ)

### Pas 6: Activare Campania 1 (DOAR Entrümpelung)

**Condiții:**
- ✅ Conversion tracking testat (cel puțin 1 test conversion înregistrată)
- ✅ Stadtteile + city pages indexate
- ✅ Bonus 400€ activ în account

**Acțiune:**
1. **Buget redus 7€/zi** (≈ 200€/lună) prima săptămână — jumătate de Faza 1.
2. Manual CPC max bid: **1.20€** (mai conservativ decât 1.50€).
3. Status: `[Search] Entrümpelung — Rastatt-Region` → **ENABLED**.
4. Restul campaniilor → rămân PAUSED.

### Pas 7: Monitorizare zilnică primele 3 zile (15 min/zi)

Verifici în Google Ads → Overview:
- Sunt impresii? (Trebuie 50+/zi pentru a învăța)
- Click-uri vin? (3-10 click-uri/zi e normal la 7€/zi)
- CPC mediu? (Target: < 1.20€)
- Search Terms Report → vezi cuvinte reale pe care apare ad-ul → adaugă negatives

### Pas 8: Adjust după 7 zile

Date după 7 zile (~50€ cheltuiți):
- **Dacă CPL < 50€:** ✅ Mărește buget la 13€/zi (Faza 1 completă).
- **Dacă CPL 50-80€:** 🟡 Verifică ad copy + negative keywords. Mai aștepți 7 zile.
- **Dacă CPL > 80€ sau 0 conversions:** 🔴 STOP. Pause. Investigăm tracking + landing page.

---

## Faza C — Săptămâna 3-5 (scale)

### Pas 9: Activează HHA + Reinigung

**Săpt 3:**
- Dacă Entrümpelung merge OK → activează `[Search] Haushaltsauflösung — Region`

**Săpt 5+:**
- După ce ai 30+ conversions cumulate → switch bidding pe **"Maximize Conversions"** (Smart Bidding)
- Activează Faza 1.5: `[Search] Endreinigung` + `[Search] Büroreinigung B2B`

### Pas 10: Optimization weekly checklist

Săptămânal (30 min, vinerea):
1. Search Terms Report → adaugă 5-10 negatives noi
2. Verifică Quality Score per keyword → re-scrie ad-uri unde e <7/10
3. Performance Max suggestions: ignore (sunt traps de upsell)
4. Bid adjustments: doar dacă date solide după 14+ zile

---

## Numere realiste pe care să le aștepți

Per memory + Flo's case studies:

| Săptămână | Buget cumulat | Leads | CPL realistic | Status |
|---|---|---|---|---|
| 1 | 0€ (setup) | 0 | - | Paused |
| 2 | ~50€ | 1-2 | 25-50€ | Învățare |
| 3-4 | ~150€ | 4-8 | 20-40€ | Optimizare |
| 5-8 | ~400€/lună | 12-20/lună | 20-30€ | Stabil |

**Cost/booking realist la stabil: 25-40€** (presupunând 35-45% close rate de la lead la booking).

La un ticket mediu Entrümpelung de **1.500€** și un profit per job de ~600€:
- Cost achiziție client: 75€
- Profit per client: 525€
- **ROI ~7-8x** în Faza stabilă

---

## Decision tree când merg lucrurile

### "Primesc 0 leads după 7 zile":
- Verifică Search Terms Report → ai impresii pe keywords incorecte? → adaugă negatives
- Verifică Conversion tracking → înregistrează la rândul lui? → 80% din cazuri AICI e problema
- Verifică landing page → bounce rate ridicat? → revizitează hero section

### "CPL prea mare (>50€)":
- Negative keywords insuficiente → adaugă mai multe Konkurrenz Klarnamen
- Match types prea broad → restrânge la `[exact]` only
- Geo target prea mare → restrânge la Rastatt + 10km

### "Buget se cheltuie în 2h, apoi 0":
- Match types prea largi → restrânge
- Sau: piață saturată în zona ta → conform Flo, trebuie buget mai mic per zi cu durată mai mare

### "Apare în German Maps dar nu în Search":
- GBP categorii nu sunt setate corect → verifică
- Sitemap nu e re-indexat → resubmit GSC

---

## Cine ce face

### Eu (Claude)
- Update fișiere când ai feedback
- Audit weekly performance dacă-mi trimiți screenshots
- Generate ad copy variants când ai nevoie de A/B test
- Help cu Search Terms Report analysis

### Tu (Laura)
- Faza A: 2-3 ore (cont, billing, import, tracking verify)
- Faza B-C: 30 min/zi primele 7 zile, apoi 30 min/săpt
- Trimiți screenshots săptămânal pentru audit

---

## Scenarii de eșec (ce facem dacă)

### "Bonus 400€ nu se aplică"
- Ai cont vechi (deja folosit)? → bonus pentru NEW advertisers only
- Code expirat? → caută alte coduri active
- Worst case: continui fără bonus, ROI tot pozitiv pe termen mediu

### "Card refuzat la billing"
- Verifică limita zilnică → setează 50€/zi minim
- Try alt card (credit > debit pentru Google)
- SEPA direct debit ca alternativă

### "Săpt 4 — CPL încă > 50€"
- Probabil ad copy sau landing page
- Plan: re-scriu ads, fac A/B test
- Target landing → fixăm hero section per Flo's model 5-piece

---

## Status fișiere (commit ee20d5f36 + d995ebb0 + 5b9c270d)

✅ `01-campaigns.csv` — 4 campanii, schedule fix (no Sunday)
✅ `02-ad-groups.csv` — 5 ad groups
✅ `03-keywords.csv` — ~80 keywords
✅ `04-ads.csv` — 5 RSAs cu pin-uri
✅ `negative-keywords.txt` — 188 → 230+ negatives (cu Konkurrenz + price-comparison)
✅ `conversion-tracking.md` — setup detaliat
✅ `kpi-tracking-sheet.md` — template săptămânal
✅ `landing-pages-audit.md` — fix list (P0 GA4 deja făcut)
✅ `README.md` — overview
✅ `ACTIVARE-AZI.md` — acest doc

---

**Ready to launch.** Pas 1 (cont Google Ads) când ai ~2 ore liber.
