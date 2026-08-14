# Entsorgungskosten-Rechner — Design Spec

**Status:** Design aprobat 2026-08-14. Construcție planificată pentru weekend-ul următor. Următorul pas la reluare: skill `writing-plans` → plan de implementare.

## Context și scop

Idee originală venită din analiza TikTok a aplicației comerciale "RäumScan" (49,99€/lună, "Von Entrümplern für Entrümpler"). Scopul acestei unelte **NU** este generarea unei oferte pentru client (asta a fost o presupunere inițială greșită, corectată de user în brainstorming).

**Scopul real:** unealtă internă pentru Laura (PSS), folosită pe telefon în timpul vizitei de Besichtigung, care estimează **costul propriu de eliminare a deșeurilor** (Entsorgungsgebühren la Wertstoffhof/Deponie) pe baza materialelor și cantităților găsite la fața locului. Acest cost e input pentru decizia ei de preț către client (cost + marjă = preț), dar generarea ofertei către client rămâne complet separată și manuală, ca până acum.

## De ce contează corectitudinea

Site-ul PSS a avut deja un incident real: un Preisrechner vechi avea un default greșit și a arătat unei cliente 1.620€ în loc de 482€ — a fost retras. Principiul de design central aici: **AI-ul niciodată nu calculează prețul final singur**; el doar propune o estimare de materiale+cantități din poze, pe care omul o revizuiește obligatoriu înainte de calculul de cost, care e făcut prin cod determinist cu tabelul de tarife exact.

## Flux (validat vizual cu user, 5 ecrane)

1. **Start** — câmp opțional "Kunde / Adresse", buton "Fotos aufnehmen"
2. **Poze** — grid de poze adăugate (multiple), buton "Analysieren"
3. **Analiză AI** — stare de loading (câteva secunde)
4. **Rezultat editabil** — pentru fiecare categorie de material detectată de AI: nume categorie + cantitate (editabilă manual) + cost calculat pe linie. Buton "+ Kategorie manuell hinzufügen" pentru cazuri ratate de AI. Avertisment vizibil: "Schätzung der KI — Mengen sind editierbar, bevor du weitermachst."
5. **Total + PDF** — sumă totală, buton "PDF erstellen"

Culori: paleta deja folosită pe perfektsauberservice.com (fond crem `#fbf7f0`, verde `#5aa83a` pentru acțiuni, albastru `#1d6dd6` pentru cifre/total).

## Separarea responsabilităților (principiu central)

- **AI (Claude Vision):** doar identifică tipul de material din poze + estimează o cantitate/volum aproximativă. Explicit inexact — volumul dintr-o poză 2D fără reper de scară e greu de estimat pentru orice AI. Se poate calibra ulterior prin prompt (ex: cere un obiect de referință în cadru), dar nu se "antrenează" în sens ML.
- **Cod determinist:** aplică tabelul de tarife exact pe cantitatea confirmată de user. Zero calcul liber al AI-ului pentru preț.
- **User:** confirmă/corectează cantitățile înainte de calculul final. Pas obligatoriu, nu opțional.

## Tabelul de tarife (sursă: Abfallwirtschaftsbetrieb Landkreis Rastatt, "Abfallentsorgungsgebühren 2026", foto-uri trimise de user pe 2026-08-14)

Categorii incluse în V1 (confirmate de user ca relevante pentru munca reală de Entrümpelung/Haushaltsauflösung):

| Categorie | ≥ prag / tonă | < prag pauschal | Volum mic (flat) |
|---|---|---|---|
| Sperrmüllsammlung (0,5 m³) | — | — | 18 € |
| Sperrmüllsammlung (1 m³) | — | — | 30 € |
| Sperrmüllsammlung (2 m³) | — | — | 45 € |
| Sperrmüll Einzelanlieferung ab 2m³ | ≥200kg = 260 €/t | <200kg = 45 € | — |
| Altholz Kategorie A I–A II (lemn curat) | ≥200kg = 85 €/t | <200kg = 16 € | bis 0,5m³ = 10 € |
| Altholz Kategorie A IV (lemn tratat) | ≥200kg = 170 €/t | <200kg = 30 € | bis 0,5m³ = 20 € |
| Bauabfallgemische (moloz mixt) | ≥200kg = 185 €/t | <200kg = 35 € | Kleinmenge PKW bis 0,5m³ = 18 € |
| Gewerbeabfälle (deșeuri comerciale mixte) | ≥200kg = 280 €/t | <200kg = 30 € | — |
| Metallschrott | **gebührenfrei (0 €)** | | |
| Elektro-/Elektronik-Altgeräte | **gebührenfrei (0 €)** | | |
| Altpapier | **gebührenfrei (0 €)** | | |
| PKW-Reifen ohne Felge (≤20 Zoll) | 5 €/bucată, max. 10 bucăți | | |
| Altreifen Großreifen/-anhänger | ≥200kg = 385 €/t | <200kg = 77 € | |
| Matratzen | **25 €/bucată** (tarif dat direct de user, NU din fișa oficială Landkreis — de reverificat periodic, nu era pe pozele primite) | | |

**Explicit exclus din V1** (categorii din fișa oficială, dar prea rare pentru munca reală curentă — de adăugat doar dacă apare un caz concret): Asbesthaltige Abfälle, Mineralwollabfälle (KMF), Bodenaushub DK I/II, Bauschutt DK I/II, Grünabfälle, Wurzelstöcke, Zwischenlager chemische Deponie.

## Arhitectură (varianta aprobată din 3 propuse)

**Pagină simplă pe site + AI live**, nu PWA offline, nu chat manual:

- Pagină mobilă **nelistată** pe perfektsauberservice.com (Netlify) — fără link în navigație, fără sitemap, fără indexare. Doar Laura are URL-ul direct.
- Upload poze → **Netlify Function** → apel către **Claude Vision API** (identificare materiale + estimare cantitate) → JSON structurat înapoi.
- Calcul cost: cod determinist client-side, citind tabelul de mai sus dintr-un fișier JSON static (nu hardcodat în AI, nu hardcodat în prompt).
- PDF: generat client-side (ex. `jsPDF`), fără server necesar pentru acest pas.

**Riscuri tehnice cunoscute, de verificat la implementare:**
- Timeout Netlify Functions (tier gratuit ~10s) — un apel Vision cu mai multe poze poate dura mai mult; de testat real, posibil de limitat la 3-5 poze per cerere.
- Necesită cheie API Anthropic configurată server-side (Netlify env var), niciodată expusă în client JS.
- Acuratețea estimării de volum din poze e inerent aproximativă — mitigat prin pasul obligatoriu de revizuire umană (ecranul 4).

**Respins:**
- PWA cu coadă offline — rezolvă complet problema semnalului slab, dar efort de construcție/întreținere disproporționat pentru o unealtă cu un singur utilizator.
- Trimitere directă a pozelor în chat Claude — zero cost de construcție, dar fără "look" de unealtă dedicată, tot depinde de semnal.

## Ce NU face unealta asta (scope explicit exclus)

- Nu generează ofertă pentru client.
- Nu calculează automat prețul de vânzare — doar costul de eliminare.
- Nu salvează istoric de leads/oferte (nu a fost cerut).
- Nu funcționează offline (limitare acceptată pentru V1).
