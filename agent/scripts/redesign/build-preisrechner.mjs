// Build /preisrechner with the full interactive calculator from cibersite.
// Pulls the calculator HTML + JS verbatim from the cibersite source so the
// behaviour matches the homepage's #rechner anchor exactly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS, FONTS_HEAD } from './lib/css.mjs';
import { NAV, FOOTER, FAB, COOKIE, SCRIPTS, GA4, contactSection } from './lib/parts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CIBERSITE = path.join(HERE, 'lib/_cibersite-index.html');

const src = fs.readFileSync(CIBERSITE, 'utf8');
const lines = src.split('\n');

// Calculator HTML: lines 412..693 (1-indexed in original)
const calcHtml = lines.slice(411, 693).join('\n');
// Calculator JS IIFE only (skip the surrounding gallery/lightbox/reveal): 798..980
const calcJs = lines.slice(797, 980).join('\n') + '\n</script>';

// Patch image paths in the extracted HTML — calculator block doesn't reference
// images, but be safe.
const calcHtmlFixed = calcHtml
  .replace(/src="img\//g, 'src="/images/cibersite/')
  .replace(/`img\//g, '`/images/cibersite/');

const SITE = 'https://perfektsauberservice.com';
const URL = `${SITE}/preisrechner`;

const title = 'Preisrechner | Festpreis sofort schätzen | Perfekt Sauber Service';
const desc = 'Kostenloser Preisrechner für Wohnungsauflösung, Entrümpelung, Bauendreinigung, Grundreinigung und Malerarbeiten. Schiebe die Regler — sofortige Schätzung nach echter Preisrichtwert-Tabelle.';

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Perfekt Sauber Service Preisrechner',
  url: URL,
  description: desc,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  provider: {
    '@type': 'LocalBusiness',
    name: 'Perfekt Sauber Service',
    telephone: '+49 163 9087197',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Reutstraße 9',
      addressLocality: 'Loffenau',
      postalCode: '76597',
      addressCountry: 'DE',
    },
  },
}, null, 2);

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${URL}">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE}/images/echipa.webp">
<meta property="og:locale" content="de_DE">
<link rel="canonical" href="${URL}">
${FONTS_HEAD}
<style>${CSS}</style>
<script type="application/ld+json">
${jsonLd}
</script>
${GA4}
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
</style>
</head>
<body>
${NAV}
<nav class="crumb"><a href="/">Startseite</a><span class="sep">›</span><span>Preisrechner</span></nav>
<section class="hero" style="padding-bottom:40px;">
  <div>
    <span class="eyebrow">Festpreis · Sofort-Schätzung · Vor-Ort-Termin kostenlos</span>
    <h1 class="h1">Preis-<em>Rechner</em>.<br/>Festpreis nach <b>Begehung</b>.</h1>
    <p class="deck">Detaillierte Schätzung nach echter Preisrichtwert-Tabelle. Schieben Sie die Regler — Sie sehen sofort jede Position. Den verbindlichen Festpreis erhalten Sie nach kostenloser Vor-Ort-Besichtigung.</p>
    <div class="cta-row">
      <a href="#rechner" class="btn btn-pri">Jetzt rechnen ↓</a>
      <a href="https://wa.me/491639087197" class="btn btn-w" target="_blank" rel="noreferrer">WhatsApp →</a>
      <a href="tel:+491639087197" class="btn btn-phone">📞 0163 9087197</a>
    </div>
  </div>
  <div class="hero-img">
    <img src="/images/echipa.webp" alt="Perfekt Sauber Service Team" loading="eager"/>
    <div class="badge"><strong>Kostenlos</strong><span>Schätzen</span></div>
  </div>
</section>

${calcHtmlFixed}

${contactSection('', '', '')}
${FOOTER}
${FAB}
${COOKIE}
${calcJs}
${SCRIPTS}
</body>
</html>`;

const out = path.join(process.cwd(), 'preisrechner.html');
fs.writeFileSync(out, html);
console.log(`✓ ${out} (${html.length} bytes)`);
