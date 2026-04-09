// compress-images.mjs
// Comprimă toate imaginile din images/keller-*, wohnung-*, garage-*, haus-*
// PNG → JPEG 85%, JPEG → JPEG 82%, păstrează fișierul original suprascris
// Rulează: node agent/compress-images.mjs

import sharp from 'sharp';
import { readdir, stat } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '../images');
const JPEG_QUALITY = 82;
const PNG_QUALITY  = 85;
const MIN_SAVINGS_KB = 20; // sari peste dacă economisești mai puțin de 20KB

async function getFolders(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && /^(keller|wohnung|garage|haus)-/i.test(e.name))
    .map(e => join(dir, e.name));
}

async function compressFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) return;

  const { size: sizeBefore } = await stat(filePath);
  const img = sharp(filePath);
  const meta = await img.metadata();

  // Max 1600px wide (generos pentru web)
  const resized = meta.width > 1600
    ? img.resize({ width: 1600, withoutEnlargement: true })
    : img;

  let buf;
  if (ext === '.png') {
    buf = await resized.jpeg({ quality: PNG_QUALITY, mozjpeg: true }).toBuffer();
    // Salvăm ca .jpg în loc de .png dacă e mai mic
    const jpgPath = filePath.replace(/\.png$/i, '.jpg');
    if (buf.length < sizeBefore - MIN_SAVINGS_KB * 1024) {
      await sharp(buf).toFile(jpgPath);
      // Ștergem png-ul vechi
      const { unlink } = await import('fs/promises');
      await unlink(filePath);
      console.log(`  PNG→JPG: ${basename(filePath)} ${kb(sizeBefore)} → ${kb(buf.length)}`);
      return { from: sizeBefore, to: buf.length };
    }
  } else {
    buf = await resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    if (buf.length < sizeBefore - MIN_SAVINGS_KB * 1024) {
      await sharp(buf).toFile(filePath);
      console.log(`  JPEG: ${basename(filePath)} ${kb(sizeBefore)} → ${kb(buf.length)}`);
      return { from: sizeBefore, to: buf.length };
    }
  }

  console.log(`  skip: ${basename(filePath)} (${kb(sizeBefore)}, câștig mic)`);
  return null;
}

function kb(bytes) { return (bytes / 1024).toFixed(0) + 'KB'; }

async function main() {
  const folders = await getFolders(IMAGES_DIR);
  if (folders.length === 0) {
    console.log('Niciun folder găsit (keller-*, wohnung-*, garage-*, haus-*)');
    return;
  }

  let totalBefore = 0, totalAfter = 0, count = 0;

  for (const folder of folders) {
    console.log(`\n📁 ${basename(folder)}`);
    const files = await readdir(folder);
    for (const file of files) {
      const result = await compressFile(join(folder, file));
      if (result) {
        totalBefore += result.from;
        totalAfter  += result.to;
        count++;
      }
    }
  }

  if (count > 0) {
    console.log(`\n✅ ${count} fișiere comprimate`);
    console.log(`   Înainte: ${kb(totalBefore)} | După: ${kb(totalAfter)} | Economisit: ${kb(totalBefore - totalAfter)}`);
  } else {
    console.log('\nNimic de comprimat.');
  }
}

main().catch(console.error);
