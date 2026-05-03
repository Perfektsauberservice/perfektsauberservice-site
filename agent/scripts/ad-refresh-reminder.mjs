import { readFileSync } from 'fs';
import { resolve } from 'path';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '648944715';

if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN nu este setat in environment');
  process.exit(1);
}

const ADS_FILE = resolve('agent/config/kleinanzeigen-ads.json');
const ads = JSON.parse(readFileSync(ADS_FILE, 'utf8'));

// UTCDay: 0=Sun, 1=Mon, ..., 4=Thu, 6=Sat
const dayOfWeek = new Date().getUTCDay();

let batch;
let dayName;

if (dayOfWeek === 1) {
  // Luni: prima jumatate (anunturi 1-6)
  batch = ads.slice(0, Math.ceil(ads.length / 2));
  dayName = 'Luni';
} else if (dayOfWeek === 4) {
  // Joi: a doua jumatate (anunturi 7-12)
  batch = ads.slice(Math.ceil(ads.length / 2));
  dayName = 'Joi';
} else {
  console.log(`Ziua ${dayOfWeek} - reminder programat doar Luni/Joi. Skip.`);
  process.exit(0);
}

const list = batch
  .map((ad, i) => `${i + 1}. ${ad.title}`)
  .join('\n');

const minutesEstimate = batch.length * 2;

const message = `🔔 *Reminder Kleinanzeigen — Refresh Anunțuri*

${dayName} dimineața — refresh la următoarele anunțuri:

${list}

📋 *Pași:*
1. Mergi la kleinanzeigen.de → Meine Anzeigen
2. Pentru fiecare anunț: click "Bearbeiten"
3. Modifică ceva REAL (1 cuvânt, 1 bullet, schimbă o poză)
4. Salvează

⏱️ Timp estimat: ~${minutesEstimate} minute total

💡 Tip: variază titlul ca să testezi care prinde mai bine (A/B testing organic)`;

const response = await fetch(
  `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  }
);

const result = await response.json();
if (!result.ok) {
  console.error('Telegram API eroare:', JSON.stringify(result));
  process.exit(1);
}

console.log(`Reminder trimis pentru ${dayName} (${batch.length} anunțuri)`);
