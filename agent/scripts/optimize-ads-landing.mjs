// Speed fixes for the 6 Google Ads landing pages (mobile "landing page experience", 16.10.2026).
//   node agent/scripts/optimize-ads-landing.mjs
// 1) remove the high-priority preload of an image the page never shows (Rastatt / Karlsruhe pages)
//    and preload the real hero image instead (responsive)
// 2) hero images get a 480px variant for phones (srcset/sizes)
// 3) preload the two critical variable fonts (Inter text, Fraunces headings) -> fewer late reflows / shifts
// 4) no backdrop blur on the sticky menu on phones (expensive to paint)
// 5) below-the-fold stylesheets (reviews widget, CTA band) no longer block rendering
// 6) favicon link (the missing /favicon.ico produced a 404 on every page)
// Idempotent: a page already carrying the marker is skipped.
import { readFileSync, writeFileSync } from 'node:fs';

const PAGES = ['entruempelung-rastatt', 'haushaltsaufloesung-rastatt', 'entruempelung-karlsruhe',
  'haushaltsaufloesung-karlsruhe', 'entruempelung-baden-baden', 'haushaltsaufloesung-baden-baden'];
const MARK = '<!-- pss-landing-perf-v1 -->';
const SIZES = '(max-width: 760px) 92vw, 560px';
const BB = '/images/locations/haushaltsaufloesung-baden-baden-wohnung-freigeraeumt';

function once(html, from, to, label) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: expected 1 match, found ${n}`);
  return html.replace(from, to);
}

export function optimize(html) {
  if (html.includes(MARK)) return { html, changed: false };
  let h = html;
  const vorNach = h.includes('src="/images/hero-nach-800.webp"');
  if (vorNach) {
    h = once(h, 'src="/images/hero-nach-800.webp" width="800" height="800"',
      `src="/images/hero-nach-800.webp" srcset="/images/hero-nach-480.webp 480w, /images/hero-nach-800.webp 800w" sizes="${SIZES}" fetchpriority="high" width="800" height="800"`, 'hero-nach');
    h = once(h, 'src="/images/hero-vor-800.webp" width="800" height="1000"',
      `src="/images/hero-vor-800.webp" srcset="/images/hero-vor-480.webp 480w, /images/hero-vor-800.webp 800w" sizes="${SIZES}" width="800" height="1000"`, 'hero-vor');
    // the preloaded "freigeraeumter-bereich" image is not used on these pages -> preload the real hero
    h = h.replace(/<link rel="preload" as="image" href="\/images\/locations\/entruempelung-(rastatt|karlsruhe)-freigeraeumter-bereich\.webp" fetchpriority="high">/,
      `<link rel="preload" as="image" href="/images/hero-nach-800.webp" imagesrcset="/images/hero-nach-480.webp 480w, /images/hero-nach-800.webp 800w" imagesizes="${SIZES}" fetchpriority="high">`);
    if (h.includes('freigeraeumter-bereich.webp" fetchpriority="high"')) throw new Error('unused preload not replaced');
  } else {
    h = once(h, `<link rel="preload" as="image" href="${BB}.webp" fetchpriority="high">`,
      `<link rel="preload" as="image" href="${BB}.webp" imagesrcset="${BB}-480.webp 480w, ${BB}.webp 940w" imagesizes="${SIZES}" fetchpriority="high">`, 'bb-preload');
    const imgRe = new RegExp(`src="${BB.replace(/\//g, '\\/')}\\.webp"`, 'g');
    if (!imgRe.test(h)) throw new Error('bb hero img not found');
    h = h.replace(new RegExp(`src="${BB.replace(/\//g, '\\/')}\\.webp"`), `src="${BB}.webp" srcset="${BB}-480.webp 480w, ${BB}.webp 940w" sizes="${SIZES}"`);
  }
  // critical fonts + mobile menu without blur + favicon, right after the fonts.css preload
  h = once(h, '<noscript><link rel="stylesheet" href="/fonts/fonts.css"/></noscript>',
    '<noscript><link rel="stylesheet" href="/fonts/fonts.css"/></noscript>\n' + MARK + '\n'
    + '<link rel="preload" href="/fonts/inter-Cp50SjIa1ZL7.woff2" as="font" type="font/woff2" crossorigin>\n'
    + '<link rel="preload" href="/fonts/fraunces-c2Wa0KxC9TeA.woff2" as="font" type="font/woff2" crossorigin>\n'
    + '<link rel="icon" href="/images/favicon-32.png" sizes="32x32" type="image/png">\n'
    + '<style>@media(max-width:760px){.nav{backdrop-filter:none;-webkit-backdrop-filter:none;background:rgba(251,247,240,.98)}}</style>', 'fonts');
  // below-the-fold stylesheets: load without blocking the first paint
  for (const href of ['/css/gbp-reviews-widget.css?v=20260930b', '/css/cta-band.css?v=3']) {
    h = once(h, `<link rel="stylesheet" href="${href}">`,
      `<link rel="preload" href="${href}" as="style" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${href}"></noscript>`, href);
  }
  return { html: h, changed: true };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('optimize-ads-landing.mjs')) {
  for (const p of PAGES) {
    const f = `${p}.html`;
    const { html, changed } = optimize(readFileSync(f, 'utf8'));
    if (changed) writeFileSync(f, html);
    console.log(`${f}: ${changed ? 'optimized' : 'already optimized'}`);
  }
}
