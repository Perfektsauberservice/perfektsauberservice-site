// Rebuild gallery sections on all city + hub pages as INTERACTIVE
// Vorher/Nachher comparison sliders (drag the handle to reveal nachher).
//
// Each slider uses two real photos (a vorher.webp + nachher.webp pair) from
// images/<folder>/. NO splitscreen composites, NO lucrari fillers.
//
// Per-city availability of paired photos in images/:
//   keller-1            (Rastatt, basement):    4 pairs
//   keller-badenbaden:                          9 pairs
//   wohnung-rastatt:                            4 pairs
//   wohnung-badenbaden:                         1 pair
//   wohnung-ettlingen:                          11 pairs
//   wohnung-karlsruhe:                          5 pairs
//   wohnung-gaggenau:                           5 pairs
//
// Strategy:
//  • Cities WITH local pairs: use up to 6 local sliders, prioritising the kind
//    that matches the page service (keller for keller/dachboden/garage pages,
//    wohnung for wohnung/haushalts/etc.).
//  • Cities WITHOUT local pairs: 6 sliders from a curated regional pool;
//    gallery title becomes "Beispiele aus der Region" with a Datenschutz note.

import fs from 'node:fs';
import path from 'node:path';

const REPO = 'C:/Users/laral/Documents/proiect 1 claude code/perfektsauberservice-site-main';

// Folder catalog: { folder, prefix used in filenames, count of pairs, kind }
const FOLDERS = {
  'keller-rastatt':      { folder: 'keller-1',          prefix: 'kellerentruempelung-rastatt',     count: 4, kind: 'Keller' },
  'keller-badenbaden':   { folder: 'keller-badenbaden', prefix: 'kellerentruempelung-badenbaden',  count: 9, kind: 'Keller' },
  'wohnung-rastatt':     { folder: 'wohnung-rastatt',   prefix: 'wohnungsaufloesung-rastatt',      count: 4, kind: 'Wohnung' },
  'wohnung-badenbaden':  { folder: 'wohnung-badenbaden',prefix: 'wohnungsaufloesung-badenbaden',   count: 1, kind: 'Wohnung' },
  'wohnung-ettlingen':   { folder: 'wohnung-ettlingen', prefix: 'wohnungsaufloesung-ettlingen',    count: 11, kind: 'Wohnung' },
  'wohnung-karlsruhe':   { folder: 'wohnung-karlsruhe', prefix: 'wohnungsaufloesung-karlsruhe',    count: 5, kind: 'Wohnung' },
  'wohnung-gaggenau':    { folder: 'wohnung-gaggenau',  prefix: 'wohnungsaufloesung-gaggenau',     count: 5, kind: 'Wohnung' },
};

// Per-city local availability
const LOCAL_KEYS = {
  'rastatt':     ['wohnung-rastatt', 'keller-rastatt'],
  'baden-baden': ['wohnung-badenbaden', 'keller-badenbaden'],
  'ettlingen':   ['wohnung-ettlingen'],
  'karlsruhe':   ['wohnung-karlsruhe'],
  'gaggenau':    ['wohnung-gaggenau'],
};

// Service → which kinds are allowed. STRICT means we will NEVER mix in
// other kinds (e.g., a wohnungsaufloesung page never gets a keller slider).
// 'Wohnung' = lived-in rooms, 'Keller' = basement / storage / garage.
const SERVICE_KIND = {
  // wohnung-only services — apartment / household scope
  'wohnungsaufloesung':    ['Wohnung'],
  'haushaltsaufloesung':   ['Wohnung'],
  'nachlassaufloesung':    ['Wohnung'],
  'messi-wohnung':         ['Wohnung'],
  'gewerberaeumung':       ['Wohnung'],
  'bueroaufloesung':       ['Wohnung'],
  'bueroreinigung':        ['Wohnung'],
  'fensterreinigung':      ['Wohnung'],
  'grundreinigung':        ['Wohnung'],
  'endreinigung':          ['Wohnung'],
  'unterhaltsreinigung':   ['Wohnung'],
  'hausmeisterservice':    ['Wohnung'],
  'reinigung':             ['Wohnung'],
  // keller-only services — storage / cellar / garage / attic scope
  'kellerentruempelung':   ['Keller'],
  'dachbodenentruempelung':['Keller'],
  'garagenentruempelung':  ['Keller'],
  // general clearance — both kinds OK (any room of the property)
  'entruempelung':         ['Wohnung', 'Keller'],
};

// Regional pool — 6 hand-picked variety sliders for cities without local pairs
const REGIONAL_POOL = [
  { key: 'wohnung-ettlingen',  n: 1 },
  { key: 'wohnung-rastatt',    n: 1 },
  { key: 'keller-rastatt',     n: 1 },
  { key: 'wohnung-karlsruhe',  n: 1 },
  { key: 'wohnung-gaggenau',   n: 1 },
  { key: 'keller-badenbaden',  n: 1 },
];

const MAX_LOCAL_SLIDERS = 6;

const ALL_CITIES = [
  'achern','au-am-rhein','bad-herrenalb','bad-wildbad','baden-baden','bietigheim',
  'bischweier','buehl','durmersheim','elchesheim-illingen','ettlingen','forbach',
  'gaggenau','gernsbach','huegelsheim','iffezheim','karlsruhe','karlsruhe-durlach',
  'kuppenheim','loffenau','malsch','muggensturm','oetigheim','pforzheim','rastatt',
  'rheinmuenster','rheinstetten','sinzheim','steinmauern','stutensee','weisenbach',
];

const CITY_LABEL = {
  'achern': 'Achern', 'au-am-rhein': 'Au am Rhein', 'bad-herrenalb': 'Bad Herrenalb',
  'bad-wildbad': 'Bad Wildbad', 'baden-baden': 'Baden-Baden', 'bietigheim': 'Bietigheim',
  'bischweier': 'Bischweier', 'buehl': 'Bühl', 'durmersheim': 'Durmersheim',
  'elchesheim-illingen': 'Elchesheim-Illingen', 'ettlingen': 'Ettlingen',
  'forbach': 'Forbach', 'gaggenau': 'Gaggenau', 'gernsbach': 'Gernsbach',
  'huegelsheim': 'Hügelsheim', 'iffezheim': 'Iffezheim', 'karlsruhe': 'Karlsruhe',
  'karlsruhe-durlach': 'Karlsruhe-Durlach', 'kuppenheim': 'Kuppenheim',
  'loffenau': 'Loffenau', 'malsch': 'Malsch', 'muggensturm': 'Muggensturm',
  'oetigheim': 'Ötigheim', 'pforzheim': 'Pforzheim', 'rastatt': 'Rastatt',
  'rheinmuenster': 'Rheinmünster', 'rheinstetten': 'Rheinstetten', 'sinzheim': 'Sinzheim',
  'steinmauern': 'Steinmauern', 'stutensee': 'Stutensee', 'weisenbach': 'Weisenbach',
};

const HUB_PAGES = new Set([
  'bueroreinigung.html','endreinigung.html','fensterreinigung.html','grundreinigung.html',
  'hausmeisterservice.html','reinigung.html','unterhaltsreinigung.html','unterhaltsreinigung-region.html',
]);

function parseFilename(file) {
  const baseName = path.basename(file);
  const baseNoExt = baseName.replace(/\.html$/, '');
  if (HUB_PAGES.has(baseName)) return { service: baseNoExt, city: null };
  const cities = [...ALL_CITIES].sort((a, b) => b.length - a.length);
  for (const c of cities) {
    if (baseNoExt.endsWith('-' + c)) {
      return { service: baseNoExt.slice(0, -('-' + c).length), city: c };
    }
  }
  return null;
}

function buildRegionalPool(allowedKinds, excludeCity) {
  // Returns up to 6 items of allowed kind from any source folder, excluding
  // sources tied to excludeCity (so a regional Achern page doesn't show
  // achern-specific photos that don't exist anyway, but more importantly so
  // a hybrid Baden-Baden wohnung page doesn't pad with another Baden-Baden
  // wohnung pair already counted).
  const out = [];
  const slug = excludeCity ? (LOCAL_KEYS[excludeCity] || []) : [];
  for (const kind of allowedKinds) {
    const sources = Object.keys(FOLDERS).filter(key =>
      FOLDERS[key].kind === kind && !slug.includes(key)
    );
    // Pick 2 from each source for variety
    for (const key of sources) {
      for (let n = 1; n <= Math.min(FOLDERS[key].count, 2) && out.length < 6; n++) {
        out.push({ key, n, kind });
      }
      if (out.length >= 6) break;
    }
    if (out.length >= 6) break;
  }
  return out;
}

function pickPairs(city, service) {
  const allowedKinds = SERVICE_KIND[service] || ['Wohnung'];
  const locals = city ? (LOCAL_KEYS[city] || []) : [];

  // Gather strictly allowed-kind locals, in kind preference order
  const localItems = [];
  for (const kind of allowedKinds) {
    for (const key of locals) {
      if (FOLDERS[key].kind !== kind) continue;
      for (let n = 1; n <= FOLDERS[key].count && localItems.length < MAX_LOCAL_SLIDERS; n++) {
        localItems.push({ key, n, kind });
      }
    }
    if (localItems.length >= MAX_LOCAL_SLIDERS) break;
  }

  // Decide framing
  if (localItems.length >= 3) {
    // Enough local — fully local gallery
    return { items: localItems, mode: 'local' };
  }
  if (localItems.length > 0) {
    // Hybrid: 1-2 local + pad with regional same-kind
    const regional = buildRegionalPool(allowedKinds, city);
    const seen = new Set(localItems.map(i => i.key + '/' + i.n));
    const padded = localItems.concat(regional.filter(p => !seen.has(p.key + '/' + p.n))).slice(0, 6);
    return { items: padded, mode: 'hybrid', localCount: localItems.length };
  }
  // No matching local — fully regional with disclaimer
  return { items: buildRegionalPool(allowedKinds, city), mode: 'regional' };
}

function buildSlider(item, idx, cityLabel, mode) {
  const f = FOLDERS[item.key];
  const v = `/images/${f.folder}/${f.prefix}-vorher-${item.n}.webp`;
  const a = `/images/${f.folder}/${f.prefix}-nachher-${item.n}.webp`;
  // Per-item subject reflects truth: local items can claim the city, regional
  // items must NOT claim the page's city — they describe the source city.
  let subj;
  if (mode === 'local') {
    subj = `${cityLabel} — ${f.kind}`;
  } else if (mode === 'hybrid') {
    // first localCount items are local, rest are regional
    const itemCity = item.key.endsWith('-rastatt') ? 'Rastatt'
      : item.key.endsWith('-badenbaden') ? 'Baden-Baden'
      : item.key.endsWith('-ettlingen') ? 'Ettlingen'
      : item.key.endsWith('-karlsruhe') ? 'Karlsruhe'
      : item.key.endsWith('-gaggenau') ? 'Gaggenau' : 'Region';
    subj = `${itemCity} — ${f.kind}`;
  } else {
    const itemCity = item.key.endsWith('-rastatt') ? 'Rastatt'
      : item.key.endsWith('-badenbaden') ? 'Baden-Baden'
      : item.key.endsWith('-ettlingen') ? 'Ettlingen'
      : item.key.endsWith('-karlsruhe') ? 'Karlsruhe'
      : item.key.endsWith('-gaggenau') ? 'Gaggenau' : 'Region';
    subj = `${itemCity} — ${f.kind}`;
  }
  const altV = `${subj} — Vorher`;
  const altA = `${subj} — Nachher`;
  const num = String(idx + 1).padStart(2, '0');
  return `    <figure class="vn-card" data-vn>
      <img class="vn-img vn-after" src="${a}" alt="${altA}" loading="lazy" decoding="async"/>
      <img class="vn-img vn-before" src="${v}" alt="${altV}" loading="lazy" decoding="async"/>
      <div class="vn-handle" aria-hidden="true"><div class="vn-knob">⇆</div></div>
      <span class="vn-tag vn-tag-l">Vorher</span>
      <span class="vn-tag vn-tag-r">Nachher</span>
      <span class="vn-num">№ ${num}</span>
    </figure>`;
}

function buildGallerySection(city, service) {
  const cityLabel = city ? (CITY_LABEL[city] || city) : null;
  const { items, isLocal } = pickPairs(city, service);

  const heading = isLocal
    ? `<em>Beispiele</em> aus unseren Räumungen in ${cityLabel}`
    : `<em>Beispiele</em> aus der Region`;
  const desc = isLocal
    ? `Bilder aus realen Aufträgen in ${cityLabel} und direkter Umgebung. <strong>Ziehen Sie den Schieberegler</strong>, um Vorher und Nachher zu vergleichen.`
    : (cityLabel
        ? `Bilder aus realen Aufträgen im Raum Mittelbaden / Karlsruhe. Aus Datenschutzgründen veröffentlichen wir Fotos aus benachbarten Einsätzen statt aus jedem Ort selbst. <strong>Ziehen Sie den Schieberegler</strong>, um Vorher und Nachher zu vergleichen.`
        : `Bilder aus realen Aufträgen im Raum Mittelbaden / Karlsruhe. <strong>Ziehen Sie den Schieberegler</strong>, um Vorher und Nachher zu vergleichen.`);
  const note = `Alle Bilder stammen aus echten Aufträgen — keine Stockfotos. Eigene Fotos können wir auf Anfrage und mit Einverständnis der Auftraggeber für Referenzzwecke teilen.`;

  const cards = items.map((it, i) => buildSlider(it, i, cityLabel, isLocal)).join('\n');

  return `<section class="sec">
    <div class="sec-mark">Galerie</div>
    <h2 class="sec-h">${heading}</h2>
    <p class="sec-p">${desc}</p>
    <div class="vn-grid">
${cards}
    </div>
    <p class="gal-note">${note}</p>
  </section>`;
}

const VN_CSS = `
.vn-grid{display:grid; grid-template-columns:repeat(2,1fr); gap:18px; margin-top:18px;}
@media(max-width:720px){.vn-grid{grid-template-columns:1fr;}}
.vn-card{position:relative; aspect-ratio:4/3; border-radius:12px; overflow:hidden; margin:0; user-select:none; touch-action:pan-y; cursor:ew-resize; background:var(--bg-2,#1a2030); box-shadow:0 10px 24px -10px rgba(26,32,48,.22);}
.vn-img{position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; pointer-events:none;}
.vn-before{clip-path:inset(0 calc(100% - var(--vn-pos,50%)) 0 0); transition:clip-path .04s linear;}
.vn-handle{position:absolute; top:0; bottom:0; left:var(--vn-pos,50%); width:3px; background:#fff; transform:translateX(-50%); pointer-events:none; box-shadow:0 0 8px rgba(0,0,0,.4);}
.vn-knob{position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:38px; height:38px; border-radius:50%; background:#fff; color:#1a2030; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; box-shadow:0 4px 12px rgba(0,0,0,.3);}
.vn-tag{position:absolute; padding:5px 11px; border-radius:999px; font-family:"Geist Mono",monospace; font-size:.62rem; letter-spacing:.18em; text-transform:uppercase; pointer-events:none;}
.vn-tag-l{top:12px; left:12px; background:rgba(255,255,255,.92); color:var(--ink,#1a2030);}
.vn-tag-r{top:12px; right:12px; background:var(--green,#2bbf6e); color:#fff;}
.vn-num{position:absolute; bottom:10px; right:12px; padding:4px 10px; border-radius:999px; font-family:"Geist Mono",monospace; font-size:.6rem; letter-spacing:.14em; background:rgba(0,0,0,.55); color:#fff; pointer-events:none;}
`;

const VN_JS = `
(function(){
  function init(card){
    if(card.dataset.vnReady) return; card.dataset.vnReady='1';
    var setPos = function(clientX){
      var r = card.getBoundingClientRect();
      var pct = ((clientX - r.left) / r.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      card.style.setProperty('--vn-pos', pct + '%');
    };
    var dragging = false;
    var down = function(e){ dragging = true; var x = (e.touches?e.touches[0].clientX:e.clientX); setPos(x); e.preventDefault && e.preventDefault(); };
    var move = function(e){ if(!dragging) return; var x = (e.touches?e.touches[0].clientX:e.clientX); setPos(x); };
    var up = function(){ dragging = false; };
    card.addEventListener('mousedown', down);
    card.addEventListener('touchstart', down, {passive:false});
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, {passive:true});
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    // Optional hover preview on desktop
    card.addEventListener('mouseenter', function(){ if(!dragging) card.style.setProperty('--vn-pos','50%'); });
  }
  function ready(){ document.querySelectorAll('[data-vn]').forEach(init); }
  if(document.readyState!=='loading') ready();
  else document.addEventListener('DOMContentLoaded', ready);
})();
`;

function fixPage(file) {
  const meta = parseFilename(file);
  if (!meta) return { changed: false, reason: 'no city/hub match' };

  let html = fs.readFileSync(file, 'utf8');
  const startMatch = html.match(/<section class="sec">\s*<div class="sec-mark">Galerie<\/div>/);
  if (!startMatch) return { changed: false, reason: 'no gallery section' };

  const start = startMatch.index;
  const after = html.slice(start);
  const endIdx = after.indexOf('</section>');
  if (endIdx < 0) return { changed: false, reason: 'no closing section' };
  const sectionEnd = start + endIdx + '</section>'.length;
  const oldSection = html.slice(start, sectionEnd);

  const newSection = buildGallerySection(meta.city, meta.service);
  if (oldSection === newSection && html.includes('.vn-grid{')) return { changed: false, reason: 'no-op' };

  html = html.slice(0, start) + newSection + html.slice(sectionEnd);

  // Inject CSS into the first <style> block (idempotent — replace if present)
  if (html.includes('/* vn-slider css */')) {
    html = html.replace(/\/\* vn-slider css \*\/[\s\S]*?\/\* \/vn-slider css \*\//,
      `/* vn-slider css */${VN_CSS}/* /vn-slider css */`);
  } else {
    html = html.replace(/(<style[^>]*>)/, `$1/* vn-slider css */${VN_CSS}/* /vn-slider css */`);
  }

  // Strip any older one-off badges/CSS we injected before (vn-tag with ↔)
  html = html.replace(/\.vn-tag\{position:absolute;[^}]+\}\s*/g, '');

  // Inject JS just before </body>, idempotent
  if (html.includes('/* vn-slider js */')) {
    html = html.replace(/\/\* vn-slider js \*\/[\s\S]*?\/\* \/vn-slider js \*\//,
      `/* vn-slider js */${VN_JS}/* /vn-slider js */`);
  } else {
    html = html.replace(/(<\/body>)/i,
      `<script>/* vn-slider js */${VN_JS}/* /vn-slider js */</script>$1`);
  }

  fs.writeFileSync(file, html);
  return { changed: true, items: pickPairs(meta.city, meta.service).items.length, isLocal: pickPairs(meta.city, meta.service).isLocal };
}

function listHtml(dir) {
  return fs.readdirSync(dir)
    .filter(n => n.endsWith('.html') && !n.startsWith('_'))
    .map(n => path.join(dir, n));
}

const files = listHtml(REPO);
const stats = { changed: 0, local: 0, regional: 0, skipped: 0 };
const skipReasons = {};
for (const f of files) {
  const r = fixPage(f);
  if (r.changed) {
    stats.changed++;
    if (r.isLocal) stats.local++;
    else stats.regional++;
  } else {
    stats.skipped++;
    skipReasons[r.reason] = (skipReasons[r.reason] || 0) + 1;
  }
}
console.log(`Updated ${stats.changed} pages (${stats.local} local, ${stats.regional} regional)`);
console.log(`Skipped ${stats.skipped}:`, skipReasons);
