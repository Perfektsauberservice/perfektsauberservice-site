/**
 * Genereaza vocea lui Max cu ElevenLabs Voice Design
 * Voce: tanar, masculin, accent german
 * Output: agent/mascot/max-voice.mp3
 *
 * Ruleaza: ELEVENLABS_API_KEY=sk_... node agent/scripts/generate-max-voice.mjs
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT  = join(ROOT, 'agent', 'mascot');

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('❌ ELEVENLABS_API_KEY lipsa'); process.exit(1); }

// Textul pe care il spune Max
const MAX_TEXT = `Hallo! Ich bin Max, das Maskottchen von Perfekt Sauber Service! Wir räumen Keller, Wohnungen und Dachböden leer – schnell, gründlich und zu fairen Preisen. In Rastatt, Baden-Baden und Karlsruhe. Ruf uns jetzt an und frag kostenlos an!`;

async function generateVoiceDesign() {
  console.log('🎙️  Generez voce noua cu ElevenLabs Voice Design...');
  console.log('   Parametri: masculin, tanar, accent german\n');

  // Step 1: Genereaza preview voce
  const previewResp = await fetch('https://api.elevenlabs.io/v1/voice-generation/generate-voice', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gender: 'male',
      age: 'young',
      accent: 'german',
      accent_strength: 1.5,
      text: MAX_TEXT,
    }),
  });

  if (!previewResp.ok) {
    const err = await previewResp.text();
    console.log(`⚠️  Voice Design error: ${err}`);
    console.log('   Folosesc voce alternativa din librarie...');
    return null;
  }

  const previewData = await previewResp.json();
  const previewId = previewData.previews?.[0]?.generated_voice_id;

  if (!previewId) {
    console.log('⚠️  Nu am primit preview ID, folosesc voce alternativa...');
    return null;
  }

  console.log(`   ✅ Voice Design generat (ID: ${previewId})`);

  // Step 2: Salveaza vocea custom din preview
  const saveResp = await fetch('https://api.elevenlabs.io/v1/voice-generation/create-voice-from-preview', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_name: 'Max PSS',
      voice_description: 'Mascota copil Perfekt Sauber Service - voce tanara germana',
      generated_voice_id: previewId,
    }),
  });

  if (!saveResp.ok) {
    console.log('⚠️  Nu pot salva vocea, generez direct din preview...');
    // Foloseste preview-ul direct ca audio
    if (previewData.previews?.[0]?.audio_base_64) {
      return Buffer.from(previewData.previews[0].audio_base_64, 'base64');
    }
    return null;
  }

  const saveData = await saveResp.json();
  return saveData.voice_id;
}

async function generateTTS(voiceId, text, outPath) {
  console.log(`🎙️  Generez TTS cu vocea: ${voiceId}...`);

  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!resp.ok) throw new Error(`TTS error ${resp.status}: ${await resp.text()}`);

  const buffer = Buffer.from(await resp.arrayBuffer());
  writeFileSync(outPath, buffer);
  console.log(`   ✅ Voce salvata: ${outPath}`);
}

async function main() {
  console.log('=== Generez Vocea lui Max ===\n');

  const outPath = join(OUT, 'max-voice.mp3');

  // Incearca Voice Design (voce tanara germana custom)
  const result = await generateVoiceDesign();

  if (result instanceof Buffer) {
    // Am primit audio direct din preview
    writeFileSync(outPath, result);
    console.log(`✅ Voce salvata din preview: ${outPath}`);
  } else if (typeof result === 'string') {
    // Am voice ID — genereaza TTS
    await generateTTS(result, MAX_TEXT, outPath);
  } else {
    // Fallback: foloseste vocea "Daniel" (British, tânăr) sau "Adam"
    console.log('   Fallback: vocea Daniel (tanara, britanica)...');
    // Daniel = onwK4e9ZLuTAKqWW03F9, Adam = pNInz6obpgDQGcFmaJgB
    // Liam = TX3LPaxmHKxFdv7VOQHJ (tânăr, energic)
    await generateTTS('TX3LPaxmHKxFdv7VOQHJ', MAX_TEXT, outPath);
  }

  console.log('\n✅ Gata! Urmatorul pas:');
  console.log('   cd agent/mascot-video && npm install && node render.mjs');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
