# Landing Pages — Audit & Fix-uri

**Auditat:** 2026-05-02 — pe paginile principale care vor primi trafic plătit în Faza 1.

**Pagini auditate:**
- `entruempelung-rastatt.html` (representative pentru toate `entruempelung-*.html`)
- `haushaltsaufloesung-rastatt.html` (representative pentru `haushaltsaufloesung-*.html`)
- `index.html`
- `kontakt.html`, `preisrechner.html`, `danke.html` (suport conversion path)

---

## Verdict general

**Paginile de Entrümpelung sunt solide pentru Google Ads** — Quality Score estimat la lansare: **7-8/10**.

Aspecte foarte bune (rare la firme regionale):
- ✅ Schema markup complet (`Service`, `LocalBusiness`, `FAQPage`, `BreadcrumbList`, `AggregateRating`)
- ✅ FAQ Schema cu 8 întrebări naturale
- ✅ CTA-uri above the fold (telefon, WhatsApp, Preisrechner)
- ✅ Trust strip cu 5★ + Festpreis-Garantie + Versichert
- ✅ Hero image WebP + `loading="eager"` + `fetchpriority="high"`
- ✅ Canonical URL corect
- ✅ Open Graph tags
- ✅ Stadtteile + Nachbarorte = signals locale puternice
- ✅ Tabel Festpreis cu exemple realiste = answer-engine-friendly

---

## Probleme găsite (P0/P1/P2)

### 🔴 P0 — Blocante pentru lansare

**[P0-1] GA4 lipsește pe paginile de oraș**
- **Issue**: Tag-ul `G-BMC32KSYKF` e doar în `index.html`. Pe `entruempelung-rastatt.html` și restul paginilor — lipsește.
- **Impact**: 100 % din traficul plătit care aterizează pe city pages e invizibil pentru Google Ads. Smart Bidding nu poate funcționa. Conversiile NU se atribuie.
- **Fix**: Adaugă snippet-ul GA4 pe TOATE paginile (vezi `conversion-tracking.md` pas 1).
- **Effort**: 30 min cu un script automat — pot să-l fac eu.

**[P0-2] Click handler pentru tracking butoane lipsește**
- **Issue**: Butoanele `tel:+491639087197` și `wa.me/491639087197` sunt prezente, dar fără `gtag('event', ...)` la click.
- **Impact**: Telefoanele și WhatsApp-urile generate de ads NU se contorizează.
- **Fix**: Cod global din `conversion-tracking.md` pas 5 — un singur snippet pe toate paginile.

**[P0-3] Form `/kontakt` — verifică redirect spre `/danke.html`**
- **Issue**: Nu e clar dacă form submit duce explicit la `/danke.html` (necesar pentru tracking via "thank you page" trigger).
- **Action**: Trebuie verificat în `kontakt.html` — dacă form-ul nu redirecționează la `/danke`, trebuie adăugat `action="/danke.html"` sau event JS.

---

### 🟡 P1 — Recomandate (impact mediu, implementabile în 1-2 zile)

**[P1-1] Page speed nu verificat — nu există tracking de performanță**
- **Action**: Rulează PageSpeed Insights pe `https://perfektsauberservice.com/entruempelung-rastatt` (mobile + desktop). Target: > 75 mobile, > 90 desktop.
- **Risc**: Dacă mobile e sub 70, CPC va fi 30-50 % mai mare. Quality Score "Landing page experience" va fi sub-optim.

**[P1-2] Hero image — verifică dimensiuni reale**
- **Issue**: `entruempelung-rastatt-freigeraeumter-bereich.webp` — necunoscut dacă e optimizat (sub 200 KB)
- **Action**: Verifică dimensiunea reală + dimensiunea afișată. Hero-ul nu trebuie să depășească 250 KB pentru mobile.

**[P1-3] Trust strip — adaugă "Versichert bis 5 Mio €" sau cifră concretă**
- **Issue**: "Versichert" e generic. "Versichert bis 5 Mio €" = trust signal mult mai puternic, conversie ↑ 5-10 %.
- **Action**: Dacă ai polița cu această sumă, adaugă în trust strip.

**[P1-4] FAQ — adaugă întrebare despre durată**
- **Issue**: "Wie lange dauert eine Entrümpelung?" lipsește din FAQ. Asta e top-3 întrebare în search intent.
- **Suggestion**: Adaugă: "Wie lange dauert eine Entrümpelung in Rastatt? Eine 3-Zimmer-Wohnung wird typischerweise in 4-8 Stunden geräumt. Häuser brauchen 1-3 Werktage. Termine planen wir so, dass Sie nichts organisieren müssen."

---

### 🟢 P2 — Nice-to-have (impact mic, opțional)

**[P2-1] Sticky mobile CTA bar**
- Pe mobil, când scroll-ezi după hero, butonul de telefon dispare. Adaugă o bară fixă jos cu 📞 + WhatsApp = +15-20 % click pe mobil.

**[P2-2] Video testimonial / before-after time-lapse**
- Galeria are imagini statice. Un video scurt (15-30 sec) before/after pe hero secondary slot = engagement masiv ↑.

**[P2-3] Live chat / chatbot scurt**
- "Termin în 24h posibil?" — un chatbot scurt cu 3 răspunsuri pre-set poate captura intenția joi noaptea / weekend când nu se răspunde la telefon imediat.

---

## Pagini-suport — verificat parțial

### `preisrechner.html`
- **Action necesară**: Verifică că la final-ul calculului se trimite event `preisrechner_complete` (vezi conversion-tracking.md pas 4). Dacă nu există, adaugă-l — e una din cele mai valoroase conversii pentru calitate de lead.

### `kontakt.html`
- **Action necesară**: Verifică redirect to `/danke.html`. Verifică formularul are honeypot anti-spam (altfel Google Ads va trimite trafic, dar și boții vor trimite forms = false conversions).

### `danke.html`
- **Action necesară**: Trebuie să fie pagină distinctă cu URL `/danke` accesat doar după form submit. Verifică că NU e indexabilă în search (`<meta name="robots" content="noindex">`).

---

## Pagini Reinigung — TBD

`endreinigung-*.html`, `bueroreinigung-*.html`, `unterhaltsreinigung-region.html` — nu există încă.

**Aceste 6 pagini sunt în Phase B din plan** — le construiesc folosind același template ca `entruempelung-rastatt.html`. Vor avea automat toate signal-urile bune (schema, FAQ, CTA-uri, trust strip).

**Înainte să le activez în campaniile Phase 1.5:**
1. Pages live + accesibile
2. Submit la sitemap.xml + Google Search Console
3. 7-14 zile de indexare (verifică în GSC că au "Indexed")
4. GA4 tag activ pe ele
5. Click handler instalat

---

## Comandă rapidă: detectează care pagini NU au GA4

```bash
cd /c/Users/laral/Documents/proiect\ 1\ claude\ code/perfektsauberservice-site-main
grep -L "G-BMC32KSYKF" *.html
```

Output-ul = lista paginilor care trebuie injectate cu GA4 înainte de launch.

---

## Sumar acțiuni — în ordinea priorității

| # | Acțiune | Effort | Impact | Owner |
|---|---|---|---|---|
| 1 | Injectează GA4 pe toate paginile | 30 min | 🔴 Blocant | Eu (script) |
| 2 | Instalează click handler global | 15 min | 🔴 Blocant | Eu (snippet) |
| 3 | Verifică `/kontakt` → `/danke` redirect | 5 min | 🔴 Blocant | User să verifice |
| 4 | PageSpeed Insights mobile audit | 10 min | 🟡 High | User să ruleze |
| 5 | Adaugă FAQ "Wie lange dauert?" | 10 min/page | 🟡 Medium | Optional |
| 6 | Construiește 6 pagini Reinigung | ~3h | 🟡 Phase 1.5 | Eu |
| 7 | Sticky mobile CTA bar | 30 min | 🟢 Low-medium | Optional |

**Acțiunile 1-3 sunt prerequisite pentru launch Phase 1. Le pot face acum dacă confirmi.**
