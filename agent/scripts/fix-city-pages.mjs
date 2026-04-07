/**
 * fix-city-pages.mjs
 *
 * Face doua lucruri pe toate paginile de oras (entruempelung-*.html):
 * 1. Descarca poza de la Pexels cu nume SEO (daca lipseste)
 * 2. Injecteaza sectiunea "Aktuelle Blogartikel" cu articolele relevante din blog-index.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(str) {
  return str.toLowerCase()
    .replace(/ü/g, 'ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Step 1: Download image from Pexels ───────────────────────────────────────

async function downloadCityImage(city) {
  const citySlug = toSlug(city);
  const filename = `entruempelung-${citySlug}-freigeraeumter-bereich.jpg`;
  const dir = join(ROOT, 'images', 'locations');
  mkdirSync(dir, { recursive: true });
  const localPath = join(dir, filename);

  if (existsSync(localPath)) {
    console.log(`   ✅  Bild bereits vorhanden: ${filename}`);
    return `/images/locations/${filename}`;
  }

  if (!PEXELS_API_KEY) {
    console.warn(`   ⚠️  PEXELS_API_KEY fehlt – kein Bild für ${city}`);
    return null;
  }

  const queries = [
    `room clearance ${city}`,
    'entrümpelung wohnung',
    'apartment clearance furniture removal',
    'clutter removal home',
    'empty apartment room'
  ];

  for (const query of queries) {
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      const data = await res.json();
      if (data.photos?.length > 0) {
        const photo = data.photos[0];
        const imgRes = await fetch(photo.src.large);
        if (!imgRes.ok) continue;
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        writeFileSync(localPath, buffer);
        console.log(`   ✅  Bild gespeichert: ${filename} (Pexels: ${photo.photographer})`);
        return `/images/locations/${filename}`;
      }
    } catch (e) {
      console.warn(`   ⚠️  Pexels Fehler: ${e.message}`);
    }
  }

  console.warn(`   ⚠️  Kein Bild gefunden für ${city}`);
  return null;
}

// ─── Step 2: Inject blog articles section ─────────────────────────────────────

function buildBlogSection(articles) {
  const items = articles.map(a => `
      <a class="blog-card" href="${escHtml(a.url)}">
        <div class="blog-card-body">
          <div class="blog-card-title">${escHtml(a.title)}</div>
          <div class="blog-card-meta">${escHtml(a.city)} · ${escHtml(a.service)}</div>
        </div>
        <span class="blog-card-arrow">→</span>
      </a>`).join('');

  return `
  <!-- BLOG-ARTICLES-START -->
  <section class="blog-articles-section">
    <h2 class="blog-articles-title">Aktuelle Ratgeber-Artikel</h2>
    <div class="blog-articles-list">${items}
    </div>
  </section>
  <style>
    .blog-articles-section{max-width:900px;margin:32px auto 0;padding:0 22px}
    .blog-articles-title{font-size:1.3rem;color:#21466f;margin:0 0 14px;font-weight:800}
    .blog-articles-list{display:flex;flex-direction:column;gap:10px}
    .blog-card{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border:1px solid #dde5ee;border-radius:16px;background:#f8fbff;text-decoration:none;color:#122033;transition:box-shadow .15s}
    .blog-card:hover{box-shadow:0 4px 18px rgba(15,23,42,.10)}
    .blog-card-title{font-weight:700;font-size:.97rem}
    .blog-card-meta{font-size:.82rem;color:#5d697a;margin-top:3px}
    .blog-card-arrow{font-size:1.1rem;color:#76c043;flex-shrink:0;margin-left:12px}
  </style>
  <!-- BLOG-ARTICLES-END -->`;
}

function injectBlogSection(html, articles) {
  // Sterge sectiunea veche daca exista
  html = html.replace(/\s*<!-- BLOG-ARTICLES-START -->[\s\S]*?<!-- BLOG-ARTICLES-END -->/g, '');

  if (articles.length === 0) return html;

  const section = buildBlogSection(articles);
  return html.replace('</body></html>', `${section}\n</body></html>`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀  fix-city-pages.mjs gestartet\n');

  // Citeste blog-index
  const indexPath = join(ROOT, 'content', 'auto', 'blog-index.json');
  let blogItems = [];
  try {
    const data = JSON.parse(readFileSync(indexPath, 'utf8'));
    blogItems = data.items || [];
    console.log(`📚  Blog index: ${blogItems.length} Artikel geladen\n`);
  } catch (e) {
    console.warn('⚠️  blog-index.json nicht gefunden – nur Bilder werden aktualisiert');
  }

  // Gaseste toate paginile entruempelung-*.html
  const { readdirSync } = await import('fs');
  const files = readdirSync(ROOT).filter(f => f.startsWith('entruempelung-') && f.endsWith('.html'));

  console.log(`📄  ${files.length} Stadtseiten gefunden\n`);

  let updated = 0;

  for (const file of files) {
    const city = file.replace('entruempelung-', '').replace('.html', '')
      .split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      .replace('Baden Baden', 'Baden-Baden')
      .replace('Au Am Rhein', 'Au am Rhein')
      .replace('Bad Herrenalb', 'Bad Herrenalb')
      .replace('Bad Wildbad', 'Bad Wildbad')
      .replace('Elchesheim Illingen', 'Elchesheim-Illingen');

    const citySlug = toSlug(city);
    console.log(`\n🏙️  ${city} (${file})`);

    let html = readFileSync(join(ROOT, file), 'utf8');
    let changed = false;

    // Step 1: Poza
    const imgFilename = `entruempelung-${citySlug}-freigeraeumter-bereich.jpg`;
    const imgPath = join(ROOT, 'images', 'locations', imgFilename);

    if (!existsSync(imgPath)) {
      const downloaded = await downloadCityImage(city);
      if (downloaded) changed = true;
    } else {
      console.log(`   ✅  Bild OK`);
    }

    // Step 2: Blog articole relevante pentru acest oras
    const relevant = blogItems.filter(a => {
      const aCity = toSlug(a.city || '');
      return aCity === citySlug || aCity === citySlug.replace(/-/g, '');
    }).slice(0, 4); // max 4 articole

    const newHtml = injectBlogSection(html, relevant);
    if (newHtml !== html) {
      html = newHtml;
      changed = true;
      console.log(`   ✅  Blog-Links injiziert: ${relevant.length} Artikel`);
    } else if (relevant.length === 0) {
      console.log(`   ℹ️  Keine Blog-Artikel für diese Stadt`);
    } else {
      console.log(`   ✅  Blog-Links bereits vorhanden`);
    }

    if (changed) {
      writeFileSync(join(ROOT, file), html, 'utf8');
      updated++;
    }
  }

  console.log(`\n🎉  Fertig! ${updated} Seiten aktualisiert.`);
}

main().catch(err => {
  console.error('\n❌  Fehler:', err);
  process.exit(1);
});
