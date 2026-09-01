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

// Cities & service to link in the Standorte block. Coords are real (Wikipedia
// infoboxes), used for the Leaflet satellite map.
const CITY_DATA = [
  { slug:'rastatt',             label:'Rastatt',             lat:48.8587, lng:8.2057 },
  { slug:'baden-baden',         label:'Baden-Baden',         lat:48.7610, lng:8.2396 },
  { slug:'karlsruhe',           label:'Karlsruhe',           lat:49.0069, lng:8.4037 },
  { slug:'pforzheim',           label:'Pforzheim',           lat:48.8922, lng:8.6946 },
  { slug:'ettlingen',           label:'Ettlingen',           lat:48.9408, lng:8.4072 },
  { slug:'gaggenau',            label:'Gaggenau',            lat:48.8024, lng:8.3265 },
  { slug:'gernsbach',           label:'Gernsbach',           lat:48.7616, lng:8.3286 },
  { slug:'buehl',               label:'Bühl',                lat:48.6960, lng:8.1318 },
  { slug:'sinzheim',            label:'Sinzheim',            lat:48.7704, lng:8.1689 },
  { slug:'muggensturm',         label:'Muggensturm',         lat:48.9001, lng:8.3192 },
  { slug:'rheinstetten',        label:'Rheinstetten',        lat:48.9686, lng:8.3083 },
  { slug:'stutensee',           label:'Stutensee',           lat:49.0717, lng:8.4767 },
  { slug:'achern',              label:'Achern',              lat:48.6304, lng:8.0717 },
  { slug:'bad-wildbad',         label:'Bad Wildbad',         lat:48.7521, lng:8.5495 },
  { slug:'bad-herrenalb',       label:'Bad Herrenalb',       lat:48.7989, lng:8.4368 },
  { slug:'forbach',             label:'Forbach',             lat:48.6788, lng:8.3578 },
  { slug:'iffezheim',           label:'Iffezheim',           lat:48.8295, lng:8.1349 },
  { slug:'huegelsheim',         label:'Hügelsheim',          lat:48.8055, lng:8.1217 },
  { slug:'kuppenheim',          label:'Kuppenheim',          lat:48.8395, lng:8.2647 },
  { slug:'loffenau',            label:'Loffenau',            lat:48.7864, lng:8.4058 },
  { slug:'malsch',              label:'Malsch',              lat:48.8838, lng:8.4008 },
  { slug:'oetigheim',           label:'Ötigheim',            lat:48.8861, lng:8.2531 },
  { slug:'steinmauern',         label:'Steinmauern',         lat:48.8836, lng:8.1797 },
  { slug:'weisenbach',          label:'Weisenbach',          lat:48.7222, lng:8.3736 },
  { slug:'bietigheim',          label:'Bietigheim',          lat:48.8997, lng:8.2647 },
  { slug:'bischweier',          label:'Bischweier',          lat:48.8419, lng:8.2597 },
  { slug:'durmersheim',         label:'Durmersheim',         lat:48.9275, lng:8.2742 },
  { slug:'au-am-rhein',         label:'Au am Rhein',         lat:48.9325, lng:8.2156 },
  { slug:'rheinmuenster',       label:'Rheinmünster',        lat:48.7717, lng:8.0247 },
];
const CITIES = CITY_DATA.map(c => c.slug);
const CITY_LABELS = Object.fromEntries(CITY_DATA.map(c => [c.slug, c.label]));

function buildStandorteSection() {
  const chips = CITIES.map(c => `<a href="/entruempelung-${c}" class="chip">${CITY_LABELS[c] || c}</a>`).join('');
  const mapData = JSON.stringify(CITY_DATA.map(c => [c.label, c.lat, c.lng, c.slug]));
  return `<section class="sec" id="standorte" style="max-width:1440px; margin:0 auto; padding:120px 48px;">
  <div class="sec-mark">Standorte</div>
  <h2 class="ch-h" style="max-width:18ch;">Wir sind dort, wo Sie <em>uns brauchen</em>.</h2>
  <p class="ch-p" style="margin-bottom:32px;">Festpreis-Räumung, Reinigung und Übergabe in über 30 Städten in Mittelbaden, Karlsruhe und Nordschwarzwald — schauen Sie, ob wir bei Ihnen aktiv sind.</p>

  <!-- Satellite map of the service area (Leaflet + Esri World Imagery) -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  <div id="standorte-map" style="height:480px; border-radius:14px; overflow:hidden; box-shadow:0 24px 50px -20px rgba(26,32,48,.25); margin-bottom:36px; background:var(--bg-2);"></div>
  <script>
  (function(){
    var el = document.getElementById('standorte-map');
    if (!el) return;
    var loaded = false;
    function load(){
      if (loaded) return; loaded = true;
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      s.crossOrigin = '';
      s.onload = init;
      document.head.appendChild(s);
    }
    function init(){
      if (typeof L === 'undefined') return;
    var data = ${mapData};
    var map = L.map('standorte-map', { scrollWheelZoom:false, zoomControl:true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution:'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
      maxZoom: 18,
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, opacity: 0.85,
    }).addTo(map);
    var bounds = L.latLngBounds([]);
    var icon = L.divIcon({
      className:'pss-pin',
      html:'<div style="width:14px;height:14px;border-radius:50%;background:#5aa83a;border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.4);"></div>',
      iconSize:[14,14], iconAnchor:[7,7]
    });
    data.forEach(function(c){
      var name=c[0], lat=c[1], lng=c[2], slug=c[3];
      var m = L.marker([lat,lng], {icon:icon}).addTo(map);
      m.bindPopup('<strong style="font-family:Fraunces,serif;font-size:1.05rem;">'+name+'</strong><br/><a href="/entruempelung-'+slug+'" style="font-family:\\'Geist Mono\\',monospace;font-size:.7rem;color:#1d6dd6;text-transform:uppercase;letter-spacing:.1em;">Zur Stadtseite →</a>');
      bounds.extend([lat,lng]);
    });
    map.fitBounds(bounds, { padding:[40,40] });
    // Loffenau pin highlight (legal headquarters)
    var loffIdx = data.findIndex(function(c){ return c[3] === 'loffenau'; });
    if (loffIdx >= 0) {
      var l = data[loffIdx];
      L.marker([l[1], l[2]], {
        icon: L.divIcon({
          className:'pss-pin-hq',
          html:'<div style="width:22px;height:22px;border-radius:50%;background:#1d6dd6;border:4px solid #fff;box-shadow:0 6px 14px rgba(0,0,0,.5);"></div><div style="position:absolute;left:50%;top:24px;transform:translateX(-50%);background:#fff;border-radius:6px;padding:3px 8px;font-family:\\'Geist Mono\\',monospace;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:#1d6dd6;white-space:nowrap;font-weight:600;">Hauptsitz</div>',
          iconSize:[22,22], iconAnchor:[11,11]
        }), zIndexOffset: 1000
      }).addTo(map);
    }
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function(es){ if (es[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '200px' });
      io.observe(el);
    } else { load(); }
  })();
  </script>

  <div style="display:flex; flex-wrap:wrap; gap:8px;">${chips}</div>
  <style>
    #standorte .chip{display:inline-block; background:#fff; color:var(--ink); padding:10px 18px; border-radius:999px;
      font-family:"Geist Mono",monospace; font-size:.74rem; letter-spacing:.08em; border:1px solid var(--line); transition:all .2s;}
    #standorte .chip:hover{border-color:var(--blue); color:var(--blue); transform:translateY(-2px);}
    #standorte-map .leaflet-popup-content-wrapper{border-radius:8px;}
    #standorte-map .leaflet-popup-content{margin:14px 18px;line-height:1.5;}
    #standorte-map .leaflet-control-attribution{font-size:9px;opacity:.7;}
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

  // 2a. SIMPLIFIED HERO: replace the cibersite 2-photo split (which kept rendering
  //     blank for the user across multiple debug attempts) with a single full
  //     hero image stacked over a small "after" thumbnail. Bulletproof, no
  //     position:absolute / aspect-ratio / transform combo to misbehave.
  tpl = tpl.replace(/<div class="hero-img reveal">[\s\S]*?<\/div>\s*<\/section>/m, `<div class="hero-img">
    <img src="/images/hero-vor.jpeg" alt="Wohnung vor der Räumung — Vitrine, Rastatt" loading="eager" style="width:100%; height:auto; aspect-ratio:4/5; object-fit:cover; border-radius:14px; box-shadow:0 30px 60px -20px rgba(26,32,48,.25); display:block;"/>
    <div style="position:absolute; bottom:-32px; right:-32px; width:46%; aspect-ratio:1; border-radius:14px; overflow:hidden; box-shadow:0 24px 50px -20px rgba(26,32,48,.4); border:6px solid #fff;">
      <img src="/images/hero-nach.jpg" alt="Wohnung nach der Räumung — besenrein, Rastatt" loading="eager" style="width:100%; height:100%; object-fit:cover; display:block;"/>
    </div>
    <span style="position:absolute; top:18px; left:18px; padding:6px 12px; font-family:'Geist Mono',monospace; font-size:.66rem; letter-spacing:.18em; text-transform:uppercase; border-radius:999px; background:#fff; color:#1a2030;">Vorher</span>
    <span style="position:absolute; bottom:18px; right:18px; padding:6px 12px; font-family:'Geist Mono',monospace; font-size:.66rem; letter-spacing:.18em; text-transform:uppercase; border-radius:999px; background:#5aa83a; color:#fff; z-index:3;">Nachher</span>
  </div>
</section>`);

  // 2b. Hero text column also doesn't need .reveal (above the fold).
  tpl = tpl.replace(/<div class="reveal">\s*\n\s*<span class="eyebrow">/, '<div>\n    <span class="eyebrow">');

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
