# 📝 Google Reviews Push — Template-uri & Workflow

**Scop:** Push 4 → 12+ recenzii Google în 30 zile, 25+ în 90 zile. **Update 2026-08-14:** la 10 recenzii (5,0★) — progres real dar mai lent decât proiectat, țintă revizuită 20+ în 90 zile de la această dată.
**De ce:** Pentru un local biz în 2026, reviews Google sunt **direct factor de ranking**. 1 review nou ≈ 5 directoare ca impact SEO local. Plus credibility, plus CTR în SERP.

---

## 🔧 SETUP (one-time, 5 min) — Fă-l ÎNAINTE de orice template

### Pasul 1: Obține Google review short URL

1. Deschide [Google Business Profile dashboard](https://business.google.com/dashboard)
2. Selectează **Perfekt Sauber Service**
3. Caută secțiunea **"Get more reviews"** sau **"Mehr Bewertungen erhalten"**
4. Copiază link-ul de forma: `https://g.page/r/CXXXXXX/review` (sau `https://maps.app.goo.gl/...`)
5. **Lipește-l aici jos pentru referință permanentă:**

```
GOOGLE REVIEW SHORT URL: https://g.page/r/CYyWrOw6BeWQEBM/review
```

> ⚠️ Acest URL apare doar în GMB dashboard. Eu nu îl pot fetch automat (memorie 2026-05-08: SAB invisible în Places API). Trebuie să-l obții manual o dată, apoi îl folosim peste tot.

### Pasul 2: Generează QR code pentru factură

Link direct, gata de deschis în browser și salvat ca PNG:

```
https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Fg.page%2Fr%2FCYyWrOw6BeWQEBM%2Freview
```

Salvează imaginea PNG. Imprimă pe **fiecare** Rechnung + handover sheet, dimensiune ~3×3cm, jos pe pagină cu textul: *"Bewertung in 60 Sekunden →"*

---

## ⏱️ TIMING — când trimiți (foarte important)

| Tip job | Best timing | De ce |
|---|---|---|
| **Haushaltsauflösung Trauerfall** | 5-7 zile post-job | Prea repede = nesimțit (familia e în doliu). Așteaptă să se așeze. |
| **Entrümpelung standard** (mutare, Erbschaft non-deces) | 24-48h post-job | Cât e proaspăt în minte, dar nu chiar a doua zi. |
| **Reinigung / Übergabe** | 24h post-job | Dacă a fost Übergabe-Reinigung pentru Mietkaution → așteaptă cu 1 zi după ce a primit kaution înapoi (timing perfect, mood pozitiv). |
| **Gewerberäumung** | 48-72h post-job | Business client → mai puțin emoțional. |

**Day 7 follow-up:** Dacă în 7 zile n-a lăsat review, trimite mesaj 2 (mai jos). NU trimite a 3-a oară. 2 toucher max.

---

## 💬 TEMPLATE 1 — WhatsApp / SMS — Trauerfall (sensitiv)

> Pentru Haushaltsauflösung după deces. Trimite ziua 5-7. Tonul empatic, nicio presiune.

```
Liebe Frau [Nachname],

ich hoffe, es geht Ihnen den Umständen entsprechend gut.
Wir wollten uns nochmal melden — die Wohnung ist nun übergeben,
und wir hoffen, Sie haben einen Schritt weniger zu tragen.

Wenn Sie irgendwann ein paar Minuten finden und unser Service
Sie überzeugt hat, würde uns eine kurze Google-Bewertung sehr
helfen. Andere Familien in einer ähnlichen Situation finden
uns dadurch leichter.

Direkt-Link: https://g.page/r/CYyWrOw6BeWQEBM/review

Ohne Druck — wenn die Zeit gerade nicht passt, ist das auch
völlig in Ordnung.

Herzlich,
Laura
Perfekt Sauber Service
```

**De ce funcționează:** *"den Umständen entsprechend"* = empatie reală. *"ohne Druck"* = explicit no-pressure. *"Andere Familien"* = altruism frame, nu tranzacțional. Semnătura cu prenume = trust.

---

## 💬 TEMPLATE 2 — WhatsApp / SMS — Standard (Reinigung, Übergabe, Entrümpelung non-deces)

> Trimite ziua 1-2 post-job. Tonul cald dar mai direct.

```
Hallo [Vorname],

vielen Dank, dass Sie uns gestern vertraut haben — wir hoffen,
mit der [Endreinigung / Übergabe / Räumung] passt alles und
der nächste Schritt läuft entspannt.

Wenn Sie mit unserer Arbeit zufrieden waren, würden wir uns
sehr über eine kurze Google-Bewertung freuen. Sie hilft
anderen, uns zu finden — und uns, weiter besser zu werden.

Direkt: https://g.page/r/CYyWrOw6BeWQEBM/review

Herzlichen Dank!
Laura · Perfekt Sauber Service
```

---

## 📧 TEMPLATE 3 — Email — Trauerfall

**Subject:** `Ein letztes Mal: Danke — und eine kleine Bitte`

```
Liebe Familie [Nachname],

vor ein paar Tagen haben wir die Wohnung in [Ort] für Sie
übergeben. Wir wissen, wie schwer solche Aufgaben in dieser
Zeit sind, und sind dankbar für das Vertrauen, das Sie uns
geschenkt haben.

Wir würden Sie um etwas Kleines bitten — wenn Sie mit unserer
Arbeit, unserer Kommunikation oder einfach mit der Atmosphäre
während des Termins zufrieden waren, würde uns eine kurze
Google-Bewertung sehr helfen.

Ihre wenige Zeilen helfen anderen Familien, die gerade vor
derselben Aufgabe stehen wie Sie damals — sie finden uns
dadurch leichter und wissen, dass sie es mit jemandem zu tun
haben, dem Diskretion und Sorgfalt wirklich wichtig sind.

→ https://g.page/r/CYyWrOw6BeWQEBM/review

Falls die Zeit gerade nicht passt: kein Problem. Sollten Sie
in Zukunft Fragen zu Erbschaftsthemen, Räumungen oder
Reinigungen haben, melden Sie sich jederzeit.

Mit den besten Wünschen,
Laura Craciun
Perfekt Sauber Service
+49 163 9087197 · kontakt@perfektsauberservice.com
```

---

## 📧 TEMPLATE 4 — Email — Standard

**Subject:** `Danke für Ihr Vertrauen — eine kurze Bitte`

```
Hallo [Vorname],

vor ein paar Tagen haben wir bei Ihnen [Endreinigung /
Übergabe / Entrümpelung] durchgeführt. Wir hoffen, alles
hat geklappt und Sie konnten Ihren nächsten Schritt
entspannt angehen.

Eine kurze Bitte: Wenn Sie zufrieden waren, würde uns eine
Google-Bewertung sehr helfen. Wir sind ein junger
Handwerksbetrieb in Loffenau und wachsen vor allem über
Mundpropaganda und Bewertungen.

Ein paar Sätze reichen schon, dauert keine 2 Minuten:
→ https://g.page/r/CYyWrOw6BeWQEBM/review

Falls Sie eine Frage haben, einen weiteren Termin brauchen
oder etwas nicht passt — melden Sie sich gerne direkt bei
mir, ich kümmere mich persönlich.

Herzlichen Dank!
Laura Craciun
Perfekt Sauber Service
+49 163 9087197 · kontakt@perfektsauberservice.com
```

---

## 🗣️ TEMPLATE 5 — In-person script (la predare cheile / handover)

> Verbal, în timp ce semnezi protokoll de predare. Nu insistent.

> *"Wenn alles zu Ihrer Zufriedenheit ist und Sie ein paar
> Minuten Zeit haben — eine Google-Bewertung würde uns
> riesig helfen. Wir hängen gerade stark von Empfehlungen ab,
> jede Bewertung ist für uns wie ein neuer Auftrag.
> Hier auf der Rechnung ist auch ein QR-Code, einmal scannen
> und Sie sind direkt auf der Bewertungsseite."*

**Variantă mai scurtă (post-Trauerfall, mai sensibilă):**

> *"Falls Sie irgendwann das Gefühl haben, dass wir Ihnen
> in dieser Zeit geholfen haben — auf der Rechnung ist ein
> QR-Code für eine Google-Bewertung. Ohne Druck, irgendwann."*

---

## 🔁 TEMPLATE 6 — Day 7 Follow-up (DOAR dacă n-a răspuns)

> Trimite o singură dată, 7 zile după primul mesaj. Apoi STOP — nu spam.

```
Hallo [Vorname],

falls meine Nachricht von letzter Woche untergegangen ist
— keine Sorge, das ist ganz normal nach so einem hektischen
Tag. Hier nochmal der Link, falls Sie eine Minute übrig haben:

https://g.page/r/CYyWrOw6BeWQEBM/review

Wenn nicht, alles gut. Wir freuen uns, wann immer Sie uns
wieder brauchen.

Laura · Perfekt Sauber Service
```

---

## 📊 Tracking sheet — copiezi în Google Sheets / Excel

| Datum Auftrag | Kunde (Vorname Nachname) | Job-Typ | Tel/Email | Datum Anfrage | Kanal | Status | Datum Review | Bemerkung |
|---|---|---|---|---|---|---|---|---|
| 2026-05-12 | Maria Schmidt | Haushaltsauflösung | WhatsApp +49... | 2026-05-19 | WA | sent | — | Trauerfall, sensitive |
| 2026-05-13 | Klaus Müller | Endreinigung | klaus@... | 2026-05-15 | Email | review left ✅ | 2026-05-16 | 5⭐ |
| ... | | | | | | | | |

**Status values:**
- `sent` — primul mesaj trimis
- `follow-up sent` — Day 7 mesaj 2 trimis
- `review left ✅` — completed, review apare pe Google
- `declined politely` — clientul a răspuns dar nu vrea
- `no response` — după 14 zile fără răspuns, închis

---

## 🎁 OPȚIONAL — Thank-you gift (test 60 zile)

**Test:** Pentru următorii 10 clienți, oferă **€10 voucher Reinigung** (next time) celor care lasă review cu poză.

**Pitch:**
> *"Als kleines Dankeschön: Wer eine Google-Bewertung mit
> Foto hinterlässt, bekommt einen 10€-Gutschein für eine
> Folge-Reinigung."*

**De ce funcționează:** Reviews cu poză = **rank mai mare în Google Local** (signal autenticitate). 10€ × 10 = €100 cost, dar +10 reviews cu poze = boost SEO substanțial. Worth it.

**⚠️ Caveat legal:** Conform Google ToS, **NU oferi gift pentru review pozitiv**. Oferă pentru *orice* review (pozitiv sau negativ). În practică toți tăi clienți satisfăcuți (5.0 rating) vor da pozitiv. Formularea trebuie să fie: *"für eine Bewertung — egal welche Sterne"*.

---

## 🚀 Workflow recomandat — 30 zile

### Săptămâna 1
- [ ] Setup (5 min): obține Google review URL + generează QR code
- [ ] Imprimă QR code pe template factură (1× modificare)
- [ ] Pregătește fișa de tracking în Sheets

### Săptămâna 1-4 — pentru fiecare job nou
- [ ] La predare cheile: rostește scriptul in-person (Template 5)
- [ ] +24-48h sau +5-7 zile (după tipul job): trimite Template 1, 2, 3 sau 4 (după caz)
- [ ] +7 zile dacă nu răspunde: trimite Template 6
- [ ] Update tracking sheet după fiecare touch

### Pentru clienții vechi (cei 6 fără review din cei ~10 totali)
- [ ] Trimite Template 2 sau 4 cu mesaj uter ușor adaptat: *"Wir haben vor [Zeit] für Sie gearbeitet..."* — fără follow-up dacă nu răspund (sunt deja prea vechi pentru spam).

### Verificare 30 zile
- [ ] Re-numără reviews pe Google
- [ ] Update tracking sheet "Datum Review" pentru noi
- [ ] Dacă <12 reviews atinse → analizează: care template/kanal a convertit cel mai bine? Ajustează.

---

## 📈 Conversion rate țintă

- **In-person + QR pe factură:** 30-40% (cel mai înalt — atingere multiplă)
- **WhatsApp:** 20-30% (personal, mobile)
- **Email:** 10-15% (mai puțin urgent)
- **SMS:** 15-20% (scurt, dar mai impersonal decât WA)

**Math:** Dacă ai 8 jobs noi în 30 zile × 30% conversion = **+8 reviews**. Plus 1-2 din 6 clienți vechi (lower conversion ~20%) = **+1-2 reviews**. Total realist: **4 + 9-10 = ~13-14 reviews în 30 zile**. Țintă atinsă.

---

_Document creat: 2026-05-10. Sursa de adevăr live = acest fișier. Update conversion rates real după 30 zile pentru calibrare._
