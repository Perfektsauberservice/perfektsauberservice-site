# Vapi Calling System — Workflow Complet
# Perfekt Sauber Service — B2B Cold Calling

---

## KURZÜBERSICHT

Pasul 1: alegi firma și apeși „Sună"
Pasul 2: agentul vorbește
Pasul 3: agentul face summary
Pasul 4: dacă persoana cere email, se trimite automat
Pasul 5: totul se salvează într-un tabel

---

## ARHITECTURĂ TEHNICĂ — FLUX COMPLET

```
[Dashboard / Telegram / Buton „Sună acum"]
                │
                │  trimiți:
                │  - Zielgruppe
                │  - Firmenname
                │  - Telefonnummer
                │  - optional Notiz
                ▼
        [Call Controller / Backend]
                │
                │  pregătește datele apelului
                │  și le trimite mai departe
                ▼
     [Claude / Prompt Agent Logic]
                │
                │  alege:
                │  - intro corect
                │  - ton
                │  - răspunsuri
                │  - handling pentru întrebări
                ▼
     [Voice Layer: Vapi / telefonie]
                │
                │  - sună numărul
                │  - transformă text în voce
                │  - primește răspunsul interlocutorului
                │  - trimite transcriere live
                ▼
          [Convorbire telefonică]
                │
                │  rezultat posibil:
                │  - E-Mail gewünscht
                │  - Interesse
                │  - kein Interesse
                │  - falscher Ansprechpartner
                │  - Rückruf sinnvoll
                │  - nicht erreichbar
                ▼
       [Post-Call Summary Agent]
                │
                │  generează:
                │  - Ergebnis
                │  - Ansprechpartner
                │  - E-Mail
                │  - Kurznotizen
                │  - nächster Schritt
                ▼
       [Decision / Automation Layer]
                │
                ├── dacă E-Mail gewünscht
                │      ▼
                │   [Email Agent]
                │      │
                │      └── trimite follow-up email
                │
                ├── dacă Rückruf sinnvoll
                │      ▼
                │   [Callback List]
                │
                ├── dacă falscher Ansprechpartner
                │      ▼
                │   [Lead Update / contact corect]
                │
                ├── dacă kein Interesse
                │      ▼
                │   [Stop / no follow-up]
                │
                └── dacă nicht erreichbar
                       ▼
                    [Retry Queue]

                ▼
         [CRM / Google Sheet / Airtable]
                │
                │  se salvează:
                │  - firmă
                │  - telefon
                │  - target group
                │  - rezultat
                │  - email
                │  - contact person
                │  - next step
                ▼
            [Statistici / Dashboard]
```

---

## FLUX APEL DETALIAT

```
LEAD / NUMĂR SELECTAT DE TINE
        ↓
Alegi manual:
- Zielgruppe
- Firmenname
- Telefonnummer
- optional: Notiz / Kontext
        ↓
Comandă de pornire apel
(ex: Telegram / Dashboard / Button „Sună acum")
        ↓
AGENTUL VOCAL PRIMEȘTE INPUTUL
- citește Zielgruppe
- alege introducerea corectă
- sună numărul
        ↓
CONVORBIRE TELEFONICĂ
- se prezintă ca virtueller Assistent
- spune introducerea potrivită
- răspunde la întrebări simple
- nu inventează
- încearcă să obțină:
  • email
  • Ansprechpartner
  • Erlaubnis für Infos
  • Rückruf
        ↓
REZULTAT APEL
Poate fi unul din:
- interessiert
- teilweise interessiert
- E-Mail gewünscht
- falscher Ansprechpartner
- Rückruf sinnvoll
- kein Interesse
- nicht erreichbar
        ↓
POST-CALL SUMMARY AUTOMAT
Agentul generează:
- Zielgruppe
- Firmenname
- Telefonnummer
- Ergebnis
- Ansprechpartner
- E-Mail
- Kurznotizen
- Nächster Schritt
        ↓
DECIZIE AUTOMATĂ / MANUALĂ
Dacă:
- E-Mail gewünscht      → trimite email automat
- Ansprechpartner       → salvează și eventual reapelează
- Rückruf sinnvoll      → pune pe listă de callback
- kein Interesse        → marchează „fără follow-up"
- nicht erreichbar      → pune retry
        ↓
FOLLOW-UP EMAIL
Agentul generează emailul potrivit
în funcție de Zielgruppe și rezultat
        ↓
SALVARE ÎN CRM / LISTĂ
Se salvează:
- status
- notițe
- email
- persoană de contact
- next action
        ↓
FOLLOW-UP VIITOR
- retry call
- email follow-up
- callback
- sau stop
```

---

## REZULTATE POSIBILE DUPĂ APEL

| Ergebnis               | Acțiune automată                   | Status                      |
|------------------------|------------------------------------|-----------------------------|
| interessiert           | salvează lead                      | interessiert                |
| teilweise interessiert | salvează lead + marchează retry    | teilweise interessiert      |
| E-Mail gewünscht       | crează draft email (nu trimite)    | E-Mail-Entwurf erstellt     |
| falscher Ansprechpartner | salvează info                    | Ansprechpartner prüfen      |
| Rückruf sinnvoll       | adaugă în callback list            | Rückruf offen               |
| kein Interesse         | fără follow-up                     | abgeschlossen / kein Follow-up |
| nicht erreichbar       | adaugă pe lista retry              | retry                       |

---

## LOGICĂ DECIZIE POST-APEL

```
Dacă Ergebnis = "E-Mail gewünscht"
→ crează draft email (NU trimite automat)
→ status = „E-Mail-Entwurf erstellt – manueller Versand erforderlich"

Dacă Ergebnis = "falscher Ansprechpartner"
→ salvează info
→ status = Ansprechpartner prüfen

Dacă Ergebnis = "Rückruf sinnvoll"
→ adaugă în callback list
→ status = Rückruf offen

Dacă Ergebnis = "kein Interesse"
→ status = abgeschlossen / kein Follow-up

Dacă Ergebnis = "nicht erreichbar"
→ status = retry
```

---

## COMPONENTE SISTEM

1. **Frontend**
   - Dashboard sau Telegram

2. **Backend / Orchestrator**
   - primește comanda
   - trimite datele la agentul vocal
   - decide ce urmează după apel

3. **Voice Agent**
   - Claude + Vapi / telefonie

4. **Summary Agent**
   - rezumat după apel

5. **Email Agent**
   - follow-up automat

6. **Storage**
   - Google Sheets / Airtable / DB

---

## FIȘIERE SISTEM

- `vapi-calling-agent-prompt.md` — promptul complet pentru agentul vocal
- `vapi-system-workflow.md` — acest fișier, arhitectura sistemului
