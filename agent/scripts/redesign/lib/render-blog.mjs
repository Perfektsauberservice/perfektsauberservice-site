// Blog article renderer.
// Editorial design works beautifully for long-form reading: Fraunces serif H2,
// Inter body, generous line-height. Preserves Article JSON-LD verbatim.

import fs from 'node:fs';
import path from 'node:path';
import { CSS, FONTS_HEAD } from './css.mjs';
import { NAV, FOOTER, FAB, COOKIE, SCRIPTS, GA4, contactSection } from './parts.mjs';

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
  .replace(/&nbsp;/g, ' ');
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const BLOG_CSS = `
.art-hero{background:var(--bg-2); border-bottom:1px solid var(--line); padding:80px 28px 60px;}
@media(max-width:720px){.art-hero{padding:48px 20px 40px;}}
.art-hero-wrap{max-width:880px; margin:0 auto;}
.art-badge{display:inline-block; padding:8px 16px; border-radius:999px; background:#fff; border:1px solid var(--line);
  font-family:"Geist Mono",monospace; font-size:.66rem; letter-spacing:.18em; text-transform:uppercase; color:var(--blue); margin-bottom:24px;}
.art-h1{font-family:"Fraunces",serif; font-weight:300; font-size:clamp(2rem,4.6vw,3.6rem); line-height:1.05; letter-spacing:-0.025em; color:var(--ink); margin-bottom:24px;}
.art-h1 em{font-style:italic; color:var(--green);}
.art-lead{font-family:"Fraunces",serif; font-style:italic; font-weight:400; font-size:1.15rem; line-height:1.6; color:var(--muted); max-width:65ch;}
.art-meta{margin-top:24px; font-family:"Geist Mono",monospace; font-size:.66rem; letter-spacing:.16em; text-transform:uppercase; color:var(--muted);}
.art-actions{display:flex; gap:10px; flex-wrap:wrap; margin-top:28px;}

.art{max-width:780px; margin:0 auto; padding:64px 28px 60px;}
@media(max-width:720px){.art{padding:48px 20px 40px;}}
.art-section{margin-bottom:44px;}
.art-section h2{font-family:"Fraunces",serif; font-weight:500; font-size:clamp(1.5rem,2.6vw,2rem); line-height:1.2; letter-spacing:-0.02em; color:var(--ink); margin-bottom:18px;}
.art-section h2 em{font-style:italic; color:var(--green);}
.art-section h3{font-family:"Fraunces",serif; font-weight:500; font-size:1.2rem; margin:24px 0 10px; color:var(--ink);}
.art-section p{font-family:"Inter",sans-serif; font-size:1.05rem; line-height:1.75; color:var(--ink); margin-bottom:16px;}
.art-section ul{padding-left:24px; margin-bottom:16px;}
.art-section li{font-size:1.02rem; line-height:1.7; color:var(--ink); margin-bottom:8px;}
.art-section a{color:var(--blue); text-decoration:underline; text-underline-offset:3px;}
.art-section a:hover{color:var(--green-dk);}
.art-notice{margin-top:18px; padding:18px 22px; background:var(--accent); border-radius:8px;
  font-size:.95rem; line-height:1.6; color:var(--ink);}
.art-notice a{color:var(--blue); text-decoration:underline;}
.art-credit{margin-top:36px; font-family:"Geist Mono",monospace; font-size:.65rem; letter-spacing:.14em; color:var(--muted); text-align:center;}
.art-credit a{color:var(--muted); text-decoration:underline;}

.art-related{max-width:880px; margin:0 auto 80px; padding:0 28px;}
.art-related h2{font-family:"Fraunces",serif; font-weight:500; font-size:1.4rem; margin-bottom:20px; color:var(--ink);}
.art-related .links{display:flex; flex-wrap:wrap; gap:8px;}
.art-related .links a{display:inline-block; padding:9px 16px; border-radius:999px; background:#fff; border:1px solid var(--line);
  font-family:"Geist Mono",monospace; font-size:.7rem; letter-spacing:.1em; color:var(--ink);}
.art-related .links a:hover{border-color:var(--blue); color:var(--blue);}
`;

export function renderBlog(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const data = parse(html, filePath);

  const robots = grab(html, /<meta\s+name="robots"\s+content="([^"]*)"/) || 'index,follow';
  const jsonLd = (data.jsonLdBlocks || []).map(b =>
    `<script type="application/ld+json">\n${b}\n</script>`).join('\n');

  const sectionsHtml = data.sections.map(s => renderSection(s)).join('\n');
  const relHtml = data.related.length ? renderRelated(data.related) : '';

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
<meta property="og:type" content="article">
${data.ogImage ? `<meta property="og:image" content="${data.ogImage}">` : ''}
<meta property="og:locale" content="de_DE">
${data.publishedTime ? `<meta name="article:published_time" content="${data.publishedTime}">` : ''}
${data.canonical ? `<link rel="canonical" href="${data.canonical}">` : ''}
${FONTS_HEAD}
<style>${CSS}${BLOG_CSS}</style>
${jsonLd}
${GA4}
</head>
<body>
${NAV}
<section class="art-hero">
  <div class="art-hero-wrap">
    ${data.badge ? `<span class="art-badge">${escapeHtml(data.badge)}</span>` : ''}
    <h1 class="art-h1">${escapeHtml(data.h1)}</h1>
    ${data.lead ? `<p class="art-lead">${escapeHtml(data.lead)}</p>` : ''}
    ${data.publishedTime ? `<div class="art-meta">Veröffentlicht: ${escapeHtml(data.publishedTime)}</div>` : ''}
    <div class="art-actions">
      <a href="https://wa.me/491639087197" class="btn btn-w" target="_blank" rel="noreferrer">WhatsApp →</a>
      <a href="/preisrechner" class="btn btn-sec">Preisrechner</a>
      ${data.cityPageHref ? `<a href="${escapeHtml(data.cityPageHref)}" class="btn btn-sec">Zur Stadtseite</a>` : ''}
    </div>
  </div>
</section>
<article class="art">
${sectionsHtml}
${data.imgCredit ? `<p class="art-credit">${data.imgCredit}</p>` : ''}
</article>
${relHtml}
${contactSection('', '', '')}
${FOOTER}
${FAB}
${COOKIE}
${SCRIPTS}
</body>
</html>`;
}

function renderSection(s) {
  // FAQ section: render as accordion
  if (s.kind === 'faq') {
    const items = s.faqs.map((f, i) => `
      <details${i === 0 ? ' open' : ''}>
        <summary>${escapeHtml(f.q)}</summary>
        <div class="ans">${escapeHtml(f.a)}</div>
      </details>`).join('');
    return `<section class="art-section">
      <h2>${escapeHtml(s.h2)}</h2>
      <div class="faq" style="border-top:1px solid var(--line); margin-top:0;">${items}</div>
    </section>`;
  }

  // CTA "Jetzt anfragen" section: render with prominent CTA
  if (s.kind === 'cta') {
    return `<section class="art-section" style="background:var(--bg-2); padding:32px 28px; border-radius:14px; text-align:center;">
      <h2>${escapeHtml(s.h2)}</h2>
      ${s.bodyHtml ? `<div>${s.bodyHtml}</div>` : ''}
      <div class="art-actions" style="justify-content:center; margin-top:20px;">
        <a href="https://wa.me/491639087197" class="btn btn-w" target="_blank" rel="noreferrer">WhatsApp</a>
        <a href="tel:+491639087197" class="btn btn-phone">📞 0163 9087197</a>
        <a href="/preisrechner" class="btn btn-sec">Preisrechner</a>
      </div>
    </section>`;
  }

  // Generic content section: keep inner HTML (paragraphs, lists, links preserved)
  return `<section class="art-section">
    <h2>${escapeHtml(s.h2)}</h2>
    <div>${s.bodyHtml}</div>
    ${s.notice ? `<div class="art-notice">${s.notice}</div>` : ''}
  </section>`;
}

function renderRelated(links) {
  return `<aside class="art-related">
    <h2>Weitere Themen</h2>
    <div class="links">${links.map(l => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`).join('')}</div>
  </aside>`;
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
    publishedTime: grab(html, /<meta\s+name="article:published_time"\s+content="([^"]*)"/),
    canonical: grab(html, /<link\s+rel="canonical"\s+href="([^"]*)"/),
    lang: grab(html, /<html\s+lang="([^"]*)"/) || 'de',
    jsonLdBlocks: grabAll(html, /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)
      .map(m => m[1].trim()),
    badge: '', h1: '', lead: '',
    sections: [], related: [], imgCredit: '', cityPageHref: '',
  };

  // Hero
  const hero = grab(html, /<section\s+class="hero">([\s\S]*?)<\/section>/);
  data.badge = stripTags(grab(hero, /<div\s+class="badge">([\s\S]*?)<\/div>/));
  data.h1 = stripTags(grab(hero, /<h1[^>]*>([\s\S]*?)<\/h1>/));
  data.lead = stripTags(grab(hero, /<p\s+class="lead">([\s\S]*?)<\/p>/));
  // Pull "Zur Stadtseite" link from hero actions
  const cityLinkMatch = hero.match(/<a[^>]+href="(\/[a-z\-]+)"[^>]*>Zur Stadtseite<\/a>/i);
  if (cityLinkMatch) data.cityPageHref = cityLinkMatch[1];

  // Content sections
  const contentSections = grabAll(html, /<section\s+class="content-section">([\s\S]*?)<\/section>/g);
  for (const m of contentSections) {
    const inner = m[1];
    const h2 = stripTags(grab(inner, /<h2[^>]*>([\s\S]*?)<\/h2>/));
    if (!h2) continue;

    // FAQ?
    if (inner.includes('class="faq-grid"') || inner.includes('class="faq-item"')) {
      const faqs = grabAll(inner, /<div\s+class="faq-item">([\s\S]*?)<\/div>/g).map(f => ({
        q: stripTags(grab(f[1], /<h3[^>]*>([\s\S]*?)<\/h3>/)),
        a: stripTags(grab(f[1], /<p[^>]*>([\s\S]*?)<\/p>/)),
      })).filter(f => f.q);
      data.sections.push({ kind: 'faq', h2, faqs });
      continue;
    }

    // CTA?
    if (inner.includes('class="actions"') || /Jetzt|anfragen|Kontakt/i.test(h2)) {
      const bodyP = grab(inner, /<p[^>]*>([\s\S]*?)<\/p>/);
      data.sections.push({ kind: 'cta', h2, bodyHtml: bodyP ? `<p style="font-size:1.05rem; line-height:1.7;">${bodyP}</p>` : '' });
      continue;
    }

    // Generic content: extract body (everything after </h2>)
    let body = inner.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '').trim();
    // Extract notice if present
    const notice = grab(body, /<div\s+class="notice">([\s\S]*?)<\/div>/);
    if (notice) body = body.replace(/<div\s+class="notice">[\s\S]*?<\/div>/, '').trim();
    // The body is wrapped in <div class="content-copy"> often — unwrap it
    body = body.replace(/<div\s+class="content-copy">/, '').replace(/<\/div>\s*$/, '').trim();

    data.sections.push({ kind: 'content', h2, bodyHtml: body, notice });
  }

  // Image credit
  const credit = grab(html, /<p\s+class="img-credit">([\s\S]*?)<\/p>/);
  if (credit) data.imgCredit = credit;

  // Related links: <a> chips inside "Weitere Themen" content-card
  // Extract from the inline-styled chips at the bottom
  const relMatches = grabAll(html, /<a\s+href="([^"]+)"\s+style="display:inline-block;padding:8px 14px;border-radius:999px[^"]*"[^>]*>([^<]+)<\/a>/g);
  data.related = relMatches.map(m => ({ href: m[1], label: decode(m[2]) }));

  return data;
}

if (process.argv[1]?.endsWith('render-blog.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node render-blog.mjs <file.html>'); process.exit(1); }
  const out = renderBlog(file);
  const dest = path.join('_preview', 'blog', path.basename(file));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
  console.log(`✓ ${dest} (${out.length} bytes)`);
}
