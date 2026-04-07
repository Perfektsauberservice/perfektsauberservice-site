/**
 * Agent 10 — Facebook Page Auto-Poster
 *
 * Postează automat articole noi pe pagina de Facebook a Perfekt Sauber Service.
 * Citește ultimul articol din blog-index.json și îl postează dacă nu a fost deja postat.
 *
 * Utilizare:
 *   node agent/scripts/fb-poster.mjs
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

// ─── Stare postări deja publicate ────────────────────────────────────────────

const POSTED_LOG = join(ROOT, 'agent', 'config', 'fb-posted.json');

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

function buildPostMessage(article) {
  const serviceEmojis = {
    'Entrümpelung': '🏠',
    'Haushaltsauflösung': '📦',
    'Wohnungsauflösung': '🔑',
    'Gewerberäumung': '🏢',
    'Endreinigung': '✨',
    'Fensterreinigung': '🪟',
  };
  const emoji = serviceEmojis[article.service] || '✅';

  return `${emoji} ${article.title}

${article.metaDescription || ''}

📍 ${article.city} & Umgebung
📞 Jetzt anfragen: +49 163 9087197
💬 WhatsApp: https://wa.me/491639087197

#Entrümpelung #${article.city} #PerfektSauberService #Haushaltsauflösung #Rastatt`;
}

// ─── Postează pe Facebook ─────────────────────────────────────────────────────

async function postToFacebook(message, link) {
  const url = `https://graph.facebook.com/v25.0/${FB_PAGE_ID}/feed`;

  const body = {
    message,
    link,
    access_token: FB_PAGE_ACCESS_TOKEN,
  };

  const res = await fetch(url, {
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
  console.log('📘 PSS Facebook Poster gestartet\n');

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
  const toPost = articles.find(a => !alreadyPosted(a.slug));

  if (!toPost) {
    console.log('ℹ️  Alle Artikel wurden bereits gepostet.');
    process.exit(0);
  }

  console.log(`📝 Poste: "${toPost.title}" (${toPost.city})`);

  const message = buildPostMessage(toPost);
  const link = toPost.url;

  console.log('   → Message preview:', message.substring(0, 100) + '...');
  console.log('   → Link:', link);

  const result = await postToFacebook(message, link);

  markPosted(toPost.slug);

  console.log(`\n✅ Erfolgreich gepostet! Post ID: ${result.id}`);
  console.log(`   URL: https://www.facebook.com/${result.id}`);
}

main().catch(err => {
  console.error('\n❌ Fehler:', err.message);
  process.exit(1);
});
