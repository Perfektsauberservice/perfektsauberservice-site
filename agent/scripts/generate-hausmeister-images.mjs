/**
 * Generate photorealistic Hausmeister task images with DALL-E 3
 * Output: images/hausmeister/*.png
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(ROOT, 'images', 'hausmeister');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('OPENAI_API_KEY lipsa'); process.exit(1); }

const BASE = `Photorealistic professional photograph, high detail, natural daylight, clean modern look. A facility-service worker wearing a plain green and dark-grey work uniform with no visible brand logos or text. The worker is shown from behind or three-quarter angle so the face is NOT identifiable. No text, no watermark, no logos, no readable signage.`;

const IMAGES = [
  { file: 'rasenmaehen.png',        prompt: `${BASE} The worker is mowing a neat green residential lawn with a modern push lawn mower, tidy garden with hedges in the background, sunny summer day.` },
  { file: 'heckenschnitt.png',      prompt: `${BASE} The worker is trimming a green garden hedge with an electric hedge trimmer, wearing work gloves, close focus on the hands and the freshly cut hedge, residential garden.` },
  { file: 'treppenhausreinigung.png', prompt: `${BASE} The worker is cleaning the staircase of a modern German apartment building (Treppenhaus) with a mop and bucket, bright clean stairwell with metal handrail and large windows.` },
  { file: 'kleinreparatur.png',     prompt: `${BASE} The worker is doing a small repair, fixing a ceiling light fixture with a screwdriver, close focus on the hands and tools, tidy indoor residential setting.` },
];

async function gen(item) {
  console.log(`Generez: ${item.file} ...`);
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: item.prompt, n: 1, size: '1536x1024', quality: 'high' }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const d0 = data.data[0];
  let buf;
  if (d0.url) { const r = await fetch(d0.url); buf = Buffer.from(await r.arrayBuffer()); }
  else if (d0.b64_json) { buf = Buffer.from(d0.b64_json, 'base64'); }
  else throw new Error('Raspuns fara url/b64');
  writeFileSync(join(OUT, item.file), buf);
  console.log(`   OK: ${item.file}`);
}

for (const it of IMAGES) {
  try { await gen(it); await new Promise(r => setTimeout(r, 2000)); }
  catch (e) { console.error(`   EROARE ${it.file}: ${e.message}`); }
}
console.log('Gata. Folder:', OUT);
