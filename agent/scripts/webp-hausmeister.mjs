import sharp from 'sharp';
import { statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'images', 'hausmeister');
const files = ['rasenmaehen', 'heckenschnitt', 'treppenhausreinigung', 'kleinreparatur'];
for (const f of files) {
  const src = join(DIR, `${f}.png`), out = join(DIR, `${f}.webp`);
  await sharp(src).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
  const kb = (statSync(out).size / 1024).toFixed(0);
  console.log(`${f}.webp  ${kb} KB`);
}
console.log('Gata.');
