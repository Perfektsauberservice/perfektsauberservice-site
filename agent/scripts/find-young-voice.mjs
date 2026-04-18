/**
 * Cauta voci tinere masculine in libraria ElevenLabs
 * si genereaza un sample audio cu fiecare
 * Ruleaza: ELEVENLABS_API_KEY=sk_... node agent/scripts/find-young-voice.mjs
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT  = join(ROOT, 'agent', 'mascot', 'voice-samples');

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('❌ ELEVENLABS_API_KEY lipsa'); process.exit(1); }

const SAMPLE_TEXT = 'Hallo! Ich bin Max! Wir räumen Keller und Wohnungen – schnell und günstig!';

// Voci candidate — tinere masculine, potrivite pentru un adolescent german
const CANDIDATES = [
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (young)' },
  { id: 'pMsXgVXv3BLzUgSXRplE', name: 'Serena' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum (young male)' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (young male)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (british young)' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will (young)' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (deep)' },
];

async function generateSample(voiceId, name) {
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: SAMPLE_TEXT,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.75 },
    }),
  });

  if (!resp.ok) {
    console.log(`   ⚠️  ${name}: ${resp.status}`);
    return;
  }

  const safeName = name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const outPath = join(OUT, `${safeName}.mp3`);
  writeFileSync(outPath, Buffer.from(await resp.arrayBuffer()));
  console.log(`   ✅ ${name} → ${safeName}.mp3`);
}

// Genereaza si cu Voice Design (tanar german)
async function generateVoiceDesignSample() {
  console.log('\n🎨 Voice Design (tanar, german, masculin)...');
  const resp = await fetch('https://api.elevenlabs.io/v1/voice-generation/generate-voice', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gender: 'male',
      age: 'young',
      accent: 'german',
      accent_strength: 2.0,
      text: SAMPLE_TEXT,
    }),
  });

  if (!resp.ok) {
    console.log(`   ⚠️  Voice Design error: ${await resp.text()}`);
    return;
  }

  const data = await resp.json();
  const preview = data.previews?.[0];
  if (preview?.audio_base_64) {
    const outPath = join(OUT, 'voice-design-german-young.mp3');
    writeFileSync(outPath, Buffer.from(preview.audio_base_64, 'base64'));
    console.log(`   ✅ Voice Design → voice-design-german-young.mp3`);
    console.log(`   Voice ID: ${preview.generated_voice_id}`);
  }
}

async function main() {
  console.log('=== Caut voci tinere pentru Max ===');
  console.log(`Output: ${OUT}\n`);

  console.log('🎤 Generez samples din libraria ElevenLabs...');
  for (const c of CANDIDATES) {
    await generateSample(c.id, c.name);
    await new Promise(r => setTimeout(r, 800));
  }

  await generateVoiceDesignSample();

  console.log('\n✅ Gata! Deschide folderul si asculta fiecare fisier MP3:');
  console.log(`   ${OUT}`);
  console.log('\nDupa ce alegi vocea preferata, spune-mi numele fisierului');
  console.log('si updatez generate-max-voice.mjs cu voice ID-ul corect.');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
