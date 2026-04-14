/**
 * Agent 13 — Instagram Auto-Poster
 *
 * Postează automat articole noi pe contul Instagram perfektsauberservice.
 * Citește ultimul articol din blog-index.json și îl postează dacă nu a fost deja postat.
 *
 * Utilizare:
 *   node agent/scripts/ig-poster.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const IG_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_USER_ID = '17841437576100238';

if (!IG_ACCESS_TOKEN) {
  console.error('[FEHLER] INSTAGRAM_ACCESS_TOKEN lipsește.');
  process.exit(1);
}

// ─── Imagini fallback (rotatie) ───────────────────────────────────────────────

const FALLBACK_IMAGES = [
  'https://perfektsauberservice.com/images/keller-badenbaden/kellerentruempelung-badenbaden-nachher-1.webp',
  'https://perfektsauberservice.com/images/keller-badenbaden/kellerentruempelung-badenbaden-nachher-2.webp',
  'https://perfektsauberservice.com/images/wohnung-gaggenau/wohnungsaufloesung-gaggenau-nachher-1.webp',
  'https://perfektsauberservice.com/images/wohnung-karlsruhe/wohnungsaufloesung-karlsruhe-nachher-1.webp',
  'https://perfektsauberservice.com/images/wohnung-rastatt/wohnungsaufloesung-rastatt-nachher-1.webp',
];

function getImageForPost(index) {
  return FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
}

// ─── Stare postări deja publicate ────────────────────────────────────────────

const POSTED_LOG = join(ROOT, 'agent', 'config', 'ig-posted.json');

function getPostedLog() {
  try {
    return JSON.parse(readFileSync(POSTED_LOG, 'utf8'));
  } catch (e) {
    return { posted: [] };
  }
}

function markPosted(slug) {
  const log = getPostedLog();
  log.posted.push({ slug, postedAt: new Date().toISOString() });
  writeFileSync(POSTED_LOG, JSON.stringify(log, null, 2));
}

function alreadyPosted(slug) {
  const log = getPostedLog();
  return log.posted.some(p => p.slug === slug);
}

// ─── Generează textul postării ────────────────────────────────────────────────

function buildCaption(article) {
  const serviceEmojis = {
    'Entrümpelung': '🏠',
    'Haushaltsauflösung': '📦',
    'Wohnungsauflösung': '🔑',
    'Gewerberäumung': '🏢',
    'Endreinigung': '✨',
    'Fensterreinigung': '🪟',
  };
  const emoji = serviceEmojis[article.service] || '✅';
  const serviceHashtag = (article.service || 'Entrümpelung').replace(/\s/g, '');

  return `${emoji} ${article.title}

${article.metaDescription || ''}

📍 ${article.city} & Umgebung
📞 Jetzt anfragen: +49 163 9087197
💬 WhatsApp: https://wa.me/491639087197
🌐 ${article.url || 'https://perfektsauberservice.com'}

#${serviceHashtag} #${(article.city || '').replace(/\s/g, '')} #PerfektSauberService #Entrümpelung #Rastatt #Haushaltsauflösung #Baden #Karlsruhe`;
}

// ─── Instagram Graph API ──────────────────────────────────────────────────────

async function createMediaContainer(imageUrl, caption) {
  const url = `https://graph.facebook.com/v25.0/${IG_USER_ID}/media`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: IG_ACCESS_TOKEN,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(`Container Fehler: ${JSON.stringify(data.error || data)}`);
  }

  return data.id;
}

async function publishMedia(creationId) {
  const url = `https://graph.facebook.com/v25.0/${IG_USER_ID}/media_publish`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: IG_ACCESS_TOKEN,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(`Publish Fehler: ${JSON.stringify(data.error || data)}`);
  }

  return data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📸 PSS Instagram Poster gestartet\n');

  const indexPath = join(ROOT, 'content', 'auto', 'blog-index.json');
  if (!existsSync(indexPath)) {
    console.error('[FEHLER] blog-index.json nicht gefunden.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(indexPath, 'utf8'));
  const articles = data.items || [];

  if (articles.length === 0) {
    console.log('ℹ️  Keine Artikel im Index.');
    process.exit(0);
  }

  // Găsește primul articol nepostat (cel mai nou mai întâi)
  const toPostIndex = articles.findIndex(a => !alreadyPosted(a.slug));

  if (toPostIndex === -1) {
    console.log('ℹ️  Alle Artikel wurden bereits gepostet.');
    process.exit(0);
  }

  const toPost = articles[toPostIndex];
  console.log(`📝 Poste: "${toPost.title}" (${toPost.city})`);

  const caption = buildCaption(toPost);
  const imageUrl = getImageForPost(toPostIndex);

  console.log('   → Image:', imageUrl);
  console.log('   → Caption preview:', caption.substring(0, 80) + '...');

  // 1. Creează container
  console.log('\n⏳ Creez media container...');
  const creationId = await createMediaContainer(imageUrl, caption);
  console.log(`   → Creation ID: ${creationId}`);

  // Asteapta 5 secunde (recomandat de Meta)
  await new Promise(r => setTimeout(r, 5000));

  // 2. Publică
  console.log('⏳ Publică...');
  const result = await publishMedia(creationId);

  markPosted(toPost.slug);

  console.log(`\n✅ Erfolgreich auf Instagram gepostet! ID: ${result.id}`);
}

main().catch(err => {
  console.error('\n❌ Fehler:', err.message);
  process.exit(1);
});
