import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'images', 'hausmeister');
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('OPENAI_API_KEY lipsa'); process.exit(1); }

const prompt = `Photorealistic wide professional photograph, natural daylight, high detail. A well-maintained modern German residential apartment building (Mehrfamilienhaus) with a tidy freshly mown green lawn and neatly trimmed hedges in front. A facility-service worker wearing a plain green and dark-grey work uniform with no visible brand logos or text is tending the grounds, shown from behind or three-quarter angle so the face is NOT identifiable. Clean, welcoming, professional caretaker / Hausmeister scene, inviting atmosphere. No text, no watermark, no logos, no readable signage. Wide landscape composition.`;

const resp = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: '1536x1024', quality: 'high' }),
});
if (!resp.ok) { console.error('OpenAI', resp.status, await resp.text()); process.exit(1); }
const data = await resp.json();
const d0 = data.data[0];
const buf = d0.b64_json ? Buffer.from(d0.b64_json, 'base64')
  : Buffer.from(await (await fetch(d0.url)).arrayBuffer());
writeFileSync(join(OUT, 'hero.png'), buf);
console.log('OK: hero.png');
