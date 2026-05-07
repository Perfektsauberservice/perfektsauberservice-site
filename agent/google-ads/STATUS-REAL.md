# Status REAL Google Ads — 2026-05-07 (SNAPSHOT ISTORIC)

> ⚠️ **ARHIVAT 2026-05-08.** Acest fișier e snapshot din 2026-05-07. Pentru starea curentă citește **`STATE.md`** (sursa de adevăr nouă).
> Păstrat ca istoric — documentează decizia Plan B din 7 mai (de ce am divergat de planul original Flo).

---

## Decizie: Plan B — aliniere cu realitatea

Pe 7 mai 2026, după 2 zile de cifre din primul soft-launch, am derogat de la planul original Flo (1 campanie Entrümpelung @ €13/zi) în favoarea unui setup cu 2 campanii @ €17/zi total. Motivele:

1. **Reinigung_Search a aterizat accidental ca enabled și performează cel mai bine** — CTR 19% în primele 2 zile (media search = 3-5%). Decizia să NU o omor pentru disciplină.
2. **Bugetul Entrümpelung de €20/zi era supradimensionat** — utilizare reală 7% (€2.74 cheltuit din €40 disponibili în 2 zile). Coborât la €10/zi.
3. **PMax @ €0.54/zi era zgomot** — sub minimul de learning phase (~€30/zi). Eliminat complet.

## Ce e LIVE acum (2026-05-07)

### Campanii active

| Campanie | Buget/zi | Status | Note |
|---|---|---|---|
| **PSS_Reinigung_Search** | €7 | Enabled | 3 ad groups (AG1 Bueroreinigung, AG2 Endreinigung, AG3 Grundreinigung). CTR 19-20% pe AG3. |
| **PSS_Entrumpelung_Search** | €10 | Enabled | 4 ad groups (AG1 Core, AG2 Wohnungsaufloesung, AG3 Haushalts_Nachlass, AG4 Gewerbe_Akut). CTR 3% pe Core. |
| ~~Entrümpelung Rastatt PMax~~ | ~~€0.54~~ | **REMOVED** | Era waste, sub minimul de learning. |

**Total buget zilnic: €17 (~€510/lună).**

### Settings cont

- **Negative keywords list:** `PSS Master Negatives` (178 termeni) aplicată la nivel de cont, ambele campanii.
- **GA4 ↔ Google Ads linking:** activ. Property `G-BMC32KSYKF` (id 531103504).
- **Bidding:** Manual CPC pe ambele Search. Bid caps între €1.20-1.80 per ad group.
- **Schedule:** Mo-Fr 07-19, Sa 09-13, no Sunday (din original plan, păstrat).

### Conversion tracking

- **GA4 events implementate** pe toate 67 pagini de campanie + index: `phone_click`, `whatsapp_click`, `email_click` (handler JS pe `tel:` / `wa.me` / `mailto:`).
- **Key events GA4:** `phone_click`, `whatsapp_click`, `email_click` — toate 3 marcate (steluță plină).
- **Google Ads conversion actions:** **NU sunt încă create.** Wizard în Google Ads cere events GA4, sync-ul GA4→Ads durează ~24h. **De reluat 2026-05-08** după sync.
- Există DEJA un „Phone call lead" auto-detected (Active, 2 of 2 campaigns) — separate de `phone_click` event, e pentru Call Extensions.

### Landing pages Reinigung

5 pagini city Reinigung aveau hero `echipa-800.webp` (poză cu echipa) — kill conversion rate pentru ad-uri „Endreinigung/Bueroreinigung". **Înlocuite 2026-05-07** cu poze specifice cleaning de la Pexels (commit `051f7025`):

- `endreinigung-{rastatt,baden-baden,karlsruhe}.html` → `cleaning-endreinigung-800.webp`
- `bueroreinigung-rastatt.html` → `cleaning-bueroreinigung-800.webp`
- `unterhaltsreinigung-region.html` → `cleaning-unterhaltsreinigung-800.webp`

## Ce e LĂSAT din planul original Flo

Aceste părți din planul Flo SUNT încă valabile și nu au fost atinse:
- ✅ Manual CPC primele 14 zile (până avem 30+ conversions cumulate)
- ✅ Schedule Mo-Sa, no Sunday
- ✅ Geo targeting Presence only (NU "Presence or interest")
- ✅ Negative keywords master list
- ✅ Mobile +100% bid adjustment
- ✅ Search Partners + Display = OFF

## Ce mai trebuie făcut

### Mâine (2026-05-08)
- [ ] Reia Google Ads conversion wizard → import GA4 events ca conversion actions
- [ ] Setează values: phone_click=60€ Primary, whatsapp_click=25€ Primary, email_click=15€ Secondary
- [ ] Verifică Search Terms Report la PSS_Entrumpelung_Search → identifică queries inutile

### Săpt 1 (08-14 mai)
- [ ] Monitor Conversions data în Google Ads (apare cu 24h delay)
- [ ] Search Terms Report săptămânal → adaugă negatives noi în lista master
- [ ] Dacă AG3_Haushalts_Nachlass + AG4_Gewerbe_Akut rămân la 0% CTR → pause-le, mută bugetul pe AG-urile care performează

### Săpt 2-4 (15 mai - 4 iunie)
- [ ] Date pentru CPL real per ad group
- [ ] Decizie scalare: dacă CPL < €30 → urcă bugete cu 50%
- [ ] Dacă Reinigung continuă cu CTR > 15% → adaugă încă 2 ad groups (Endreinigung Karlsruhe + Bauendreinigung)
- [ ] Switch bidding pe Maximize Conversions (după 30+ conversions cumulate)

### Backlog
- [ ] Designul React „premium" din `Downloads/reinigung/` → port la static HTML pentru Lighthouse + SEO
- [ ] Update CSV-uri (`01-campaigns.csv`, `02-ad-groups.csv`) ca să reflecte Reinigung_Search activ în Faza 1 (acum e marcat „Phase 1.5")

## Lecții învățate

1. **Bugetul nu e o intenție, e plafonul real.** €20/zi alocat dar 7% utilizat = bugetul de €10/zi e mai onest.
2. **CTR 19% nu se ignoră** — chiar dacă nu era în plan, e semnal că ad copy + landing aliniate.
3. **Tracking blocant** — toate optimizările sunt teorie fără conversion data. 2 zile fără tracking = 2 zile cu €11+ orbește.
4. **PMax sub €30/zi e ban aruncat** — algoritmul nu poate învăța sub minimum.

## Comit-uri relevante

- `03de0a85` — fix Aufzug→Lift pe 5 BB district pages + Gaggenau meta description
- `051f7025` — fix Reinigung hero photos (5 pagini, Pexels source)

---

**Ultimul update:** 2026-05-07 ~01:30 EEST
**Următoarea revizuire:** 2026-05-08 după sync GA4 → Google Ads
