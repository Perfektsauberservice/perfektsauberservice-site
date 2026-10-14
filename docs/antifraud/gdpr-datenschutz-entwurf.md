# PSS Anti-Click-Fraud — GDPR: evaluare + text de informare (ENTWURF, NEPUBLICAT)

Pagina Datenschutzerklärung de pe site **nu a fost modificată**. Textul de mai jos e o propunere și are nevoie de aprobarea Laurei (ideal și de verificarea unui specialist în protecția datelor).

## Ce se prelucrează (doar vizitele care vin dintr-un clic pe o reclamă Google: gclid/gbraid/wbraid)
- adresa IP, ora, pagina deschisă, identificatorul de clic Google;
- browserul (User-Agent) și limba browserului (Accept-Language);
- localizarea aproximativă (țară, land, oraș), calculată de Netlify din IP;
- operatorul de rețea (ASN, furnizor), aflat prin ipinfo.io;
- o amprentă pseudonimă: hash SHA-256 al antetelor de browser, ireversibil.

**Nu se folosesc** cookie-uri, localStorage sau scripturi pe dispozitiv. Totul se întâmplă pe server (Netlify Edge), deci § 25 TDDDG nu se aplică.

## Temei legal
Art. 6 alin. 1 lit. f GDPR: interesul legitim de a preveni frauda cu clicuri și abuzul bugetului de publicitate. Considerentul 47 numește explicit prevenirea fraudei ca interes legitim.

**Echilibrarea intereselor:**
- se prelucrează doar vizitele din reclame;
- date minime;
- păstrare scurtă;
- nu se face profilare în scop de marketing;
- excluderea unui IP înseamnă doar că, de pe acel IP, reclama nu mai este afișată.

## Destinatari / persoane împuternicite
- **Netlify, Inc.:** găzduirea și stocarea (Netlify Blobs). Există deja DPA/SCC pentru site.
- **ipinfo.io:** interogarea operatorului de rețea; se transmite doar IP-ul. ⚠️ Trebuie verificat DPA-ul / sediul (SUA).
- **Google Ireland Ltd.:** doar IP-urile/intervalele excluse, transmise ca excludere în contul Google Ads.
- **Telegram:** alertele interne către proprietară conțin IP-ul. ⚠️ Alternativă: alerte doar cu IP-ul trunchiat.
- **Furnizori de internet:** doar dacă Laura aprobă o sesizare de abuz, cu date minime (ora, IP, pagina).

## Păstrare
- Evenimentele brute și indexurile: **30 de zile**, apoi șterse automat (`runner.mjs purge`, zilnic).
- Excluderile active și dosarele de abuz: cât timp sunt necesare pentru excludere sau sesizare, verificate lunar.

## Text propus pentru Datenschutzerklärung (germană)

> **Schutz vor Klickbetrug bei Google-Ads-Anzeigen**
>
> Wenn Sie unsere Website über eine Google-Ads-Anzeige aufrufen, verarbeiten wir zur Erkennung und Abwehr von Klickbetrug (z. B. automatisierte oder wiederholte missbräuchliche Anzeigenklicks) folgende Daten: IP-Adresse, Zeitpunkt, aufgerufene Seite, die von Google übermittelte Klick-ID, Browser-Kennung (User-Agent), Browsersprache, ungefährer Standort (Land/Region/Stadt) sowie den Netzbetreiber der IP-Adresse. Es werden dabei keine Cookies gesetzt und keine Informationen auf Ihrem Endgerät gespeichert oder ausgelesen.
>
> Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt im Schutz unseres Werbebudgets vor betrügerischen Klicks. IP-Adressen, bei denen ein Missbrauch festgestellt wurde, können wir in unserem Google-Ads-Konto von der Anzeigenschaltung ausschließen; in begründeten Einzelfällen können wir den zuständigen Internetanbieter über den Missbrauch informieren.
>
> Empfänger: Netlify, Inc. (Hosting, Speicherung), ipinfo.io (Ermittlung des Netzbetreibers), Google Ireland Limited (Ausschluss von IP-Adressen). Eine Übermittlung in die USA erfolgt auf Grundlage des EU-U.S. Data Privacy Framework bzw. von Standardvertragsklauseln.
>
> Die Daten werden nach 30 Tagen gelöscht, sofern sie nicht für einen festgestellten Missbrauchsfall benötigt werden. Sie können der Verarbeitung aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO).

## De făcut înainte de producție
1. Laura aprobă textul (sau îl verifică un specialist) și îl adăugăm în Datenschutzerklärung. **Doar cu aprobare explicită.**
2. Verificare ipinfo.io: DPA și DPF. Alternativ, bază de date ASN locală, fără transfer.
3. Decizie: alerte Telegram cu IP complet sau trunchiat.
