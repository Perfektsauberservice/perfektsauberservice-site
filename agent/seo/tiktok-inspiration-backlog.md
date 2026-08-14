# 📋 TikTok Inspiration Backlog — PSS

**Scop:** Lista de gap-uri/idei extrase din analiza de videoclipuri TikTok trimise de user, pentru execuție ulterioară în bloc.
**Regulă:** NU executăm nimic pe măsură ce apare — doar adunăm aici, bifăm ce există deja, și atacăm task-urile abia după ce lista e completă (la cererea explicită a user-ului).
**Sursă video:** salvate la `c:\tmp\tiktok-to-claude\out\pss-analysis\` (transcript + frames per video).

---

## Video 1 — @heytonyagency (free SEO tools listicle)

URL: https://vm.tiktok.com/ZGdxPsakU/

- ☑ **On-page audit (title/meta/H1-H6/linkuri)** — deja acoperit, verificat direct din cod sursă, nu prin tool extern. Nu e gap.
- ☐ **Analiză concurență cu PageAudit.com / RankReportCard.com** — nu am făcut niciodată audit SEO formal pe un concurent PSS. Ar ajuta pentru poziționare/gap analysis.
- ☐ **FindQuestions.com — idei de conținut din întrebări reale ale clienților** — nu am folosit; ar putea genera idei de articole blog/FAQ bazate pe ce caută oamenii real.
- ☐ **Unlinked.io — mențiuni brand fără backlink** — nu am verificat dacă PSS e menționat undeva online fără link către site.

## Video 2 — @frewertmedia (Google Maps invisible → #1)

URL: https://vm.tiktok.com/ZGdxPqFo5/

- ☐ **Google Business Profile "Profile strength" la 100%** — confirmat incomplet de user (screenshot 12.08.2026). Cel mai mare gap găsit până acum, legat direct de blocajul Maps Pack Rastatt cunoscut.
- ☐ **Extensia GMB Everywhere** — nu instalată/folosită; ar arăta categoriile exacte alese de concurenți pe Maps, utile pentru alegerea categoriei corecte PSS.
- ☐ **Backlinks locale prin directoare de branșă** — deja planificat în `agent/seo/citations-checklist.md` (HWK Karlsruhe, Gelbeseiten Grundeintrag, Bing Places, Apple Business Connect) dar **toate căsuțele nebifate** — muncă veche neexecutată, nu gap nou.

## Video 3 — @sofiia.ads (spionează concurența cu site: search)

URL: https://vm.tiktok.com/ZGdxPmv7R/

- ☐ **`site:domeniu-concurent.de` în Google** — nu am făcut niciodată un audit sistematic al concurenților PSS locali (ce pagini au indexate, ce topicuri/orașe/servicii acoperă, cum structurează landing page-urile). Tehnică gratuită, pot rula chiar eu cu WebSearch. Utilă mai ales pentru idei de conținut/pagini lipsă, nu pentru copiat structură (PSS are deja 350+ pagini, acoperire structurală mare).
- Restul videoclipului = CTA lead-gen pentru agenția ei (irelevant pentru noi).

## Video 4 — @deepweb_tv (ChatGPT + Kleinanzeigen plugin)

URL: https://vm.tiktok.com/ZGdxPMWAq/

- ☐ **Plugin oficial Kleinanzeigen în ChatGPT** — încarci poze cu obiecte, ChatGPT cercetează preț de piață și creează anunțul automat. Confirmat vizual real (listare oficială, 58M anunțuri, buton "Plugin installieren"), nu pare fake, dar stilul canalului (mască + "secret trick") cere scepticism la validare practică.
- **Legătură directă cu PSS:** serviciul de Entrümpelung oferă deja **Wertanrechnung** (reducere preț dacă mobila găsită e vandabilă) — nu există momentan un flux clar pentru a pune efectiv aceste obiecte pe Kleinanzeigen. Pluginul ar putea automatiza exact asta (poze din casă golită → preț + anunț).
- **Distinct de campania Kleinanzeigen existentă** (reclamă pentru serviciul de Entrümpelung, nu vânzare obiecte) — două utilizări separate, nu se suprapun.

## Video 5 — @sofiia.ads (Custom Segments — target trafic concurență)

URL: https://vm.tiktok.com/ZGdxP8T4b/ (fără subtitrări, analizat din cadre)

- ☐ **Custom Segment Google Ads "konkurrent traffic"** — țintește: (1) căutări Google "Nume Concurent + Preis", (2) vizitatori ai site-urilor concurenților direcți, (3) useri de apps ale concurenților. Se adaugă ca audiență pe campaniile Search existente.
- **Gap real confirmat:** contul PSS_Reinigung_Search / PSS_Entrumpelung_Search nu are niciun custom segment de audiență configurat — doar keyword targeting cu Manual CPC.
- ☑ **TESTAT 2026-08-14, confirmat IMPOSIBIL pe campanii Search.** Am construit lista reală de 26 concurenți direcți (din `agent/state/keyword-rankings.json`, 12 săptămâni date Serper — Rümpelprofi24, Die Rümpel Crew, Tina Entrümpelung, Neibert, Elcik, etc.), am creat Custom Audience în cont, și am încercat să-l leg de campanii Search în 3 variante (INTEREST+URL pe ad-group, INTEREST+URL pe campanie, SEARCH+keyword-only pe campanie) — **toate 3 au picat cu `OPERATION_NOT_PERMITTED_FOR_CONTEXT`, trigger "SEARCH"**. Custom Segments/Custom Audiences NU sunt permise deloc pe campanii Search de Google — doar pe Display/Video/Discovery. Resursele de test au fost șterse din cont. Ideea din Video 5 nu se aplică unui cont 100% Search ca al nostru.
- Necesită: identificarea concurenților direcți locali (nume + site) — se leagă de Video 3 (`site:` audit concurenți).

## Video 6 — @jakob..rankt (Google Search Console — striking distance keywords)

URL: https://vm.tiktok.com/ZGdxPR15q/

- ☐ **GSC Performance → sortare după Impressions → găsește keyword-uri cu impresii mari, CTR mic, poziție 8-20** ("money keywords" aproape de pagina 1) → optimizezi pagina respectivă (H1/subtitlu/descriere) pentru acel keyword exact. Tehnică standard, foarte acționabilă.
- **Direct aplicabil:** avem deja date GSC zilnice salvate în `agent/gsc-snapshots/` — pot rula analiza asta pe datele reale ale site-ului, fără tool extern.

## Video 7 — @frewertmedia (glosar + internal linking prin ChatGPT)

URL: https://vm.tiktok.com/ZGdxPf39u/

- ☐ **Pagină "Glosar" generată de ChatGPT din sitemap** — linkuri interne către paginile importante + descriere scurtă fiecare, apoi 1-2 backlinks doar către pagina asta, ca să "împingă" autoritate spre paginile legate.
- **Legătură:** backlinks-urile din citations-checklist.md (neexecutate) ar putea ținti acest glosar în loc de homepage.

## Video 8 — @gobigsystems (descrieri servicii GBP optimizate cu AI)

URL: https://vm.tiktok.com/ZGdxP2cuG/

- ☐ **GBP → Edit Services → descriere AI sub 300 caractere per serviciu, cu keyword + oraș** — completează exact bucata "Services" din profilul Google Business incomplet.
- **Cel mai direct legat de gap-ul #1 din listă** (GBP Profile strength) — pot scrie chiar eu descrierile pentru serviciile PSS acum, e doar de copiat-lipit după.

## Video 9 — compactkeywords (GSC pagină → conținut lipsă via Claude)

URL: https://vm.tiktok.com/ZGdxybncb/

- ☐ **GSC → Pages → export CSV query-uri per pagină → Claude identifică clustere neacoperite → sugerează H2 noi.** Extensie mai precisă la Video 6 (nivel de pagină, nu doar keyword izolat).

## Video 10 — Google Ads Transparency Center

URL: https://vm.tiktok.com/ZGdxyn1R6/

- ☐ **google.com/adstransparency (căutare "google ads transparency center")** — vezi reclamele live ale oricărui concurent, în orice locație, gratuit și oficial. Completează Video 3 + 5 (research concurență) cu copy-ul real de reclamă, nu doar paginile.

## Video 11 — compactkeywords (Ahrefs Backlink Checker)

URL: https://vm.tiktok.com/ZGdxyB9QP/

- ☐ **Ahrefs Backlink Checker (free)** — backlinks proprii + domain rating, apoi ale concurenței, pentru surse/directoare de replicat. Se leagă de `citations-checklist.md` (neexecutat).

## Video 14 — Google Ads campaign type tier list

URL: https://vm.tiktok.com/ZGdxD6AW8/

- ☑ Search Partners + Display Network OFF — **deja confirmat activ la noi** (STATE.md), nu e gap.
- ☐ **"Automatically created assets" (campaign settings) + Account-level Automated Assets → Advanced settings** — nu apare verificat nicăieri în munca anterioară. Gap real de verificat/dezactivat.
- ☐ Performance Max — confirmă că nu e activat fără destule date istorice pentru lead-gen local.

## Video 15 — aplicația RäumScan (Besichtigung + ofertă preț fix, pentru Entrümpler)

URL: https://vm.tiktok.com/ZGdxAxxpN/

- 🔥 **Cel mai relevant găsit până acum — nu marketing, ci operațional.** App dedicată exact industriei PSS ("Von Entrümplern für Entrümpler"): Besichtigung la client direct din telefon → categorie (Haushaltsauflösung ab 1.290€, Wohnungsauflösung ab 690€, Messie-Wohnung ab 990€, Keller/Dachboden/Garage ab 290€, Geschäfts-/Betriebsauflösung ab 490€) → date client + obiect → ofertă preț fix generată pe loc. 49,99€/lună Pro, 1 vizionare gratis de test.
- ☐ De evaluat: înlocuiește/eficientizează fluxul actual de Besichtigung (relevant inclusiv pentru cazul recent cu clienta de Grundreinigung din Karlsruhe-Südstadt).

## Video 16 — tehnica "Council" (prompting Claude pentru decizii)

URL: https://vm.tiktok.com/ZGdxSfw6L/

- ☐ **Simulezi 5 perspective (Pesimist/Builder/Oportunist/Outsider/Executor) + un verdict final**, în loc de o singură întrebare directă. Utilă pentru decizii strategice PSS (preț, extindere), nu specific SEO/Ads — categorie separată de proces de gândire, nu tool de marketing.

*(Video 12 = duplicat Video 7. Video 13 = self-promo generic fără tehnică nouă, ignorat. Video 17 = sfat Inkasso personal, nelegat de PSS, ignorat.)*

## Videoclipuri 20-42 (batch mare, 23 linkuri — grupate pe temă, nu unul câte unul)

2 linkuri au eșuat (postări foto TikTok, nu video, neprocesabile). 1 link Facebook s-a dovedit a fi conținut irelevant (video de fitness). Restul, grupate:

### ☑ Google Ads budget pacing change (1 iunie) — VERIFICAT 2026-08-14, nu e problemă activă

- Schedule confirmat: Mo-Fr 07-21 + Sa 09-13, FĂRĂ duminică (6/7 zile) — exact contextul vulnerabil la schimbarea de pacing.
- **Rezultat `check-budget-limit.js` (ultimele 7 zile):**
  - PSS_Entrumpelung_Search: buget 25€/zi, cost mediu real 11.89€/zi, Lost-la-BUGET 0.0%
  - PSS_Reinigung_Search: buget 15€/zi, cost mediu real 12.48€/zi, Lost-la-BUGET 11.0%
- **Concluzie:** ambele campanii cheltuiesc sub bugetul setat (cu marjă mare la Entrümpelung) — pacing-ul ÷30,4 nu creează niciun overspend/underspend vizibil acum. Nu e blocajul real.
- **Blocaj real confirmat de aceeași verificare:** Lost-la-RANK e mult mai mare (68.3% Entrümpelung, 56.2% Reinigung) — impression share pierdut din cauza bidding/Quality Score, nu din cauza bugetului. Impression Share mediu doar 31.7%/32.8%.
- ⚠️ **Notă separată, de verificat**: bugetul Reinigung apare acum ca 15€/zi, dar în memoria de sesiune anterioară era notat 20€ — posibilă schimbare neînregistrată sau memorie deja stale. De clarificat dacă a fost o reducere intenționată.

### Cercetare concurență (completare la site:/Ahrefs/Transparency Center)
- ☐ SpyFu.com — concurenți organici + keyword-uri comune, pentru orice domeniu.

### Google Business Profile (confirmă gap #1 ca prioritate maximă)
- ☐ Gemini integration în GBP — administrare prin chat (analiză recenzii, sugestii categorii, postări din recenzii/servicii).
- ☐ Sincronizare GBP → GA4 (Admin → link profil) — statistici unificate într-un singur loc.
- ☐ GBP → Performance → Search Breakdown — vezi exact ce servicii caută lumea, aliniezi Edit Services.
- 📊 Studiu de caz real (altă firmă): optimizare completă GBP (poze săptămânale, categorii corecte, recenzii, produse per serviciu, descriere SEO, postări săptămânale) → 0→27 interacțiuni, 0→6 apeluri într-o lună.
- ☐ Rețetă recenzii de calitate de cerut clienților: (1) context + rezolvare problemă, (2) urgență + proximitate, (3) scop detaliat al lucrării — aplicabil la viitoarele cereri de recenzii.

### Backlink local — sponsorizare club sportiv (idee nouă, nu duplicat de nimic anterior)
- ☐ Cauți echipe de fotbal/handbal/șah locale din zona PSS → pagină "Sponsoren" pe site-ul lor → scrii cerând doar logo+link pentru ~150-200€/an. Backlink local relevant + vizibilitate în comunitate, potrivit pentru o firmă hyper-locală.

### GA4 — funcție nouă
- ☐ Traffic Acquisition → canal "AI Assistant" — arată vizitatori veniți din ChatGPT/Gemini/Claude. Verificabil acum, avem deja acces GA4.

### Tier-list unelte SEO (context, nu acțiune directă)
- Microsoft Clarity (heatmaps gratuite) = 8/10, nefolosit de noi — singurul iesit în evidență ca nou.
- Confirmă: setul `claude-seo` deja instalat = exact ce alții numesc "unealta care ucide industria SEO" — suntem deja pe el.

*(Duplicate/zgomot ignorate: Hostinger "toată pagina Google e a ta" ×2, reclamă pistol de vopsit, ChatGPT+Kleinanzeigen duplicat, GSC striking-distance duplicat ×2, video fitness de pe Facebook.)*

## Videoclipuri 43-48 (batch trimis 2026-08-14, analizat cu transcript+frame reale via extract.mjs)

### Video 43 — @sofiia.ads (Keyword Planner cu URL concurent)

URL: https://vm.tiktok.com/ZGdxaFQRb/

- ☐ **Google Ads Keyword Planner → Discover new keywords → introduci URL-ul unui concurent local** (nu domeniul propriu) → Google generează toate keyword-urile pe care le asociază cu acel site, fără să licitezi pe marca lor. Tehnică distinctă de `site:` audit (Video 3) și de Custom Segments (Video 5) — extinde lista de keyword-uri pentru campaniile PSS_Reinigung_Search / PSS_Entrumpelung_Search.
- Necesită aceeași listă de concurenți direcți (nume+site) cerută și de Video 3/5 — de făcut o singură dată, folosită de 3 tactici diferite.

### Video 44 + 48 — @alan.buildz / @luca.delfino_ (plugin Claude Ads — același tool, 2 creatori diferiți)

URL: https://vm.tiktok.com/ZGdx5mhk9/ și https://vm.tiktok.com/ZGdx5NXtL/

- ☐ **Plugin `claude-ads` (GitHub: AgriciDaniel/claude-ads, public, activ — 16 issues, 19 PR, 9 branch-uri)** — skill Claude Code pentru analiză competitivă, generare ad creatives și campanii pe Google/Meta/TikTok. Confirmat real (nu fake ca Video 47), merită testat separat pe un cont de test înainte de contul live PSS.

### Video 45 — @jakob..rankt (case study GBP Entrümpelung Heilbronn)

URL: https://vm.tiktok.com/ZGdx5gM6c/

- ☐ **Structură H1 per pagină de serviciu = [serviciu] + [oraș]** (ex. "Entrümpelung Heilbronn") — de verificat dacă paginile PSS existente (350+) respectă exact acest pattern sau doar se aproprie de el.
- ☐ **Folosire activă (nu doar completare pasivă) a secțiunii Products/Offers/Posts din GBP** — completează direct gap #1 (GBP Profile strength) deja în listă.

### Video 46 — @colmlocalseo (Guerilla Local SEO — 6 tactici, sursă newsletter Corey Hind)

URL: https://vm.tiktok.com/ZGdx5ehUy/

- ☐ **Conținut reactiv la evenimente hyperlocale** (drum blocat, inundație, incendiu în zona Rastatt/Karlsruhe) — post rapid GBP/social legat de eveniment + serviciul PSS, dacă e relevant. Idee nouă, nimic similar în listă.
- ☐ **Conținut "doar un local ar ști"** — reguli locale de eliminare deșeuri, cel mai apropiat Wertstoffhof pe cartier, sfaturi hyperlocale legate de Entrümpelung/Reinigung — poziționare de expert local.
- ☐ **Prezență utilă (nu spam) în grupuri Facebook/subreddit-uri locale** — răspunzi la întrebări reale ale oamenilor din zonă.
- ☑ confirmă dintr-o a doua sursă independentă ideea deja notată "Backlink local prin sponsorizare club sportiv" — nu bullet nou, doar întărește prioritatea.

### Video 47 — @alex.carter.crypto (OpenSEO / RankPilot) — IGNORAT, semnal spam

URL: https://vm.tiktok.com/ZGdx5Rq37/

- Discrepanță text/vizual (pretinde "OpenSEO", screen recording arată de fapt landing page-ul "RankPilot") — semn de conținut reciclat de affiliate spam pe cont cu nume crypto. Nu adăugat ca idee.

## Diagnoză Lost-la-Rank + acțiuni 2026-08-14 (continuare din verificarea pacing-ului)

**Cauza reală a Impression Share scăzut (31-33%)**: nu bugetul (Lost-la-BUGET 0-11%), ci Lost-la-RANK (56-68%). Root cause identificat din date API reale:
1. Landing Page Experience = BELOW_AVERAGE aproape uniform pe toate keyword-urile cu QS scăzut — semnătură clasică de "date insuficiente per pagină", nu conținut slab (title/H1 deja corecte, TTFB server confirmat rapid 0.1-0.5s după re-test).
2. Trafic împrăștiat pe 40 de pagini — top 5 fac 81% din clicuri, 9 pagini au impresii dar ZERO clicuri în 30 zile.
3. Bid sub piață doar pe 3 ad groups specifice (nu generalizat): AG1_Bueroreinigung, AG3_Haushalts_Nachlass, AG12_Unterhaltsreinigung — verificat cu Keyword Planner real, nu presupunere.
4. Ad Strength AVERAGE (nu GOOD) doar pe AG1_Bueroreinigung + AG8_Hausmeisterservice_Core.
5. Zero Sitelinks/Callouts/Structured Snippets pe ambele campanii înainte de azi.

**Executat azi (2026-08-14), fără să ating RSA/bid pe ad groups în cooldown:**
- ☑ Schimbat final URL pe 14 keyword-uri satelit (0-2 clicuri/lună) către pagina hub Rastatt a serviciului lor: haushaltsauflösung {ettlingen, baden-baden, bühl, karlsruhe, gaggenau, pforzheim, gernsbach} → `/haushaltsaufloesung-rastatt`; wohnungsauflösung {ettlingen, gaggenau} → `/wohnungsaufloesung-rastatt`; büroreinigung {ettlingen, gaggenau} → `/bueroreinigung`; entrümpelung {bühl, ettlingen, pforzheim} → `/entruempelung-rastatt`. Paginile SEO rămân live pe site, s-a schimbat doar targetul din Ads.
- ☑ Creat și legat 6 Callouts (Festpreis garantiert, Kostenlose Besichtigung, 5,0 Sterne bei Google, Familienbetrieb Loffenau, Anfrage per WhatsApp, Ohne versteckte Kosten) pe AMBELE campanii.
- ☑ Creat 4 Sitelinks per campanie (Reinigung: Grundreinigung/Büroreinigung/Hausmeisterservice/Preise; Entrümpelung: Entrümpelung Rastatt/Wohnungsauflösung/Haushaltsauflösung/Preise), toate cu text deja verificat din RSA-urile live.
- ☑ Creat Structured Snippet "Service catalog" per campanie (lista serviciilor reale).
- Verificat live via API: 4 SITELINK + 6 CALLOUT + 1 STRUCTURED_SNIPPET confirmate pe fiecare campanie.

**Lăsat pentru discuție separată (~21 august, reminder programat `trig_01JiyjDmxyunYTQDZeFtuKzi`):**
- Bid AG1_Bueroreinigung (1.20€→?, piață 2.23-7.94€), AG3_Haushalts_Nachlass/haushaltsauflösung rastatt (1.50€→recomandat 2.80€, piață 2.77-7.94€), AG12_Unterhaltsreinigung (1.20€→?, piață 1.36-4.90€).
- Rescriere RSA + fix Ad Strength AVERAGE pe AG1_Bueroreinigung și AG8_Hausmeisterservice_Core.
- Review checkpoint separat deja notat: AG1_Entrumpelung_Core + AG2_Wohnungsaufloesung (bid 1.50€→2.00€ testat 7 aug).
- PageSpeed Insights / Core Web Vitals mobil real — API public a dat rate-limit (429) de 2 ori, de reîncercat.

## Idei proprii — runda 2 (verificate individual contra codului sursă)

- ☑ ~~llms.txt~~ — **deja există** (creat 05.08.2026, conținut complet). Retras.
- ☑ ~~Galerie înainte/după~~ — **probabil deja acoperit** în `portfolio.html` (35 mențiuni vorher/nachher). Retras.
- ☐ **Program de recomandare cu recompensă** — verificat: 0 mențiuni "Empfehlung + Rabatt/Prämie/Bonus" pe tot site-ul. Gap confirmat real.
- ☐ Parteneriate B2B: pompe funebre, firme de mutări, Hausverwaltungen, notari/avocați Erbrecht, Betreuer legali
- ☐ Pagină/argument activ §35a EStG (deducere fiscală 20%) — conținutul există pe 10 pagini (garage-entruempelung + 1 blog post), dar neverificat dacă e folosit ca argument de vânzare în Ads/GBP
- ☐ Calculator public economie fiscală §35a
- ☐ Campanie sezonieră Frühjahrsputz (martie-aprilie)
- ☐ Reminder fiscal ianuarie-martie (Steuererklärung)
- ☐ Follow-up automat WhatsApp la 2-3 luni post-job
- ☐ Anunț Gemeindeblatt/Amtsblatt local
- ☐ Parteneriat Wertstoffhof local
- ☐ QR code pe mașina de serviciu
- ☐ Verifică vizibilitate PSS în răspunsuri directe ChatGPT/Perplexity la "Entrümpelung Rastatt empfehlung"
- ☐ Buton "Cere ofertă" cu upload poze direct din WhatsApp (alternativă la Preisrechner cu bug)

## Idei proprii — runda 1 (deja notate anterior)

- ☐ **Raport săptămânal automatizat unificat** (GSC-adiacent + GA4 + Google Ads API, deja avem acces la toate 3) — striking-distance keywords, trafic AI Assistant, conversii picate, budget pacing, într-un singur loc în loc de verificări separate ad-hoc.
- ☐ **Bid-uri sezoniere pe Ads** — cererea de Entrümpelung e sezonieră (sezon mutări august-septembrie DE, curățenie de primăvară, declutter post-sărbători ianuarie). Niciun videoclip n-a acoperit asta; cu buget de 17€/zi contează mai mult decât orice tool nou.
- ☐ **Mesaj automat WhatsApp Business cu prețuri "ab"** — ar fi prevenit direct confuzia din cazul de azi (482€ vs 1620€) înainte să apară, cost zero.
- ☐ **RäumScan gratuit, construit intern** — avem deja toate prețurile fixe (RW1-5, Entrümpelung, Haushaltsauflösung etc.) din site; un formular simplu sau PDF intern ar face același lucru fără 49,99€/lună.

---

## Sumar rapid (actualizat automat pe măsură ce adaug videoclipuri)

| Gap | Prioritate estimată | Status |
|---|---|---|
| GBP Profile strength 100% | 🔴 Mare (leagă de Maps Pack blocat) | ☑ Majoritar completat 2026-08-14 — categorie, descriere, opening date, Instagram, service area fix, recycling attributes; procent exact "strength" neconfirmat |
| GMB Everywhere (research categorii concurenți) | 🟡 Medie | Neînceput |
| Citations-checklist.md (HWK, Gelbeseiten, Bing, Apple) | 🟡 Medie | Planificat, neexecutat |
| `site:` audit concurenți locali (topicuri/pagini lipsă) | 🟡 Medie | Neînceput — pot rula direct cu WebSearch |
| Audit concurență (PageAudit/RankReportCard) | 🟢 Mică | Neînceput |
| FindQuestions.com — idei conținut | 🟢 Mică | Neînceput |
| Unlinked.io — mențiuni fără link | 🟢 Mică | Neînceput |
| ChatGPT Kleinanzeigen plugin → flux Wertanrechnung | 🟡 Medie (proces nou, nu doar tool) | Neînceput |
| Custom Segment "konkurrent traffic" (Google Ads) | — | ☑ Testat 2026-08-14 — IMPOSIBIL pe campanii Search (confirmat API, 3 variante încercate), doar Display/Video/Discovery |
| GSC striking-distance keywords (impresii mari, CTR mic) | — | ☑ Rulat 2026-08-14 — 12 oportunități găsite, toate "haushaltsauflösung [oraș mic]", 0 clicuri din ~294 impr/lună |
| Cannibalizare Entrümpelung vs Haushaltsauflösung (orașe mici) | — | ☑ Consolidat 2026-08-14 — 6 orașe (Durmersheim, Bad Wildbad, Muggensturm, Malsch, Au am Rhein, Elchesheim-Illingen): redirect 301 haushaltsaufloesung-X → entruempelung-X, cross-links fixate, sitemap actualizat |
| Cannibalizare Entrümpelung vs Haushaltsauflösung (orașe mari: Rastatt/Karlsruhe/Baden-Baden/Pforzheim/Gaggenau) | 🟡 Medie (proiect separat, diferențiere de conținut, nu redirect) | Neînceput |
| Pagină Glosar + internal linking + backlinks țintite | 🟡 Medie | Neînceput |
| Descrieri servicii GBP optimizate cu AI (sub 300 car.) | 🔴 Mare (completează gap #1) | ☑ Executat 2026-08-14 — 9 descrieri servicii scrise și publicate |
| GSC pagină → conținut lipsă via Claude (CSV query-uri) | 🟡 Medie | Neînceput |
| Google Ads Transparency Center (copy reclame concurenți) | 🟡 Medie | Neînceput |
| Ahrefs Backlink Checker (surse backlink concurenți) | 🟡 Medie | Neînceput |
| Automatically created assets / Account-level Automated Assets OFF | 🟡 Medie (verificare rapidă) | Neverificat |
| **App RäumScan → repivotat la Entsorgungskosten-Rechner** | 🔥 Foarte mare (operațional, nișă exactă) | Design aprobat 2026-08-14, spec la `docs/superpowers/specs/2026-08-14-entsorgungskosten-rechner-design.md`, construcție planificată weekend |
| Tehnica "Council" pentru decizii strategice | 🟢 Mică (proces, nu marketing) | Neînceput |
| Google Ads budget pacing (÷30.4 din 1 iunie) | — | ☑ Verificat 2026-08-14: nu e problemă activă, ambele campanii sub buget |
| Consolidare URL keyword-uri satelit cu 0-2 clicuri/lună (14 keyword-uri) | — | ☑ Executat 2026-08-14 — vezi detalii sub |
| Sitelinks + Callouts + Structured Snippets pe ambele campanii | — | ☑ Executat 2026-08-14 — 4 sitelinks + 6 callouts + 1 structured snippet per campanie |
| Bid AG1_Bueroreinigung / AG3_Haushalts_Nachlass / AG12_Unterhaltsreinigung vs. market CPC real | 🔴 Mare | Neexecutat — blocat parțial de cooldown RSA, discuție programată ~21 aug (reminder creat) |
| Fix Ad Strength AVERAGE pe AG1_Bueroreinigung + AG8_Hausmeisterservice_Core | 🟡 Medie | Neexecutat — cooldown RSA până 17-21 aug (reminder creat) |
| Backlink local prin sponsorizare club sportiv | 🟡 Medie (idee nouă) | Neînceput |
| GBP + Gemini / sync GA4 / Search Breakdown | 🔴 Mare (completează gap #1) | Neînceput |
| GA4 canal "AI Assistant" (trafic ChatGPT/Gemini/Claude) | 🟡 Medie | Neverificat |
| Raport săptămânal automatizat (GSC+GA4+Ads) — idee proprie | — | ☑ 2/3 executat 2026-08-14 — extins `telegram-report.js` existent (Ads + GSC striking-distance) pe task-ul Windows deja programat la 2 zile; GA4 rămâne separat (Python, altă autentificare) |
| Bid-uri sezoniere Ads — idee proprie | 🟡 Medie | Neînceput |
| WhatsApp Business mesaj automat cu prețuri "ab" — idee proprie | — | Configurat 2026-08-14, apoi user a decis să NU-l folosească — nu insista, decizie luată |
| RäumScan intern gratuit — idee proprie | 🟡 Medie | Neînceput |
| Keyword Planner cu URL concurent (Google Ads) | — | ☑ Executat 2026-08-14 — 907 idei extrase din 6 concurenți, 3 keyword-uri noi adăugate live: "messie wohnungen" (vol 9.900), "sperrmüll karlsruhe" (vol 3.600), "entrümpelung in der nähe" (vol 4.400) |
| Plugin claude-ads (evaluare tool) | 🟡 Medie (necesită testare separată, nu contul live) | Neînceput |
| H1 per pagină = serviciu+oraș (verificare pattern) | 🟡 Medie | Neverificat |
| GBP Products/Offers/Posts folosite activ | 🔴 Mare (completează gap #1) | Neînceput |
| Conținut reactiv hyperlocal (evenimente zonă) | 🟡 Medie | Neînceput |
| Conținut "doar un local ar ști" | 🟡 Medie | Neînceput |
| Prezență utilă în grupuri FB/subreddit locale | 🟢 Mică | Neînceput |

*(secțiuni noi se adaugă per videoclip, pe măsură ce le trimiți)*
