// Homepage renderer.
// Strategy: take the cibersite index.html (the editorial design with 3 chapters,
// before/after sliders, calculator, gallery, reviews) as the visual base, then
// patch it with:
//   - SEO meta from the existing site (title, description, og, canonical)
//   - JSON-LD LocalBusiness from the old homepage (preserved verbatim)
//   - GA4
//   - Real nav links pointing to existing site URLs
//   - Asset paths fixed to /images/cibersite/...
//   - A "Standorte" section linking all 30+ cities for SEO

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GA4 } from './parts.mjs';

const grab = (html, pattern) => {
  const m = html.match(pattern);
  return m ? m[1].trim() : '';
};
const grabAll = (html, pattern) => {
  const out = [];
  let m;
  while ((m = pattern.exec(html)) !== null) out.push(m);
  return out;
};

const TEMPLATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '_cibersite-index.html');

// Cities & service to link in the Standorte block
const CITIES = [
  'rastatt','baden-baden','karlsruhe','pforzheim','ettlingen','gaggenau','gernsbach',
  'buehl','sinzheim','muggensturm','rheinstetten','stutensee','achern','bad-wildbad',
  'bad-herrenalb','forbach','iffezheim','huegelsheim','kuppenheim','loffenau','malsch',
  'oetigheim','steinmauern','weisenbach','bietigheim','bischweier','durmersheim',
  'au-am-rhein','elchesheim-illingen','rheinmuenster',
];
const CITY_LABELS = {
  'rastatt':'Rastatt','baden-baden':'Baden-Baden','karlsruhe':'Karlsruhe',
  'pforzheim':'Pforzheim','ettlingen':'Ettlingen','gaggenau':'Gaggenau',
  'gernsbach':'Gernsbach','buehl':'Bühl','sinzheim':'Sinzheim',
  'muggensturm':'Muggensturm','rheinstetten':'Rheinstetten','stutensee':'Stutensee',
  'achern':'Achern','bad-wildbad':'Bad Wildbad','bad-herrenalb':'Bad Herrenalb',
  'forbach':'Forbach','iffezheim':'Iffezheim','huegelsheim':'Hügelsheim',
  'kuppenheim':'Kuppenheim','loffenau':'Loffenau','malsch':'Malsch',
  'oetigheim':'Ötigheim','steinmauern':'Steinmauern','weisenbach':'Weisenbach',
  'bietigheim':'Bietigheim','bischweier':'Bischweier','durmersheim':'Durmersheim',
  'au-am-rhein':'Au am Rhein','elchesheim-illingen':'Elchesheim-Illingen',
  'rheinmuenster':'Rheinmünster',
};

function buildStandorteSection() {
  const chips = CITIES.map(c => `<a href="/entruempelung-${c}" class="chip">${CITY_LABELS[c] || c}</a>`).join('');
  return `<section class="sec" id="standorte" style="max-width:1440px; margin:0 auto; padding:120px 48px;">
  <div class="sec-mark">Standorte</div>
  <h2 class="ch-h" style="max-width:18ch;">Wir sind dort, wo Sie <em>uns brauchen</em>.</h2>
  <p class="ch-p" style="margin-bottom:32px;">Festpreis-Räumung, Reinigung und Übergabe in über 30 Städten in Mittelbaden, Karlsruhe und Nordschwarzwald — schauen Sie, ob wir bei Ihnen aktiv sind.</p>
  <div style="display:flex; flex-wrap:wrap; gap:8px;">${chips}</div>
  <style>
    #standorte .chip{display:inline-block; background:#fff; color:var(--ink); padding:10px 18px; border-radius:999px;
      font-family:"Geist Mono",monospace; font-size:.74rem; letter-spacing:.08em; border:1px solid var(--line); transition:all .2s;}
    #standorte .chip:hover{border-color:var(--blue); color:var(--blue); transform:translateY(-2px);}
  </style>
</section>`;
}

export function renderHomepage(oldIndexPath = 'index.html') {
  let tpl = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const oldHtml = fs.existsSync(oldIndexPath) ? fs.readFileSync(oldIndexPath, 'utf8') : '';

  // ---- Extract from old homepage ----
  const oldTitle = grab(oldHtml, /<title>([\s\S]*?)<\/title>/) || 'Perfekt Sauber Service · Rastatt';
  const oldDescription = grab(oldHtml, /<meta\s+name="description"\s+content="([^"]*)"/) ||
    'Entrümpelung, Haushaltsauflösung und Reinigung in Rastatt, Baden-Baden, Karlsruhe und Umgebung. Festpreis. Termin in 48h.';
  const oldOgTitle = grab(oldHtml, /<meta\s+property="og:title"\s+content="([^"]*)"/) || oldTitle;
  const oldOgDesc = grab(oldHtml, /<meta\s+property="og:description"\s+content="([^"]*)"/) || oldDescription;
  const oldOgUrl = grab(oldHtml, /<meta\s+property="og:url"\s+content="([^"]*)"/) || 'https://perfektsauberservice.com/';
  const oldOgImage = grab(oldHtml, /<meta\s+property="og:image"\s+content="([^"]*)"/) || 'https://perfektsauberservice.com/images/echipa.webp';
  const oldCanonical = grab(oldHtml, /<link\s+rel="canonical"\s+href="([^"]*)"/) || 'https://perfektsauberservice.com/';

  // Preserve all JSON-LD from old homepage
  const oldJsonLd = grabAll(oldHtml, /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    .map(m => `<script type="application/ld+json">\n${m[1].trim()}\n</script>`).join('\n');

  // ---- Patch the cibersite template ----
  // 1. Title + meta
  tpl = tpl.replace(/<title>[\s\S]*?<\/title>/, `<title>${oldTitle}</title>`);

  // Inject SEO meta block right after viewport
  const seoMeta = `
<meta name="robots" content="index,follow">
<meta name="description" content="${oldDescription}">
<meta property="og:title" content="${oldOgTitle}">
<meta property="og:description" content="${oldOgDesc}">
<meta property="og:url" content="${oldOgUrl}">
<meta property="og:type" content="website">
<meta property="og:image" content="${oldOgImage}">
<meta property="og:locale" content="de_DE">
<link rel="canonical" href="${oldCanonical}">
<link rel="icon" type="image/png" href="/images/favicon-32.png">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">`;
  tpl = tpl.replace(/<meta\s+name="viewport"[^>]*\/>/, m => m + seoMeta);

  // 2. Image paths: img/ → /images/cibersite/
  // (Also catches JS template literals like `img/${n}-vor.jpeg` and single-quoted strings.)
  tpl = tpl.replace(/src="img\//g, 'src="/images/cibersite/');
  tpl = tpl.replace(/`img\//g, '`/images/cibersite/');
  tpl = tpl.replace(/'img\//g, "'/images/cibersite/");

  // 3. Nav links: cibersite uses #anchors; we want them to point to real pages
  tpl = tpl.replace(/<a href="#leistungen">Leistungen<\/a>/, '<a href="/leistungen">Leistungen</a>');
  tpl = tpl.replace(/<a href="#galerie">Galerie<\/a>/, '<a href="/portfolio">Galerie</a>');
  tpl = tpl.replace(/<a href="#stimmen">Stimmen<\/a>/, '<a href="#stimmen">Stimmen</a>'); // keep anchor on home
  tpl = tpl.replace(/<a href="#kontakt">Kontakt<\/a>/, '<a href="#kontakt">Kontakt</a>');

  // 4. Make the service links in the .srv-section point to real service pages
  const serviceMap = [
    [/<a class="srv-row reveal" href="#kontakt"><span class="srv-num">№ 01<\/span><span class="srv-name"><em>Wohnungs-<\/em>auflösung<\/span>/,
     '<a class="srv-row reveal" href="/wohnungsaufloesung-rastatt"><span class="srv-num">№ 01</span><span class="srv-name"><em>Wohnungs-</em>auflösung</span>'],
    [/<a class="srv-row reveal" href="#kontakt"><span class="srv-num">№ 02<\/span><span class="srv-name"><em>Haushalts-<\/em>auflösung<\/span>/,
     '<a class="srv-row reveal" href="/haushaltsaufloesung-rastatt"><span class="srv-num">№ 02</span><span class="srv-name"><em>Haushalts-</em>auflösung</span>'],
    [/<a class="srv-row reveal" href="#kontakt"><span class="srv-num">№ 03<\/span><span class="srv-name"><em>Bauend-<\/em>reinigung<\/span>/,
     '<a class="srv-row reveal" href="/endreinigung-rastatt"><span class="srv-num">№ 03</span><span class="srv-name"><em>Bauend-</em>reinigung</span>'],
    [/<a class="srv-row reveal" href="#kontakt"><span class="srv-num">№ 04<\/span><span class="srv-name"><em>Grund-<\/em>reinigung<\/span>/,
     '<a class="srv-row reveal" href="/unterhaltsreinigung-region"><span class="srv-num">№ 04</span><span class="srv-name"><em>Grund-</em>reinigung</span>'],
    [/<a class="srv-row reveal" href="#kontakt"><span class="srv-num">№ 05<\/span><span class="srv-name"><em>Umzugs-<\/em>service<\/span>/,
     '<a class="srv-row reveal" href="/leistungen"><span class="srv-num">№ 05</span><span class="srv-name"><em>Umzugs-</em>service</span>'],
    [/<a class="srv-row reveal" href="#kontakt"><span class="srv-num">№ 06<\/span><span class="srv-name"><em>Entrümpelung<\/em><\/span>/,
     '<a class="srv-row reveal" href="/entruempelung-rastatt"><span class="srv-num">№ 06</span><span class="srv-name"><em>Entrümpelung</em></span>'],
  ];
  for (const [re, rep] of serviceMap) tpl = tpl.replace(re, rep);

  // 5. Footer links → real impressum/datenschutz
  tpl = tpl.replace(/href="impressum\.html"/g, 'href="/impressum"');
  tpl = tpl.replace(/href="datenschutz\.html"/g, 'href="/datenschutz"');

  // 6. Add JSON-LD + GA4 right before </head>
  tpl = tpl.replace(/<\/head>/, `${oldJsonLd}\n${GA4}\n</head>`);

  // 7. Insert Standorte section before contact
  const standorte = buildStandorteSection();
  tpl = tpl.replace(/(<!-- ======== CONTACT ======== -->|<section class="contact")/, `${standorte}\n$1`);

  // 8. Mobile fix for the price calculator: drop position:sticky and force single
  //    column. Inline `position:sticky` on the left column overrides the existing
  //    media query at <=980px, causing it to stick atop the right column on phones.
  const mobileFix = `
<style>
@media(max-width:980px){
  .calc-section > .reveal{
    display:block !important;
    grid-template-columns:1fr !important;
    gap:32px !important;
  }
  .calc-section > .reveal > div{
    position:static !important;
    margin-bottom:24px;
  }
  .calc-section > .reveal > div:last-child{margin-bottom:0;}
  .calc-section{padding:60px 20px !important;}
}
</style>`;
  tpl = tpl.replace('</head>', `${mobileFix}\n</head>`);

  return tpl;
}

if (process.argv[1]?.endsWith('render-homepage.mjs')) {
  const out = renderHomepage();
  fs.mkdirSync('_preview', { recursive: true });
  fs.writeFileSync('_preview/index.html', out);
  console.log(`✓ _preview/index.html (${out.length} bytes)`);
}
