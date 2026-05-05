// Render hub pages (leistungen, einsatzgebiete, portfolio, blog, preisrechner,
// hausmeisterservice). These have hero + trust-grid + service cards in their own
// custom layout; we map those into the editorial design.

import fs from 'node:fs';
import { CSS, FONTS_HEAD } from './css.mjs';
import { NAV, STRIP, FOOTER, FAB, COOKIE, SCRIPTS, GA4, contactSection } from './parts.mjs';

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
const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&rsaquo;/g, '›').replace(/&nbsp;/g, ' ');
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function italicizeFirst(text) {
  if (text.includes('<')) return text;
  const stop = new Set(['was','wer','wie','wo','der','die','das','ein','eine','und','oder','für','mit','von','auf','unsere','unser']);
  const words = text.split(/(\s+)/);
  for (let i = 0; i < Math.min(words.length, 6); i++) {
    const w = words[i];
    const c = w.toLowerCase().replace(/[^a-zäöüß]/gi, '');
    if (c.length >= 4 && !stop.has(c)) { words[i] = `<em>${w}</em>`; return words.join(''); }
  }
  return text;
}

export function renderHub(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const data = parse(html, filePath);

  const robots = grab(html, /<meta\s+name="robots"\s+content="([^"]*)"/) || 'index,follow';
  const jsonLd = (data.jsonLdBlocks || []).map(b =>
    `<script type="application/ld+json">\n${b}\n</script>`).join('\n');

  // Hero
  const heroHtml = renderHero(data);
  // Trust grid → USPs
  const trustHtml = data.trustItems.length ? renderTrust(data.trustItems) : '';
  // Service cards (large cards from .grid > article.card)
  const cardsHtml = data.serviceCards.length ? renderServiceCards(data.serviceCards) : '';
  // Generic cards (mini-card)
  const miniHtml = data.miniCards.length ? renderMiniCards(data.miniCards) : '';
  // Plain sections (CTA box content, generic copy)
  const sectionsHtml = data.extraSections.map(s => renderGeneric(s)).join('\n');

  return `<!DOCTYPE html>
<html lang="${data.lang || 'de'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="${robots}">
<title>${data.title}</title>
${data.metaDescription ? `<meta name="description" content="${data.metaDescription}">` : ''}
${data.ogTitle ? `<meta property="og:title" content="${data.ogTitle}">` : ''}
${data.ogDescription ? `<meta property="og:description" content="${data.ogDescription}">` : ''}
${data.ogUrl ? `<meta property="og:url" content="${data.ogUrl}">` : ''}
<meta property="og:type" content="website">
${data.ogImage ? `<meta property="og:image" content="${data.ogImage}">` : ''}
<meta property="og:locale" content="de_DE">
${data.canonical ? `<link rel="canonical" href="${data.canonical}">` : ''}
${FONTS_HEAD}
<style>${CSS}</style>
${jsonLd}
${GA4}
</head>
<body>
${NAV}
${heroHtml}
${STRIP}
${cardsHtml}
${trustHtml}
${miniHtml}
${sectionsHtml}
${contactSection('', '', '')}
${FOOTER}
${FAB}
${COOKIE}
${SCRIPTS}
</body>
</html>`;
}

function renderHero(d) {
  const badges = d.heroBadges.length
    ? `<div class="trust">${d.heroBadges.slice(0, 5).map(b => `<div class="it"><strong>✓</strong><span>${escapeHtml(b)}</span></div>`).join('')}</div>`
    : '';
  return `<section class="hero">
  <div>
    ${d.heroEyebrow ? `<span class="eyebrow">${escapeHtml(d.heroEyebrow)}</span>` : ''}
    <h1 class="h1">${italicizeFirst(escapeHtml(d.heroH1))}</h1>
    ${d.heroSub ? `<p class="deck">${escapeHtml(d.heroSub)}</p>` : ''}
    <div class="cta-row">
      <a href="tel:+491639087197" class="btn btn-phone">📞 0163 9087197</a>
      <a href="https://wa.me/491639087197" class="btn btn-w" target="_blank" rel="noreferrer">WhatsApp →</a>
      <a href="/preisrechner" class="btn btn-sec">Preis berechnen</a>
    </div>
    ${badges}
  </div>
  ${d.heroImg ? `<div class="hero-img">
    <img src="${escapeHtml(d.heroImg)}" alt="${escapeHtml(d.heroImgAlt || d.heroH1)}" loading="eager"/>
    <div class="badge"><strong>★★★★★</strong><span>5,0 Google</span></div>
  </div>` : ''}
</section>`;
}

function renderTrust(items) {
  return `<section class="sec">
    <div class="sec-mark">Darauf zählen Sie</div>
    <h2 class="sec-h">Was uns <em>auszeichnet</em>.</h2>
    <div class="usps">${items.map(it => `
      <div class="usp">
        <div class="num">✓</div>
        <h3>${escapeHtml(it.title)}</h3>
        <p>${escapeHtml(it.desc)}</p>
      </div>`).join('')}</div>
  </section>`;
}

function renderServiceCards(cards) {
  return `<section class="sec alt">
    <div style="max-width:1440px; margin:0 auto;">
      <div class="sec-mark">Leistungen</div>
      <h2 class="sec-h">Was wir <em>tun</em>.</h2>
      <div class="cards">${cards.map(c => `
        <div class="card">
          ${c.eyebrow ? `<div class="ic">${escapeHtml(c.eyebrow)}</div>` : '<div class="ic">№</div>'}
          <h3>${italicizeFirst(escapeHtml(c.title))}</h3>
          <p>${escapeHtml(c.desc)}</p>
          ${c.href ? `<a href="${escapeHtml(c.href)}" style="display:inline-block; margin-top:14px; font-family:'Geist Mono',monospace; font-size:.7rem; letter-spacing:.16em; text-transform:uppercase; color:var(--blue);">${escapeHtml(c.linkLabel || 'Mehr erfahren')} →</a>` : ''}
        </div>`).join('')}</div>
    </div>
  </section>`;
}

function renderMiniCards(cards) {
  // Render mini cards as a related-grid (compact)
  return `<section class="sec">
    <div class="sec-mark">Weitere Bereiche</div>
    <h2 class="sec-h">Auch <em>verfügbar</em>.</h2>
    <div class="rel-grid">${cards.map(c => `
      <a href="${escapeHtml(c.href || '#')}">
        <strong style="display:block; font-family:'Fraunces','Fraunces Fallback',serif; font-size:1rem; font-weight:500; margin-bottom:6px; color:var(--ink); letter-spacing:-0.01em;">${escapeHtml(c.title)}</strong>
        ${c.desc ? `<span style="display:block; font-family:'Inter',sans-serif; font-size:.85rem; line-height:1.5; color:var(--muted); text-transform:none; letter-spacing:0;">${escapeHtml(c.desc)}</span>` : ''}
      </a>`).join('')}</div>
  </section>`;
}

function renderGeneric(s) {
  if (!s.h2 && !s.body) return '';
  return `<section class="sec">
    ${s.h2 ? `<h2 class="sec-h">${italicizeFirst(escapeHtml(s.h2))}</h2>` : ''}
    ${s.body ? `<div style="font-size:1.05rem; line-height:1.7; color:var(--muted); max-width:62ch;">${s.body}</div>` : ''}
  </section>`;
}

function parse(html, filePath) {
  const data = {
    srcPath: filePath,
    title: grab(html, /<title>([\s\S]*?)<\/title>/),
    metaDescription: grab(html, /<meta\s+name="description"\s+content="([^"]*)"/),
    ogTitle: grab(html, /<meta\s+property="og:title"\s+content="([^"]*)"/),
    ogDescription: grab(html, /<meta\s+property="og:description"\s+content="([^"]*)"/),
    ogUrl: grab(html, /<meta\s+property="og:url"\s+content="([^"]*)"/),
    ogImage: grab(html, /<meta\s+property="og:image"\s+content="([^"]*)"/),
    canonical: grab(html, /<link\s+rel="canonical"\s+href="([^"]*)"/),
    lang: grab(html, /<html\s+lang="([^"]*)"/) || 'de',
    jsonLdBlocks: grabAll(html, /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)
      .map(m => m[1].trim()),
    heroEyebrow: '', heroH1: '', heroSub: '', heroBadges: [], heroImg: '', heroImgAlt: '',
    trustItems: [], serviceCards: [], miniCards: [], extraSections: [],
  };

  // Hero
  const hero = grab(html, /<section\s+class="hero">([\s\S]*?)<\/section>/);
  if (hero) {
    data.heroEyebrow = stripTags(grab(hero, /<div\s+class="eyebrow">([\s\S]*?)<\/div>/));
    data.heroH1 = stripTags(grab(hero, /<h1[^>]*>([\s\S]*?)<\/h1>/));
    data.heroSub = stripTags(grab(hero, /<p\s+class="sub">([\s\S]*?)<\/p>/));
    data.heroBadges = grabAll(hero, /<span\s+class="badge">([\s\S]*?)<\/span>/g).map(m => stripTags(m[1]));
    data.heroImg = grab(hero, /<img\s+class="hero-img"\s+src="([^"]+)"/);
    data.heroImgAlt = grab(hero, /<img\s+class="hero-img"[^>]*alt="([^"]*)"/);
  }

  // Trust grid
  const trust = grab(html, /<section\s+class="trust-box">([\s\S]*?)<\/section>/);
  if (trust) {
    data.trustItems = grabAll(trust, /<div\s+class="trust-item">([\s\S]*?)<\/div>/g).map(m => ({
      title: stripTags(grab(m[1], /<strong>([\s\S]*?)<\/strong>/)),
      desc: stripTags(grab(m[1], /<span>([\s\S]*?)<\/span>/)),
    })).filter(t => t.title);
  }

  // Service cards from .grid > <article class="card">
  const gridSection = grab(html, /<section\s+class="grid">([\s\S]*?)<\/section>/);
  if (gridSection) {
    data.serviceCards = grabAll(gridSection, /<article\s+class="card">([\s\S]*?)<\/article>/g).map(m => {
      const h2 = stripTags(grab(m[1], /<h2[^>]*>([\s\S]*?)<\/h2>/));
      const p = stripTags(grab(m[1], /<p[^>]*>([\s\S]*?)<\/p>/));
      const link = m[1].match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      return { title: h2, desc: p, href: link?.[1] || '', linkLabel: link ? stripTags(link[2]) : '' };
    }).filter(c => c.title);
  }

  // Mini cards (.services-list > .mini-card)
  const miniSection = grab(html, /<(?:ul|div)\s+class="services-list">([\s\S]*?)<\/(?:ul|div)>/);
  if (miniSection) {
    data.miniCards = grabAll(miniSection, /<a\s+class="mini-card"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g).map(m => ({
      href: m[1],
      title: stripTags(grab(m[2], /<strong>([\s\S]*?)<\/strong>/)),
      desc: stripTags(grab(m[2], /<span>([\s\S]*?)<\/span>/)),
    })).filter(c => c.title);
  }

  // Other sections (cta-box, list-box, plain section)
  const otherSections = grabAll(html, /<section\s+class="(cta-box|list-box|section)"[^>]*>([\s\S]*?)<\/section>/g);
  for (const m of otherSections) {
    const h2 = stripTags(grab(m[2], /<h2[^>]*>([\s\S]*?)<\/h2>/));
    if (h2 && /Verwandt|Mehr|Auch|Standort|Zurück/i.test(h2)) continue; // dedup with our own
    // Body: keep the inner HTML minus the H2
    let body = m[2].replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '').trim();
    // Strip cta buttons (we add our own contact section)
    body = body.replace(/<div\s+class="cta-row">[\s\S]*?<\/div>/g, '');
    body = body.replace(/<a\s+class="cta[^"]*"[^>]*>[\s\S]*?<\/a>/g, '');
    if (h2 || body.trim()) data.extraSections.push({ h2, body });
  }

  return data;
}

if (process.argv[1]?.endsWith('render-hub.mjs')) {
  const path = await import('node:path');
  const file = process.argv[2];
  if (!file) { console.error('Usage: node render-hub.mjs <file.html>'); process.exit(1); }
  const out = renderHub(file);
  const dest = path.join('_preview', path.basename(file));
  fs.mkdirSync('_preview', { recursive: true });
  fs.writeFileSync(dest, out);
  console.log(`✓ ${dest} (${out.length} bytes)`);
}
