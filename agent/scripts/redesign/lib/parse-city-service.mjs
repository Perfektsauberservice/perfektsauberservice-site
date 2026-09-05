// Extract structured data from an existing city × service SEO HTML page.
// Returns a plain JS object that the renderer can consume.
// Uses regex/string ops because the old templates are consistent and we want
// no external deps.

import fs from 'node:fs';

const re = (pat, flags = 's') => new RegExp(pat, flags);
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
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&rsaquo;/g, '›')
  .replace(/&nbsp;/g, ' ');
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

export function parseCityService(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const data = { srcPath: filePath, srcHtml: html };

  // ---- HEAD meta ----
  data.title = grab(html, /<title>([\s\S]*?)<\/title>/);
  data.metaDescription = grab(html, /<meta\s+name="description"\s+content="([^"]*)"/);
  data.ogTitle = grab(html, /<meta\s+property="og:title"\s+content="([^"]*)"/);
  data.ogDescription = grab(html, /<meta\s+property="og:description"\s+content="([^"]*)"/);
  data.ogUrl = grab(html, /<meta\s+property="og:url"\s+content="([^"]*)"/);
  data.ogImage = grab(html, /<meta\s+property="og:image"\s+content="([^"]*)"/);
  data.canonical = grab(html, /<link\s+rel="canonical"\s+href="([^"]*)"/);
  data.lang = grab(html, /<html\s+lang="([^"]*)"/) || 'de';

  // ---- JSON-LD blocks (preserved verbatim, can be one or many) ----
  data.jsonLdBlocks = grabAll(html, /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    .map(m => m[1].trim());

  // ---- Hero ----
  const heroBlock = grab(html, /<section\s+class="hero">([\s\S]*?)<\/section>/);
  data.eyebrow = stripTags(grab(heroBlock, /<div\s+class="eyebrow">([\s\S]*?)<\/div>/) || '');
  data.h1 = stripTags(grab(heroBlock, /<h1[^>]*>([\s\S]*?)<\/h1>/));
  data.sub = stripTags(grab(heroBlock, /<p\s+class="sub">([\s\S]*?)<\/p>/));
  data.heroImg = grab(heroBlock, /<img\s+class="hero-img"\s+src="([^"]+)"/);
  data.heroImgAlt = grab(heroBlock, /<img\s+class="hero-img"[^>]*alt="([^"]*)"/);

  // Phone / WhatsApp text — always same number, but the WA query text is city/service-specific
  data.waText = grab(heroBlock, /href="https:\/\/wa\.me\/491639087197\?text=([^"]+)"/);

  // Trust strip badges (5 spans inside .trust-strip)
  const trustStrip = grab(html, /<div\s+class="trust-strip">([\s\S]*?)<\/div>/);
  data.trustItems = grabAll(trustStrip, /<span[^>]*>([\s\S]*?)<\/span>/g)
    .map(m => stripTags(m[1])).filter(t => t && !t.match(/^[★\s]+$/));

  // ---- Breadcrumb ----
  const crumbBlock = grab(html, /<nav\s+class="breadcrumb">([\s\S]*?)<\/nav>/);
  data.crumbs = grabAll(crumbBlock, /<a\s+href="([^"]*)"[^>]*>([^<]+)<\/a>/g)
    .map(m => ({ href: m[1], label: decode(m[2]) }));
  // Last crumb is plain text (current page) — extract it
  const tail = crumbBlock.replace(/<a[^>]+>[^<]+<\/a>/g, '').replace(/&rsaquo;/g, '').trim();
  if (tail) data.crumbCurrent = stripTags(tail);

  // ---- Sections (in order). The current template has multiple .section blocks ----
  // We extract each by their H2 title and grab known shapes inside.
  const sections = grabAll(html, /<section\s+class="section"[^>]*>([\s\S]*?)<\/section>/g)
    .map(m => m[1]);

  data.sections = [];
  for (const s of sections) {
    const h2 = stripTags(grab(s, /<h2[^>]*>([\s\S]*?)<\/h2>/));
    const intro = stripTags(grab(s, /<h2[^>]*>[\s\S]*?<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/));
    const sec = { h2, intro, html: s };

    // Price table?
    const tbody = grab(s, /<tbody>([\s\S]*?)<\/tbody>/);
    if (tbody) {
      sec.kind = 'price';
      sec.headers = grabAll(grab(s, /<thead>([\s\S]*?)<\/thead>/),
        /<th[^>]*>([\s\S]*?)<\/th>/g).map(m => stripTags(m[1]));
      sec.rows = grabAll(tbody, /<tr[^>]*>([\s\S]*?)<\/tr>/g)
        .map(m => grabAll(m[1], /<td[^>]*>([\s\S]*?)<\/td>/g).map(c => c[1].trim()));
      sec.note = grab(s, /<div\s+class="price-note">([\s\S]*?)<\/div>/).trim();
    }

    // Services grid (.card blocks). Card has no nested <div>, so a direct
    // greedy-on-section scan picks all of them.
    if (s.includes('services-grid') || /<div\s+class="card"/.test(s)) {
      const cards = grabAll(s, /<div\s+class="card"[^>]*>([\s\S]*?)<\/div>/g).map(m => ({
        title: stripTags(grab(m[1], /<strong>([\s\S]*?)<\/strong>/)),
        desc: stripTags(grab(m[1], /<p[^>]*>([\s\S]*?)<\/p>/)),
      })).filter(c => c.title);
      if (cards.length) {
        sec.kind = 'cards';
        sec.cards = cards;
      }
    }

    // Gallery?
    if (s.includes('class="gallery"')) {
      sec.kind = 'gallery';
      sec.images = grabAll(s, /<img\s+src="([^"]+)"[^>]*alt="([^"]*)"/g).map(m => ({ src: m[1], alt: m[2] }));
      sec.note = stripTags(grab(s, /<p\s+class="gallery-note">([\s\S]*?)<\/p>/));
    }

    // Steps?
    if (s.includes('class="steps"')) {
      sec.kind = 'steps';
      sec.steps = grabAll(s, /<div\s+class="step">([\s\S]*?)<\/div>/g).map(m => ({
        title: stripTags(grab(m[1], /<strong>([\s\S]*?)<\/strong>/)),
        desc: stripTags(grab(m[1], /<p[^>]*>([\s\S]*?)<\/p>/)),
      })).filter(st => st.title);
    }

    // USPs?
    if (s.includes('class="usp-grid"')) {
      sec.kind = 'usps';
      sec.usps = grabAll(s, /<div\s+class="usp">([\s\S]*?)<\/div>/g).map(m => ({
        num: stripTags(grab(m[1], /<div\s+class="num">([\s\S]*?)<\/div>/)),
        title: stripTags(grab(m[1], /<strong>([\s\S]*?)<\/strong>/)),
        desc: stripTags(grab(m[1], /<p[^>]*>([\s\S]*?)<\/p>/)),
      })).filter(u => u.title);
    }

    // FAQs (.faq-item)?
    if (s.includes('class="faq-item"')) {
      sec.kind = 'faq';
      sec.faqs = grabAll(s, /<div\s+class="faq-item">([\s\S]*?)<\/div>/g).map(m => ({
        q: stripTags(grab(m[1], /<h3[^>]*>([\s\S]*?)<\/h3>/)),
        a: stripTags(grab(m[1], /<p[^>]*>([\s\S]*?)<\/p>/)),
      })).filter(f => f.q);
    }

    // Districts?
    if (s.includes('class="districts"')) {
      sec.kind = 'districts';
      sec.chips = grabAll(s, /<span\s+class="district">([\s\S]*?)<\/span>/g).map(m => stripTags(m[1]));
      sec.umlandH3 = stripTags(grab(s, /<h3[^>]*>([\s\S]*?)<\/h3>/));
      // Extract the umland paragraph (last <p> in section)
      const ps = grabAll(s, /<p[^>]*>([\s\S]*?)<\/p>/g).map(m => stripTags(m[1]));
      sec.umlandText = ps.length > 1 ? ps[ps.length - 1] : '';
    }

    // Related (.related blocks)?
    if (s.includes('class="related"')) {
      sec.kind = 'related';
      const rels = grabAll(s, /<div\s+class="related">([\s\S]*?)<\/div>/g);
      sec.groups = rels.map((r, i) => {
        // Find the H3 directly preceding this .related (if any). We split section by .related blocks.
        return {
          links: grabAll(r[1], /<a\s+href="([^"]*)"[^>]*>([^<]+)<\/a>/g).map(m => ({ href: m[1], label: decode(m[2]) })),
        };
      });
      sec.h3s = grabAll(s, /<h3[^>]*>([\s\S]*?)<\/h3>/g).map(m => stripTags(m[1]));
    }

    data.sections.push(sec);
  }

  // ---- CTA box (final) ----
  const ctaBlock = grab(html, /<section\s+class="cta-box"[^>]*>([\s\S]*?)<\/section>/);
  if (ctaBlock) {
    data.ctaH2 = stripTags(grab(ctaBlock, /<h2[^>]*>([\s\S]*?)<\/h2>/));
    data.ctaP = stripTags(grab(ctaBlock, /<p[^>]*>([\s\S]*?)<\/p>/));
    data.ctaWaText = grab(ctaBlock, /href="https:\/\/wa\.me\/491639087197\?text=([^"]+)"/);
  }

  return data;
}

// CLI: print parsed data as JSON for inspection
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('parse-city-service.mjs')) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node parse-city-service.mjs <file.html>');
    process.exit(1);
  }
  const data = parseCityService(file);
  delete data.srcHtml; // too noisy
  console.log(JSON.stringify(data, null, 2));
}
