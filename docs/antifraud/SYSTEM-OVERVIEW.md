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

## 10. Îmbunătățiri V1.1 (14.10.2026, seara, live)
- **Lista albă clienți reali:**
  - formular trimis → IP-ul nu e exclus niciodată (30 de zile);
  - tap pe telefon / WhatsApp / e-mail → pragul de excludere crește cu +2, timp de 24 h. Un tap nu dă imunitate, pentru că oricine îl poate declanșa.
  - IP-ul clientului în funcțiile Netlify e intrarea din X-Forwarded-For dinaintea primului hop intern Netlify, ca să nu poată fi falsificat.
- **Comparația Google Ads ↔ site** (`insights.mjs reconcile`): clicurile plătite (click_view gclid) care nu au ajuns pe site, grupate pe loc, dispozitiv și cuvânt cheie. Zilele dinaintea captării complete sunt marcate „parțial”.
- **Zone** (`insights.mjs zones`): concentrarea clicurilor (≥10% din clicuri și ≥75% mobil) → propunere text pentru agenție. Pe 14.10: Bietigheim 38% / 78% mobil, Daxlanden 12% / 100% mobil.
- **Rezumat zilnic pe Telegram** la 20:30: clicuri, cost, invalide Google, vizite captate, comparația Ads ↔ site, suspecte, excluderi, zone. Lunea și verificarea pragurilor.
- **Verificarea pragurilor** (`tune`): comparație cu invalid_clicks din Google; IP-uri excluse care au devenit apoi clienți = semn că pragul e prea strict.
- **Pachet de rambursare** (`refund <de la> <până la>`): CSV cu gclid, IP, oră, campanie și cuvânt cheie confirmat în click_view, plus cererea în germană pentru formularul Google „ungültige Klicks”. Nu trimite nimic.
- **Rotația la limita de 500** cu butoane Telegram „Aprob / Nu”. Botul de pe Netlify doar înregistrează decizia; programul de pe PC scoate exact pozițiile aprobate.
- (Excluderea direct din Netlify a fost implementată în V1.2 — vezi secțiunea 11.)

## 11. V1.2: excluderi direct din Netlify, fără PC (14.10.2026, ~23:30, live)
- **`af-exclude`** (Netlify Function): pornită de edge function imediat după ce pune o propunere în coadă.
  - Nu primește date din exterior; citește doar coada `rec/pending/` din Netlify Blobs.
  - Trimite excluderea în Google Ads (aceeași gardă: doar IP_BLOCK) și confirmă pe Telegram.
- **`af-cron`** (funcție programată, la fiecare 5 minute, doar pe producție). Plasă de siguranță pentru:
  - propunerile rămase în coadă;
  - rotațiile aprobate prin butoane;
  - erorile captării (alertă);
  - cheltuiala pe oră;
  - ștergerea datelor după 30 de zile;
  - propunerea de rotație când o listă trece de 450;
  - rezumatul zilnic după 20:30 (lunea și verificarea pragurilor).
- **Preluare atomică** (`rec/claim/`): o excludere e trimisă o singură dată, chiar dacă rulează simultan funcția, cron-ul și, opțional, programul de pe PC.
- **Chei:** credențialele Google Ads sunt variabile de mediu Netlify (scope: functions), puse pe production și deploy-preview. `AF_ENFORCE=1` e pus doar pe production. Pe copiile de test totul rămâne `validateOnly`.
- **Testul de producție:** adresa de documentare 192.0.2.1/32 a fost pusă în coadă, iar funcția a aplicat-o singură pe toate cele 6 campanii în ~6,6 s (confirmat de Google). Apoi a fost scoasă; listele au revenit la 185/185/184/185.
- **Lecție:** `netlify env:set --site` e ignorat într-un folder nelegat de proiect. Se folosește `NETLIFY_SITE_ID=<id>` și se verifică mesajul „Set environment variable”.

## 12. V1.3 (15.10.2026, live)
1. **Semnal om / robot** (`js/af-b.js` + edge `/af-b`):
   - Scriptul e adăugat de edge **doar** în paginile deschise dintr-un clic pe reclamă. Nu folosește cookie-uri.
   - Trimite: timp pe pagină, procent derulat, număr de interacțiuni. Trimite un semnal intermediar la 8 s și unul final la plecare.
   - **Vizită „moartă”:** sub 4 s, fără derulare și fără atingere, sau niciun semnal după 20 s. O vizită anterioară „moartă” = semnal puternic, deci excludere de la al 2-lea clic.
   - Vizite anterioare clar omenești → pragul crește cu 1.
2. **Clicuri fantomă** (la 15 minute, ore terminate de cel puțin 2 h):
   - clicuri Ads − vizite captate ≥ 3 → alertă, cu locurile, dispozitivele și cuvintele cheie ale clicurilor fără vizită.
3. **Captare defectă:** Ads ≥ 3 clicuri într-o oră și 0 captate → alertă.
4. **Expirare:** excluderile proprii pentru IP-uri mobile (CGNAT), mai vechi de 45 de zile, sunt scoase automat. Doar criteriile create de sistem.
5. **Capcană** (`/af-trap`): legătură invizibilă (off-screen, aria-hidden, nofollow), doar pe paginile din reclame. Accesarea ei + un clic plătit de pe același IP = excludere de la primul clic.
6. **Clic → client:** formular / tap pe telefon sau WhatsApp cu gclid → `lead/<hash>`. Raportul săptămânal arată clienții pe campanie, cuvânt cheie și loc.
7. **Pachet de rambursare Google, săptămânal** (luni după 09:00): cererea în germană + CSV pe Telegram. Nu se trimite automat la Google.
8. **Scrieri străine:** schimbări IP_BLOCK prin API care nu sunt în jurnalul PSS → alertă (verificare din oră în oră).
9. **Rețele:** RIPEstat (network-info, as-overview, maxmind-geo-lite) ca sursă principală, ipinfo ca rezervă. Fără cheie, din UE, 200–400 ms.
10. **Raport săptămânal** (luni): clicuri, cost, invalide Google, suspecte, excluderi, surse principale, clienți reali, zone.

**Teste:** 156/156 automate; testul complet pe draft 13/13. Pe live s-a verificat că scriptul și capcana apar doar pe paginile cu gclid.

## 13. V1.4 (15.10.2026): semnătura atacatorului, dosar, clienți reali → Google
- **Analiza istoricului** (895 de clicuri, 15.08–15.10): de la sfârșitul lui septembrie, valurile vin din Bietigheim / Daxlanden, de pe mobil, pe Haushalts-/Wohnungsauflösung, mai ales între 17:00 și 19:00. 139 de clicuri cu semnătura, 8 valuri, ~145 € în orele de val.
- **Semnătura** (`ATTACKER_SIGNATURES` în config.mjs) = semnal puternic, deci excludere de la al 2-lea clic. La momentul clicului contează: mobil + pagină de Auflösung + loc (Bietigheim / Daxlanden) sau O2 (AS6805) cu loc Karlsruhe / Rastatt / Bietigheim / Durmersheim / Rheinstetten. **Verificare retroactivă** la 30 de minute, cu locația din Google click_view: 2+ clicuri cu semnătura de pe același IP → excludere.
- **Dosarul atacatorului** (`attacker-dossier.mjs`): valuri, clicuri cu GCLID, IP-uri (marcate „legătura cu valurile nedovedită”), raport în română, Sachverhaltsdarstellung în germană (§ 263a StGB / § 4 Nr. 4 UWG, încadrarea rămâne la autorități), manifest SHA-256. Trimis doar proprietarei.
- **Clienți reali → Google** (`offline-conversions.mjs`): fișierul de import offline (formular / tap cu gclid), săptămânal, doar proprietarei. Sistemul nu creează și nu modifică acțiuni de conversie.
