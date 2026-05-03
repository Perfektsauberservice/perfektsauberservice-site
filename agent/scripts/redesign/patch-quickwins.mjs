// In-place patches for Lighthouse quick wins. Idempotent.
//   1. --muted color #5a6173 → #4a5160 (contrast fix)
//   2. cookie banner buttons aria-label
//   3. <label class="calc-lbl"> for= association on calculator
//   4. defer Leaflet JS until #standorte-map enters viewport (homepage only)
//   5. width/height attrs on <img> for CLS reservation
//
// Run from repo root: node agent/scripts/redesign/patch-quickwins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';

const ROOT = process.cwd();
const sizeCache = new Map();
function getImgSize(srcAttr) {
  if (!srcAttr || srcAttr.startsWith('http') || srcAttr.startsWith('data:')) return null;
  const cleanSrc = srcAttr.split('?')[0].split('#')[0];
  if (sizeCache.has(cleanSrc)) return sizeCache.get(cleanSrc);
  const filePath = path.join(ROOT, cleanSrc.replace(/^\//, ''));
  let result = null;
  try {
    if (fs.existsSync(filePath)) {
      const dim = imageSize(fs.readFileSync(filePath));
      if (dim && dim.width && dim.height) result = { w: dim.width, h: dim.height };
    }
  } catch {}
  sizeCache.set(cleanSrc, result);
  return result;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'agent') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archived' || entry.name === '_backup_2026-05-03') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
let muted = 0, cookie = 0, calcLabels = 0, leaflet = 0, imgWH = 0, imgWHCount = 0, lazyCalc = 0;

for (const f of files) {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;

  // 1. Contrast: darker --muted
  html = html.replace(/--muted:#5a6173/g, '--muted:#4a5160');
  if (html !== orig) muted++;

  // 2. Cookie banner buttons aria-label
  const before2 = html;
  html = html.replace(/<button class="acc" id="cookieAccept">/g, '<button class="acc" id="cookieAccept" aria-label="Alle Cookies akzeptieren">');
  html = html.replace(/<button class="dec" id="cookieDecline">/g, '<button class="dec" id="cookieDecline" aria-label="Nur notwendige Cookies">');
  if (html !== before2) cookie++;

  // 3. Calculator: associate <label class="calc-lbl"> with the next input/select via `for`
  const before3 = html;
  html = html.replace(/<label class="calc-lbl">([\s\S]*?)<\/label>(\s*)(<(?:input|select)[^>]*id="([^"]+)")/g,
    (m, inner, ws, tag, id) => `<label class="calc-lbl" for="${id}">${inner}</label>${ws}${tag}`);
  if (html !== before3) calcLabels++;

  // 4. Defer Leaflet JS until #standorte-map enters viewport.
  //    Only matches files where leaflet.js is loaded synchronously (homepage).
  const before4 = html;
  html = html.replace(
    /<script src="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js" integrity="([^"]+)" crossorigin=""><\/script>\s*<script>\s*\(function\(\)\{\s*if \(typeof L === 'undefined'\) return;/,
    (m, integrity) => `<script>
  (function(){
    var el = document.getElementById('standorte-map');
    if (!el) return;
    var loaded = false;
    function load(){
      if (loaded) return; loaded = true;
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.integrity = '${integrity}';
      s.crossOrigin = '';
      s.onload = init;
      document.head.appendChild(s);
    }
    function init(){
      if (typeof L === 'undefined') return;`
  );
  // Close: replace `})();` (the outer IIFE close) with init body close + loader trigger.
  // We tagged the new function as `function init(){`, so we need to close it AND keep the IIFE close.
  // Strategy: match the exact closing pattern (the only `})();` near end of map script).
  if (html !== before4) {
    // Find the end of the map IIFE — it ends with `})();\n  </script>`.
    // Replace it with `}\n    if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function(es){ if (es[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '200px' }); io.observe(el); } else { load(); }\n  })();\n  </script>`
    const closeReplacement = `}
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function(es){ if (es[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '200px' });
      io.observe(el);
    } else { load(); }
  })();
  </script>
  <div style="display:flex; flex-wrap:wrap; gap:8px;">`;
    html = html.replace(
      /\}\)\(\);\s*<\/script>\s*<div style="display:flex; flex-wrap:wrap; gap:8px;">/,
      closeReplacement
    );
    leaflet++;
  }

  // 5b. Lazy-load the calculator <script> (Price calculator IIFE). Runs only on
  //     pages with `// ===== Price calculator` marker (preisrechner + homepage).
  //     Idempotent: if the script tag already has type="text/x-deferred-calc"
  //     OR a #calcLoader exists, skip.
  const before5b = html;
  if (html.includes('// ===== Price calculator') && !html.includes('text/x-deferred-calc')) {
    html = html.replace(
      /<script>(\s*\/\/ ===== Price calculator)/,
      '<script type="text/x-deferred-calc" id="calcDeferred">$1'
    );
    const loader = `
<script>
(function(){
  var calc = document.getElementById('calcDeferred'); if (!calc) return;
  var fired = false;
  function go(){
    if (fired) return; fired = true;
    var s = document.createElement('script');
    s.text = calc.textContent;
    document.body.appendChild(s);
  }
  var sec = document.getElementById('rechner') || document.getElementById('preisrechner') || calc.previousElementSibling;
  if (sec && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(es){ if (es[0].isIntersecting) { io.disconnect(); go(); } }, { rootMargin: '600px' });
    io.observe(sec);
  }
  ['click','scroll','keydown','touchstart','pointerdown'].forEach(function(ev){
    addEventListener(ev, go, { once: true, passive: true });
  });
  // Safety: if neither IO nor interaction fires within 6s, run anyway
  setTimeout(go, 6000);
})();
</script>`;
    html = html.replace('</body>', loader + '\n</body>');
  }
  if (html !== before5b) lazyCalc++;

  // 5. Inject width/height on <img> tags from real file dimensions. Idempotent —
  //    skips imgs that already have both attrs.
  const before5 = html;
  let perFile = 0;
  html = html.replace(/<img\s+([^>]*?)\/?>/g, (full, attrs) => {
    if (/\swidth\s*=/.test(' ' + attrs) && /\sheight\s*=/.test(' ' + attrs)) return full;
    const srcMatch = attrs.match(/\bsrc\s*=\s*"([^"]+)"/);
    if (!srcMatch) return full;
    const dim = getImgSize(srcMatch[1]);
    if (!dim) return full;
    perFile++;
    // Insert width/height right after src= attribute
    const withWH = attrs.replace(/(\bsrc\s*=\s*"[^"]+")/, `$1 width="${dim.w}" height="${dim.h}"`);
    return `<img ${withWH}/>`;
  });
  if (perFile > 0) { imgWH++; imgWHCount += perFile; }

  if (html !== orig) fs.writeFileSync(f, html);
}

console.log(`patched: ${muted} (--muted), ${cookie} (cookie a11y), ${calcLabels} (calc labels), ${leaflet} (leaflet defer), ${lazyCalc} (lazy calc), ${imgWH} files / ${imgWHCount} imgs (width+height)`);
