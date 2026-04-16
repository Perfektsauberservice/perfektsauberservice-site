/**
 * Agent — Avatar Video Poster
 *
 * Genereaza video cu avatar vorbitor (D-ID) + voce germana (ElevenLabs)
 * si posteaza pe Instagram ca Reel + Facebook ca Video.
 *
 * Flow:
 *   1. Alege urmatorul script din lista (rotatie)
 *   2. ElevenLabs TTS → MP3 german
 *   3. Upload MP3 la D-ID → creeaza talk video
 *   4. Asteapta pana e gata → URL public video
 *   5. Posteaza pe Instagram ca Reel
 *   6. Posteaza pe Facebook ca Video
 *   7. Salveaza stare (index curent)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const STATE_PATH = join(ROOT, 'agent', 'state', 'avatar-video-state.json');
const TMP_DIR = join(ROOT, 'agent', 'tmp-avatar');

// ─── Env vars ─────────────────────────────────────────────────────────────────

const DID_API_KEY       = process.env.DID_API_KEY;
const ELEVENLABS_KEY    = process.env.ELEVENLABS_API_KEY;
const IG_USER_ID        = process.env.IG_USER_ID        || '17841437576100238';
const IG_ACCESS_TOKEN   = process.env.IG_ACCESS_TOKEN;
const FB_PAGE_ID        = process.env.FB_PAGE_ID;
const FB_ACCESS_TOKEN   = process.env.FB_PAGE_ACCESS_TOKEN;

if (!DID_API_KEY)     { console.error('❌ DID_API_KEY lipsa'); process.exit(1); }
if (!ELEVENLABS_KEY)  { console.error('❌ ELEVENLABS_API_KEY lipsa'); process.exit(1); }
if (!IG_ACCESS_TOKEN) { console.error('❌ IG_ACCESS_TOKEN lipsa'); process.exit(1); }

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

// ─── Scripturi video (rotatie) ────────────────────────────────────────────────

const SCRIPTS = [
  {
    title: 'Entrümpelung Kosten',
    text: 'Was kostet eine Entrümpelung? Bei Perfekt Sauber Service in Rastatt bezahlen Sie nur für das, was wirklich entrümpelt wird. Wohnung ab 25 Euro pro Quadratmeter, Keller ab 22 Euro. Transparent, ohne versteckte Kosten. Wir kommen zur kostenlosen Besichtigung. Jetzt anrufen!',
    caption: `💡 Was kostet eine Entrümpelung?\n\nBei uns zahlen Sie nur für das, was wirklich geräumt wird – transparent und fair.\n\n✅ Wohnung ab 25€/m²\n✅ Keller ab 22€/m²\n✅ Kostenlose Besichtigung\n\n📍 Rastatt • Baden-Baden • Karlsruhe\n\n#Entrümpelung #Rastatt #Haushaltsauflösung #BadenBaden #Kellerentrümpelung #PerfektSauberService`,
  },
  {
    title: 'Haushaltsauflösung nach Todesfall',
    text: 'Eine Haushaltsauflösung nach einem Todesfall ist emotional schwer. Perfekt Sauber Service übernimmt alles für Sie – respektvoll, diskret und gründlich. Wir kümmern uns um die komplette Räumung, sortieren verwertbare Gegenstände und hinterlassen die Wohnung besenrein. Rufen Sie uns an – wir sind für Sie da.',
    caption: `🕊️ Haushaltsauflösung nach Todesfall\n\nIn schwierigen Zeiten kümmern wir uns um alles – diskret, respektvoll, professionell.\n\n✅ Komplette Räumung\n✅ Besenreine Übergabe\n✅ Verwertbare Gegenstände werden sortiert\n\n📍 Rastatt • Baden-Baden • Karlsruhe\n\n#Haushaltsauflösung #Entrümpelung #Todesfall #Rastatt #BadenBaden #PerfektSauberService`,
  },
  {
    title: 'Keller entrümpeln',
    text: 'Ihr Keller quillt über? Perfekt Sauber Service räumt Ihren Keller schnell und gründlich. Wir sortieren, entsorgen fachgerecht und hinterlassen Ihren Keller sauber und leer. Ab 22 Euro pro Quadratmeter, kostenlose Besichtigung, faire Preise. Jetzt in Rastatt, Baden-Baden und Karlsruhe.',
    caption: `🏚️ Keller entrümpeln leicht gemacht!\n\nSchluss mit dem Chaos – schnell, sauber, faire Preise.\n\n✅ Ab 22€/m²\n✅ Fachgerechte Entsorgung\n✅ Kostenlose Besichtigung\n\n📍 Rastatt • Baden-Baden • Karlsruhe\n\n#Kellerentrümpelung #Entrümpelung #Rastatt #Haushaltsauflösung #BadenBaden #PerfektSauberService`,
  },
  {
    title: 'Wohnungsauflösung',
    text: 'Sie müssen eine Wohnung auflösen? Wir übernehmen das komplett für Sie. Perfekt Sauber Service räumt, sortiert, entsorgt und übergibt besenrein. In Rastatt, Baden-Baden, Karlsruhe und Umgebung. Schnell, zuverlässig, zum Festpreis. Rufen Sie uns jetzt an für eine kostenlose Besichtigung!',
    caption: `🏠 Wohnungsauflösung?\n\nWir machen das für Sie – komplett, schnell, Festpreis!\n\n✅ Räumen & Sortieren\n✅ Fachgerechte Entsorgung\n✅ Besenreine Übergabe\n✅ Kostenlose Besichtigung\n\n📍 Rastatt • Baden-Baden • Karlsruhe\n\n#Wohnungsauflösung #Haushaltsauflösung #Entrümpelung #Rastatt #BadenBaden #PerfektSauberService`,
  },
  {
    title: 'Messie-Wohnung',
    text: 'Messie-Wohnungen sind eine besondere Herausforderung – aber kein Problem für Perfekt Sauber Service. Wir räumen diskret und ohne Wertung, egal wie der Zustand ist. Volle Räumung, Reinigung, Entsorgung. Wir sind für Sie da, wenn niemand sonst hilft. Jetzt kostenlos anfragen in Rastatt und Umgebung.',
    caption: `🧹 Messie-Wohnung? Kein Problem!\n\nWir räumen diskret und ohne Urteil – egal wie der Zustand ist.\n\n✅ Komplette Räumung\n✅ Professionelle Reinigung\n✅ Diskret & respektvoll\n\n📍 Rastatt • Baden-Baden • Karlsruhe\n\n#MessieWohnung #Entrümpelung #Haushaltsauflösung #Rastatt #Reinigung #PerfektSauberService`,
  },
  {
    title: 'Dachboden entrümpeln',
    text: 'Der Dachboden ist voll und Sie wissen nicht wo anfangen? Perfekt Sauber Service räumt Ihren Dachboden komplett leer. Wir trennen Wertvolles von Müll, entsorgen alles ordnungsgemäß und hinterlassen einen sauberen Dachboden. Faire Preise, kostenlose Besichtigung. Jetzt anrufen!',
    caption: `🏠 Dachboden entrümpeln?\n\nWir räumen alles – schnell, günstig, besenrein!\n\n✅ Komplette Räumung\n✅ Fachgerechte Entsorgung\n✅ Ab 22€/m²\n✅ Kostenlose Besichtigung\n\n📍 Rastatt • Baden-Baden • Karlsruhe\n\n#Dachbodenreinigung #Dachbodenentrümpelung #Entrümpelung #Rastatt #PerfektSauberService`,
  },
];

// ─── State ────────────────────────────────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_PATH)) return { lastIndex: -1 };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return { lastIndex: -1 }; }
}

function saveState(state) {
  const dir = join(ROOT, 'agent', 'state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────

async function generateVoice(text) {
  console.log('🎙️  Generez voiceover german cu ElevenLabs...');

  // Gaseste o voce germana disponibila
  const voicesResp = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': ELEVENLABS_KEY },
  });
  const voicesData = await voicesResp.json();

  let voiceId = 'pNInz6obpgDQGcFmaJgB'; // Adam - fallback, functioneaza cu multilingual
  const germanVoice = voicesData.voices?.find(
    v => v.labels?.language === 'German' || v.labels?.accent === 'german'
  );
  if (germanVoice) {
    voiceId = germanVoice.voice_id;
    console.log(`   Voce germana: ${germanVoice.name} (${voiceId})`);
  } else {
    console.log(`   Folosesc voce multilingual: ${voiceId}`);
  }

  const ttsResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!ttsResp.ok) {
    const err = await ttsResp.text();
    throw new Error(`ElevenLabs error ${ttsResp.status}: ${err}`);
  }

  const audioBuffer = await ttsResp.arrayBuffer();
  const audioPath = join(TMP_DIR, 'voiceover.mp3');
  writeFileSync(audioPath, Buffer.from(audioBuffer));
  console.log(`   ✅ Voiceover salvat (${Math.round(audioBuffer.byteLength / 1024)} KB)`);
  return audioPath;
}

// ─── D-ID: upload audio ───────────────────────────────────────────────────────

async function uploadAudioToDID(audioPath) {
  console.log('📤 Upload audio la D-ID...');

  const audioBuffer = readFileSync(audioPath);
  const formData = new FormData();
  formData.append('audio', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'voiceover.mp3');

  const resp = await fetch('https://api.d-id.com/audios', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${DID_API_KEY}` },
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`D-ID audio upload error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  console.log(`   ✅ Audio URL: ${data.url}`);
  return data.url;
}

// ─── D-ID: gaseste presenter disponibil ──────────────────────────────────────

async function getDIDPresenter() {
  console.log('🔍 Caut presenter disponibil D-ID...');

  const resp = await fetch('https://api.d-id.com/clips/presenters?limit=5', {
    headers: { 'Authorization': `Basic ${DID_API_KEY}` },
  });

  if (resp.ok) {
    const data = await resp.json();
    const presenter = data.presenters?.[0];
    if (presenter) {
      console.log(`   Presenter gasit: ${presenter.name || presenter.id}`);
      return { type: 'clips', presenterId: presenter.id, driverId: presenter.driver_id };
    }
  }

  // Fallback: folosim talks API cu o imagine publica simpla
  console.log('   Folosesc talks API cu imagine proprie...');
  return { type: 'talks', imageUrl: 'https://www.perfektsauberservice.com/images/echipa.webp' };
}

// ─── D-ID: creeaza talk ───────────────────────────────────────────────────────

async function createDIDTalk(audioUrl) {
  console.log('🎬 Creez talk D-ID...');

  const presenter = await getDIDPresenter();

  let resp;

  if (presenter.type === 'clips') {
    // Clips API (V4 Expressive Avatars)
    const body = {
      presenter_id: presenter.presenterId,
      script: {
        type: 'audio',
        audio_url: audioUrl,
      },
      config: { result_format: 'mp4' },
    };
    if (presenter.driverId) body.driver_id = presenter.driverId;

    resp = await fetch('https://api.d-id.com/clips', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${DID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } else {
    // Talks API (V2 Photo Avatars) cu poza de pe site
    const body = {
      source_url: presenter.imageUrl,
      script: {
        type: 'audio',
        audio_url: audioUrl,
      },
      config: { result_format: 'mp4', fluent: true, pad_audio: 0.5 },
    };

    resp = await fetch('https://api.d-id.com/talks', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${DID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`D-ID ${presenter.type} create error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  console.log(`   ✅ ${presenter.type} ID: ${data.id}`);
  return { id: data.id, type: presenter.type };
}

// ─── D-ID: asteapta video ─────────────────────────────────────────────────────

async function waitForDIDTalk({ id, type }, maxWaitMs = 120000) {
  console.log('⏳ Astept generarea video D-ID...');
  const start = Date.now();
  const endpoint = type === 'clips' ? 'clips' : 'talks';

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));

    const resp = await fetch(`https://api.d-id.com/${endpoint}/${id}`, {
      headers: { 'Authorization': `Basic ${DID_API_KEY}` },
    });

    const data = await resp.json();
    console.log(`   Status: ${data.status}`);

    if (data.status === 'done') {
      console.log(`   ✅ Video URL: ${data.result_url}`);
      return data.result_url;
    }
    if (data.status === 'error') {
      throw new Error(`D-ID ${type} failed: ${JSON.stringify(data.error)}`);
    }
  }

  throw new Error('D-ID video timeout (>2 min)');
}

// ─── Instagram Reel ───────────────────────────────────────────────────────────

async function postInstagramReel(videoUrl, caption) {
  console.log('📱 Postez Reel pe Instagram...');

  // Step 1: Creeaza container
  const createResp = await fetch(
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        share_to_feed: 'true',
        access_token: IG_ACCESS_TOKEN,
      }),
    }
  );

  const createData = await createResp.json();
  if (!createData.id) throw new Error(`IG container error: ${JSON.stringify(createData)}`);
  console.log(`   Container: ${createData.id}`);

  // Step 2: Asteapta procesarea video (pana la 2 min)
  let ready = false;
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusResp = await fetch(
      `https://graph.facebook.com/v21.0/${createData.id}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`
    );
    const statusData = await statusResp.json();
    console.log(`   IG status: ${statusData.status_code}`);
    if (statusData.status_code === 'FINISHED') { ready = true; break; }
    if (statusData.status_code === 'ERROR') throw new Error('IG container processing error');
  }

  if (!ready) throw new Error('IG container timeout');

  // Step 3: Publica
  const publishResp = await fetch(
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: createData.id,
        access_token: IG_ACCESS_TOKEN,
      }),
    }
  );

  const publishData = await publishResp.json();
  if (!publishData.id) throw new Error(`IG publish error: ${JSON.stringify(publishData)}`);
  console.log(`   ✅ Reel publicat: ${publishData.id}`);
  return publishData.id;
}

// ─── Facebook Video ───────────────────────────────────────────────────────────

async function postFacebookVideo(videoUrl, description) {
  if (!FB_ACCESS_TOKEN || !FB_PAGE_ID) {
    console.log('   ⚠️  FB_PAGE_ID sau FB_ACCESS_TOKEN lipsa, skip Facebook.');
    return null;
  }

  console.log('📘 Postez video pe Facebook...');

  const resp = await fetch(
    `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_url: videoUrl,
        description,
        access_token: FB_ACCESS_TOKEN,
      }),
    }
  );

  const data = await resp.json();
  if (!data.id) throw new Error(`FB video error: ${JSON.stringify(data)}`);
  console.log(`   ✅ Video FB publicat: ${data.id}`);
  return data.id;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Avatar Video Poster ===\n');

  // Alege urmatorul script
  const state = loadState();
  const nextIndex = (state.lastIndex + 1) % SCRIPTS.length;
  const script = SCRIPTS[nextIndex];
  console.log(`📝 Script: "${script.title}" (${nextIndex + 1}/${SCRIPTS.length})\n`);

  // 1. Genereaza voiceover
  const audioPath = await generateVoice(script.text);

  // 2. Upload audio la D-ID
  const audioUrl = await uploadAudioToDID(audioPath);

  // 3. Creeaza talk
  const talkId = await createDIDTalk(audioUrl);

  // 4. Asteapta video
  const videoUrl = await waitForDIDTalk(talkId);

  // 5. Posteaza pe Instagram
  let igId = null;
  try {
    igId = await postInstagramReel(videoUrl, script.caption);
  } catch (err) {
    console.error(`   ❌ Instagram error: ${err.message}`);
  }

  // 6. Posteaza pe Facebook
  let fbId = null;
  try {
    fbId = await postFacebookVideo(videoUrl, script.caption);
  } catch (err) {
    console.error(`   ❌ Facebook error: ${err.message}`);
  }

  // 7. Salveaza stare
  if (igId || fbId) {
    saveState({
      lastIndex: nextIndex,
      lastRun: new Date().toISOString(),
      lastScript: script.title,
    });
  }

  console.log('\n=== DONE ===');
  console.log(`Script: ${script.title}`);
  console.log(`Instagram: ${igId || 'eroare'}`);
  console.log(`Facebook: ${fbId || 'skip/eroare'}`);
}

main().catch(err => {
  console.error('❌ Eroare fatala:', err.message);
  process.exit(1);
});
