/**
 * Generate Max mascot poses with DALL-E 3
 * Output: agent/mascot/max-running.png, max-swing.png, max-impact.png, max-present.png
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(ROOT, 'agent', 'mascot');

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error('❌ OPENAI_API_KEY lipsa'); process.exit(1); }

// Baza comuna pentru toate pozele — mentiine consistenta personajului
const BASE = `Clean vector cartoon illustration, white background, full body visible, no shadows, no gradients on background. Young boy mascot about 8-10 years old named Max: messy brown hair, big expressive brown eyes, rosy cheeks, friendly smile, wearing blue denim overalls with "PSS" text printed on the chest pocket, white t-shirt underneath, brown work boots, knees of overalls slightly torn/worn. Professional brand mascot style, vibrant colors, bold outlines.`;

const POSES = [
  {
    file: 'max-running.png',
    prompt: `${BASE} The boy is running fast from right to left, body leaning forward, legs in mid-stride running position, one arm forward one arm back, hair blown back from speed, determined happy expression, carrying a small sledgehammer in one hand. Side view, dynamic running pose.`,
  },
  {
    file: 'max-swing.png',
    prompt: `${BASE} The boy is standing with a large sledgehammer raised high above his head with both hands, about to strike downward. He is looking down at a cardboard box on the ground in front of him. Excited determined expression. Side/three-quarter view.`,
  },
  {
    file: 'max-impact.png',
    prompt: `${BASE} The boy just hit a cardboard box with a sledgehammer. The box is exploding/bursting open with items flying out, dust cloud effect, stars and impact lines around the hit. The boy is in a strong follow-through pose, grinning triumphantly. Dynamic action pose, comic book impact style.`,
  },
  {
    file: 'max-present.png',
    prompt: `${BASE} The boy is facing the camera directly, smiling broadly and confidently, one hand pointing finger toward the viewer (like "YOU!"), other hand on hip. Proud cheerful stance. He looks like he is about to introduce himself. Front view, welcoming and energetic expression.`,
  },
];

async function generateImage(pose) {
  console.log(`🎨 Generez: ${pose.file}...`);

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: pose.prompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
      response_format: 'url',
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const imageUrl = data.data[0].url;

  // Descarca imaginea
  const imgResp = await fetch(imageUrl);
  const buffer = Buffer.from(await imgResp.arrayBuffer());
  const outPath = join(OUT, pose.file);
  writeFileSync(outPath, buffer);

  console.log(`   ✅ Salvat: ${outPath}`);
  return outPath;
}

async function main() {
  console.log('=== Generez pozele mascotei Max ===\n');
  console.log(`Output: ${OUT}\n`);

  for (const pose of POSES) {
    try {
      await generateImage(pose);
      // Pauza intre cereri sa nu depasim rate limit
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`❌ Eroare la ${pose.file}: ${err.message}`);
    }
  }

  console.log('\n✅ Toate pozele generate!');
  console.log(`   Folder: ${OUT}`);
  console.log('   Fisiere: max-running.png, max-swing.png, max-impact.png, max-present.png');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
