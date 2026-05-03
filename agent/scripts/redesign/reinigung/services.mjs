// Service-specific content for Reinigung pages.
// Each service defines: meta, hero, price table rows, service cards, USPs,
// steps, generic FAQ pool. The city wrapper layers in Stadtteile + city-FAQ.

export const SERVICES = {
  bueroreinigung: {
    slug: 'bueroreinigung',
    label: 'Büroreinigung',
    labelDative: 'Büroreinigung',
    metaPrefix: 'Büroreinigung',
    intro: (city) => `Regelmäßige Büroreinigung in ${city.label} und Umgebung — diskret, zuverlässig, mit fester Ansprechperson und transparentem Festpreis. Ob Einzelbüro, Praxis oder Etage mit mehreren Räumen: wir reinigen so, dass es Ihre Mitarbeiter morgens nicht bemerken — und Ihre Besucher beim Eintreten doch sofort spüren.`,
    heroH1: (city) => `Büroreinigung ${city.label} — sauber, diskret, mit fester Ansprechperson`,
    heroSub: (city) => `Wöchentliche, zweiwöchentliche oder monatliche Reinigung Ihrer Büros, Praxen und Gewerberäume in ${city.label}. Festpreis nach Begehung, kurze Reaktionszeiten, eigenes Personal — keine wechselnden Subunternehmer.`,
    eyebrow: (city) => `${city.label} & Umgebung`,
    heroImage: '/images/lucrari/lucrare-3.jpg',
    heroImageAlt: (city) => `Büroreinigung in ${city.label} — Reinigungsteam von Perfekt Sauber Service`,
    priceFromEur: 35,
    priceTable: {
      h2: (city) => `Was kostet eine Büroreinigung in ${city.label}?`,
      intro: (city) => `Regelmäßige Reinigungen werden nach Aufwand und Frequenz kalkuliert. Hier eine ehrliche Orientierung für ${city.label} — den verbindlichen Festpreis nennen wir nach kurzer Begehung vor Ort.`,
      headers: ['Bürotyp / Frequenz','Beispiel','Preis ab'],
      rows: [
        ['<strong>Einzelbüro</strong> (bis 30 m²)','Anwaltspraxis, Therapieraum, Coworking-Platz','ab 35 €/Termin'],
        ['<strong>Standardbüro</strong> (30–80 m²)','Kleinunternehmen, Steuerkanzlei, kleine Praxis','ab 65 €/Termin'],
        ['<strong>Großraumbüro</strong> (80–150 m²)','Open-Space, mittlere Firma, Mehr-Raum-Praxis','ab 95 €/Termin'],
        ['<strong>Etage / Komplexe</strong> (150 m²+)','Mehrere Etagen, Praxisgemeinschaft, Verwaltung','Festpreis nach Begehung'],
      ],
      note: `<strong>Im Festpreis enthalten:</strong> Staubsaugen, Wischen, Sanitäranlagen, Küche/Teeküche, Glasflächen innen, Müll entsorgen, Grundreinigung von Oberflächen. Material und Geräte bringen wir mit. Aufpreise nur bei Sonderwünschen (Glasreinigung außen, Polsterreinigung, einmalige Grundreinigung). Vollständige Berechnung im <a href="/preisrechner">Preisrechner</a>.`,
    },
    services: {
      h2: (city) => `Was wir bei einer Büroreinigung in ${city.label} übernehmen`,
      intro: () => `Vom Empfang bis zum Konferenzraum — wir reinigen, was Ihre Kunden und Mitarbeiter täglich sehen und berühren. Mit eigenem Personal, festem Ablaufplan und schriftlichem Reinigungsprotokoll auf Wunsch.`,
      cards: [
        { title: '🧴 Allgemeine Räume', desc: 'Schreibtische, Ablagen, Stühle und Türgriffe werden trocken oder feucht gereinigt. Böden gesaugt und gewischt. Papierkörbe geleert. Sichtbare Flächen abgewischt.' },
        { title: '🚿 Sanitärbereiche', desc: 'WC, Waschbecken, Spiegel, Armaturen, Bodenflächen — gereinigt und desinfiziert. Verbrauchsmaterial nach Vereinbarung nachgefüllt.' },
        { title: '🍽️ Küche / Teeküche', desc: 'Arbeitsflächen, Spüle, Außenseiten der Geräte, Tische und Stühle. Geschirrspüler entladen auf Wunsch. Mülltrennung nach lokalen Vorgaben.' },
        { title: '🪟 Glas & Innenfenster', desc: 'Eingangsglasflächen, Trennwände, Innenfenster bis Greifhöhe. Außenfensterreinigung als Sonderleistung buchbar.' },
      ],
    },
    usps: [
      { num: '5,0★', title: 'Echte Google-Bewertungen', desc: 'Verlässliche Bewertungen aus der Region — junge Firma, jede Empfehlung verdient.' },
      { num: 'Fix', title: 'Feste Ansprechperson', desc: 'Sie sprechen immer mit derselben Person. Keine wechselnden Hotlines.' },
      { num: 'Eigen', title: 'Eigenes Personal', desc: 'Keine Subunternehmer. Eigene, eingearbeitete Mitarbeiter — gleichbleibende Qualität.' },
      { num: '100%', title: 'Festpreis-Garantie', desc: 'Was im Vertrag steht, bleibt der Preis. Keine versteckten Aufschläge.' },
      { num: '24h', title: 'Reaktionszeit', desc: 'Anfragen werktags innerhalb von 24 Stunden beantwortet — meist schneller.' },
      { num: '€€', title: 'MwSt-Rechnung', desc: 'Ordentliche Geschäftsrechnung mit ausgewiesener MwSt — voll absetzbar.' },
    ],
    steps: [
      { title: 'Anfrage', desc: 'Per Anruf, WhatsApp oder Formular. Ein paar Fotos beschleunigen die Einschätzung.' },
      { title: 'Begehung', desc: 'Kostenlos vor Ort, meist in 24–48 h. Wir besprechen Frequenz, Schwerpunkte und Sonderwünsche.' },
      { title: 'Festpreis & Vertrag', desc: 'Schriftlicher Reinigungsplan mit verbindlichem Pauschalpreis pro Termin. Kündbar wie vereinbart.' },
      { title: 'Reinigung', desc: 'Festes Personal, fester Tag, festes Zeitfenster. Material und Geräte bringen wir mit.' },
      { title: 'Qualität', desc: 'Auf Wunsch monatlicher Bericht oder Begehungsprotokoll. Unzufrieden? Wir bessern bis Sie zufrieden sind.' },
    ],
    genericFaqs: [
      { q: (city) => `Wie oft sollte ein Büro in ${city.label} gereinigt werden?`, a: (city) => `Das hängt von Personenzahl und Nutzung ab. Üblich sind 1–3 Termine pro Woche bei normaler Nutzung. Praxen und Kanzleien wählen oft tägliche Reinigung der Sanitärbereiche und 2–3× Wöchentlich für Büros. Wir empfehlen nach Begehung das passende Intervall.` },
      { q: (city) => `Bekomme ich in ${city.label} immer das gleiche Reinigungspersonal?`, a: () => `Ja. Wir teilen Ihnen ein festes Team zu — gleiche Personen, gleicher Tag, gleicher Ablauf. Bei Urlaub oder Krankheit informieren wir Sie vorab und stellen eine eingearbeitete Vertretung.` },
      { q: () => `Ist eine Mindestlaufzeit nötig?`, a: () => `Nein. Sie können auch nur einmal eine Reinigung beauftragen. Für regelmäßige Verträge empfehlen wir eine 3-Monats-Frist mit monatlicher Kündigung danach — schafft Planungssicherheit für beide Seiten.` },
      { q: () => `Wer haftet bei Schäden während der Reinigung?`, a: () => `Wir sind vollständig haftpflichtversichert. Schäden werden in der Regel direkt mit der Versicherung abgewickelt. Außerdem führen wir bei Vertragsabschluss ein gemeinsames Übergabeprotokoll, das den Zustand vor Beginn dokumentiert.` },
      { q: () => `Bringen Sie eigenes Material mit oder nutzen Sie unseres?`, a: () => `Standard ist: wir bringen alles mit (Reinigungsmittel, Tücher, Sauger, Wischsysteme). Wenn Sie spezielle Mittel oder Allergie-Produkte einsetzen möchten, übernehmen wir diese gerne nach Absprache.` },
      { q: () => `Was ist mit Schlüsseln oder Zugangskarten?`, a: () => `Schlüsselübergaben werden vertraglich dokumentiert. Wir bewahren Ihre Schlüssel in einem versperrten Safe auf und führen ein Schlüsselbuch. Auf Wunsch arbeiten wir auch mit Zahlencodes oder Schließfächern.` },
      { q: () => `Werden auch Wochenenden oder Abendzeiten bedient?`, a: () => `Ja, gerne. Viele Kunden bevorzugen Reinigungstermine außerhalb der Bürozeiten — also abends ab 18 Uhr oder am Wochenende. Aufpreis bei Wochenend-/Feiertagseinsätzen liegt typischerweise bei +10 %.` },
    ],
    related: (city) => [
      { groupTitle: `Weitere Reinigungsleistungen in ${city.label}`, links: [
        { href: `/endreinigung-${city.label === 'Karlsruhe' ? 'karlsruhe' : (city.label === 'Baden-Baden' ? 'baden-baden' : (city.label === 'Rastatt' ? 'rastatt' : Object.keys({}).length))}`, label: '...' },
      ]},
    ],
  },

  endreinigung: {
    slug: 'endreinigung',
    label: 'Endreinigung',
    labelDative: 'Endreinigung',
    metaPrefix: 'Endreinigung',
    intro: (city) => `Endreinigung bei Auszug in ${city.label} und Umgebung — besenrein, übergabefertig und mit Garantie der Mietkautionsabnahme. Wir reinigen so, dass der Vermieter beim Wohnungsübergabetermin keinen Punkt mehr findet. Festpreis nach Besichtigung.`,
    heroH1: (city) => `Endreinigung ${city.label} — übergabefertig, Mietkaution-tauglich`,
    heroSub: (city) => `Auszugsreinigung, Bauendreinigung und Übergabe-Reinigung in ${city.label}. Wir wissen, worauf Vermieter, Hausverwaltungen und Notare achten — und liefern das, bevor sie überhaupt nachfragen.`,
    eyebrow: (city) => `${city.label} & Umgebung`,
    heroImage: '/images/lucrari/lucrare-5.jpg',
    heroImageAlt: (city) => `Endreinigung in ${city.label} nach Auszug — Perfekt Sauber Service`,
    priceFromEur: 242,
    priceTable: {
      h2: (city) => `Was kostet eine Endreinigung in ${city.label}?`,
      intro: (city) => `Endreinigungen kalkulieren wir nach Wohnfläche und Zustand. Die Tabelle zeigt typische Festpreise für ${city.label} — den verbindlichen Endpreis nennen wir nach kurzer Besichtigung oder nach Fotos per WhatsApp.`,
      headers: ['Wohnfläche','Beispiel','Preis ab'],
      rows: [
        ['<strong>RW 1</strong> (ca. 25–35 m²)','1-Zimmer-Wohnung, Studentenappartement','ab 242 €'],
        ['<strong>RW 2</strong> (ca. 35–50 m²)','2-Zimmer-Wohnung, kleine Praxis','ab 342 €'],
        ['<strong>RW 3</strong> (ca. 50–70 m²)','3-Zimmer-Wohnung, Familienwohnung','ab 382 €'],
        ['<strong>RW 4</strong> (ca. 70–90 m²)','4-Zimmer-Wohnung, größere Familie','ab 422 €'],
        ['<strong>RW 5</strong> (ca. 90–120 m²)','5-Zimmer-Wohnung, Reihenhaus','ab 452 €'],
      ],
      note: `<strong>Im Festpreis enthalten:</strong> Böden, Sanitäranlagen, Küche inkl. Geräte (außen), Fenster innen, Heizkörper, Türrahmen, Schalter, Innenseiten der Schränke wenn leer. Aufpreise nur bei Sonderfällen (Backofen tief verkrustet +35 €, Fenster außen +pro Fenster, Polsterreinigung). Vollständige Berechnung im <a href="/preisrechner">Preisrechner</a>.`,
    },
    services: {
      h2: (city) => `Was wir bei einer Endreinigung in ${city.label} machen`,
      intro: () => `Wir folgen einer festen Checkliste, die alle gängigen Übergabeprotokolle der großen Hausverwaltungen abdeckt. So gibt es bei der Wohnungsübergabe keine Überraschungen.`,
      cards: [
        { title: '🛁 Sanitär & Bad', desc: 'Wanne, Dusche, WC, Waschbecken, Armaturen, Spiegel, Fliesen — entkalkt und desinfiziert. Silikonfugen werden geprüft und auf Wunsch erneuert (Aufpreis).' },
        { title: '🍳 Küche', desc: 'Schränke außen und innen (wenn leer), Arbeitsplatten, Spüle, Backofen, Cerankochfeld, Dunstabzug, Spülmaschine, Kühlschrank — gründlich gereinigt.' },
        { title: '🪟 Fenster & Türen', desc: 'Fenster innen, Rahmen, Türen, Türzargen, Lichtschalter, Steckdosen — abgewischt und auf Schäden geprüft. Außenseiten der Fenster auf Wunsch (Aufpreis).' },
        { title: '🧹 Böden & Flächen', desc: 'Alle Bodenbeläge gesaugt und gewischt: Parkett, Laminat, Fliesen, Teppich. Heizkörper, Sockelleisten, Türstöcke. Auf Wunsch Polierschicht für Parkett (+).' },
      ],
    },
    usps: [
      { num: '5,0★', title: 'Mietkaution-Garantie', desc: 'Sollte der Vermieter wider Erwarten Beanstandungen haben, bessern wir kostenlos nach.' },
      { num: '48h', title: 'Termin-Garantie', desc: 'In der Regel innerhalb von 48 h vor Ort. Express-Termine bei kurzfristigen Übergaben.' },
      { num: '✓', title: 'Übergabe-Checkliste', desc: 'Wir arbeiten nach den Checklisten der gängigen Hausverwaltungen — nichts vergessen.' },
      { num: '100%', title: 'Festpreis', desc: 'Keine Stundenabrechnung, keine versteckten Kosten. Was wir vereinbaren, gilt.' },
      { num: 'WE', title: 'Wochenend-Termine', desc: 'Auch samstags und sonntags möglich (+10 % Aufschlag) — perfekt vor Wohnungsübergaben am Montag.' },
      { num: '€€', title: 'MwSt-Rechnung', desc: 'Bei Bedarf für Steuererklärung oder Abrechnung mit dem Vermieter.' },
    ],
    steps: [
      { title: 'Anfrage', desc: 'Per Anruf, WhatsApp oder Formular. Mit Fotos geht es am schnellsten.' },
      { title: 'Besichtigung', desc: 'Kostenlos und unverbindlich, meist innerhalb von 24–48 h möglich.' },
      { title: 'Festpreis', desc: 'Schriftliches Angebot mit verbindlichem Pauschalpreis. Sie wissen vorher, was es kostet.' },
      { title: 'Reinigung', desc: 'Wir kommen pünktlich, bringen alles mit, reinigen nach Checkliste. Sie können dabei sein oder nicht.' },
      { title: 'Übergabe', desc: 'Auf Wunsch begleiten wir die Wohnungsübergabe mit dem Vermieter — und bessern bei Bedarf direkt nach.' },
    ],
    genericFaqs: [
      { q: (city) => `Was kostet eine Endreinigung in ${city.label}?`, a: (city) => `Eine Endreinigung in ${city.label} startet bei rund 242 € für eine 1-Zimmer-Wohnung (RW 1). Bei einer 3-Zimmer-Wohnung (RW 3, ca. 50–70 m²) liegen die Kosten typischerweise bei 382 € als Festpreis. Wir kalkulieren nach Wohnfläche, nicht nach Stunden — Sie wissen vorher genau, was Sie zahlen.` },
      { q: () => `Wann sollte ich die Endreinigung beauftragen?`, a: () => `Idealerweise 1–2 Tage vor der Wohnungsübergabe, nachdem die Möbel raus sind. Bei kurzfristigen Übergaben sind auch Same-Day-Termine möglich (Aufschlag), für Wochenend-Übergaben am Montag bieten wir Samstag-Reinigungen an.` },
      { q: () => `Garantieren Sie, dass der Vermieter zufrieden ist?`, a: () => `Ja. Sollte der Vermieter wider Erwarten Beanstandungen haben, kommen wir kostenlos zurück und bessern nach. Das ist Teil unserer Festpreis-Zusage. In der Praxis kommt das selten vor — wir arbeiten nach den Checklisten der gängigen Hausverwaltungen.` },
      { q: () => `Was ist mit Backofen, Cerankochfeld und Dunstabzug?`, a: () => `Standard. Backofen wird mit Backofen-Reiniger eingeweicht und gründlich gereinigt (auch verkrustete). Cerankochfeld wird mit Spezialreiniger und Klingenschaber bearbeitet. Dunstabzug innen und außen, Filter werden gereinigt oder auf Wunsch erneuert (Aufpreis Material).` },
      { q: () => `Reinigen Sie auch Teppichböden?`, a: () => `Saugen und Fleckenbehandlung sind im Festpreis enthalten. Tiefenreinigung mit Sprühextraktion (Polster-Reinigung) ist eine Sonderleistung und wird separat berechnet — typischerweise 6–12 €/m².` },
      { q: () => `Reinigen Sie auch Fenster außen?`, a: () => `Innen ja, außen auf Wunsch gegen Aufpreis. Bei normalen Wohnungsfenstern liegt der Aufpreis typischerweise bei 4–8 €/Fenster. Bei schwer zugänglichen Fenstern (höhere Etagen ohne Balkon) klären wir die Sicherheitslage vor Ort.` },
      { q: () => `Wer übernimmt die Entsorgung von Restmüll und Sperrgut?`, a: () => `Bei der Endreinigung leeren wir vorhandene Mülleimer und entsorgen kleinere Mengen. Sperrgut (alte Möbel, Elektrogeräte) ist Sache der Wohnungsauflösung — diese Leistung können wir kombiniert anbieten (siehe Wohnungsauflösung).` },
    ],
    related: () => [],
  },

  grundreinigung: {
    slug: 'grundreinigung',
    label: 'Grundreinigung',
    labelDative: 'Grundreinigung',
    metaPrefix: 'Grundreinigung',
    intro: (city) => `Grundreinigung in ${city.label} und Umgebung — die einmalige Tiefen-Reinigung, die Wohnungen, Praxen und Büros wieder wie neu macht. Anders als die regelmäßige Unterhaltsreinigung gehen wir bei der Grundreinigung an alle Stellen, die im Alltag liegenbleiben: hinter Schränken, in Fugen, in Lampen, auf Heizkörpern.`,
    heroH1: (city) => `Grundreinigung ${city.label} — die Tiefenreinigung, die wirklich tief geht`,
    heroSub: (city) => `Einmalige Grundreinigung für Wohnungen, Praxen und Büros in ${city.label}. Ideal vor Einzug, nach Renovierung, vor wichtigen Terminen oder einmal jährlich. Festpreis nach Besichtigung.`,
    eyebrow: (city) => `${city.label} & Umgebung`,
    heroImage: '/images/lucrari/lucrare-7.jpg',
    heroImageAlt: (city) => `Grundreinigung in ${city.label} — Tiefenreinigung durch Perfekt Sauber Service`,
    priceFromEur: 282,
    priceTable: {
      h2: (city) => `Was kostet eine Grundreinigung in ${city.label}?`,
      intro: (city) => `Eine Grundreinigung dauert deutlich länger als eine Unterhaltsreinigung — wir arbeiten in alle Tiefen. Hier eine Orientierung für ${city.label}:`,
      headers: ['Wohnfläche','Beispiel','Preis ab'],
      rows: [
        ['<strong>RW 1</strong> (ca. 25–35 m²)','1-Zimmer-Wohnung, Studio','ab 282 €'],
        ['<strong>RW 2</strong> (ca. 35–50 m²)','2-Zimmer-Wohnung','ab 382 €'],
        ['<strong>RW 3</strong> (ca. 50–70 m²)','3-Zimmer-Wohnung, kleine Praxis','ab 482 €'],
        ['<strong>RW 4</strong> (ca. 70–90 m²)','4-Zimmer-Wohnung, mittlere Praxis','ab 582 €'],
        ['<strong>RW 5</strong> (ca. 90–120 m²)','große Familie, Etagen-Praxis','ab 682 €'],
      ],
      note: `<strong>Im Festpreis enthalten:</strong> Tiefenreinigung aller Räume, Fenster innen + Rahmen + Lichteinfasse, Heizkörper inkl. Rückseiten, Fußleisten, Türen + Türstöcke, Schaltkomponenten, Sanitär entkalkt, Küchengeräte innen, Innenseiten leerer Schränke. Vollständige Berechnung im <a href="/preisrechner">Preisrechner</a>.`,
    },
    services: {
      h2: (city) => `Was wir bei einer Grundreinigung in ${city.label} alles machen`,
      intro: () => `Eine Grundreinigung ist nicht nur "stärker" als eine Unterhaltsreinigung — sie geht an Stellen, die regelmäßig nicht erreicht werden. Hier die Standard-Punkte:`,
      cards: [
        { title: '🛋️ Hinter und unter Möbeln', desc: 'Wir bewegen leichte Möbel (Sofa, Sessel, Tische) und reinigen die Flächen darunter und dahinter. Auch Sockelleisten und Heizkörper-Rückseiten.' },
        { title: '🪟 Fenster + Rahmen + Lichteinfass', desc: 'Glasflächen innen, Rahmen, Schienen, Dichtungen, Lichteinfass — alles entstaubt und entfettet. Außenseiten auf Wunsch (Aufpreis).' },
        { title: '🍳 Küche tief', desc: 'Innenseiten der Schränke (wenn leer geräumt), Backofen mit Spezialreiniger, Cerankochfeld mit Klinge, Dunstabzug innen, Kühlschrank mit Türdichtungen.' },
        { title: '🛁 Sanitär entkalkt', desc: 'Wanne, Dusche, WC, Armaturen, Fliesen, Fugen — mit professionellem Entkalker behandelt. Silikonfugen geprüft, Schimmel-Spots behandelt.' },
      ],
    },
    usps: [
      { num: '5,0★', title: 'Echte Bewertungen', desc: 'Verlässliche Google-Bewertungen aus der Region — junge Firma mit hoher Sorgfalt.' },
      { num: '1×', title: 'Einmaliger Termin', desc: 'Keine Verträge, keine Mindestlaufzeiten. Sie buchen genau einmal.' },
      { num: 'Tief', title: 'Wirklich gründlich', desc: 'Eine Grundreinigung dauert 4–8 h für eine 3-Zimmer-Wohnung. Wir arbeiten nicht auf Zeit — wir arbeiten bis es passt.' },
      { num: '100%', title: 'Festpreis', desc: 'Keine Stunden-Abrechnung. Was im Angebot steht, ist der Endpreis.' },
      { num: '€€', title: 'MwSt-Rechnung', desc: 'Auf Wunsch ordentliche Geschäftsrechnung mit ausgewiesener MwSt.' },
      { num: '✓', title: 'Versichert', desc: 'Vollständige Haftpflichtversicherung. Schäden werden direkt mit der Versicherung abgewickelt.' },
    ],
    steps: [
      { title: 'Anfrage', desc: 'Per Anruf, WhatsApp oder Formular. Mit Fotos geht es schneller — wir können Aufwand besser schätzen.' },
      { title: 'Besichtigung', desc: 'Kostenlos vor Ort. Wir besprechen Schwerpunkte (z.B. Schimmelflecken, verkrusteter Backofen, vergilbte Fugen).' },
      { title: 'Festpreis', desc: 'Schriftliches Angebot mit Aufschlüsselung der Sonderpunkte (z.B. Silikonfugen erneuern, Polsterreinigung).' },
      { title: 'Reinigung', desc: 'Wir kommen mit allem Material und Geräten. 4–8 h für eine 3-Zimmer-Wohnung. Sie müssen nicht da sein.' },
      { title: 'Abnahme', desc: 'Auf Wunsch gemeinsame Abnahme mit Begehung. Falls etwas nicht passt: wir bessern nach, ohne Aufpreis.' },
    ],
    genericFaqs: [
      { q: () => `Was ist der Unterschied zwischen Grundreinigung und Unterhaltsreinigung?`, a: () => `Eine Unterhaltsreinigung hält den Alltagszustand sauber — sie passiert regelmäßig (wöchentlich, zweiwöchentlich) und behandelt sichtbare Flächen. Eine Grundreinigung geht in die Tiefe: hinter Möbeln, in Schränken, an Heizkörper-Rückseiten, Fenster-Rahmen, Fugen und Lampen. Empfohlen einmal jährlich oder vor speziellen Anlässen (Einzug, Auszug, Renovierung, Verkauf).` },
      { q: () => `Wie lange dauert eine Grundreinigung?`, a: () => `Für eine 3-Zimmer-Wohnung (50–70 m²) typischerweise 4–6 Stunden mit zwei Personen. Bei stark verschmutzten oder lange nicht gereinigten Wohnungen 8–12 Stunden. Bei Vertragsabschluss schätzen wir die Dauer vor Ort und planen entsprechend.` },
      { q: () => `Wann sollte man eine Grundreinigung beauftragen?`, a: () => `Klassische Anlässe: vor dem Einzug in eine neue Wohnung, nach einer Renovierung (Staub aus jeder Ritze), vor Verkauf oder Vermietung (Wertsteigerung), einmal jährlich als Reset, nach längerem Leerstand oder als Vorbereitung auf eine regelmäßige Unterhaltsreinigung.` },
      { q: () => `Reinigen Sie auch Teppichböden tief?`, a: () => `Saugen, Fleckenbehandlung und Geruchsneutralisierung sind im Festpreis enthalten. Sprühextraktions-Reinigung (Tiefenreinigung mit Spezialgerät, ca. 6–12 €/m²) wird separat berechnet — empfehlenswert bei Tierhaarallergie oder lange nicht gereinigten Teppichen.` },
      { q: () => `Was passiert mit verkrusteten Backöfen oder Cerankochfeldern?`, a: () => `Standard im Preis enthalten. Wir verwenden Profi-Backofenreiniger mit Einwirkzeit, Klingenschaber für Cerankochfelder und Spezialschwämme. Auch jahrelang nicht gereinigte Backöfen werden in der Regel deutlich besser — restlose Entfernung kann nur bei Email-Schäden nicht garantiert werden.` },
      { q: () => `Können Sie auch Schimmel entfernen?`, a: () => `Sichtbare Schimmel-Spots in Fugen oder Silikon können wir mit Schimmelentferner behandeln. Bei starkem Befall (mehr als oberflächlich) empfehlen wir einen Schimmel-Sachverständigen — das ist ein Bauschaden, kein Reinigungsthema.` },
      { q: () => `Müssen Möbel ausgeräumt sein?`, a: () => `Für die maximale Wirkung ja. Wir können auch mit Möbeln arbeiten, dann reinigen wir um sie herum. Wenn Möbel ausgeräumt sind (z.B. vor Einzug), kommt der volle Effekt zustande.` },
    ],
    related: () => [],
  },
};

// City-specific FAQ supplement: 1-2 questions that mention real local context
export function cityFaqs(serviceSlug, city) {
  const faqs = [];
  // 1) Stadtteile coverage
  const sample = city.districts.slice(0, 4).join(', ');
  faqs.push({
    q: `In welchen Stadtteilen von ${city.label} sind Sie aktiv?`,
    a: `Wir sind in ganz ${city.label} im Einsatz, darunter ${sample} sowie ${city.districts.length > 4 ? city.districts.slice(4, 8).join(', ') : 'alle weiteren Lagen'}. Für das Umland gilt: ${city.umland}. Sprechen Sie uns auch an, wenn Ihr Stadtteil nicht in der Liste steht — wir bedienen die gesamte Region Mittelbaden / Karlsruher Raum.`,
  });
  // 2) Wertstoffhof / lokale Spezifik (only for end + grund where waste matters)
  if (serviceSlug === 'endreinigung' || serviceSlug === 'grundreinigung') {
    faqs.push({
      q: `Wohin kommt der Müll aus der Reinigung in ${city.label}?`,
      a: `Restmüll und Verpackungen entsorgen wir nach den Vorgaben der Stadt ${city.label}. Größere Mengen oder Sondermüll (Farben, Lacke) werden zum ${city.wertstoffhof} gebracht. Bei Auszugsreinigungen mit Sperrgut empfehlen wir die Kombination mit unserer Wohnungsauflösung — dann ist alles aus einer Hand.`,
    });
  }
  return faqs;
}
