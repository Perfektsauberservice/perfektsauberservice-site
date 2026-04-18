import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const MASCOT = path.join(ROOT, 'agent/mascot');
const OUTPUT = path.join(ROOT, 'agent/mascot/max-intro.mp4');

// Each keyframe: file + how long it shows (seconds)
const frames = [
  { file: 'kf1.png', duration: 0.5 },
  { file: 'kf2.png', duration: 0.4 },
  { file: 'kf3.png', duration: 0.4 },
  { file: 'kf4.png', duration: 0.35 },
  { file: 'kf5.png', duration: 0.35 },
  { file: 'kf6.png', duration: 0.5 },
  { file: 'kf7.png', duration: 2.0 },
  { file: 'kf8.png', duration: 1.5 },
];

const voice = path.join(MASCOT, 'max-voice.mp3');
const hasVoice = fs.existsSync(voice);
const concatFile = path.join(MASCOT, 'concat.txt');

// Verify all frames exist
for (const f of frames) {
  const p = path.join(MASCOT, f.file);
  if (!fs.existsSync(p)) {
    console.error(`Missing: ${p}`);
    process.exit(1);
  }
}

// Build concat file
let txt = '';
for (const f of frames) {
  const p = path.join(MASCOT, f.file).replace(/\\/g, '/');
  txt += `file '${p}'\nduration ${f.duration}\n`;
}
// ffmpeg requires last file repeated
const last = frames[frames.length - 1];
txt += `file '${path.join(MASCOT, last.file).replace(/\\/g, '/')}'`;
fs.writeFileSync(concatFile, txt);

const totalDuration = frames.reduce((s, f) => s + f.duration, 0);
const fadeOut = totalDuration - 0.4;

const videoFilter = [
  'scale=1080:1080:force_original_aspect_ratio=decrease',
  'pad=1080:1080:(ow-iw)/2:(oh-ih)/2:white',
  `fade=t=in:st=0:d=0.2`,
  `fade=t=out:st=${fadeOut.toFixed(2)}:d=0.4`,
].join(',');

let cmd;
if (hasVoice) {
  cmd = `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -i "${voice}" ` +
    `-vf "${videoFilter}" ` +
    `-af "afade=t=in:st=0:d=0.2,afade=t=out:st=${(totalDuration - 0.5).toFixed(2)}:d=0.5" ` +
    `-c:v libx264 -pix_fmt yuv420p -r 25 -c:a aac -shortest "${OUTPUT}"`;
} else {
  cmd = `ffmpeg -y -f concat -safe 0 -i "${concatFile}" ` +
    `-vf "${videoFilter}" ` +
    `-c:v libx264 -pix_fmt yuv420p -r 25 "${OUTPUT}"`;
}

console.log('Building Max intro video...');
try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\nDone: ${OUTPUT}`);
} catch (e) {
  console.error('Error:', e.message);
} finally {
  if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
}
