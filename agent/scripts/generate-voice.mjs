import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const OUTPUT = path.join(ROOT, 'agent/mascot/max-voice.mp3');

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) { console.error('ELEVENLABS_API_KEY missing'); process.exit(1); }

const TEXT = "Hallo, ich bin Max von Perfekt Sauber Service — dein Helfer für Entrümpelung und Reinigung im Umkreis von Rastatt bis zu 50 Kilometern. Egal wie viel oder wie schwer es ist, wir kümmern uns darum, damit du dir keine Sorgen machen musst. Melde dich einfach bei uns! Ab heute zeige ich euch hier unsere abgeschlossenen Arbeiten und viele weitere interessante Informationen rund um Entrümpelung und Reinigung — zum Beispiel Kosten, Dauer und wichtige Tipps, die man unbedingt kennen sollte. Liebe Grüße und bis zum nächsten Mal!";

// List voices to find Chris Beck
const voice = { name: 'Liam - Energetic Social Media Creator', voice_id: 'TX3LPaxmHKxFdv7VOQHJ' };

console.log(`Folosesc vocea: ${voice.name} (${voice.voice_id})`);

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voice_id}`, {
  method: 'POST',
  headers: {
    'xi-api-key': API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: TEXT,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
  })
});

if (!res.ok) {
  const err = await res.text();
  console.error('Eroare ElevenLabs:', err);
  process.exit(1);
}

const buffer = await res.arrayBuffer();
fs.writeFileSync(OUTPUT, Buffer.from(buffer));
console.log(`Audio salvat: ${OUTPUT}`);
