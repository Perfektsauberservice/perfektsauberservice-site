# Google Ads — Perfekt Sauber Service

## Plan integrat Faza 1 + Faza 1.5

| Fază | Servicii | Buget zilnic | Buget lunar | Start |
|---|---|---|---|---|
| **Faza 1** | Entrümpelung + Haushaltsauflösung | 13 € | ~400 € | Săpt 1 (paginile sunt deja live) |
| **Faza 1.5** | Endreinigung + Büroreinigung B2B | 8 € | ~250 € | Săpt 4-5 (după ce pagini noi sunt indexate) |
| **Total stabil** | Toate de mai sus | 21 € | **~650 €/lună** | Săpt 5+ |

**Faza 1** lansează imediat — paginile de Entrümpelung/Haushaltsauflösung sunt solide (schema markup, FAQ, CTA-uri, trust strip, Standort vor Ort).

**Faza 1.5** este pe pause până când:
1. ✅ Cele 6 pagini Reinigung sunt construite (folder `/` — endreinigung-rastatt, endreinigung-baden-baden, endreinigung-karlsruhe, bueroreinigung-rastatt, bueroreinigung-baden-baden, unterhaltsreinigung-region)
2. ✅ Submit la sitemap.xml + Google Search Console
3. ✅ Index confirmat în GSC (7-14 zile)
4. ✅ GA4 + click handler verificat pe paginile noi

Apoi schimbi status din `Paused` → `Enabled` pe campaniile Phase 1.5 și pornesc.

---

## Structură fișiere

| Fișier | Ce conține |
|---|---|
| `01-campaigns.csv` | 2 campanii: Entrümpelung + Haushaltsauflösung. Buget, geo, bidding, schedule. |
| `02-ad-groups.csv` | 5 ad groups (Rastatt, Baden-Baden, Karlsruhe, Region, HHA). |
| `03-keywords.csv` | ~80 keywords cu match types corecți (70 % Exact, 25 % Phrase, 5 % Broad). |
| `04-ads.csv` | 5 RSA-uri (15 headlines + 4 descriptions fiecare), pin-uri specificate. |
| `negative-keywords.txt` | ~140 negatives organizate pe 6 categorii (jobs, DIY, ankauf, container, etc.). |
| `conversion-tracking.md` | Setup pas-cu-pas: GA4 pe toate paginile + 4 conversion events (call, form, WhatsApp, Preisrechner). |
| `kpi-tracking-sheet.md` | Template săptămânal de optimizat. KPI-uri target. Decision tree. |
| `landing-pages-audit.md` | Audit pe top 4 landing pages + lista de fix-uri P0/P1/P2 (cu GA4 missing ca P0). |

---

## Cum să imporți în Google Ads Editor

1. Deschide Google Ads Editor → contul tău → "Account" → "Import" → "From file"
2. Importă `01-campaigns.csv` PRIMUL (trebuie să existe campaniile înainte de ad groups)
3. Apoi `02-ad-groups.csv`, `03-keywords.csv`, `04-ads.csv` în ordinea asta
4. Înainte de "Post" → revizuiește în Editor:
   - Verifică geo-targeting-ul (radius, NU "people interested in")
   - Verifică Display Network = OFF, Search Partners = OFF
   - Aplică `negative-keywords.txt` ca **lista la nivel de cont** (Tools → Negative keyword lists → Apply to all campaigns)
5. **NU da Post până NU verifici că ai conversion tracking activ** (vezi `conversion-tracking.md` — fără asta, Smart Bidding nu va funcționa și vei arunca buget).

---

## Ordinea recomandată de lansare

**Săptămâna 1 (înainte de orice click plătit):**
1. Citește `landing-pages-audit.md` → fixează P0-urile (GA4 lipsă pe city pages e blocant)
2. Setup conversion tracking complet (`conversion-tracking.md`)
3. Importă blueprint în Google Ads Editor (status = PAUSED)
4. Verifică în Preview Tool că ad-urile apar corect în Rastatt (incognito mode, location override)

**Săptămâna 2 (lansare):**
5. Setează status = ENABLED pe campania 1 (Entrümpelung) — păstrează HHA pe pause încă 1 săpt
6. Bidding: "Manual CPC" cu cap 1,50 € — primele 14 zile, ca să strângi date curate
7. Monitorizezi zilnic primele 3 zile, apoi de 2x/săpt

**Săptămâna 3-4 (optimizare):**
8. Pornești campania 2 (Haushaltsauflösung)
9. Search Terms Report săptămânal → adaugi negatives noi
10. Verifici Quality Score per keyword → optimizezi RSA dacă < 7/10

**Săptămâna 5-8 (smart bidding):**
11. Switch bidding pe "Maximize Conversions" sau "Target CPA 25 €" (după ce ai 30+ conversii cumulate)
12. La 8 săptămâni → review complet → decizie scalare la Faza 2 (~900 €/lună)

---

## Numere realiste pe care să le aștepți

| Săptămână | Buget cumulat | Leads estimate | Cost/lead |
|---|---|---|---|
| 1-2 | ~180 € | 5-10 | 18-30 € (învățare) |
| 3-4 | ~360 € | 15-25 | 12-20 € |
| 5-8 | ~720 € | 40-60 | 10-15 € (stabil) |

**Cost/booking realist la stabil: 25-40 €** (presupunând 35-45 % close rate de la lead la booking).

La un ticket mediu Entrümpelung de **1.500 €** și un profit per job de ~600 €, ROI-ul e **~15-20x** în Faza 1 stabilă. Asta NU e proiecție optimistă — e realist pentru un cont configurat corect, pe o nișă cu intenție mare. Dacă cifrele vin sub asta în săpt 5-6, ceva e rupt (probabil tracking sau negative keywords).
