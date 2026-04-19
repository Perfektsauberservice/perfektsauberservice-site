/**
 * Genereaza imagini split-screen Vorher/Nachher pentru GBP.
 * Output: images/splitscreen/[id]-splitscreen.jpg (1200x630, format GBP recomandat)
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'images', 'splitscreen');
const PROJECTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent', 'config', 'projects.json'), 'utf8'));

fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 1200, H = 630;
const HALF = W / 2;

// Label overlay SVG
function labelSvg(text, side) {
  const x = side === 'left' ? 16 : HALF + 16;
  return `<svg width="${W}" height="${H}">
    <rect x="${x}" y="${H - 44}" width="${text.length * 13 + 24}" height="32" rx="6" fill="rgba(0,0,0,0.55)"/>
    <text x="${x + 12}" y="${H - 22}" font-family="Arial" font-size="18" font-weight="bold" fill="white">${text}</text>
  </svg>`;
}

// Divider SVG
const dividerSvg = `<svg width="${W}" height="${H}">
  <line x1="${HALF}" y1="0" x2="${HALF}" y2="${H}" stroke="white" stroke-width="3"/>
  <circle cx="${HALF}" cy="${H/2}" r="18" fill="white"/>
  <text x="${HALF}" y="${H/2 + 6}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold" fill="#333">↔</text>
</svg>`;

async function resolveImagePath(url) {
  // url e de forma https://perfektsauberservice.com/images/...
  const rel = url.replace('https://perfektsauberservice.com/', '');
  const jpgPath = path.join(ROOT, rel.replace('.webp', '.jpg'));
  const webpPath = path.join(ROOT, rel);
  if (fs.existsSync(jpgPath)) return jpgPath;
  if (fs.existsSync(webpPath)) return webpPath;
  return null;
}

async function generateSplitscreen(pair) {
  const vorherPath = await resolveImagePath(pair.vorher);
  const nachherPath = await resolveImagePath(pair.nachher);

  if (!vorherPath || !nachherPath) {
    console.log(`⚠️  Lipsa: ${pair.id}`);
    return;
  }

  const [vorherBuf, nachherBuf] = await Promise.all([
    sharp(vorherPath).resize(HALF, H, { fit: 'cover', position: 'centre' }).toBuffer(),
    sharp(nachherPath).resize(HALF, H, { fit: 'cover', position: 'centre' }).toBuffer(),
  ]);

  const outPath = path.join(OUT_DIR, `${pair.id}-splitscreen.jpg`);

  await sharp({
    create: { width: W, height: H, channels: 3, background: '#1a1a1a' }
  })
    .composite([
      { input: vorherBuf, left: 0, top: 0 },
      { input: nachherBuf, left: HALF, top: 0 },
      { input: Buffer.from(labelSvg('VORHER', 'left')), left: 0, top: 0 },
      { input: Buffer.from(labelSvg('NACHHER', 'right')), left: 0, top: 0 },
      { input: Buffer.from(dividerSvg), left: 0, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toFile(outPath);

  console.log(`✅ ${pair.id} → ${path.basename(outPath)}`);
}

async function run() {
  console.log(`Generez ${PROJECTS.pairs.length} imagini split-screen...\n`);
  for (const pair of PROJECTS.pairs) {
    await generateSplitscreen(pair);
  }
  console.log(`\n🎉 Gata! Imagini salvate in images/splitscreen/`);
}

run().catch(console.error);
