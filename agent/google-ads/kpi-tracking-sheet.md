# KPI Tracking — Weekly Optimization Sheet

> Update săptămânal (de preferat luni dimineața). Decizie de optimizare la final.

---

## Săptămâna ____ (data: ___________)

### Account-level

| Metric | Săpt curentă | Săpt anterioară | Δ % | Target | Status |
|---|---|---|---|---|---|
| Impressii | _____ | _____ | _____ | n/a | – |
| Clicks | _____ | _____ | _____ | n/a | – |
| Spend total | _____ € | _____ € | _____ | ≤ 91 €/săpt (Faza 1) | 🟢🟡🔴 |
| CTR mediu | _____ % | _____ % | _____ | ≥ 6 % | 🟢🟡🔴 |
| CPC mediu | _____ € | _____ € | _____ | ≤ 1,40 € | 🟢🟡🔴 |
| **Conversii (lead-uri)** | _____ | _____ | _____ | săpt 1: 3+ / săpt 4: 8+ | 🟢🟡🔴 |
| **Cost / lead** | _____ € | _____ € | _____ | ≤ 18 € (stabil) | 🟢🟡🔴 |
| Bookings (manual count) | _____ | _____ | _____ | leads × 35 % close | – |
| **Cost / booking** | _____ € | _____ € | _____ | **≤ 40 €** | 🟢🟡🔴 |
| Revenue est. (bookings × 1.500 €) | _____ € | _____ € | _____ | ROI > 5x | 🟢🟡🔴 |

### Per-Ad-Group (campania Entrümpelung)

| Ad Group | Clicks | CTR | CPC | Conv | Cost/Conv | QS mediu | Decizie |
|---|---|---|---|---|---|---|---|
| AG1 Rastatt | __ | __% | __€ | __ | __€ | __/10 | scale / hold / pause |
| AG2 Baden-Baden | __ | __% | __€ | __ | __€ | __/10 | scale / hold / pause |
| AG3 Karlsruhe | __ | __% | __€ | __ | __€ | __/10 | scale / hold / pause |
| AG4 Region | __ | __% | __€ | __ | __€ | __/10 | scale / hold / pause |
| AG5 Haushaltsauflösung | __ | __% | __€ | __ | __€ | __/10 | scale / hold / pause |

---

## KPI Targets — Benchmark Realist

### Săptămâna 1-2 (învățare)
| Metric | Target |
|---|---|
| CTR | 4-7 % (e ok să fie mic — încă învățăm) |
| CPC | 1,20-1,80 € |
| Cost/lead | 18-30 € |
| Cost/booking | 50-90 € |
| Quality Score | 5-7/10 (urcă cu timpul) |

### Săptămâna 3-4 (ajustare)
| Metric | Target |
|---|---|
| CTR | 6-10 % |
| CPC | 1,00-1,40 € |
| Cost/lead | 12-20 € |
| Cost/booking | 35-55 € |
| Quality Score | 7-8/10 |

### Săptămâna 5-8 (stabil)
| Metric | Target |
|---|---|
| CTR | 8-14 % |
| CPC | 0,80-1,20 € |
| Cost/lead | **8-15 €** |
| Cost/booking | **20-40 €** |
| Quality Score | 8-9/10 |

### Excellent (luna 3+)
| Metric | "Killer" benchmark |
|---|---|
| CTR | > 14 % |
| CPC | < 0,80 € |
| Cost/lead | < 8 € |
| Cost/booking | < 20 € |

---

## Decision Tree — Ce fac la finalul săptămânii?

```
Cost/booking < 30 €?
├── DA → Crește buget cu 20-30 % la AG-urile cu cost/conv mic. Pornește următoarea fază.
└── NU
    │
    ├── Cost/booking 30-60 € → Optimizare obișnuită:
    │   • Adaugă negatives din Search Terms Report (top 10 termeni irelevanți)
    │   • Verifică Quality Score per keyword — sub 5/10 = pause sau rewrite RSA
    │   • A/B test RSA — schimbă 3 headlines slabe (sub 50 % impressions)
    │   • Verifică landing page speed (PageSpeed Insights mobile < 75 = problemă)
    │
    └── Cost/booking > 60 € → ALARMĂ:
        • Verifică Conversion Tracking funcționează (GA4 DebugView)
        • Verifică geo-targeting (incognito mode + location override)
        • Verifică că NU e Display Network on / Search Partners on
        • Pause AG-urile cu cost/conv > 80 € pentru o săptămână
        • Reduce buget la 50 % până se stabilizează — NU închide complet
        • Schimbă bidding strategy: Manual → Maximize Clicks (dacă nu ai 30+ conv) sau Maximize Conversions (dacă ai)
```

---

## Search Terms Report — săptămânal

**Workflow (15 min/săptămână):**
1. Google Ads → Keywords → Search Terms (filter: last 7 days)
2. Sortare după Cost descrescător
3. Pentru fiecare termen care a costat > 3 € și nu a generat conversie:
   - Dacă e relevant pentru alt AG → mută acolo cu match Exact
   - Dacă e job-search/DIY/wrong intent → adaugă ca negative la nivel cont
   - Dacă e variantă fonetică/typo a unui keyword existent → adaugă ca exact match
4. Lista de negatives noi → adaugă în `negative-keywords.txt` și sincronizează în cont

**Estimat impact**: 10-20 % reducere cost/click după prima lună de optimizare.

---

## Săptămânal — Ce NU să faci

❌ Schimbi bidding strategy mai des de 1x/2 săptămâni — Smart Bidding are nevoie să "învețe"  
❌ Schimbi mai mult de 20 % din buget într-o săptămână — destabilizează algoritm  
❌ Pause-zi AG-uri după 3 zile fără conversii — varianță statistică normală  
❌ Te uiți doar la CTR — un AG cu CTR 15 % și 0 conversii = bani pierduți  
❌ Adaugi keywords aleatoare "pentru volume" — Quality Score scade pe ad group

---

## Lunar — Review profund (săpt 4, 8, 12)

- [ ] Pull data din GA4 + Google Ads → verifică concordanță (>15 % diferență = problemă tracking)
- [ ] Calculează LTV pe leads convertiți (chemi clienții, întrebi cum au găsit, validezi atribuirea)
- [ ] Compară cost/booking cu profit/booking — rentabilitate reală
- [ ] Decizie de scalare: cresc buget Faza 1 sau pornesc Faza 2 / Faza 1.5
- [ ] Update `kpi-tracking-sheet.md` cu observații pentru luna următoare
