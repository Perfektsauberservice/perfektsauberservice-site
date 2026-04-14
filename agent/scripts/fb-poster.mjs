/**
 * Agent 10 — Facebook Page Auto-Poster (Vorher/Nachher)
 *
 * Postează automat proiecte reale (Vorher + Nachher) pe pagina de Facebook.
 * Ciclează prin toate perechile din projects.json. Când toate sunt postate, resetează.
 *
 * Utilizare:
 *   node agent/scripts/fb-poster.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
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

// ─── Stare postări ────────────────────────────────────────────────────────────

const POSTED_LOG = join(ROOT, 'agent', 'config', 'fb-posted.json');

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

Von einem überfüllten Raum zu einem sauberen, befreiten Ergebnis — alles in einem Tag. Professionell, schnell und zuverlässig.

📍 ${pair.city} & Umgebung
📞 +49 163 9087197
💬 WhatsApp: https://wa.me/491639087197
🌐 https://perfektsauberservice.com

#VorherNachher #${serviceTag} #${cityTag} #PerfektSauberService #Entrümpelung #Rastatt #BadenBaden #Karlsruhe #Gaggenau`;
}

// ─── Facebook Graph API ───────────────────────────────────────────────────────

async function postPhoto(imageUrl, caption, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`https://graph.facebook.com/v25.0/${FB_PAGE_ID}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        caption,
        access_token: FB_PAGE_ACCESS_TOKEN,
      }),
    });
    const data = await res.json();
    if (res.ok && !data.error) return data;

    const err = data.error || data;
    const isTransient = err.is_transient === true;
    if (isTransient && attempt < retries) {
      console.log(`   ⚠️  Transient error (attempt ${attempt}/${retries}), retry in 5s...`);
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }
    throw new Error(`Facebook API Fehler: ${JSON.stringify(err)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📘 PSS Facebook Poster gestartet\n');

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

  // Posteaza imaginea Nachher cu caption (jpg in loc de webp)
  console.log('⏳ Postez poza Nachher pe Facebook...');
  const result = await postPhoto(pair.nachher.replace('.webp', '.jpg'), caption);

  markPosted(pair.id);

  console.log(`\n✅ Erfolgreich auf Facebook gepostet! Post ID: ${result.id}`);
}

main().catch(err => {
  console.error('\n❌ Fehler:', err.message);
  process.exit(1);
});
