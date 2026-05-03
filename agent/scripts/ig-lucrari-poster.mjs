/**
 * Agent — Lucrari Poster
 *
 * Posteaza pozele din images/lucrari/ individual pe Instagram + Facebook.
 * Ruleaza de 10 ori/zi pana epuizeaza toate pozele, apoi se opreste.
 * Starea (ce s-a postat) se salveaza in agent/state/lucrari-posted.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const STATE_PATH = join(ROOT, 'agent', 'state', 'lucrari-posted.json');
const IMAGES_DIR = join(ROOT, 'images', 'lucrari');
const BASE_URL = 'https://www.perfektsauberservice.com/images/lucrari';

const IG_USER_ID = process.env.IG_USER_ID || '17841437576100238';
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const CAPTION = `✅ Entrümpelung & Haushaltsauflösung — schnell, diskret, besenrein! 🏠

Wir räumen Keller, Wohnungen, Dachböden und Büros in Rastatt, Baden-Baden, Gaggenau und Umgebung.

📞 Kostenlos anfragen: +49 163 9087197
🌐 www.perfektsauberservice.com

#Entrümpelung #Haushaltsauflösung #Rastatt #BadenBaden #Gaggenau #Karlsruhe #Entrümpelungsfirma #PerfektSauberService #Wohnungsauflösung #Kellerentrümpelung`;

// ─── State ────────────────────────────────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_PATH)) return { posted: [] };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return { posted: [] }; }
}

function saveState(state) {
  const dir = join(ROOT, 'agent', 'state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ─── Instagram ────────────────────────────────────────────────────────────────

async function postToInstagram(imageUrl) {
  if (!IG_ACCESS_TOKEN) throw new Error('IG_ACCESS_TOKEN lipsa');

  const createRes = await fetch(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: CAPTION,
        access_token: IG_ACCESS_TOKEN,
      }),
    }
  );
  const createData = await createRes.json();
  if (!createData.id) throw new Error('IG create error: ' + JSON.stringify(createData));

  await new Promise(r => setTimeout(r, 3000));

  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: createData.id,
        access_token: IG_ACCESS_TOKEN,
      }),
    }
  );
  const publishData = await publishRes.json();
  if (!publishData.id) throw new Error('IG publish error: ' + JSON.stringify(publishData));
  return publishData.id;
}

// ─── Facebook ─────────────────────────────────────────────────────────────────

async function postToFacebook(imageUrl) {
  if (!FB_ACCESS_TOKEN || !FB_PAGE_ID) return null;

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        caption: CAPTION,
        access_token: FB_ACCESS_TOKEN,
      }),
    }
  );
  const data = await res.json();
  if (!data.id) throw new Error('FB error: ' + JSON.stringify(data));
  return data.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const state = loadState();

  // Gaseste toate pozele disponibile
  const allPhotos = readdirSync(IMAGES_DIR)
    .filter(f => f.endsWith('.jpg'))
    .sort((a, b) => {
      const na = parseInt(a.replace('lucrare-', ''));
      const nb = parseInt(b.replace('lucrare-', ''));
      return na - nb;
    });

  // Gaseste prima poza nepostata
  const nextPhoto = allPhotos.find(f => !state.posted.includes(f));

  if (!nextPhoto) {
    console.log('✅ Toate pozele au fost postate. Nimic de facut.');
    process.exit(0);
  }

  const imageUrl = `${BASE_URL}/${nextPhoto}`;
  console.log(`📸 Postez: ${nextPhoto}`);
  console.log(`   URL: ${imageUrl}`);

  let igId = null, fbId = null;

  try {
    igId = await postToInstagram(imageUrl);
    console.log(`   ✅ Instagram: ${igId}`);
  } catch (err) {
    console.error(`   ❌ Instagram: ${err.message}`);
  }

  try {
    fbId = await postToFacebook(imageUrl);
    if (fbId) console.log(`   ✅ Facebook: ${fbId}`);
  } catch (err) {
    console.error(`   ❌ Facebook: ${err.message}`);
  }

  if (igId || fbId) {
    state.posted.push(nextPhoto);
    saveState(state);
    console.log(`\n📊 Postate: ${state.posted.length}/${allPhotos.length}`);
    const remaining = allPhotos.length - state.posted.length;
    if (remaining === 0) {
      console.log('🎉 Toate pozele au fost postate!');
    } else {
      console.log(`   Ramase: ${remaining}`);
    }
  }
}

// Coduri Meta tranziente (anti-spam, rate-limit) — workflow-ul nu trebuie să eșueze pe ele.
const TRANSIENT_META_CODES = [
  '"code":4', '"code":17', '"code":32',
  '"error_subcode":2207051', '"error_subcode":2207026',
];

main().catch(err => {
  const msg = err.message || '';
  if (TRANSIENT_META_CODES.some(code => msg.includes(code))) {
    console.warn(`⚠️ Meta block tranzitoriu detectat — sare runul fără fail.`);
    console.warn(`   Detalii: ${msg}`);
    process.exit(0);
  }
  console.error('❌ Eroare:', msg);
  process.exit(1);
});
