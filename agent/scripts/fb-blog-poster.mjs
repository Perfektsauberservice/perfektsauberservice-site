/**
 * Agent — FB Blog Poster
 *
 * Posteaza articole din blog/ pe pagina de Facebook, cate unul per run.
 * Starea (ce s-a postat) se salveaza in agent/config/fb-blog-posted.json
 *
 * Logica:
 * - Citeste blog-index.json
 * - Gaseste primul articol nepostat (sortat dupa publishedAt, cel mai vechi primul)
 * - Posteaza pe FB ca link post cu caption generat
 * - Salveaza slug-ul in fb-blog-posted.json
 * - Daca toate sunt postate, afiseaza mesaj si iese cu cod 0
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;

if (!FB_PAGE_ACCESS_TOKEN || !FB_PAGE_ID) {
  console.error('[FEHLER] FB_PAGE_ACCESS_TOKEN sau FB_PAGE_ID lipsesc.');
  process.exit(1);
}

// ─── State ────────────────────────────────────────────────────────────────────

const STATE_PATH = join(ROOT, 'agent', 'config', 'fb-blog-posted.json');

function loadState() {
  if (!existsSync(STATE_PATH)) return { posted: [] };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return { posted: [] }; }
}

function markPosted(slug) {
  const state = loadState();
  state.posted.push({ slug, postedAt: new Date().toISOString() });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function isPosted(slug) {
  return loadState().posted.some(p => p.slug === slug);
}

// ─── Caption ─────────────────────────────────────────────────────────────────

function buildCaption(article) {
  const serviceEmojis = {
    'Entrümpelung': '📦',
    'Haushaltsauflösung': '🏠',
    'Kellerentrümpelung': '🏚️',
    'Wohnungsauflösung': '🔑',
    'Dachbodenräumung': '🏗️',
    'Hausmeisterservice': '🔧',
    'Gewerberäumung': '🏢',
  };
  const emoji = serviceEmojis[article.service] || '✅';

  // Hashtags aus City + Service
  const cityTag = '#' + article.city.replace(/[-\s]/g, '');
  const serviceRaw = (article.service || 'Entruempelung')
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
    .replace(/Ä/g,'Ae').replace(/Ö/g,'Oe').replace(/Ü/g,'Ue')
    .replace(/ß/g,'ss').replace(/\s/g,'');
  const serviceTag = '#' + serviceRaw;

  return `${emoji} ${article.title}

${article.metaDescription}

📍 ${article.city} & Umgebung
📞 Jetzt kostenlos anfragen: +49 163 9087197
💬 WhatsApp: https://wa.me/491639087197
🌐 Mehr lesen: ${article.url}

${serviceTag} ${cityTag} #PerfektSauberService #Entrümpelung #Rastatt #BadenBaden #Karlsruhe #Gaggenau #Haushaltsaufloesung`;
}

// ─── Facebook API ─────────────────────────────────────────────────────────────

async function postToFacebook(article) {
  const caption = buildCaption(article);

  // Link post: FB zeigt automatisch eine Preview-Card mit Bild vom Artikel
  const body = {
    message: caption,
    link: article.url,
    access_token: FB_PAGE_ACCESS_TOKEN,
  };

  const res = await fetch(`https://graph.facebook.com/v25.0/${FB_PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Facebook API Fehler: ${JSON.stringify(data.error || data)}`);
  }
  return data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[FB Blog Poster] Start\n');

  const blogIndex = JSON.parse(readFileSync(join(ROOT, 'content', 'auto', 'blog-index.json'), 'utf8'));

  // Sorteaza dupa publishedAt ASC (cel mai vechi primul — catch-up in ordine cronologica)
  const articles = [...blogIndex.items].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

  const notPosted = articles.filter(a => !isPosted(a.slug));

  console.log(`Total articole: ${articles.length}`);
  console.log(`Deja postate pe FB: ${articles.length - notPosted.length}`);
  console.log(`Ramase de postat: ${notPosted.length}`);

  if (notPosted.length === 0) {
    console.log('\nToate articolele sunt deja postate pe Facebook!');
    process.exit(0);
  }

  const article = notPosted[0];
  console.log(`\nPostez: "${article.title}" (${article.city})`);
  console.log(`URL: ${article.url}`);

  const result = await postToFacebook(article);
  markPosted(article.slug);

  console.log(`\nPostat cu succes! Post ID: ${result.id}`);
  console.log(`Ramase dupa acest run: ${notPosted.length - 1}`);
}

main().catch(err => {
  console.error('\n[FEHLER]', err.message);
  process.exit(1);
});
