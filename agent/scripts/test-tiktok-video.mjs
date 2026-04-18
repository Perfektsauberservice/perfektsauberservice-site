/**
 * TEST: TikTok Video Generator
 * Creeaza un video demo stil TikTok cu pozele din images/lucrari/
 * Format: 1080x1920 (portrait 9:16), text overlay, voiceover german
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'agent', 'test-output');
const IMGS = join(ROOT, 'images', 'lucrari');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const FFMPEG = 'ffmpeg';
const W = 1080, H = 1920;
const IMG_DURATION = 2.8;
const FONT = 'C\\:/Windows/Fonts/arialbd.ttf';

const IMAGES = [
  'lucrare-1.jpg',
  'lucrare-2.jpg',
  'lucrare-3.jpg',
  'lucrare-4.jpg',
  'lucrare-5.jpg',
  'lucrare-6.jpg',
];

const TOTAL_DURATION = IMAGES.length * IMG_DURATION;

// ─── 1. TTS german ────────────────────────────────────────────────────────────
const TTS_TEXT = 'Wir raeumen Ihre Wohnung, Ihren Keller oder Ihren Dachboden - schnell, gruendlich und zu fairen Preisen. Perfekt Sauber Service in Rastatt und Umgebung. Jetzt kostenlos anfragen!';
const TTS_WAV = join(OUT_DIR, 'voiceover.wav').replace(/\//g, '\\');
const TTS_MP3 = join(OUT_DIR, 'voiceover.mp3');

console.log('Generez voiceover german...');
const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Katja')
$synth.Rate = -1
$synth.Volume = 100
$synth.SetOutputToWaveFile('${TTS_WAV}')
$synth.Speak('${TTS_TEXT}')
$synth.Dispose()
`;
const psResult = spawnSync('powershell', ['-Command', psScript], { encoding: 'utf8' });
if (psResult.status !== 0) {
  console.error('TTS error:', psResult.stderr || psResult.stdout);
  process.exit(1);
}
console.log('Voiceover generat OK');

execSync(`"${FFMPEG}" -y -i "${TTS_WAV}" -q:a 2 "${TTS_MP3}"`, { stdio: 'pipe' });

// ─── 2. Build ffmpeg command ───────────────────────────────────────────────────
console.log('\nGenerez video...');

const inputs = IMAGES.map(f => `-loop 1 -t ${IMG_DURATION} -i "${join(IMGS, f)}"`).join(' ');

const fps = 25;
const totalFrames = Math.floor(IMG_DURATION * fps);

// Per-image filters: scale to 1080x1080, pad to 1080x1920, zoom, fade
const perImageFilters = IMAGES.map((_, i) => {
  const chain = [
    `scale=${W}:${W}`,
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `zoompan=z='min(zoom+0.001,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${W}x${H}:fps=${fps}`,
    `fade=t=in:st=0:d=0.25`,
    `fade=t=out:st=${(IMG_DURATION - 0.35).toFixed(2)}:d=0.35`,
    `setpts=PTS-STARTPTS`,
  ].join(',');
  return `[${i}:v]${chain}[v${i}]`;
}).join('; ');

const concatPart = IMAGES.map((_, i) => `[v${i}]`).join('') + `concat=n=${IMAGES.length}:v=1:a=0[vconcat]`;

// Text overlays - toate in filter_complex dupa concat
const ctaStart = (TOTAL_DURATION - 4.5).toFixed(1);
const midY = Math.floor(H / 2);

const textPart = [
  // Banner top
  `drawbox=x=0:y=50:w=${W}:h=130:color=0x000000@0.65:t=fill`,
  `drawtext=fontfile='${FONT}':text='Entruempelung und Haushaltsaufloesung':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=88:shadowcolor=black:shadowx=2:shadowy=2`,
  // Banner bottom brand
  `drawbox=x=0:y=${H - 190}:w=${W}:h=190:color=0x1a3c5e@0.8:t=fill`,
  `drawtext=fontfile='${FONT}':text='Perfekt Sauber Service':fontsize=46:fontcolor=white:x=(w-text_w)/2:y=${H - 168}:shadowcolor=black:shadowx=2:shadowy=2`,
  `drawtext=fontfile='${FONT}':text='Rastatt - Baden-Baden - Karlsruhe':fontsize=30:fontcolor=0xFFD700:x=(w-text_w)/2:y=${H - 110}`,
  // CTA in ultimele 4.5 secunde
  `drawbox=x=80:y=${midY - 55}:w=920:h=85:color=0x1E8449@0.9:t=fill:enable='gte(t,${ctaStart})'`,
  `drawtext=fontfile='${FONT}':text='Jetzt anrufen\\: +49 163 9087197':fontsize=38:fontcolor=white:x=(w-text_w)/2:y=${midY - 40}:shadowcolor=black:shadowx=2:shadowy=2:enable='gte(t,${ctaStart})'`,
].join(',');

// Scrie filter_complex intr-un fisier .txt pentru a evita probleme cu shell quoting
const filterComplex = `${perImageFilters}; ${concatPart}; [vconcat]${textPart}[vout]`;
const FILTER_SCRIPT = join(OUT_DIR, 'filter.txt');
writeFileSync(FILTER_SCRIPT, filterComplex, 'utf8');

const OUTPUT = join(OUT_DIR, 'test-tiktok.mp4');
const VIDEO_ONLY = join(OUT_DIR, 'video-only.mp4');

// Pass 1: video cu text (fara audio)
const cmdVideo = [
  `"${FFMPEG}"`,
  `-y`,
  inputs,
  `-/filter_complex "${FILTER_SCRIPT}"`,
  `-map "[vout]"`,
  `-c:v libx264 -preset fast -crf 22`,
  `-t ${TOTAL_DURATION}`,
  `-pix_fmt yuv420p`,
  `"${VIDEO_ONLY}"`,
].join(' ');

// Pass 2: adauga audio
const cmdAudio = [
  `"${FFMPEG}"`,
  `-y`,
  `-i "${VIDEO_ONLY}"`,
  `-i "${TTS_MP3}"`,
  `-c:v copy`,
  `-c:a aac -b:a 128k`,
  `-shortest`,
  `-movflags +faststart`,
  `"${OUTPUT}"`,
].join(' ');

try {
  console.log('Pass 1: generez video cu text...');
  execSync(cmdVideo, { stdio: 'inherit' });
  console.log('Pass 2: adaug audio...');
  execSync(cmdAudio, { stdio: 'inherit' });
  console.log(`\nVideo gata: ${OUTPUT}`);
  console.log(`Format: ${W}x${H} (TikTok portrait 9:16)`);
  console.log(`Durata: ${TOTAL_DURATION}s`);
} catch (err) {
  console.error('FFmpeg error');
  process.exit(1);
}
