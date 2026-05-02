# Conversion Tracking — Setup Pas-cu-Pas

> **CRITIC**: Fără conversion tracking, Google Ads e cutie neagră. NU lansa nicio campanie până NU sunt activate cel puțin 3 conversii. Smart Bidding nu funcționează fără date — Manual CPC e ok pentru 14 zile, dar dincolo de asta, Google "ghicește" cui să arate ad-urile dacă nu îi spui ce e o conversie.

---

## P0 — Probleme blocante descoperite în audit

### 1. GA4 lipsește pe paginile de oraș

**Status actual:** GA4 (`G-BMC32KSYKF`) e activ DOAR pe `index.html`. Toate cele ~237 pagini de oraș (entrumpelung-rastatt, haushaltsaufloesung-*, etc.) NU au tag de tracking.

**Consecință:** când cineva dă click pe ad și aterizează pe `/entruempelung-rastatt`, Google Ads NU vede sesiunea, NU înregistrează conversia și Smart Bidding nu poate optimiza.

**Fix necesar (ÎNAINTE de orice click plătit):**

Adaugă acest snippet în `<head>` pe TOATE paginile de oraș, ideal printr-un script de build sau direct în template:

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-BMC32KSYKF"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-BMC32KSYKF');
</script>
```

**Comandă rapidă pentru a injecta tag-ul automat în toate paginile** (rulează din rădăcina proiectului, after dry-run):

```bash
# DRY RUN — vezi ce se modifică:
grep -L "G-BMC32KSYKF" *.html | head -10

# Aplică (după ce verifici dry-run):
# (script de injecție în head — îți pot face unul separat dacă vrei)
```

---

## Conversiile care trebuie configurate

| # | Eveniment | Tip | Valoare implicită | Trigger | Importanță |
|---|---|---|---|---|---|
| 1 | `phone_call_click` | Engagement | 60 € | Click pe `tel:+491639087197` | **PRIMARY** (60 % din leads) |
| 2 | `whatsapp_click` | Engagement | 25 € | Click pe `wa.me/491639087197` | **PRIMARY** |
| 3 | `form_submit_kontakt` | Conversion | 80 € | Form `/kontakt` trimis cu succes (ajunge la `/danke`) | **PRIMARY** |
| 4 | `preisrechner_complete` | Engagement | 45 € | User finalizează Preisrechner-ul | Secondary |
| 5 | `landing_page_view_3min` | Engagement | 8 € | Engaged session 3 min+ | Soft signal pentru Smart Bidding |

**Total conversion value pe lead calificat: ~80-150 €** — corespunde profitului tău mediu pe job × close rate.

---

## Setup Pas-cu-Pas

### Pasul 1: Verifică GA4 e pe toate paginile (P0)

```bash
# Rulează din /perfektsauberservice-site-main:
grep -c "G-BMC32KSYKF" *.html | grep ":0$"
# Output gol = bine. Lista de fișiere = trebuie injectat tag-ul în ele.
```

### Pasul 2: Configurează evenimentele în GA4

În GA4 → Admin → Events → Create event:

**Event 1: phone_call_click**
- Custom event name: `phone_call_click`
- Matching condition: `event_name equals click` AND `link_url contains tel:+491639087197`
- Mark as conversion: ✓

**Event 2: whatsapp_click**
- Custom event name: `whatsapp_click`
- Matching condition: `event_name equals click` AND `link_url contains wa.me/491639087197`
- Mark as conversion: ✓

**Event 3: form_submit_kontakt**
- Custom event name: `form_submit_kontakt`
- Matching condition: `event_name equals page_view` AND `page_location contains /danke`
- Mark as conversion: ✓
- (Asta presupune că formul de pe `/kontakt` redirecționează spre `/danke.html` la submit. Verifică în `kontakt.html`.)

**Event 4: preisrechner_complete**
- Necesită cod custom — trimite event `preisrechner_complete` la final de Preisrechner. Pun mai jos cod gata.

### Pasul 3: Linkează GA4 → Google Ads

În Google Ads → Tools → Linked accounts → Google Analytics (GA4) → Link contul tău GA4.

Apoi: Tools → Conversions → Import → Google Analytics (GA4) → selectezi cele 4 evenimente marcate ca Conversion.

**Setează "Primary action"** pe `phone_call_click`, `whatsapp_click`, `form_submit_kontakt`. Restul = "Secondary".

### Pasul 4: Cod custom pentru Preisrechner

În `preisrechner.html`, la final de calcul (când utilizatorul vede prețul), adaugă:

```javascript
// La submit-ul finalului de Preisrechner:
gtag('event', 'preisrechner_complete', {
  'event_category': 'engagement',
  'event_label': 'preis_calculated',
  'value': 45  // valoare implicită
});
```

### Pasul 5: Tracking pe butoane existente (deja în paginile tale)

Codul de mai jos pune un click handler global care detectează automat tel:, wa.me, mailto: links pe toată pagina. **Adaugă-l într-un script global** (ex: în footer pe toate paginile, sau într-un fișier `tracking.js` includ pe toate paginile):

```html
<script>
document.addEventListener('click', function(e) {
  var link = e.target.closest('a');
  if (!link) return;
  var href = link.getAttribute('href') || '';
  
  // Phone calls
  if (href.indexOf('tel:+491639087197') === 0) {
    gtag('event', 'phone_call_click', {
      'event_category': 'lead',
      'event_label': window.location.pathname,
      'value': 60
    });
  }
  
  // WhatsApp
  if (href.indexOf('wa.me/491639087197') !== -1 || href.indexOf('https://wa.me/491639087197') === 0) {
    gtag('event', 'whatsapp_click', {
      'event_category': 'lead',
      'event_label': window.location.pathname,
      'value': 25
    });
  }
  
  // Email
  if (href.indexOf('mailto:kontakt@perfektsauberservice.com') === 0) {
    gtag('event', 'email_click', {
      'event_category': 'lead',
      'event_label': window.location.pathname,
      'value': 30
    });
  }
});
</script>
```

### Pasul 6: Verifică în GTM Preview / GA4 DebugView

1. GA4 → Admin → DebugView
2. În Chrome, instalează extensia "Google Analytics Debugger"
3. Pe `/entruempelung-rastatt`, dă click pe butonul de telefon → vezi în DebugView dacă apare `phone_call_click` cu value 60
4. Repetă pentru WhatsApp și Form

---

## Call Tracking (opțional, dar foarte util)

Google oferă **Call Forwarding Numbers gratuit** — un număr "fake" care se afișează în ad și redirecționează la numărul tău real. Asta îți spune EXACT ce campanie/keyword aduce ce telefon.

Setup: Google Ads → Ads & Extensions → Extensions → Call Extension → "Use Google forwarding number" → ✓.

**Singurul dezavantaj:** numărul afișat în ad nu va fi `0163 9087197`, ci unul cu prefix Google (de obicei tot DE). Clienții uneori se întreabă "de ce nu e numărul lor real" — dar conversion data merită.

**Alternativă plătită cu mai multă claritate:** CallRail (~50 €/lună) — îți dă numere multiple, înregistrări, și poți dovedi exact ce keyword aduce ce client. Recomand DUPĂ ce ai prima lună de date și vrei să optimizezi mai fin. La start, Google Forwarding e suficient.

---

## Checklist final înainte de launch

- [ ] GA4 tag pe TOATE paginile de oraș (verifică cu `grep -L "G-BMC32KSYKF" *.html` să fie gol)
- [ ] 4 evenimente create în GA4 și marcate ca Conversion
- [ ] Cont GA4 linkat la Google Ads
- [ ] Cele 4 conversii importate în Google Ads (3 Primary, 1 Secondary)
- [ ] Click handler pentru tel/whatsapp/email instalat global
- [ ] Test cu DebugView — telefon, WhatsApp, form trigger evenimente
- [ ] Call Forwarding Numbers activat în Call Extension
- [ ] Form `/kontakt` redirecționează spre `/danke.html` la submit (verifică)

**Doar după ce toate sunt ✓ — schimbi status campanie din `Paused` în `Enabled`.**
