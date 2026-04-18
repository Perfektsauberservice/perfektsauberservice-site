/**
 * TEST — Slideshow Lucrari
 * Genereaza video local: agent/test-output/test-lucrari.mp4
 * Ruleaza: node agent/scripts/test-video-lucrari.mjs
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT   = join(ROOT, 'agent', 'test-output');
const IMGS  = join(ROOT, 'images', 'lucrari');

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_KEY) { console.error('❌ ELEVENLABS_API_KEY lipsa'); process.exit(1); }

const PHOTOS       = ['lucrare-1.jpg','lucrare-2.jpg','lucrare-3.jpg','lucrare-4.jpg','lucrare-5.jpg','lucrare-6.jpg'];
const VOICE_TEXT   = 'Hier sehen Sie einige unserer abgeschlossenen Projekte. Perfekt Sauber Service räumt Keller, Wohnungen und Dachböden – in Rastatt, Baden-Baden und Karlsruhe. Schnell, gründlich und zu fairen Preisen. Jetzt kostenlos anfragen!';
const FONT         = 'C\\:/Windows/Fonts/arialbd.ttf';
const W = 1080, H = 1920, FPS = 25;
const IMG_DUR      = 2.5; // secunde per poza

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────

async function generateVoice(outPath) {
  console.log('🎙️  Generez voce germana...');
  const resp = await fetch('https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: VOICE_TEXT,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.55, similarity_boost: 0.75 },
    }),
  });
  if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
  writeFileSync(outPath, Buffer.from(await resp.arrayBuffer()));
  console.log('   ✅ Voce salvata');
}

// ─── FFmpeg video ─────────────────────────────────────────────────────────────

function buildVideo(audioPath, videoPath) {
  console.log('🎬 Generez video cu FFmpeg...');

  const frames      = Math.floor(IMG_DUR * FPS);
  const totalDur    = PHOTOS.length * IMG_DUR;

  // Inputs: fiecare poza loop
  const inputs = PHOTOS.map(f => `-loop 1 -t ${IMG_DUR} -i "${join(IMGS, f)}"`).join(' ');

  // Per-image: scale square + zoom + fade + pad la 1080x1920 (imaginea centrata la y=400)
  const perImg = PHOTOS.map((_, i) => {
    const f = [
      `scale=${W}:${W}:force_original_aspect_ratio=increase`,
      `crop=${W}:${W}`,
      `zoompan=z='min(zoom+0.0015,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${W}:fps=${FPS}`,
      `fade=t=in:st=0:d=0.3`,
      `fade=t=out:st=${(IMG_DUR - 0.3).toFixed(1)}:d=0.3`,
      `setpts=PTS-STARTPTS`,
      `pad=${W}:${H}:(ow-iw)/2:380:color=0x1a3c5e`,
    ].join(',');
    return `[${i}:v]${f}[v${i}]`;
  }).join('; ');

  const concat = PHOTOS.map((_, i) => `[v${i}]`).join('') + `concat=n=${PHOTOS.length}:v=1:a=0[vconcat]`;

  // Text overlay
  const text = [
    `drawbox=x=0:y=0:w=${W}:h=170:color=0x1a3c5e@1:t=fill`,
    `drawtext=fontfile='${FONT}':text='Perfekt Sauber Service':fontsize=50:fontcolor=white:x=(w-text_w)/2:y=28`,
    `drawtext=fontfile='${FONT}':text='Unsere Arbeiten':fontsize=36:fontcolor=0xFFD700:x=(w-text_w)/2:y=100`,
    `drawbox=x=0:y=${H - 210}:w=${W}:h=210:color=0x1E8449@0.93:t=fill`,
    `drawtext=fontfile='${FONT}':text='Kostenlose Besichtigung':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=${H - 185}`,
    `drawtext=fontfile='${FONT}':text='+49 163 9087197':fontsize=50:fontcolor=0xFFD700:x=(w-text_w)/2:y=${H - 118}`,
  ].join(',');

  const filterFile = join(OUT, 'filter-lucrari.txt');
  writeFileSync(filterFile, `${perImg}; ${concat}; [vconcat]${text}[vout]`);

  const cmd = [
    'ffmpeg -y',
    inputs,
    `-i "${audioPath}"`,
    `-filter_complex_script "${filterFile}"`,
    `-map "[vout]"`,
    `-map ${PHOTOS.length}:a`,
    `-c:v libx264 -preset fast -crf 22`,
    `-c:a aac -b:a 128k`,
    `-t ${totalDur}`,
    `-pix_fmt yuv420p -movflags +faststart`,
    `"${videoPath}"`,
  ].join(' ');

  execSync(cmd, { stdio: 'inherit' });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Test Video Lucrari ===\n');
  const audioPath = join(OUT, 'lucrari-voice.mp3');
  const videoPath = join(OUT, 'test-lucrari.mp4');

  await generateVoice(audioPath);
  buildVideo(audioPath, videoPath);

  console.log(`\n✅ Video gata: ${videoPath}`);
  console.log('   Deschide fisierul sa vezi rezultatul.');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
