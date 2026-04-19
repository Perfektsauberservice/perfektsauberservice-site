import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../../images/Wohnung Ettlingen');
const dstDir = path.join(__dirname, '../../images/wohnung-ettlingen');

fs.mkdirSync(dstDir, { recursive: true });

// Perechi: 1+2, 3+4, ..., 21+22
// Odd = vorher (JPEG), Even = nachher (PNG)
const pairs = [];
for (let i = 1; i <= 11; i++) {
  const vorherNum = (i - 1) * 2 + 1;  // 1,3,5,7,9,11,13,15,17,19,21
  const nachherNum = (i - 1) * 2 + 2; // 2,4,6,8,10,12,14,16,18,20,22
  pairs.push({ i, vorherNum, nachherNum });
}

async function processImage(srcPath, dstBase) {
  const jpgPath = dstBase + '.jpg';
  const webpPath = dstBase + '.webp';

  await sharp(srcPath)
    .resize(1080, 1080, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toFile(jpgPath);

  await sharp(srcPath)
    .resize(1080, 1080, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toFile(webpPath);

  console.log('✅', path.basename(jpgPath), '+', path.basename(webpPath));
}

async function run() {
  for (const { i, vorherNum, nachherNum } of pairs) {
    // Detecteaza extensia sursa (jpeg sau jpg pentru vorher, png pentru nachher)
    const vorherSrc = fs.existsSync(path.join(srcDir, `${vorherNum}.jpeg`))
      ? path.join(srcDir, `${vorherNum}.jpeg`)
      : path.join(srcDir, `${vorherNum}.jpg`);
    const nachherSrc = fs.existsSync(path.join(srcDir, `${nachherNum}.png`))
      ? path.join(srcDir, `${nachherNum}.png`)
      : path.join(srcDir, `${nachherNum}.jpg`);

    const vorherDst = path.join(dstDir, `wohnungsaufloesung-ettlingen-vorher-${i}`);
    const nachherDst = path.join(dstDir, `wohnungsaufloesung-ettlingen-nachher-${i}`);

    console.log(`\nPerecht ${i}: ${path.basename(vorherSrc)} → vorher-${i}, ${path.basename(nachherSrc)} → nachher-${i}`);
    await processImage(vorherSrc, vorherDst);
    await processImage(nachherSrc, nachherDst);
  }
  console.log('\n🎉 Gata! Toate 11 perechi convertite in images/wohnung-ettlingen/');
}

run().catch(console.error);
