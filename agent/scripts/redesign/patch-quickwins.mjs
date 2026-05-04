// In-place patches for Lighthouse quick wins. Idempotent.
//   1. --muted color #5a6173 → #4a5160 (contrast fix)
//   2. cookie banner buttons aria-label
//   3. <label class="calc-lbl"> for= association on calculator
//   4. defer Leaflet JS until #standorte-map enters viewport (homepage only)
//   5. width/height attrs on <img> for CLS reservation
//   6. lazy-load calculator IIFE until first interaction
//   7. extract deferred CSS portion to /css/site-deferred.css + async-load
//
// Run from repo root: node agent/scripts/redesign/patch-quickwins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';
import { CSS } from './lib/css.mjs';

const ROOT = process.cwd();
const CSS_SPLIT_MARKER = '/* PRICE TABLE (editorial) */';
const CSS_SPLIT_IDX = CSS.indexOf(CSS_SPLIT_MARKER);
const CSS_DEFERRED_LF = CSS.slice(CSS_SPLIT_IDX);
const CSS_DEFERRED_CRLF = CSS_DEFERRED_LF.replace(/\n/g, '\r\n');
const ASYNC_CSS_LINK = '<link rel="preload" href="/css/site-deferred.css" as="style" onload="this.onload=null;this.rel=\'stylesheet\'"><noscript><link rel="stylesheet" href="/css/site-deferred.css"></noscript>';

// GA4 deferred-load pattern — defines gtag() shim immediately (so SCRIPTS click
// trackers work) but loads the GA library on requestIdleCallback (or 2.5s
// fallback). Page_view event fires once lib loads. Trades ~3s analytics
// latency for huge LCP/Mobile Perf gain.
const GA4_DEFERRED = `<!-- Google Analytics 4 (deferred to browser idle for perf) -->
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
(function(){
  var loaded = false;
  function loadGA(){
    if (loaded) return; loaded = true;
    gtag('js', new Date());
    gtag('config', 'G-BMC32KSYKF');
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=G-BMC32KSYKF';
    document.head.appendChild(s);
  }
  if ('requestIdleCallback' in window) requestIdleCallback(loadGA, { timeout: 4000 });
  else setTimeout(loadGA, 2500);
})();
</script>`;
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
let muted = 0, cookie = 0, calcLabels = 0, leaflet = 0, imgWH = 0, imgWHCount = 0, lazyCalc = 0, deferCss = 0, fontsAsync = 0, ga4Defer = 0;

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

  // 7. Extract deferred CSS portion → external file, replace inline with async <link>.
  //    Idempotent: skip if /css/site-deferred.css already referenced.
  if (!html.includes('/css/site-deferred.css')) {
    let replaced = false;
    if (html.includes(CSS_DEFERRED_CRLF)) {
      html = html.replace(CSS_DEFERRED_CRLF, '');
      replaced = true;
    } else if (html.includes(CSS_DEFERRED_LF)) {
      html = html.replace(CSS_DEFERRED_LF, '');
      replaced = true;
    }
    if (replaced) {
      html = html.replace('</head>', `${ASYNC_CSS_LINK}\n</head>`);
      deferCss++;
    }
  }

  // 9. Defer GA4 library load until requestIdleCallback (or 2.5s fallback).
  //    Idempotent: skip if already deferred (marker: "deferred to browser idle").
  if (!html.includes('deferred to browser idle')) {
    const before9 = html;
    // Match the standard GA4 block we ship:
    //   <!-- Google Analytics 4 -->
    //   <script async src="...gtag/js?id=G-BMC32KSYKF"></script>
    //   <script>
    //   window.dataLayer = ...; function gtag(){...}; gtag('js', ...); gtag('config', ...);
    //   </script>
    html = html.replace(
      /<!-- Google Analytics 4 -->\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-BMC32KSYKF"><\/script>\s*<script>\s*window\.dataLayer = window\.dataLayer \|\| \[\];\s*function gtag\(\)\{dataLayer\.push\(arguments\);\}\s*gtag\('js', new Date\(\)\);\s*gtag\('config', 'G-BMC32KSYKF'\);\s*<\/script>/,
      GA4_DEFERRED
    );
    if (html !== before9) ga4Defer++;
  }

  // 8. Convert Google Fonts <link rel="stylesheet"> → non-blocking preload pattern.
  //    URL already has `&display=swap`, so fallback font shows briefly then swaps.
  //    Negative lookbehind: skip the link if already inside <noscript>.
  const before8 = html;
  html = html.replace(
    /(?<!<noscript>)<link href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)" rel="stylesheet"\/?>/g,
    (m, href) => `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'"/><noscript><link href="${href}" rel="stylesheet"/></noscript>`
  );
  if (html !== before8) fontsAsync++;

  if (html !== orig) fs.writeFileSync(f, html);
}

console.log(`patched: ${muted} (--muted), ${cookie} (cookie a11y), ${calcLabels} (calc labels), ${leaflet} (leaflet defer), ${lazyCalc} (lazy calc), ${imgWH}f/${imgWHCount}i (WH), ${deferCss} (def css), ${fontsAsync} (fonts), ${ga4Defer} (GA4 defer)`);
