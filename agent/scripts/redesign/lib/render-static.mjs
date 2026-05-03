// Render static pages (impressum, datenschutz, 410, danke, kontakt, ueber-uns).
// Strategy: preserve all <body> content verbatim (legal text MUST not change),
// but wrap it in the new editorial layout (nav, footer, GA4) and apply typography
// via a scoped CSS section. Existing inline styles in body are kept (won't conflict
// with our scoped .static rules since they target different selectors).

import fs from 'node:fs';
import { CSS, FONTS_HEAD } from './css.mjs';
import { NAV, FOOTER, FAB, COOKIE, SCRIPTS, GA4, contactSection } from './parts.mjs';

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

const STATIC_CSS = `
.static{max-width:880px; margin:0 auto; padding:80px 28px 60px;}
@media(max-width:720px){.static{padding:48px 20px 40px;}}
.static .back{display:inline-block; margin-bottom:36px; font-family:"Geist Mono",monospace; font-size:.7rem; letter-spacing:.16em; text-transform:uppercase; color:var(--blue);}
.static .back:hover{text-decoration:underline;}
.static h1{font-family:"Fraunces",serif; font-weight:300; font-size:clamp(2.4rem,5vw,3.8rem); line-height:1.05; letter-spacing:-0.025em; margin-bottom:48px; color:var(--ink);}
.static h1 em{font-style:italic; color:var(--green);}
.static .card{background:#fff; border:1px solid var(--line); border-radius:14px; padding:32px 36px; margin-bottom:18px; box-shadow:0 8px 20px -10px rgba(26,32,48,.08);}
@media(max-width:720px){.static .card{padding:24px 22px;}}
.static .card h2{font-family:"Fraunces",serif; font-weight:500; font-size:1.35rem; margin-bottom:16px; color:var(--ink); letter-spacing:-0.01em;}
.static .card h3{font-family:"Fraunces",serif; font-weight:500; font-size:1.1rem; margin:18px 0 8px; color:var(--ink);}
.static .card p, .static .card li, .static .card address{font-family:"Inter",sans-serif; font-size:1rem; line-height:1.7; color:var(--ink); margin-bottom:10px;}
.static .card address{font-style:normal;}
.static .card ul, .static .card ol{padding-left:22px; margin:10px 0;}
.static .card a{color:var(--blue); text-decoration:underline; text-underline-offset:3px;}
.static .card a:hover{color:var(--green-dk);}
.static .card strong{color:var(--ink);}
.static-cta{margin-top:48px; padding:36px; background:var(--bg-2); border-radius:14px; text-align:center;}
.static-cta h2{font-family:"Fraunces",serif; font-weight:300; font-size:1.6rem; margin-bottom:14px; color:var(--ink);}
.static-cta a{margin-top:12px;}
`;

export function renderStatic(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const data = parseStatic(html, filePath);

  // Decide robots tag — preserve original (impressum is noindex)
  const robots = grab(html, /<meta\s+name="robots"\s+content="([^"]*)"/) || 'index,follow';

  // Preserve any existing JSON-LD (some static pages may not have it)
  const jsonLd = (data.jsonLdBlocks || []).map(b =>
    `<script type="application/ld+json">\n${b}\n</script>`).join('\n');

  // Body content: prefer .container or main wrapper; fall back to whole <body>
  let bodyContent = grab(html, /<div\s+class="container"[^>]*>([\s\S]*?)<\/div>\s*<\/body>/) ||
                    grab(html, /<main[^>]*>([\s\S]*?)<\/main>/) ||
                    grab(html, /<body[^>]*>([\s\S]*?)<\/body>/);

  // Strip the original "Zurück zur Startseite" link (we put a new one in nav)
  bodyContent = bodyContent.replace(/<a\s+class="back"[^>]*>[\s\S]*?<\/a>/g, '');
  // Also strip any cookie banner / scripts left in body
  bodyContent = bodyContent.replace(/<script[\s\S]*?<\/script>/g, '');
  bodyContent = bodyContent.replace(/<noscript[\s\S]*?<\/noscript>/g, '');

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
<style>${CSS}${STATIC_CSS}</style>
${jsonLd}
${GA4}
</head>
<body>
${NAV}
<div class="static">
  <a class="back" href="/">← Zurück zur Startseite</a>
  ${bodyContent}
</div>
${FOOTER}
${FAB}
${COOKIE}
${SCRIPTS}
</body>
</html>`;
}

function parseStatic(html, filePath) {
  return {
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
  };
}

if (process.argv[1]?.endsWith('render-static.mjs')) {
  const path = await import('node:path');
  const file = process.argv[2];
  if (!file) { console.error('Usage: node render-static.mjs <file.html>'); process.exit(1); }
  const out = renderStatic(file);
  const dest = path.join('_preview', path.basename(file));
  fs.mkdirSync('_preview', { recursive: true });
  fs.writeFileSync(dest, out);
  console.log(`✓ ${dest} (${out.length} bytes)`);
}
