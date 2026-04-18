/**
 * Render Max Intro Video
 * Ruleaza: node render.mjs
 * Output: ../../agent/test-output/max-intro.mp4
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..', '..');
const MASCOT    = join(ROOT, 'agent', 'mascot');
const PUBLIC    = join(__dirname, 'public');
const OUT_DIR   = join(ROOT, 'agent', 'test-output');

// ─── Copiaza imaginile si audio in public/ ────────────────────────────────────

if (!existsSync(PUBLIC)) mkdirSync(PUBLIC, { recursive: true });
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const assets = ['max-running.png', 'max-swing.png', 'max-impact.png', 'max-present.png'];
for (const f of assets) {
  const src = join(MASCOT, f);
  if (!existsSync(src)) {
    console.error(`❌ Lipsa: ${src}`);
    console.error('   Pune pozele Max in agent/mascot/ si incearca din nou.');
    process.exit(1);
  }
  copyFileSync(src, join(PUBLIC, f));
  console.log(`📋 Copiat: ${f}`);
}

// Copiaza vocea daca exista
const voiceSrc = join(MASCOT, 'max-voice.mp3');
const hasVoice = existsSync(voiceSrc);
if (hasVoice) {
  copyFileSync(voiceSrc, join(PUBLIC, 'max-voice.mp3'));
  console.log('📋 Copiat: max-voice.mp3');
} else {
  console.log('⚠️  max-voice.mp3 nu exista — video fara audio');
}

// ─── Bundle si render ─────────────────────────────────────────────────────────

const entryPoint = join(__dirname, 'src', 'index.jsx');
const outputPath = join(OUT_DIR, 'max-intro.mp4');

console.log('\n🎬 Bundling Remotion...');
const bundled = await bundle({
  entryPoint,
  webpackOverride: (config) => config,
});

console.log('🎯 Selectez compositia...');
const composition = await selectComposition({
  serveUrl: bundled,
  id: 'MaxIntro',
  inputProps: { audioSrc: hasVoice },
});

console.log('🎞️  Renderez video (poate dura 2-5 minute)...');
await renderMedia({
  composition,
  serveUrl: bundled,
  codec: 'h264',
  outputLocation: outputPath,
  inputProps: { audioSrc: hasVoice },
  onProgress: ({ progress }) => {
    const pct = Math.round(progress * 100);
    process.stdout.write(`\r   Progress: ${pct}%`);
  },
});

console.log(`\n\n✅ Video gata: ${outputPath}`);
console.log('   Deschide fisierul sa vezi animatia!');
