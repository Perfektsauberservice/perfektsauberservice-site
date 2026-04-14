/**
 * Agent 13 — Instagram Auto-Poster (Vorher/Nachher Carousel)
 *
 * Postează automat proiecte reale (Vorher + Nachher) pe Instagram.
 * Ciclează prin toate perechile din projects.json. Când toate sunt postate, resetează.
 *
 * Utilizare:
 *   node agent/scripts/ig-poster.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
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

// ─── Stare postări ────────────────────────────────────────────────────────────

const POSTED_LOG = join(ROOT, 'agent', 'config', 'ig-posted.json');

function getPostedLog() {
  try {
    return JSON.parse(readFileSync(POSTED_LOG, 'utf8'));
  } catch {
    return { posted: [] };
  }
}

function markPosted(id) {
  const log = getPostedLog();
  log.posted.push({ id, postedAt: new Date().toISOString() });
  writeFileSync(POSTED_LOG, JSON.stringify(log, null, 2));
}

function alreadyPosted(id) {
  return getPostedLog().posted.some(p => p.id === id);
}

function resetPostedLog() {
  writeFileSync(POSTED_LOG, JSON.stringify({ posted: [] }, null, 2));
  console.log('🔄 Log resetat — ciclu nou început.');
}

// ─── Caption ─────────────────────────────────────────────────────────────────

function buildCaption(pair) {
  const serviceEmojis = {
    'Kellerentrümpelung': '🏚️',
    'Wohnungsauflösung': '🔑',
    'Haushaltsauflösung': '📦',
    'Gewerberäumung': '🏢',
  };
  const emoji = serviceEmojis[pair.service] || '✅';
  const cityTag = pair.city.replace(/[-\s]/g, '');
  const serviceTag = pair.service.replace(/[äöüÄÖÜß\s]/g, s =>
    ({ ä:'ae', ö:'oe', ü:'ue', Ä:'Ae', Ö:'Oe', Ü:'Ue', ß:'ss', ' ':'' }[s] || s)
  );

  return `${emoji} Vorher & Nachher | ${pair.service} in ${pair.city}

Wischen Sie nach links, um die Verwandlung zu sehen! ➡️

Von einem überfüllten Raum zu einem sauberen, befreiten Ergebnis — alles in einem Tag. Professionell, schnell und zuverlässig.

📍 ${pair.city} & Umgebung
📞 +49 163 9087197
💬 WhatsApp: https://wa.me/491639087197
🌐 perfektsauberservice.com

#VorherNachher #${serviceTag} #${cityTag} #PerfektSauberService #Entrümpelung #Haushaltsaufloesung #Rastatt #BadenBaden #Karlsruhe #Gaggenau #Aufräumen #Kelleraufloesung`;
}

// ─── Instagram Graph API ──────────────────────────────────────────────────────

function toJpegUrl(imageUrl) {
  const encoded = imageUrl.replace('https://', '');
  return `https://images.weserv.nl/?url=${encoded}&output=jpg&w=1080`;
}

async function createSingleItem(imageUrl) {
  const jpegUrl = toJpegUrl(imageUrl);
  const res = await fetch(`https://graph.facebook.com/v25.0/${IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: jpegUrl,
      is_carousel_item: true,
      access_token: IG_ACCESS_TOKEN,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Item Fehler: ${JSON.stringify(data.error || data)}`);
  return data.id;
}

async function createCarousel(itemIds, caption) {
  const res = await fetch(`https://graph.facebook.com/v25.0/${IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: itemIds.join(','),
      caption,
      access_token: IG_ACCESS_TOKEN,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Carousel Fehler: ${JSON.stringify(data.error || data)}`);
  return data.id;
}

async function publishMedia(creationId) {
  const res = await fetch(`https://graph.facebook.com/v25.0/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: IG_ACCESS_TOKEN,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Publish Fehler: ${JSON.stringify(data.error || data)}`);
  return data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📸 PSS Instagram Poster gestartet\n');

  const projectsPath = join(ROOT, 'agent', 'config', 'projects.json');
  const { pairs } = JSON.parse(readFileSync(projectsPath, 'utf8'));

  // Gaseste primul nepostat
  let pair = pairs.find(p => !alreadyPosted(p.id));

  // Daca toate sunt postate → reseteaza si incepe de la capat
  if (!pair) {
    resetPostedLog();
    pair = pairs[0];
  }

  console.log(`📝 Poste: ${pair.service} in ${pair.city} (${pair.id})`);

  const caption = buildCaption(pair);

  // 1. Creaza item Vorher
  console.log('⏳ Upload Vorher...');
  const vorherItemId = await createSingleItem(pair.vorher);
  console.log(`   → Vorher ID: ${vorherItemId}`);

  await new Promise(r => setTimeout(r, 3000));

  // 2. Creaza item Nachher
  console.log('⏳ Upload Nachher...');
  const nachherItemId = await createSingleItem(pair.nachher);
  console.log(`   → Nachher ID: ${nachherItemId}`);

  await new Promise(r => setTimeout(r, 3000));

  // 3. Creaza carousel
  console.log('⏳ Creez carousel...');
  const carouselId = await createCarousel([vorherItemId, nachherItemId], caption);
  console.log(`   → Carousel ID: ${carouselId}`);

  await new Promise(r => setTimeout(r, 5000));

  // 4. Publica
  console.log('⏳ Publică...');
  const result = await publishMedia(carouselId);

  markPosted(pair.id);

  console.log(`\n✅ Erfolgreich auf Instagram gepostet! ID: ${result.id}`);
}

main().catch(err => {
  console.error('\n❌ Fehler:', err.message);
  process.exit(1);
});
