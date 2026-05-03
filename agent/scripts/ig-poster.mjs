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

// Limită self-imposed — Instagram permite 50 postări/24h, dar pentru siguranță & engagement organic
// limităm la 1 postare/zi (redus de la 2 după ce Meta a flagged page-ul cu code 2207051).
const MAX_POSTS_PER_DAY = 1;
// Buffer față de quota Meta — dacă quota usage ≥ (total - QUOTA_BUFFER), sărim postarea.
const QUOTA_BUFFER = 5;

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

function postsInLast24h() {
  const log = getPostedLog();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return log.posted.filter(p => p.postedAt && new Date(p.postedAt).getTime() > cutoff).length;
}

function resetPostedLog() {
  // Pastram doar ultimele 24h ca sa nu pierdem rate-limit tracking dupa reset
  const log = getPostedLog();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = log.posted.filter(p => p.postedAt && new Date(p.postedAt).getTime() > cutoff);
  writeFileSync(POSTED_LOG, JSON.stringify({ posted: recent }, null, 2));
  console.log('🔄 Log resetat — ciclu nou început (postări recente păstrate pentru rate-limit).');
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
  return imageUrl.replace('.webp', '.jpg');
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

async function checkMetaQuota() {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${IG_USER_ID}/content_publishing_limit?access_token=${IG_ACCESS_TOKEN}`
    );
    const data = await res.json();
    const usage = data.data?.[0]?.quota_usage ?? 0;
    const total = data.data?.[0]?.config?.quota_total ?? 50;
    return { usage, total };
  } catch (e) {
    console.warn(`⚠️ Quota check eșuat (continuăm): ${e.message}`);
    return { usage: 0, total: 50 };
  }
}

async function main() {
  console.log('📸 PSS Instagram Poster gestartet\n');

  // ─── Rate-limit gate 1: limita noastră (2 postări/zi) ───────────────────────
  const todayCount = postsInLast24h();
  if (todayCount >= MAX_POSTS_PER_DAY) {
    console.log(`⏭ Deja ${todayCount}/${MAX_POSTS_PER_DAY} postări în ultimele 24h. Sare runul.`);
    process.exit(0);
  }
  console.log(`📊 Postări locale ultimele 24h: ${todayCount}/${MAX_POSTS_PER_DAY}`);

  // ─── Rate-limit gate 2: quota Meta ──────────────────────────────────────────
  const { usage, total } = await checkMetaQuota();
  console.log(`📊 Quota Meta: ${usage}/${total}`);
  if (usage >= total - QUOTA_BUFFER) {
    console.log(`⚠️ Quota Meta aproape de limită (≥ ${total - QUOTA_BUFFER}). Sare runul.`);
    process.exit(0);
  }

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

// Coduri Meta tranziente (anti-spam, rate-limit) — workflow-ul nu trebuie să eșueze pe ele.
// Why: Meta marchează temporar page-ul ca "acțiune blocată" pentru conținut similar repetat.
// Ies cu 0 ca notificarea de fail să nu mai vină; rulajul următor reîncearcă natural.
const TRANSIENT_META_CODES = [
  '"code":4',          // Application request limit reached
  '"code":17',         // User request limit reached
  '"code":32',         // Page request limit reached
  '"error_subcode":2207051', // acțiune blocată (anti-spam carousel)
  '"error_subcode":2207026', // unsupported format / temporary
];

main().catch(err => {
  const msg = err.message || '';
  if (TRANSIENT_META_CODES.some(code => msg.includes(code))) {
    console.warn(`\n⚠️ Meta block tranzitoriu detectat — sare runul fără fail.`);
    console.warn(`   Detalii: ${msg}`);
    process.exit(0);
  }
  console.error('\n❌ Fehler:', msg);
  process.exit(1);
});
