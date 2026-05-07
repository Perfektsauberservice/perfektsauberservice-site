/*
 * generate-blog.js — produces a blog-cards fragment from blog-index.json.
 *
 * SAFETY (2026-05-07): script no longer overwrites blog.html.
 *   blog.html is maintained manually with the full site template (legal
 *   footer with AGB/Widerruf, GA4 consent gate, self-hosted fonts). Auto-
 *   overwriting it on every Netlify deploy would undo the DSGVO/TTDSG
 *   compliance fixes.
 *
 *   Two outputs:
 *   - content/auto/blog-cards.html  : reusable fragment (cards only)
 *   - content/auto/blog-auto.html   : full standalone preview (legacy template)
 *
 *   To surface the auto-blog list on blog.html, paste the fragment between
 *   <!-- AUTO-BLOG-CARDS-START --> and <!-- AUTO-BLOG-CARDS-END --> markers,
 *   or set up an include via your build pipeline.
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'content/auto/blog-index.json');
const cardsPath = path.join(__dirname, 'content/auto/blog-cards.html');
const blogAutoPath = path.join(__dirname, 'content/auto/blog-auto.html');
const blogPath = path.join(__dirname, 'blog.html');

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(value) {
  try {
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value || '';
  }
}

const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const items = Array.isArray(data.items) ? data.items : [];

const cardsHtml = items.length === 0
  ? '<div class="empty">Noch keine veröffentlichten Artikel im Blog.</div>'
  : items.map(item => `
<article class="card">
  <div class="img" style="background-image:url('${escapeHtml(item.image || '')}')"></div>
  <div class="body">
    <div class="badges"><span class="badge">${escapeHtml(item.city || '')}</span><span class="badge">${escapeHtml(item.service || '')}</span></div>
    <h2>${escapeHtml(item.title || '')}</h2>
    <p>${escapeHtml(item.intro || item.metaDescription || '')}</p>
    <div class="footer-row">
      <div style="color:#5d697a;font-size:14px">${fmtDate(item.publishedAt)}</div>
      <a class="more" href="${escapeHtml(item.url || '#')}">Artikel lesen</a>
    </div>
  </div>
</article>`).join('');

const countText = `${items.length} Artikel im Blog`;
const updatedText = data.updatedAt
  ? `Zuletzt aktualisiert: ${fmtDate(data.updatedAt)}`
  : 'Noch kein Update vorhanden';

const html = `<!doctype html>
<html lang="de">
<head>
<meta name="robots" content="index,follow" />
<link rel="canonical" href="https://perfektsauberservice.com/blog" />
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Blog – Entrümpelung & Haushaltsauflösung | Perfekt Sauber Service</title>
<meta property="og:title" content="Blog – Entrümpelung & Haushaltsauflösung | Perfekt Sauber Service">
<meta property="og:description" content="Aktuelle Artikel zu Entrümpelung, Haushaltsauflösung, Reinigung und lokalen Themen von Perfekt Sauber Service.">
<meta property="og:url" content="https://perfektsauberservice.com/blog">
<meta property="og:type" content="website">
<meta property="og:image" content="https://perfektsauberservice.com/images/echipa.webp">
<meta property="og:locale" content="de_DE">
<meta name="description" content="Aktuelle Artikel zu Entrümpelung, Haushaltsauflösung, Reinigung und lokalen Themen von Perfekt Sauber Service." />
<style>
:root{--bg:#f5f8fc;--card:#fff;--text:#122033;--muted:#5d697a;--line:#dde5ee;--blue:#21466f;--green:#76c043}
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--bg);color:var(--text)}a{text-decoration:none;color:inherit}
.container{max-width:1180px;margin:0 auto;padding:0 22px}.top{background:linear-gradient(135deg,#122033,#21466f);color:#fff;padding:72px 0 56px}.kicker{display:inline-flex;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px}.top h1{font-size:clamp(2.4rem,5vw,4.6rem);line-height:1.02;margin:18px 0 12px}.top p{max-width:820px;font-size:1.15rem;line-height:1.7;color:rgba(255,255,255,.9)}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 18px;border-radius:18px;font-weight:800}.btn-green{background:var(--green);color:#fff}.btn-dark{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.26);color:#fff}
.wrap{padding:34px 0 52px}.meta-row{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:18px}.meta-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:14px 16px;color:var(--muted)}#list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:26px;overflow:hidden;box-shadow:0 18px 40px rgba(15,23,42,.06)}.img{aspect-ratio:16/9;background:#dfe8f4 center/cover no-repeat}.body{padding:22px}.badges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.badge{display:inline-flex;padding:7px 10px;border-radius:999px;background:#eef4fb;color:#21466f;font-size:12px;font-weight:800}.card h2{font-size:1.5rem;line-height:1.2;margin:0 0 10px}.card p{margin:0;color:var(--muted);line-height:1.7}.footer-row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:18px;flex-wrap:wrap}.more{display:inline-flex;padding:12px 14px;border-radius:16px;background:#122033;color:#fff;font-weight:800}.empty,.loading{padding:26px;border-radius:22px;border:1px dashed var(--line);background:#fff;color:var(--muted)}
@media(max-width:860px){#list{grid-template-columns:1fr}.top{padding:56px 0 44px}}
</style>
</head>
<body>
<section class="top"><div class="container"><div class="kicker">PSS Blog</div><h1>Aktuelle lokale Artikel und Antworten</h1><p>Hier erscheinen automatisch veröffentlichte Artikel aus dem Content-Agent – übersichtlich gesammelt an einem Ort.</p><div class="actions"><a class="btn btn-green" href="./preisrechner.html">Preisrechner starten</a><a class="btn btn-dark" href="./index.html">Zur Startseite</a></div></div></section>
<section class="wrap"><div class="container"><div class="meta-row"><div class="meta-card" id="countBox">${countText}</div><div class="meta-card" id="updatedBox">${updatedText}</div></div><div id="list">${cardsHtml}</div></div></section>

<section class="pss-links"><h2>Weitere Seiten</h2><ul><li><a href="/entruempelung-rastatt.html">Entrümpelung Rastatt</a></li><li><a href="/entruempelung-baden-baden.html">Entrümpelung Baden-Baden</a></li><li><a href="/entruempelung-gaggenau.html">Entrümpelung Gaggenau</a></li><li><a href="/entruempelung-karlsruhe.html">Entrümpelung Karlsruhe</a></li></ul></section>
</body>
</html>`;

// Write standalone preview (legacy auto template) — NOT served as blog.html.
fs.writeFileSync(blogAutoPath, html, 'utf8');
// Write reusable cards fragment.
fs.writeFileSync(cardsPath, cardsHtml, 'utf8');

// Try to patch blog.html in-place if it has the marker pair; otherwise leave it
// alone (manual blog.html template stays intact).
try {
  if (fs.existsSync(blogPath)) {
    const blog = fs.readFileSync(blogPath, 'utf8');
    const marker = /<!--\s*AUTO-BLOG-CARDS-START\s*-->[\s\S]*?<!--\s*AUTO-BLOG-CARDS-END\s*-->/;
    if (marker.test(blog)) {
      const patched = blog.replace(marker, `<!-- AUTO-BLOG-CARDS-START -->\n${cardsHtml}\n<!-- AUTO-BLOG-CARDS-END -->`);
      fs.writeFileSync(blogPath, patched, 'utf8');
      console.log(`blog.html: cards block patched in-place (${items.length} items)`);
    } else {
      console.log(`blog.html: no <!-- AUTO-BLOG-CARDS-START/END --> markers — left untouched`);
    }
  }
} catch (err) {
  console.warn(`blog.html patch skipped: ${err.message}`);
}

console.log(`Generated: blog-cards.html (fragment) + blog-auto.html (standalone). ${items.length} items, updated ${data.updatedAt}`);
