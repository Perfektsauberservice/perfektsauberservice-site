// Build /reinigung — the super-hub for all 4 cleaning services.
// One landing page that aggregates Buero/End/Grund/Unterhalts.

import fs from 'node:fs';
import { renderCityService } from '../lib/render-city-service.mjs';
import { CITIES, ALL_TIER1_CITIES } from './cities.mjs';
import { SERVICES } from './services.mjs';

const SITE = 'https://perfektsauberservice.com';

function build() {
  const url = `${SITE}/reinigung`;

  const provider = {
    '@type': 'LocalBusiness', name: 'Perfekt Sauber Service',
    telephone: '+49 163 9087197', email: 'kontakt@perfektsauberservice.com',
    url: SITE, image: `${SITE}/images/echipa.webp`,
    address: { '@type':'PostalAddress', streetAddress:'Reutstraße 9', addressLocality:'Loffenau', postalCode:'76597', addressCountry:'DE' },
    priceRange:'€€',
    aggregateRating:{ '@type':'AggregateRating', ratingValue:'5.0', reviewCount:'2', bestRating:'5', worstRating:'1' },
  };

  const jsonLd = JSON.stringify([
    {
      '@context':'https://schema.org', '@type':'Service',
      name: 'Reinigungsservice', serviceType: 'Reinigung',
      description: 'Büroreinigung, Endreinigung, Grundreinigung und Unterhaltsreinigung in Mittelbaden, Karlsruhe und Umgebung. Festpreis nach Begehung, eigenes Personal, vollständig versichert.',
      provider,
      areaServed: ALL_TIER1_CITIES.map(c => CITIES[c].label),
      url,
    },
    {
      '@context':'https://schema.org', '@type':'FAQPage',
      mainEntity: [
        { '@type':'Question', name:'Welche Reinigungsleistungen bieten Sie an?', acceptedAnswer:{ '@type':'Answer', text:'Wir bieten vier Hauptleistungen: Büroreinigung (regelmäßig), Endreinigung (Auszug/Übergabe), Grundreinigung (einmalige Tiefenreinigung) und Unterhaltsreinigung (Treppenhäuser/Gemeinschaftsflächen). Alle mit Festpreis nach Begehung, eigenem Personal und vollständiger Versicherung.' } },
        { '@type':'Question', name:'Was ist der Unterschied zwischen Unterhalts- und Grundreinigung?', acceptedAnswer:{ '@type':'Answer', text:'Eine Unterhaltsreinigung hält den Alltagszustand sauber — sie passiert regelmäßig (wöchentlich, zweiwöchentlich) und behandelt sichtbare Flächen. Eine Grundreinigung geht in die Tiefe: hinter Möbeln, in Schränken, an Heizkörper-Rückseiten, Fugen. Empfohlen einmal jährlich oder vor speziellen Anlässen.' } },
        { '@type':'Question', name:'In welchen Städten reinigen Sie?', acceptedAnswer:{ '@type':'Answer', text:'Wir bedienen 13 Städte in Mittelbaden und Umgebung: Rastatt, Baden-Baden, Karlsruhe, Pforzheim, Ettlingen, Gaggenau, Gernsbach, Bühl, Sinzheim, Muggensturm, Stutensee, Rheinstetten und Achern. Auch in den umliegenden Gemeinden auf Anfrage.' } },
        { '@type':'Question', name:'Wie schnell ist ein Termin verfügbar?', acceptedAnswer:{ '@type':'Answer', text:'In der Regel innerhalb von 48 Stunden. Bei einmaligen Reinigungen oft am gleichen Tag möglich. Regelmäßige Verträge nach kurzer Begehung — wir starten meist innerhalb einer Woche.' } },
        { '@type':'Question', name:'Bekomme ich einen Festpreis?', acceptedAnswer:{ '@type':'Answer', text:'Ja, immer. Wir kalkulieren keine Stunden, sondern Festpreise nach Fläche und Aufwand. Was im Angebot steht, ist der Endpreis — keine versteckten Kosten.' } },
      ],
    },
    {
      '@context':'https://schema.org', '@type':'BreadcrumbList',
      itemListElement: [
        { '@type':'ListItem', position:1, name:'Startseite', item: `${SITE}/` },
        { '@type':'ListItem', position:2, name:'Leistungen', item: `${SITE}/leistungen` },
        { '@type':'ListItem', position:3, name: 'Reinigung', item: url },
      ],
    },
  ], null, 2);

  // Build "service cards" — one per Reinigung service
  const serviceCards = Object.values(SERVICES).map(s => ({
    title: s.label,
    desc: s.intro({ label: 'Mittelbaden' }).split('—')[0].replace(/Mittelbaden/g, 'der Region'),
  }));

  // Build "city x service" cross-grid as related links
  const COVERAGE = {
    bueroreinigung: ['achern','baden-baden','buehl','ettlingen','gaggenau','gernsbach','karlsruhe','muggensturm','pforzheim','rastatt','rheinstetten','sinzheim','stutensee'],
    endreinigung: ['achern','baden-baden','buehl','ettlingen','gaggenau','gernsbach','karlsruhe','muggensturm','pforzheim','rastatt','rheinstetten','sinzheim','stutensee'],
    grundreinigung: ALL_TIER1_CITIES,
    unterhaltsreinigung: ALL_TIER1_CITIES,
  };

  const cityServiceLinks = [];
  for (const [s, cities] of Object.entries(COVERAGE)) {
    for (const c of cities) {
      cityServiceLinks.push({ href: `/${s}-${c}`, label: `${SERVICES[s].label} ${CITIES[c].label}` });
    }
  }

  const sections = [
    {
      kind: 'cards',
      h2: 'Vier Reinigungsleistungen — eine Hand',
      intro: 'Vom regelmäßigen Bürodienst bis zur einmaligen Tiefen-Reinigung: alle Leistungen aus einer Hand, mit festem Personal, festem Preis und vollständiger Versicherung.',
      cards: serviceCards,
    },
    {
      kind: 'related',
      h2: 'Reinigungsleistungen pro Stadt',
      groups: [
        { links: Object.keys(SERVICES).map(s => ({ href: `/${s}`, label: SERVICES[s].label })) },
        { links: cityServiceLinks.slice(0, 30) },
        { links: cityServiceLinks.slice(30, 60) },
      ],
      h3s: [
        'Reinigungs-Hauptseiten',
        `Reinigungsleistungen pro Stadt (${cityServiceLinks.length} Kombinationen)`,
      ],
    },
    {
      kind: 'usps',
      h2: 'Warum Perfekt Sauber Service als Reinigungspartner?',
      usps: [
        { num: '5,0★', title: 'Echte Bewertungen', desc: 'Verlässliche Google-Bewertungen aus der Region — junge Firma, hohe Sorgfalt.' },
        { num: 'Eigen', title: 'Eigenes Personal', desc: 'Keine Subunternehmer, keine Tagesarbeiter. Eigene Mitarbeiter mit Vertrag und Ausbildung.' },
        { num: '100%', title: 'Festpreis-Garantie', desc: 'Keine Stundenabrechnung. Was im Angebot steht, bleibt der Endpreis.' },
        { num: '48h', title: 'Termin in 48 h', desc: 'Reaktionszeit für Anfragen werktags. Express-Termine für kurzfristige Übergaben.' },
        { num: '✓', title: 'Vollständig versichert', desc: 'Haftpflicht für alle Mitarbeiter — Schäden direkt mit Versicherung geregelt.' },
        { num: '€€', title: 'MwSt-Rechnung', desc: 'Ordentliche Geschäftsrechnung mit ausgewiesener MwSt — voll absetzbar.' },
      ],
    },
    {
      kind: 'faq',
      h2: 'Häufige Fragen zu unseren Reinigungsleistungen',
      faqs: [
        { q: 'Welche Reinigungsleistungen bieten Sie an?', a: 'Wir bieten vier Hauptleistungen: Büroreinigung (regelmäßig), Endreinigung (Auszug/Übergabe), Grundreinigung (einmalige Tiefenreinigung) und Unterhaltsreinigung (Treppenhäuser/Gemeinschaftsflächen). Alle mit Festpreis nach Begehung, eigenem Personal und vollständiger Versicherung.' },
        { q: 'Was ist der Unterschied zwischen Unterhalts- und Grundreinigung?', a: 'Eine Unterhaltsreinigung hält den Alltagszustand sauber — sie passiert regelmäßig (wöchentlich, zweiwöchentlich) und behandelt sichtbare Flächen. Eine Grundreinigung geht in die Tiefe: hinter Möbeln, in Schränken, an Heizkörper-Rückseiten, Fugen. Empfohlen einmal jährlich oder vor speziellen Anlässen.' },
        { q: 'In welchen Städten reinigen Sie?', a: 'Wir bedienen 13 Städte in Mittelbaden und Umgebung: Rastatt, Baden-Baden, Karlsruhe, Pforzheim, Ettlingen, Gaggenau, Gernsbach, Bühl, Sinzheim, Muggensturm, Stutensee, Rheinstetten und Achern. Auch in den umliegenden Gemeinden auf Anfrage.' },
        { q: 'Wie schnell ist ein Termin verfügbar?', a: 'In der Regel innerhalb von 48 Stunden. Bei einmaligen Reinigungen oft am gleichen Tag möglich. Regelmäßige Verträge nach kurzer Begehung — wir starten meist innerhalb einer Woche.' },
        { q: 'Bekomme ich einen Festpreis?', a: 'Ja, immer. Wir kalkulieren keine Stunden, sondern Festpreise nach Fläche und Aufwand. Was im Angebot steht, ist der Endpreis — keine versteckten Kosten.' },
        { q: 'Bringen Sie eigenes Material mit?', a: 'Standard ja: wir bringen alles mit (Reinigungsmittel, Tücher, Sauger, Wischsysteme). Wenn Sie spezielle Mittel oder Allergie-Produkte einsetzen möchten, übernehmen wir diese gerne nach Absprache.' },
        { q: 'Sind Sie auch für Praxen, Kanzleien und sensible Bereiche geeignet?', a: 'Ja. Wir haben Erfahrung mit Praxen, Kanzleien, Therapieräumen und sensiblen Gewerbeobjekten. Schweigepflicht-Bereiche werden mit fester Person und Geheimhaltungsvereinbarung betreut.' },
        { q: 'Was passiert bei Reklamationen?', a: 'Bei Beanstandungen kommen wir kostenlos zurück und bessern nach. Das ist Teil unserer Festpreis-Zusage — wir arbeiten, bis Sie zufrieden sind. Beschwerden werden meist innerhalb von 24 h behandelt.' },
      ],
    },
  ];

  const data = {
    title: 'Reinigung in Mittelbaden, Karlsruhe & Umgebung | Perfekt Sauber Service',
    metaDescription: 'Büroreinigung, Endreinigung, Grundreinigung und Unterhaltsreinigung in 13 Städten — Festpreis, eigenes Personal, versichert. Jetzt 0163 9087197 anrufen.',
    ogTitle: 'Reinigung in Mittelbaden, Karlsruhe & Umgebung | Perfekt Sauber Service',
    ogDescription: 'Fünf Reinigungsleistungen aus einer Hand — Festpreis, eigenes Personal, vollständig versichert.',
    ogUrl: url,
    ogImage: `${SITE}/images/lucrari/lucrare-3.jpg`,
    canonical: url,
    lang: 'de',
    jsonLdBlocks: [jsonLd],

    eyebrow: 'Reinigung · Mittelbaden · Karlsruhe · Nordschwarzwald',
    h1: 'Reinigung — sauber, planbar, mit Festpreis',
    sub: 'Vier Reinigungsleistungen aus einer Hand: Büro-, End-, Grund- und Unterhaltsreinigung in Rastatt, Baden-Baden, Karlsruhe, Pforzheim und der gesamten Region. Festpreis nach Begehung, eigenes Personal, vollständig versichert.',
    heroImg: '/images/lucrari/lucrare-3.jpg',
    heroImgAlt: 'Reinigungsteam von Perfekt Sauber Service in der Region Mittelbaden',
    waText: encodeURIComponent('Hallo, ich möchte eine Reinigungsanfrage stellen.'),

    trustItems: ['Termin in 48 h', 'Festpreis-Garantie', 'Eigenes Personal', 'Vollständig versichert'],

    crumbs: [
      { href: '/', label: 'Startseite' },
      { href: '/leistungen', label: 'Leistungen' },
    ],
    crumbCurrent: 'Reinigung',

    sections,
  };

  return renderCityService(data);
}

if (process.argv[1]?.endsWith('build-superhub.mjs')) {
  const html = build();
  fs.writeFileSync('reinigung.html', html);
  console.log(`✓ reinigung.html (${html.length} bytes)`);
}

export { build };
