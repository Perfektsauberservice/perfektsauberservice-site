# Drafts Bot — Outreach via mailbox.org

Script care **salvează cele 10 emailuri ca ciorne (Drafts) în contul tău mailbox.org**.
Tu deschizi webmail-ul, le revizuiești pe rând, și apeși **Send**. Botul **NU trimite** nimic singur — doar pregătește ciornele.

---

## Setup (one-time, ~5 min)

### 1. Creează app-specific password în mailbox.org

1. Loghează-te la **https://login.mailbox.org**
2. Click iconița ⚙️ **Einstellungen** (sus dreapta)
3. Stânga: **Konto → Mein Konto → App-spezifische Passwörter**
4. **Neues App-Passwort erstellen**
5. Nume: `Drafts Bot` — bifează **doar IMAP** (nu SMTP)
6. **Copiază parola** afișată (se arată o singură dată!)

### 2. Adaugă parola în `.env`

Deschide fișierul `.env` din rădăcina proiectului și adaugă **o linie nouă** la final:

```
MAILBOX_APP_PASSWORD=lipește-aici-parola-de-la-mailbox.org
```

(Opțional — dacă userul nu e `kontakt@perfektsauberservice.com`, adaugă și `MAILBOX_USER=...`.)

### 3. Instalează dependențe

În terminal, în folderul `outreach/`:

```bash
cd outreach
npm install
```

(Instalează `imapflow` și `nodemailer` — durează ~30s.)

---

## Folosire

### Test fără să atingă mailbox.org (recomandat prima dată)

```bash
node save-drafts-mailbox.mjs --dry-run
```

Compilează cele 10 mesaje și afișează To/Subject/dimensiune. Dacă nu sunt erori → totul OK pentru pasul real.

### Salvează ciornele real în mailbox.org

```bash
node save-drafts-mailbox.mjs
```

Output așteptat:
```
✅ Conectat la IMAP imap.mailbox.org
📁 Drafts folder: "Drafts"

  #1 → info@mechler-bestattungen.de            ... ✅ salvat
  #2 → info@ernst-bestattung.de                ... ✅ salvat
  ...
  #10 → bestattungen.krieg@t-online.de          ... ✅ salvat

🎉 10/10 ciorne salvate în "Drafts".
```

### Apoi în webmail

1. Deschide **https://login.mailbox.org**
2. Mergi la **Entwürfe** (Drafts) — sus stânga, în lista de foldere
3. Vezi 10 ciorne gata, fiecare cu To+Subject+corp pre-completate
4. Pe fiecare: deschide → revizuiește → click **Senden**

---

## Dacă vrei să adaugi/modifici emailuri

Editează `emails-data.json`:
- `from` — datele expeditorului (nume + adresă)
- `signature` — semnătura adăugată automat la sfârșitul fiecărui email
- `emails[]` — array cu emailurile (id, label, to, subject, body)

După editare, rulează din nou `node save-drafts-mailbox.mjs`.

⚠️ **Atenție:** la a doua rulare, ciornele vechi NU se șterg — vei avea duplicate în Drafts. Înainte de a re-rula, șterge ciornele vechi din webmail (sau marchează doar pe cele noi cu un caracter unic în subject).

---

## Troubleshooting

| Eroare | Cauză | Fix |
|--------|-------|-----|
| `MAILBOX_APP_PASSWORD lipsește` | Nu ai adăugat parola în `.env` | Pasul 2 de mai sus |
| `AUTHENTICATIONFAILED` | Parola greșită sau expirată | Generează una nouă în mailbox.org |
| `Nu am găsit folder de Drafts` | Numele folderului e neobișnuit | Scriptul afișează lista de foldere — anunță-mă |
| `ECONNREFUSED imap.mailbox.org:993` | Firewall sau no internet | Verifică conexiunea + firewall |

---

## Securitate

- **App password** ≠ parola contului tău — poate fi revocată oricând din mailbox.org fără să afecteze loginul
- **Doar IMAP** = scriptul **nu poate trimite**, doar citește/scrie în foldere
- `.env` e în `.gitignore` (verifică dacă nu, adaugă-l) — nu ajunge în GitHub
- Dacă pierzi parola sau bănuiești compromise: revoke din mailbox.org → generează alta → update `.env`

---

## Fișiere

- `package.json` — declarație dependențe
- `emails-data.json` — datele celor 10 emailuri
- `save-drafts-mailbox.mjs` — scriptul (Node.js, IMAP)
- `bestatter-outreach.md` — lista de tracking outreach
- `bestatter-emails-personalisiert.md` — backup markdown al emailurilor
- `bestatter-emails-personalisiert.html` — varianta HTML cu butoane copy
