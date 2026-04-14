/**
 * Agent 14 — City Pages Generator
 *
 * Citește article-topics.json, găsește orașele care au articole pe blog
 * dar nu au paginile extra de servicii, și le generează automat.
 *
 * Servicii extra generate:
 *   kellerentruempelung, dachbodenentruempelung, garagenentruempelung,
 *   bueroaufloesung, nachlassaufloesung, messi-wohnung
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── Config servicii ──────────────────────────────────────────────────────────

const SERVICES = [
  {
    slug: 'kellerentruempelung',
    name: 'Kellerentrümpelung',
    title: (city) => `Kellerentrümpelung ${city} | Perfekt Sauber Service`,
    desc: (city) => `Kellerentrümpelung in ${city}: Wir räumen überfüllte oder lange ungenutzte Kellerräume strukturiert, diskret und besenrein. Kostenlose Besichtigung und unverbindliche Einschätzung.`,
    heroText: (city) => `Wir räumen überfüllte oder lange ungenutzte Kellerräume in ${city} strukturiert, diskret und mit sauberer Übergabe.`,
    sections: (city) => [
      { h: `Wann eine Kellerentrümpelung in ${city} sinnvoll ist`, p: `Viele Keller werden über Jahre zu Abstellräumen für Dinge, die eigentlich nicht mehr gebraucht werden. Irgendwann bleibt kaum noch Platz, Wege sind zugestellt oder der Raum soll wieder nutzbar gemacht werden. Genau dann ist eine Kellerentrümpelung in ${city} sinnvoll.` },
      { h: `Worauf es bei Kellerräumen in ${city} besonders ankommt`, p: `Eine Kellerentrümpelung ist oft anders als eine normale Wohnungsräumung. Häufig spielen Treppen, enge Türen, niedrige Decken, schwere Gegenstände oder lange Wege bis zum Ausgang eine Rolle. Deshalb ist es wichtig, den Keller nicht nur schnell, sondern auch durchdacht zu räumen.` },
      { h: `So läuft die Kellerentrümpelung in ${city} ab`, p: `Zuerst wird eingeschätzt, wie groß der Aufwand ist und welche Bereiche betroffen sind. Danach wird geplant, wie der Keller am sinnvollsten geräumt werden kann. Ziel ist immer ein klarer Ablauf, damit der Raum am Ende wieder frei und ordentlich nutzbar ist.` },
    ],
    cards: [
      { t: 'Privatkeller', p: `Klassische Kellerräume in Einfamilienhäusern oder Mehrfamilienhäusern, in denen sich über lange Zeit Möbel, Kartons oder alte Haushaltsgegenstände angesammelt haben.` },
      { t: 'Kellerräume nach Umzug', p: `Wenn ein Objekt übergeben werden soll oder ein Keller noch geräumt werden muss, obwohl die eigentliche Wohnung schon leer ist.` },
      { t: 'Nebenräume mit gemischtem Inhalt', p: `Keller mit Regalen, Altgeräten, Fahrrädern, Werkzeug oder alten Gegenständen aus mehreren Haushalten.` },
      { t: 'Mehrere Räume gleichzeitig', p: `Auch wenn mehrere Kellerräume oder zusätzliche Nebenflächen betroffen sind, kann die Planung zusammengefasst werden.` },
    ],
    faqs: (city) => [
      { q: `Kann ich auch nur einen kleinen Kellerraum in ${city} anfragen?`, a: `Ja, auch kleinere Kellerräume oder einzelne Kellerabteile können separat angefragt werden.` },
      { q: `Was ist, wenn der Keller schwer zugänglich ist?`, a: `Auch enge Zugänge, Treppen oder längere Wege können bei der Planung berücksichtigt werden.` },
      { q: `Ist eine erste Einschätzung ohne Vor-Ort-Termin möglich?`, a: `Oft ja. Für eine erste Orientierung reichen häufig schon einige Fotos und kurze Angaben zum Umfang.` },
    ],
    ctaText: (city) => `Wenn Sie Ihren Keller in ${city} räumen lassen möchten, schicken Sie uns kurz, wie viele Räume betroffen sind und ob es Besonderheiten beim Zugang gibt.`,
  },
  {
    slug: 'dachbodenentruempelung',
    name: 'Dachbodenentümpelung',
    title: (city) => `Dachbodenentümpelung ${city} | Perfekt Sauber Service`,
    desc: (city) => `Dachbodenentümpelung in ${city}: Wir räumen vollgestellte Dachböden sicher und effizient. Enge Luken, steile Treppen, Hitze – kein Problem für unser erfahrenes Team.`,
    heroText: (city) => `Dachböden in ${city} professionell räumen – sicher, effizient und ohne unnötigen Aufwand für Sie.`,
    sections: (city) => [
      { h: `Warum eine Dachbodenentümpelung in ${city} oft unterschätzt wird`, p: `Dachböden sammeln über Jahrzehnte an: alte Möbel, Koffer, Bücher, Elektrogeräte und vieles mehr. Dazu kommen oft schwierige Zugänge über enge Luken oder steile Treppen, extreme Temperaturen und geringe Standfläche. Genau hier hilft Perfekt Sauber Service in ${city}.` },
      { h: `Worauf wir beim Dachboden in ${city} besonders achten`, p: `Der Zugang über Treppen oder Luken erfordert besondere Sorgfalt beim Transport. Wir planen den Ablauf so, dass auch schwere oder sperrige Gegenstände sicher nach unten gebracht werden – ohne Schäden an Wänden oder Böden.` },
      { h: `Ablauf der Dachbodenentümpelung in ${city}`, p: `Nach einer kurzen Einschätzung (oft per Foto) planen wir den Einsatz. Der Dachboden wird systematisch geräumt, Verwertbares sortiert, der Rest fachgerecht entsorgt. Am Ende erhalten Sie einen sauberen, nutzbaren Dachboden.` },
    ],
    cards: [
      { t: 'Alte Möbel & Haushaltsgegenstände', p: `Schränke, Truhen, Kisten und Hausrat, der sich über Generationen angesammelt hat.` },
      { t: 'Elektroschrott & Geräte', p: `Alte Fernseher, Radios, Elektrogeräte – fachgerechte Entsorgung inklusive.` },
      { t: 'Bücher, Zeitschriften, Papier', p: `Große Mengen Papier, Bücher oder Archive werden sortiert und entsorgt.` },
      { t: 'Sperrmüll & Diverses', p: `Alles was nicht mehr gebraucht wird – egal ob groß oder klein.` },
    ],
    faqs: (city) => [
      { q: `Kann der Dachboden in ${city} auch bei engem Zugang geräumt werden?`, a: `Ja. Auch über schmale Luken oder steile Treppen können wir sicher räumen.` },
      { q: `Was passiert mit noch nutzbaren Gegenständen?`, a: `Auf Wunsch werden verwertbare Gegenstände aussortiert und weitergegeben oder der Restwert angerechnet.` },
      { q: `Wie lange dauert eine Dachbodenräumung?`, a: `Das hängt vom Umfang ab. Kleine Dachböden schaffen wir oft an einem halben Tag.` },
    ],
    ctaText: (city) => `Lassen Sie uns wissen, wie voll Ihr Dachboden in ${city} ist und wie der Zugang aussieht – am besten mit ein paar Fotos.`,
  },
  {
    slug: 'garagenentruempelung',
    name: 'Garagenentümpelung',
    title: (city) => `Garagenentümpelung ${city} | Perfekt Sauber Service`,
    desc: (city) => `Garagenentümpelung in ${city}: Volle Garage? Wir räumen schnell und zuverlässig – inklusive Entsorgung von Öl, Reifen, Elektroschrott und Sperrmüll.`,
    heroText: (city) => `Garagen in ${city} schnell und sauber räumen – damit Ihr Fahrzeug wieder rein passt.`,
    sections: (city) => [
      { h: `Wann lohnt sich eine professionelle Garagenräumung in ${city}?`, p: `Viele Garagen werden über die Jahre zur Abstellkammer. Wenn keine Autos mehr rein passen oder ein Umzug ansteht, hilft Perfekt Sauber Service in ${city} schnell und unkompliziert.` },
      { h: `Was wir aus Garagen in ${city} entsorgen`, p: `Von alten Reifen über Ölkanister, Werkzeug, Fahrräder bis hin zu Elektroschrott – wir sorgen für die fachgerechte Entsorgung aller Materialien.` },
      { h: `Ablauf der Garagenräumung in ${city}`, p: `Kurze Einschätzung per Foto, Terminvereinbarung, Räumung und saubere Übergabe. Bei der Garagenräumung in ${city} achten wir auf eine schnelle und saubere Abwicklung.` },
    ],
    cards: [
      { t: 'Reifen & KFZ-Zubehör', p: `Alte Reifen, Felgen, Motorteile und KFZ-Zubehör werden fachgerecht entsorgt.` },
      { t: 'Werkzeug & Maschinen', p: `Alte Werkzeuge, Elektrogeräte und Maschinen – wir sortieren und entsorgen.` },
      { t: 'Fahrräder & Sportgeräte', p: `Alte Fahrräder, Roller oder Sportgeräte – auch großvolumige Gegenstände.` },
      { t: 'Chemikalien & Öle', p: `Ölkanister, Farben und Chemikalien werden umweltgerecht entsorgt.` },
    ],
    faqs: (city) => [
      { q: `Könnt ihr auch Öl und Chemikalien aus der Garage in ${city} entsorgen?`, a: `Ja, wir sorgen für die umweltgerechte Entsorgung von Öl, Farben und anderen Gefahrstoffen.` },
      { q: `Räumt ihr auch einzelne Garagenabteile?`, a: `Ja, auch kleinere Garagen oder einzelne Abteile können angefragt werden.` },
      { q: `Wie schnell könnt ihr in ${city} kommen?`, a: `In der Regel sind wir innerhalb weniger Tage vor Ort. Kontaktieren Sie uns für einen schnellen Termin.` },
    ],
    ctaText: (city) => `Schildern Sie uns kurz, was in der Garage in ${city} steht – am besten mit Fotos – und wir melden uns schnell zurück.`,
  },
  {
    slug: 'bueroaufloesung',
    name: 'Büroauflösung',
    title: (city) => `Büroauflösung ${city} | Perfekt Sauber Service`,
    desc: (city) => `Büroauflösung in ${city}: Wir räumen Büros, Praxen und Gewerbeflächen professionell und diskret. Schnelle Terminvergabe, komplette Entsorgung inklusive.`,
    heroText: (city) => `Büros und Gewerbeflächen in ${city} schnell und professionell auflösen – inklusive Entsorgung und besenreiner Übergabe.`,
    sections: (city) => [
      { h: `Wann eine Büroauflösung in ${city} notwendig wird`, p: `Betriebsschließung, Umzug, Insolvenz oder Modernisierung – es gibt viele Gründe für eine Büroauflösung in ${city}. Perfekt Sauber Service übernimmt die komplette Räumung schnell und diskret.` },
      { h: `Was wir bei Büroauflösungen in ${city} leisten`, p: `Vom Büromöbel über IT-Geräte bis hin zu Akten und Büromaterial – wir räumen alles fachgerecht aus und sorgen für die datenschutzkonforme Entsorgung von Unterlagen.` },
      { h: `Diskretion und Professionalität bei Büroauflösungen in ${city}`, p: `Wir verstehen, dass Büroauflösungen oft sensibel sind. Unser Team arbeitet diskret, pünktlich und hinterlässt das Objekt besenrein.` },
    ],
    cards: [
      { t: 'Büromöbel & Einrichtung', p: `Schreibtische, Stühle, Regale, Schränke – komplette Büroeinrichtungen werden ausgebaut und abtransportiert.` },
      { t: 'IT-Geräte & Elektronik', p: `Computer, Drucker, Server und Elektronik – fachgerechte Entsorgung oder Weitergabe.` },
      { t: 'Akten & Unterlagen', p: `Datenschutzkonforme Entsorgung von Akten, Unterlagen und sensiblen Dokumenten.` },
      { t: 'Praxen & Kanzleien', p: `Auch medizinische Praxen, Anwaltskanzleien und andere Gewerbeflächen werden diskret geräumt.` },
    ],
    faqs: (city) => [
      { q: `Wie schnell kann eine Büroauflösung in ${city} durchgeführt werden?`, a: `In der Regel können wir innerhalb weniger Tage starten. Bei dringendem Bedarf sprechen Sie uns an.` },
      { q: `Werden Akten datenschutzkonform vernichtet?`, a: `Ja, wir sorgen für die fachgerechte und datenschutzkonforme Entsorgung aller Unterlagen.` },
      { q: `Übernehmt ihr auch die Demontage von Büromöbeln?`, a: `Ja, Demontage und Abtransport sind im Service enthalten.` },
    ],
    ctaText: (city) => `Kontaktieren Sie uns für Ihre Büroauflösung in ${city}. Wir erstellen schnell ein unverbindliches Angebot.`,
  },
  {
    slug: 'nachlassaufloesung',
    name: 'Nachlassauflösung',
    title: (city) => `Nachlassauflösung ${city} | Perfekt Sauber Service`,
    desc: (city) => `Nachlassauflösung in ${city}: Einfühlsam und professionell. Wir unterstützen Angehörige bei der Räumung nach einem Todesfall – diskret, sorgfältig und vollständig.`,
    heroText: (city) => `Nachlassauflösungen in ${city} – diskret, einfühlsam und vollständig. Wir unterstützen Sie in schwierigen Zeiten.`,
    sections: (city) => [
      { h: `Nachlassauflösung in ${city} – einfühlsam und professionell`, p: `Der Verlust eines geliebten Menschen ist schmerzhaft. Die anschließende Räumung der Wohnung oder des Hauses ist zusätzlich belastend. Perfekt Sauber Service übernimmt die Nachlassauflösung in ${city} diskret und sorgfältig, damit Sie sich auf das Wesentliche konzentrieren können.` },
      { h: `Was bei einer Nachlassauflösung in ${city} zu beachten ist`, p: `Bei einer Nachlassauflösung ist Diskretion oberstes Gebot. Wir gehen sorgsam mit persönlichen Gegenständen um, sortieren auf Wunsch Wertvolles aus und kümmern uns um die fachgerechte Entsorgung des Rests.` },
      { h: `Unser Ablauf bei Nachlassauflösungen in ${city}`, p: `Nach einem ersten Gespräch planen wir gemeinsam den Ablauf. Wir räumen die Wohnung vollständig aus, sortieren nach Wunsch, und übergeben das Objekt besenrein – damit die nächsten Schritte leichter fallen.` },
    ],
    cards: [
      { t: 'Vollständige Wohnungsräumung', p: `Vom Mobiliar über persönliche Gegenstände bis hin zu Kleinkram – alles wird sorgfältig geräumt.` },
      { t: 'Aussortierung von Wertgegenständen', p: `Auf Wunsch sortieren wir Schmuck, Dokumente, Erinnerungsstücke und Wertvolles aus.` },
      { t: 'Besenreine Übergabe', p: `Das Objekt wird nach der Räumung besenrein übergeben, damit Vermieter oder Erben es weiter nutzen können.` },
      { t: 'Diskrete Abwicklung', p: `Unsere Mitarbeiter arbeiten ruhig, respektvoll und ohne unnötige Unruhe.` },
    ],
    faqs: (city) => [
      { q: `Wie geht ihr mit persönlichen Gegenständen bei Nachlassauflösungen in ${city} um?`, a: `Sehr sorgsam. Auf Wunsch sortieren wir Persönliches aus, bevor der Rest entsorgt wird.` },
      { q: `Könnt ihr auch kurzfristig eine Nachlassauflösung in ${city} übernehmen?`, a: `Ja, wir versuchen, schnell zu helfen. Kontaktieren Sie uns und wir finden einen zeitnahen Termin.` },
      { q: `Was kostet eine Nachlassauflösung in ${city}?`, a: `Die Kosten hängen vom Umfang ab. Eine erste Einschätzung ist oft per Foto möglich.` },
    ],
    ctaText: (city) => `Wenn Sie eine Nachlassauflösung in ${city} benötigen, stehen wir Ihnen mit Rat und Tat zur Seite. Kontaktieren Sie uns.`,
  },
  {
    slug: 'messi-wohnung',
    name: 'Messi-Wohnung Entrümpelung',
    title: (city) => `Messi-Wohnung Entrümpelung ${city} | Perfekt Sauber Service`,
    desc: (city) => `Messi-Wohnung in ${city} räumen? Wir helfen diskret und ohne Wertung. Erfahrenes Team für stark vermüllte Wohnungen – vollständige Entrümpelung und Reinigung.`,
    heroText: (city) => `Stark vermüllte Wohnungen in ${city} professionell räumen – diskret, ohne Wertung und mit vollständiger Entsorgung.`,
    sections: (city) => [
      { h: `Messi-Wohnungen in ${city} – diskret und professionell`, p: `Stark vermüllte Wohnungen erfordern besondere Erfahrung und Fingerspitzengefühl. Perfekt Sauber Service übernimmt die Räumung von Messi-Wohnungen in ${city} ohne Wertung – diskret, gründlich und vollständig.` },
      { h: `Worauf wir bei Messi-Wohnungen in ${city} besonders achten`, p: `Bei stark vermüllten Wohnungen ist Schutzausrüstung Pflicht, die Entsorgung muss fachgerecht erfolgen und oft müssen auch Schädlinge oder Feuchtigkeit berücksichtigt werden. Unser Team ist darauf vorbereitet.` },
      { h: `Ablauf der Räumung stark vermüllter Wohnungen in ${city}`, p: `Nach einer ersten Einschätzung – möglichst mit Fotos – erstellen wir ein Angebot. Die Räumung erfolgt systematisch, der gesamte Müll wird fachgerecht entsorgt und das Objekt nach Wunsch gereinigt übergeben.` },
    ],
    cards: [
      { t: 'Vollständige Entrümpelung', p: `Alle Gegenstände, Müll und Unrat werden restlos entfernt – egal wie voll die Wohnung ist.` },
      { t: 'Schutzausrüstung & Sicherheit', p: `Unser Team arbeitet mit geeigneter Schutzausrüstung und hält alle Sicherheitsvorschriften ein.` },
      { t: 'Diskrete Abwicklung', p: `Wir arbeiten ruhig und ohne unnötige Aufmerksamkeit – Diskretion ist für uns selbstverständlich.` },
      { t: 'Reinigung nach der Räumung', p: `Auf Wunsch reinigen wir die Wohnung nach der Räumung, damit das Objekt wieder bewohnbar ist.` },
    ],
    faqs: (city) => [
      { q: `Räumt ihr auch sehr stark vermüllte Wohnungen in ${city}?`, a: `Ja. Wir sind auf stark vermüllte Wohnungen spezialisiert und haben entsprechende Ausrüstung.` },
      { q: `Wird diskret gearbeitet?`, a: `Absolut. Unser Team arbeitet ohne unnötige Aufmerksamkeit und ohne Wertung.` },
      { q: `Was kostet die Räumung einer Messi-Wohnung in ${city}?`, a: `Die Kosten hängen stark vom Umfang ab. Eine Einschätzung per Foto ist oft möglich.` },
    ],
    ctaText: (city) => `Kontaktieren Sie uns für die Räumung einer Messi-Wohnung in ${city}. Wir helfen diskret und ohne Wertung.`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cityToSlug(city) {
  return city.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function generateHTML(service, city) {
  const citySlug = cityToSlug(city);
  const filename = `${service.slug}-${citySlug}.html`;
  const url = `https://perfektsauberservice.com/${filename}`;
  const title = service.title(city);
  const desc = service.desc(city);
  const heroText = service.heroText(city);
  const sections = service.sections(city);
  const cards = service.cards;
  const faqs = service.faqs(city);
  const ctaText = service.ctaText(city);

  const cardsHTML = cards.map(c => `
      <div class="card">
        <strong>${c.t}</strong>
        <p>${c.p}</p>
      </div>`).join('');

  const faqsHTML = faqs.map(f => `
    <h3>${f.q}</h3>
    <p>${f.a}</p>`).join('');

  const sectionsHTML = sections.map(s => `
  <section class="section">
    <h2>${s.h}</h2>
    <p>${s.p}</p>
  </section>`).join('');

  return `<!DOCTYPE html><html lang="de"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://perfektsauberservice.com/images/echipa.webp">
<meta property="og:locale" content="de_DE">
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<style>
body{margin:0;font-family:Inter,Arial,sans-serif;background:#f6f8fb;color:#10213f;line-height:1.7}
.wrap{max-width:1180px;margin:0 auto;padding:32px 18px 56px}
.hero,.section,.card,.cta-box{background:#fff;border:1px solid #e5e7eb;border-radius:24px;box-shadow:0 10px 30px rgba(15,23,42,.06)}
.hero{padding:28px}
.eyebrow{display:inline-block;background:#eef2ff;color:#17315c;border-radius:999px;padding:8px 14px;font-weight:700;font-size:13px}
h1{font-size:54px;line-height:1.04;margin:0 0 16px}
h2{font-size:34px;line-height:1.15;margin:0 0 12px}
h3{font-size:24px;line-height:1.25;margin:18px 0 8px}
.sub{font-size:20px;color:#475569;margin:0 0 18px}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:26px;align-items:center}
.hero-img{width:100%;height:100%;min-height:420px;object-fit:cover;border-radius:22px}
.btns{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}
.btn{display:inline-block;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:16px}
.btn-green{background:#77c043;color:#17315c}
.btn-blue{background:#1f4f86;color:#fff}
.btn-light{background:#fff;color:#10213f;border:1px solid #d1d5db}
.section,.cta-box{padding:24px;margin-top:22px}
.services-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:16px}
.card{padding:22px}
.card strong{display:block;font-size:22px;margin-bottom:8px}
.card p{margin:0;color:#475569}
.link-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.link-row a{color:#17315c;font-weight:700;text-decoration:none}
@media (max-width:980px){
  .hero-grid,.services-grid{grid-template-columns:1fr}
  h1{font-size:40px}
  h2{font-size:28px}
}
</style>
<script type="application/ld+json">
[{"@context":"https://schema.org","@type":"Service","name":"${service.name} ${city}","serviceType":"${service.name}","description":"${desc}","provider":{"@type":"LocalBusiness","name":"Perfekt Sauber Service","telephone":"+49 163 9087197","email":"kontakt@perfektsauberservice.com","url":"https://perfektsauberservice.com","address":{"@type":"PostalAddress","streetAddress":"Reutstraße 9","addressLocality":"Loffenau","postalCode":"76597","addressCountry":"DE"},"priceRange":"€€"},"areaServed":{"@type":"City","name":"${city}"},"url":"${url}"}]
</script>
</head>
<body>
<div class="wrap">

  <section class="hero">
    <div class="hero-grid">
      <div>
        <div class="eyebrow">${city}</div>
        <h1>${service.name} ${city}</h1>
        <p class="sub">${heroText}</p>
        <div class="btns">
          <a class="btn btn-green" href="/kontakt.html">Kostenloses Angebot anfragen</a>
          <a class="btn btn-blue" href="/preisrechner.html">Preis grob einschätzen</a>
        </div>
      </div>
      <div>
        <img class="hero-img" src="/images/locations/seite-bild-seo.webp" alt="${service.name} ${city}">
      </div>
    </div>
  </section>

${sectionsHTML}

  <section class="section">
    <h2>Was wir übernehmen</h2>
    <div class="services-grid">
${cardsHTML}
    </div>
  </section>

  <section class="section">
    <h2>Häufige Fragen zur ${service.name} in ${city}</h2>
${faqsHTML}
  </section>

  <section class="cta-box" id="kontakt">
    <h2>${service.name} in ${city} anfragen</h2>
    <p>${ctaText}</p>
    <div class="btns">
      <a class="btn btn-green" href="/kontakt.html">Anfrageformular öffnen</a>
      <a class="btn btn-light" href="https://wa.me/491639087197" target="_blank" rel="noreferrer">Fotos per WhatsApp senden</a>
    </div>
    <div class="link-row">
      <a href="/preisrechner.html">Preisrechner</a>
      <a href="/leistungen.html">Leistungen</a>
      <a href="/entruempelung-${citySlug}.html">Entrümpelung ${city}</a>
    </div>
  </section>

</div>
</body></html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🏙️ City Pages Generator gestartet\n');

  // Citeste article-topics.json
  const topicsPath = join(ROOT, 'agent', 'config', 'article-topics.json');
  const topicsData = JSON.parse(readFileSync(topicsPath, 'utf8'));

  // Colecteaza toate orasele din queue + posted (daca exista)
  const allEntries = [
    ...(topicsData.queue || []),
    ...(topicsData.posted || []),
  ];

  const cities = [...new Set(allEntries.map(e => e.city).filter(Boolean))];
  console.log(`📍 Orașe găsite în article-topics: ${cities.length}`);

  let generated = 0;
  let skipped = 0;

  for (const city of cities) {
    const citySlug = cityToSlug(city);

    for (const service of SERVICES) {
      const filename = `${service.slug}-${citySlug}.html`;
      const filepath = join(ROOT, filename);

      if (existsSync(filepath)) {
        skipped++;
        continue;
      }

      const html = generateHTML(service, city);
      writeFileSync(filepath, html, 'utf8');
      console.log(`  ✅ Generat: ${filename}`);
      generated++;
    }
  }

  console.log(`\n✅ Gata! ${generated} pagini generate, ${skipped} deja existente.`);
}

main().catch(err => {
  console.error('\n❌ Eroare:', err.message);
  process.exit(1);
});
