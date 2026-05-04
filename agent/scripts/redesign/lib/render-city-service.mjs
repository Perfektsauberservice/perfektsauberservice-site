// Render a parsed city × service page into the new editorial design.
// All SEO assets (head meta, JSON-LD, internal links, page slug) are preserved.

import { CSS, FONTS_HEAD } from './css.mjs';
import { NAV, STRIP, FOOTER, FAB, COOKIE, SCRIPTS, GA4, contactSection, leadFormSection } from './parts.mjs';

// Convert WhatsApp encoded text back to readable string for service label inference
function inferServiceLabel(d) {
  // Best signal: the H1's first words (e.g., "Büroauflösung Karlsruhe — ...")
  const m = d.h1?.match(/^([\wäöüÄÖÜß-]+)\s/);
  return m ? m[1] : 'eine Anfrage';
}
function inferCity(d) {
  // crumbCurrent = "Service City" → take everything after first space
  const m = d.crumbCurrent?.match(/^\S+\s+(.+)$/);
  return m ? m[1] : '';
}

// Render breadcrumb as a Geist Mono chip line
function renderCrumb(d) {
  const parts = [];
  d.crumbs.forEach((c, i) => {
    parts.push(`<a href="${c.href}">${c.label}</a>`);
    parts.push(`<span class="sep">›</span>`);
  });
  parts.push(`<span>${d.crumbCurrent || ''}</span>`);
  return `<nav class="crumb">${parts.join('')}</nav>`;
}

// Render hero with editorial typography. We try to find an em-em-pattern in the H1
// (separating service from city) for visual richness. Falls back to plain h1.
function renderHero(d) {
  const city = inferCity(d);
  const serviceLabel = inferServiceLabel(d);

  // Try to split H1 at em-dash for editorial wrap
  // e.g. "Büroauflösung Karlsruhe — Festpreis, 48h-Termin, DSGVO-konform"
  let h1Html = escapeHtml(d.h1);
  const dashSplit = d.h1.split(/\s—\s|\s–\s/);
  if (dashSplit.length === 2) {
    // Italicize the city name in the lead, keep the tail bold
    const lead = dashSplit[0];
    const tail = dashSplit[1];
    if (city && lead.includes(city)) {
      const leadHtml = escapeHtml(lead).replace(escapeHtml(city), `<em>${escapeHtml(city)}</em>`);
      h1Html = `${leadHtml}<br/><b>${escapeHtml(tail)}</b>`;
    } else {
      h1Html = `${escapeHtml(lead)}<br/><b>${escapeHtml(tail)}</b>`;
    }
  }

  const wa = d.waText || encodeURIComponent(`Hallo, ich möchte eine Anfrage für ${serviceLabel}${city ? ' in ' + city : ''} stellen.`);
  const trust = (d.trustItems || []).slice(0, 4)
    .map(t => t.replace(/^[✓\s]+/, '').trim())
    .filter(Boolean);

  const trustHtml = trust.length
    ? `<div class="trust">${trust.map(t => `<div class="it"><strong>✓</strong><span>${escapeHtml(t)}</span></div>`).join('')}</div>`
    : `<div class="trust">
        <div class="it"><strong>5,0★</strong><span>Google</span></div>
        <div class="it"><strong>48h</strong><span>Termin</span></div>
        <div class="it"><strong>0 €</strong><span>Besichtigung</span></div>
        <div class="it"><strong>100%</strong><span>Festpreis</span></div>
      </div>`;

  return `<section class="hero">
  <div>
    ${d.eyebrow ? `<span class="eyebrow">${escapeHtml(d.eyebrow)}</span>` : ''}
    <h1 class="h1">${h1Html}</h1>
    <p class="deck">${escapeHtml(d.sub)}</p>
    <div class="cta-row">
      <a href="tel:+491639087197" class="btn btn-phone">📞 0163 9087197</a>
      <a href="https://wa.me/491639087197?text=${wa}" class="btn btn-w" target="_blank" rel="noreferrer">WhatsApp →</a>
      <a href="/preisrechner" class="btn btn-sec">Preis berechnen</a>
    </div>
    ${trustHtml}
  </div>
  <div class="hero-img">
    <img src="${escapeAttr(d.heroImg || '/images/echipa.webp')}" alt="${escapeAttr(d.heroImgAlt || d.h1)}" loading="eager"/>
    <div class="badge"><strong>Vor &amp; Nach</strong><span>${escapeHtml(city || 'Region')}</span></div>
  </div>
</section>`;
}

function renderPrice(s) {
  const rows = s.rows.map(r => `
    <div class="price-row">
      <div class="price-name">${cleanCell(r[0])}</div>
      <div class="price-ex">${cleanCell(r[1])}</div>
      <div class="price-val">${cleanCell(r[2])}</div>
    </div>`).join('');
  const note = s.note ? `<div class="price-note">${s.note}</div>` : '';
  return `<section class="sec">
    <div class="sec-mark">Preise</div>
    <h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>
    ${s.intro ? `<p class="sec-p">${escapeHtml(s.intro)}</p>` : ''}
    <div class="price-edit">${rows}</div>
    ${note}
  </section>`;
}

function renderCards(s) {
  const cards = s.cards.map(c => `
    <div class="card">
      <div class="ic">№</div>
      <h3>${cleanCardTitle(c.title)}</h3>
      <p>${escapeHtml(c.desc)}</p>
    </div>`).join('');
  return `<section class="sec alt">
    <div style="max-width:1440px; margin:0 auto;">
      <div class="sec-mark">Leistungen</div>
      <h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>
      ${s.intro ? `<p class="sec-p">${escapeHtml(s.intro)}</p>` : ''}
      <div class="cards">${cards}</div>
    </div>
  </section>`;
}

function renderGallery(s) {
  const tiles = (s.images || []).map((img, i) => `
    <div class="gal-card">
      <img src="${escapeAttr(img.src)}" alt="${escapeAttr(img.alt)}" loading="lazy"/>
      <span class="num">№ ${String(i + 1).padStart(2, '0')}</span>
    </div>`).join('');
  return `<section class="sec">
    <div class="sec-mark">Galerie</div>
    <h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>
    ${s.intro ? `<p class="sec-p">${escapeHtml(s.intro)}</p>` : ''}
    <div class="gal-grid">${tiles}</div>
    ${s.note ? `<p class="gal-note">${escapeHtml(s.note)}</p>` : ''}
  </section>`;
}

function renderSteps(s) {
  const steps = s.steps.map((st, i) => `
    <div class="step">
      <div class="step-n">№ ${String(i + 1).padStart(2, '0')}</div>
      <h3>${escapeHtml(st.title)}</h3>
      <p>${escapeHtml(st.desc)}</p>
    </div>`).join('');
  return `<section class="sec alt">
    <div style="max-width:1440px; margin:0 auto;">
      <div class="sec-mark">So läuft es ab</div>
      <h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>
      <div class="steps">${steps}</div>
    </div>
  </section>`;
}

function renderUsps(s) {
  const usps = s.usps.map(u => `
    <div class="usp">
      <div class="num">${escapeHtml(u.num)}</div>
      <h3>${escapeHtml(u.title)}</h3>
      <p>${escapeHtml(u.desc)}</p>
    </div>`).join('');
  return `<section class="sec">
    <div class="sec-mark">Warum wir</div>
    <h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>
    <div class="usps">${usps}</div>
  </section>`;
}

function renderDistricts(s) {
  const chips = (s.chips || []).map(c => `<span class="chip">${escapeHtml(c)}</span>`).join('');
  return `<section class="sec alt">
    <div style="max-width:1440px; margin:0 auto;">
      <div class="sec-mark">Einsatzgebiete</div>
      <h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>
      ${s.intro ? `<p class="sec-p">${escapeHtml(s.intro)}</p>` : ''}
      <div class="dist">${chips}</div>
      ${s.umlandH3 ? `<div class="umland"><h3>${escapeHtml(s.umlandH3)}</h3><p>${escapeHtml(s.umlandText)}</p></div>` : ''}
    </div>
  </section>`;
}

function renderFaq(s) {
  const items = s.faqs.map((f, i) => `
    <details${i === 0 ? ' open' : ''}>
      <summary>${escapeHtml(f.q)}</summary>
      <div class="ans">${escapeHtml(f.a)}</div>
    </details>`).join('');
  return `<section class="sec">
    <div class="sec-mark">Häufige Fragen</div>
    <h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>
    <div class="faq">${items}</div>
  </section>`;
}

function renderRelated(s) {
  // The original section can have multiple .related blocks separated by <h3>
  // s.groups = [{links: [...]}, ...], s.h3s = [...]
  // First .related corresponds to no h3 (or first h3 is for second group)
  // Safest: render groups in order, prefix each (after the first) with the h3
  const blocks = [];
  s.groups.forEach((g, i) => {
    if (i > 0 && s.h3s[i - 1]) {
      blocks.push(`<h3 class="rel-h">${escapeHtml(s.h3s[i - 1])}</h3>`);
    }
    blocks.push(`<div class="rel-grid">${g.links.map(l => `<a href="${escapeAttr(l.href)}">${escapeHtml(l.label)} →</a>`).join('')}</div>`);
  });
  return `<section class="sec">
    <div class="sec-mark">Verwandt</div>
    <h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>
    ${blocks.join('')}
  </section>`;
}

// Fallback: render unrecognised section as plain editorial text from H2 + intro
function renderGeneric(s) {
  if (!s.h2 && !s.intro) return '';
  return `<section class="sec">
    <h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>
    ${s.intro ? `<p class="sec-p">${escapeHtml(s.intro)}</p>` : ''}
  </section>`;
}

const SECTION_RENDERERS = {
  price: renderPrice,
  cards: renderCards,
  gallery: renderGallery,
  steps: renderSteps,
  usps: renderUsps,
  districts: renderDistricts,
  faq: renderFaq,
  related: renderRelated,
};

export function renderCityService(d) {
  const sectionsHtml = (d.sections || []).map(s => {
    const fn = SECTION_RENDERERS[s.kind];
    return fn ? fn(s) : renderGeneric(s);
  }).join('\n');

  const city = inferCity(d);
  const serviceLabel = inferServiceLabel(d);
  const ctaWa = d.ctaWaText || d.waText || '';
  const ctaWaDecoded = (() => { try { return decodeURIComponent(ctaWa); } catch { return ''; } })();

  // Preserve all JSON-LD blocks verbatim
  const jsonLd = (d.jsonLdBlocks || [])
    .map(b => `<script type="application/ld+json">\n${b}\n</script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${d.lang || 'de'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow">
<title>${d.title}</title>
<meta name="description" content="${d.metaDescription}">
${d.ogTitle ? `<meta property="og:title" content="${d.ogTitle}">` : ''}
${d.ogDescription ? `<meta property="og:description" content="${d.ogDescription}">` : ''}
${d.ogUrl ? `<meta property="og:url" content="${d.ogUrl}">` : ''}
<meta property="og:type" content="website">
${d.ogImage ? `<meta property="og:image" content="${d.ogImage}">` : ''}
<meta property="og:locale" content="de_DE">
${d.canonical ? `<link rel="canonical" href="${d.canonical}">` : ''}
${FONTS_HEAD}
<style>${CSS}</style>
${jsonLd}
${GA4}
</head>
<body>
${NAV}
${renderCrumb(d)}
${renderHero(d)}
${STRIP}
${sectionsHtml}
${leadFormSection(city, serviceLabel)}
${contactSection(city, serviceLabel, ctaWaDecoded)}
${FOOTER}
${FAB}
${COOKIE}
${SCRIPTS}
</body>
</html>`;
}

// ---- helpers ----
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

// Italicize first word inside an H2 for editorial flair.
// "Was kostet eine Büroauflösung in Karlsruhe?" → "Was <em>kostet</em> ..."
function italicizeFirst(htmlEscapedText) {
  // Skip if already has tags
  if (htmlEscapedText.includes('<')) return htmlEscapedText;
  // Find a short emphatic word (>=4 chars, not a stop word) somewhere in first 40 chars
  const stopWords = new Set(['was', 'wer', 'wie', 'wo', 'wann', 'warum', 'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'auch', 'sind', 'wir', 'sie', 'für', 'mit', 'von', 'auf', 'bei', 'nach', 'aus', 'zu', 'vor', 'an', 'in', 'so', 'läuft', 'es', 'ab']);
  const words = htmlEscapedText.split(/(\s+)/);
  for (let i = 0; i < Math.min(words.length, 6); i++) {
    const w = words[i];
    const clean = w.toLowerCase().replace(/[^a-zäöüß]/gi, '');
    if (clean.length >= 4 && !stopWords.has(clean)) {
      words[i] = `<em>${w}</em>`;
      return words.join('');
    }
  }
  return htmlEscapedText;
}

// Clean a price-table cell: drop wrapping <strong>, keep inner text
function cleanCell(c) {
  return String(c || '')
    .replace(/&amp;/g, '&')
    .trim();
}
// Card title may contain emoji at start — keep it; bold styling is in CSS via h3
function cleanCardTitle(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .trim();
}

// CLI: render to _preview/<basename>
if (process.argv[1]?.endsWith('render-city-service.mjs')) {
  const { parseCityService } = await import('./parse-city-service.mjs');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const file = process.argv[2];
  if (!file) { console.error('Usage: node render-city-service.mjs <file.html>'); process.exit(1); }
  const data = parseCityService(file);
  const out = renderCityService(data);
  const dest = path.join('_preview', path.basename(file));
  fs.mkdirSync('_preview', { recursive: true });
  fs.writeFileSync(dest, out);
  console.log(`✓ ${dest} (${out.length} bytes)`);
}
