# PSS Anti-Click-Fraud — descrierea completă a sistemului (V1, 14.10.2026)

Document pentru evaluare externă (Codex, Perplexity). Rog: găsiți puncte slabe, reguli greșite, riscuri, idei mai bune.

## 1. Contextul afacerii
- **Firma:** Perfekt Sauber Service, firmă mică de curățenie și Entrümpelung din Loffenau (Baden-Württemberg, Germania).
- **Reclame:** Google Ads Search, ~60 €/zi, ~2 € pe clic. Campanii pe orașe (Rastatt, Baden-Baden, Karlsruhe, Loffenau), țintite doar pe BW.
- **Problema:** valuri repetate de clicuri false. Exemplu: 14.10, 12:00–13:00, 11 clicuri de pe mobil din Daxlanden pe „haushaltsauflösung rastatt”. Google a marcat doar o parte ca invalide.
- **Înainte:** ClickCease (349 $/lună, anulat). A umplut listele de excluderi IP (limita Google: 500 pe campanie) cu ~345 de servere Alibaba din Singapore, care nu dăduseră niciun clic pe reclame.
- **Scopul:** un sistem propriu care exclude un IP înainte de clicul al 4-lea.

## 2. Arhitectura

```
Vizitator cu ?gclid=… ──► Netlify Edge Function "af-capture" (rulează înaintea paginii, nu o întârzie)
                              │  context.waitUntil(...)
                              ▼
                      pipeline.processClick()
                      ├─ salvează evenimentul brut + SHA-256 (Netlify Blobs, append-only)
                      ├─ indexuri: IP / rețea /24 (IPv6 /64) / amprentă browser
                      ├─ ipinfo.io → ASN, furnizor, țară (cache 30 de zile per IP)
                      ├─ engine.evaluate() → nivel + scor + motive scrise
                      ├─ dacă e excludere → rec/pending/<IP sau /24> (o singură dată, scriere atomică)
                      └─ Telegram (o alertă per IP și nivel la 10 minute, deduplicare atomică)

PC-ul proprietarei (pornit non-stop): runner.mjs loop (la 10 s)
  ├─ preia rec/pending → ads-exclusions.applyExclusion() → Google Ads API
  │     campaignCriteria:mutate, doar IP_BLOCK, pe toate campaniile Search ENABLED + PAUSED
  ├─ verifică după scriere, notează în jurnal (ledger.jsonl), Telegram „APLICAT”
  ├─ verifică pe oră cheltuiala (≥7 clicuri pe oră → alertă)
  ├─ verifică sănătatea (erorile din edge → alertă „defecțiune”)
  └─ șterge datele mai vechi de 30 de zile
```

- **Platforma:** site static pe Netlify; edge functions (Deno); Netlify Blobs pentru stocare. Unelte locale în Node 24.
- **Google Ads:** API REST v24. Developer token pe managerul PSS; OAuth cu contul administrator.

## 3. Ce date se înregistrează (doar vizitele cu gclid / gbraid / wbraid)
- **Despre vizită:** IP, ora (ms), pagina, identificatorul de clic, User-Agent, Accept-Language, referer, ID-ul cererii Netlify.
- **Locația:** Netlify geo (țară, land, oraș).
- **Amprenta:** hash SHA-256 al antetelor (UA, limbă, sec-ch-ua*). E slabă: multe telefoane au aceeași.
- **Fără** cookie-uri sau JavaScript pe dispozitiv.
- **Reîncărcarea:** păstrează același gclid, deci e numărată ca reîncărcare, nu ca un clic plătit nou.
- **Fișierele statice** (imagini, CSS, JS) sunt excluse din captare.

## 4. Regulile (stabilite de proprietară pe 14.10)

| Situație (clicuri plătite = gclid-uri distincte) | Acțiune |
|---|---|
| 2 clicuri în 5 minute de pe același IP | alertă „ANALIZĂ” |
| **3 clicuri în 10 minute de pe același IP** | **excludere IP /32** |
| **2 clicuri în 10 minute + semnal puternic** | **excludere** |
| rețea partajată (iCloud Private Relay, Cloudflare WARP, Fastly, Akamai) | excludere abia de la 4 clicuri |
| ≥3 IP-uri diferite din aceeași rețea /24 în 60 de minute | alertă „rețea” |
| aceeași amprentă de browser pe ≥3 IP-uri, ≥5 clicuri în 14 zile | doar semnal slab (posibilă rotație de IP) |
| ≥2 IP-uri excluse din aceeași /24 (rețea fixă) / ≥3 (operator mobil, CGNAT) | propune intervalul /24, **niciodată mai larg** |
| crawlere Google (AdsBot, Googlebot) / IP-uri pe lista albă | ignorate |

**Semnal puternic** înseamnă oricare dintre:
- rețea de server / centru de date (listă de ASN-uri: Alibaba, AWS, GCP, Azure, Hetzner, OVH…);
- User-Agent automat (bot, headless, curl, python…);
- IP din afara Germaniei;
- IP exclus deja anterior (repetare între zile).

**Scorul** (doar pentru alerte și explicații; decizia de excludere ține de regulile de mai sus):
- analiză +25, evaluare (≥4/10 min) +45, ≥5/60 min +15, rețea +20, amprentă +15;
- repetare IP +45, server +40, străinătate +25, în afara BW +10, robot +40, fără limbă +10.

## 5. Modulul de excludere (siguranță)
- **Garda din cod** refuză orice operație care nu e:
  - `create` al unui criteriu negativ IP_BLOCK cu /32 sau /24 (IPv6 /128);
  - sau `remove` al unui criteriu creat chiar de sistem (din jurnal).
- **Nu se ating** bugete, cuvinte cheie, reclame, licitări, locații sau conversii.
- **Scrierea reală** cere `--enforce` și `AF_ENFORCE=1`. Altfel totul merge cu `validateOnly=true`: Google verifică, dar nu se schimbă nimic.
- **Lista plină (500):** nu se scoate nimic automat; trimite alertă „rotație necesară”.
- **Anulare:** `undoExclusion` scoate doar ce a creat sistemul.

## 6. Module suplimentare
- **Planificatorul de rotație** (`rotation.mjs`, doar raport): ordonează excluderile existente după valoarea lor. Criterii: dovezi proprii, cine le-a adăugat (istoricul Google Ads), tipul rețelei. Releele și serverele din străinătate sunt cele mai slabe.
- **PSS Abuse Evidence Reporter** (`abuse-reporter.mjs`): construiește un dosar pentru un IP:
  - evenimentele brute, cu SHA-256 reverificat;
  - legătura gclid → Google Ads click_view (campanie, cuvânt cheie, dispozitiv);
  - tiparele găsite;
  - contactul de abuz din RIPEstat + RDAP;
  - CSV minim pentru furnizor (ora, IP, pagina);
  - e-mail în germană și engleză și `manifest.sha256`.
  Nu trimite nimic; anunță pe Telegram.
- **Raport** (`runner.mjs report`): un fișier text pe ultimele N ore.

## 7. Testare (dovezi)
- **Teste automate:** 136 din 136 în tot depozitul (38 de antifraudă: motor, flux, gardă, raportor).
- **Testul complet pe un deploy de test (nu producție):** 10 din 10. A acoperit:
  - pagina nu se încarcă mai greu (~30 ms în ambele cazuri);
  - captarea și amprenta SHA-256;
  - reîncărcările nu dau alertă;
  - val: alertă la clicul 2, excludere la 3;
  - server Alibaba: excludere la 2;
  - Google validează excluderea pe 6 campanii;
  - o singură propunere per IP;
  - 5 clicuri în paralel dau o singură alertă și o singură propunere;
  - fișierele statice sunt ignorate.
- **Timpi măsurați:**
  - de la clic la decizie și alertă: ~2 s;
  - de la clic la răspunsul Google: ~11–14 s, cu verificare la 10 s;
  - scrierea reală în Google Ads: 2,8 s (adăugare, verificare și anulare pe 6 campanii, cu adresa de documentare 192.0.2.1).
- **Producție (14.10, ~20:00):** o vizită reală de verificare a fost captată în ~1,5 s, fără erori.

## 8. Limite cunoscute
1. **Captăm doar vizitele care ajung pe site.** Un clic plătit al cărui vizitator pleacă înainte de încărcarea paginii nu apare la noi.
2. **IP-urile mobile (O2, CGNAT) sunt partajate și se schimbă.** Excluderea /32 ajută puțin, iar /24 poate bloca clienți reali.
3. **Amprenta fără JavaScript e slabă.** Nu se folosește niciodată singură.
4. **Clicul care declanșează excluderea e deja plătit.** Google mai are nevoie de câteva minute ca să aplice excluderea.
5. **Limita de 500 de IP-uri pe campanie.** O parte e ocupată încă de ClickCease, care poate rescrie listele până i se revocă accesul.
6. **Excluderile se aplică doar din programul de pe PC.** Dacă PC-ul e oprit, nu se aplică.
7. **ipinfo.io fără token:** limită de ~50k interogări pe lună (volumul nostru e mic).

## 9. Întrebări pentru evaluatori
- Sunt pragurile 3/10 min (2 cu semnal puternic) prea agresive sau prea blânde pentru o firmă mică?
- Cum distingem mai bine un client real care compară oferte (2–3 clicuri) de un atacator?
- Există semnale mai bune pentru IP-urile mobile CGNAT decât IP-ul?
- Merită excluderea pe locație sau pe audiențe în locul IP-ului, pentru tiparul „Daxlanden / Bietigheim pe mobil”?
- Cum folosim mai bine Google Ads (click_view, invalid_clicks, rambursări) ca dovadă?
- Ce alte surse gratuite există pentru centre de date / VPN / iCloud Private Relay?
