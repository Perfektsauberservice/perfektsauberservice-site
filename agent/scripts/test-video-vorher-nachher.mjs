/**
 * TEST — Slideshow Vorher/Nachher (split screen vertical)
 * Genereaza video local: agent/test-output/test-vorher-nachher.mp4
 * Ruleaza: node agent/scripts/test-video-vorher-nachher.mjs
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT  = join(ROOT, 'agent', 'test-output');

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_KEY) { console.error('❌ ELEVENLABS_API_KEY lipsa'); process.exit(1); }

// 3 perechi Vorher/Nachher (fisiere .jpg locale)
const PAIRS = [
  {
    label: 'Kellerentrümpelung • Rastatt',
    vorher: join(ROOT, 'images/keller-1/kellerentruempelung-rastatt-vorher-1.jpg'),
    nachher: join(ROOT, 'images/keller-1/kellerentruempelung-rastatt-nachher-1.jpg'),
  },
  {
    label: 'Wohnungsauflösung • Baden-Baden',
    vorher: join(ROOT, 'images/wohnung-badenbaden/wohnungsaufloesung-badenbaden-vorher-1.jpg'),
    nachher: join(ROOT, 'images/wohnung-badenbaden/wohnungsaufloesung-badenbaden-nachher-1.jpg'),
  },
  {
    label: 'Wohnungsauflösung • Karlsruhe',
    vorher: join(ROOT, 'images/wohnung-karlsruhe/wohnungsaufloesung-karlsruhe-vorher-1.jpg'),
    nachher: join(ROOT, 'images/wohnung-karlsruhe/wohnungsaufloesung-karlsruhe-nachher-1.jpg'),
  },
];

const VOICE_TEXT   = 'Vorher und nachher – das ist der Unterschied, den Perfekt Sauber Service macht. Wir räumen Keller, Wohnungen und Dachböden komplett leer und hinterlassen alles besenrein. In Rastatt, Baden-Baden und Karlsruhe. Rufen Sie jetzt an!';
const FONT         = 'C\\:/Windows/Fonts/arialbd.ttf';
const W = 1080, H = 1920, FPS = 25;
const PAIR_DUR     = 4.0; // secunde per pereche

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

  // Layout: 1080x1920
  // Top bar (170px): titlu PSS
  // Vorher image (790px): y=170
  // Divider bar (60px): y=960  cu text VORHER → NACHHER
  // Nachher image (790px): y=1020
  // Bottom CTA (110px): y=1810

  const IMGW = W;         // 1080
  const IMGH = 790;       // inaltime per imagine
  const DIV_Y = 960;      // y divider
  const DIV_H = 60;
  const VORHER_Y = 170;
  const NACHHER_Y = DIV_Y + DIV_H; // 1020
  const frames = Math.floor(PAIR_DUR * FPS);
  const totalDur = PAIRS.length * PAIR_DUR;

  // Inputs: vorher + nachher pentru fiecare pereche (6 total)
  const inputs = PAIRS.flatMap(p => [
    `-loop 1 -t ${PAIR_DUR} -i "${p.vorher}"`,
    `-loop 1 -t ${PAIR_DUR} -i "${p.nachher}"`,
  ]).join(' ');

  // Per pereche: scale + zoom fiecare imagine, vstack, fade
  const perPair = PAIRS.map((pair, i) => {
    const vi = i * 2;     // vorher input index
    const ni = i * 2 + 1; // nachher input index
    const label = pair.label.replace(/'/g, "\\'").replace(/•/g, '-').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ä/g, 'a').replace(/ß/g, 'ss');

    const vorherFilter = [
      `scale=${IMGW}:${IMGH}:force_original_aspect_ratio=increase`,
      `crop=${IMGW}:${IMGH}`,
      `zoompan=z='min(zoom+0.001,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${IMGW}x${IMGH}:fps=${FPS}`,
      `setpts=PTS-STARTPTS`,
    ].join(',');

    const nachherFilter = [
      `scale=${IMGW}:${IMGH}:force_original_aspect_ratio=increase`,
      `crop=${IMGW}:${IMGH}`,
      `zoompan=z='min(zoom+0.001,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${IMGW}x${IMGH}:fps=${FPS}`,
      `setpts=PTS-STARTPTS`,
    ].join(',');

    return [
      `[${vi}:v]${vorherFilter}[vorher${i}]`,
      `[${ni}:v]${nachherFilter}[nachher${i}]`,
      // Canvas albastru 1080x1920
      `color=0x1a3c5e:s=${W}x${H}:d=${PAIR_DUR}:r=${FPS}[bg${i}]`,
      // Overlay vorher pe canvas
      `[bg${i}][vorher${i}]overlay=0:${VORHER_Y}[c${i}a]`,
      // Overlay nachher
      `[c${i}a][nachher${i}]overlay=0:${NACHHER_Y}[c${i}b]`,
      // Text: titlu top
      `[c${i}b]drawbox=x=0:y=0:w=${W}:h=170:color=0x1a3c5e@1:t=fill[c${i}c]`,
      `[c${i}c]drawtext=fontfile='${FONT}':text='Perfekt Sauber Service':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=22[c${i}d]`,
      `[c${i}d]drawtext=fontfile='${FONT}':text='${label}':fontsize=28:fontcolor=0xFFD700:x=(w-text_w)/2:y=88[c${i}e]`,
      // Divider cu VORHER / NACHHER
      `[c${i}e]drawbox=x=0:y=${DIV_Y}:w=${W}:h=${DIV_H}:color=0xFF6600@0.95:t=fill[c${i}f]`,
      `[c${i}f]drawtext=fontfile='${FONT}':text='VORHER':fontsize=28:fontcolor=white:x=40:y=${DIV_Y + 16}[c${i}g]`,
      `[c${i}g]drawtext=fontfile='${FONT}':text='NACHHER':fontsize=28:fontcolor=white:x=${W - 150}:y=${DIV_Y + 16}[c${i}h]`,
      // VORHER / NACHHER labels pe imagini
      `[c${i}h]drawbox=x=0:y=${VORHER_Y}:w=180:h=50:color=0xFF0000@0.75:t=fill[c${i}i]`,
      `[c${i}i]drawtext=fontfile='${FONT}':text='VORHER':fontsize=30:fontcolor=white:x=15:y=${VORHER_Y + 12}[c${i}j]`,
      `[c${i}j]drawbox=x=0:y=${NACHHER_Y}:w=210:h=50:color=0x1E8449@0.85:t=fill[c${i}k]`,
      `[c${i}k]drawtext=fontfile='${FONT}':text='NACHHER':fontsize=30:fontcolor=white:x=15:y=${NACHHER_Y + 12}[c${i}l]`,
      // CTA bottom
      `[c${i}l]drawbox=x=0:y=${H - 110}:w=${W}:h=110:color=0x1E8449@0.93:t=fill[c${i}m]`,
      `[c${i}m]drawtext=fontfile='${FONT}':text='+49 163 9087197  |  perfektsauberservice.com':fontsize=30:fontcolor=white:x=(w-text_w)/2:y=${H - 72}`,
      `fade=t=in:st=0:d=0.3,fade=t=out:st=${(PAIR_DUR - 0.3).toFixed(1)}:d=0.3[p${i}]`,
    ].join('; ');
  });

  const concat = PAIRS.map((_, i) => `[p${i}]`).join('') + `concat=n=${PAIRS.length}:v=1:a=0[vout]`;

  const filterFile = join(OUT, 'filter-vorher-nachher.txt');
  writeFileSync(filterFile, `${perPair.join('; ')}; ${concat}`);

  const cmd = [
    'ffmpeg -y',
    inputs,
    `-i "${audioPath}"`,
    `-filter_complex_script "${filterFile}"`,
    `-map "[vout]"`,
    `-map ${PAIRS.length * 2}:a`,
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
  console.log('=== Test Video Vorher/Nachher ===\n');
  const audioPath = join(OUT, 'vorher-nachher-voice.mp3');
  const videoPath = join(OUT, 'test-vorher-nachher.mp4');

  await generateVoice(audioPath);
  buildVideo(audioPath, videoPath);

  console.log(`\n✅ Video gata: ${videoPath}`);
  console.log('   Deschide fisierul sa vezi rezultatul.');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
