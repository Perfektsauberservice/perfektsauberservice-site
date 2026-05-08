/**
 * check-new-reviews.mjs
 *
 * Verifica review-urile actuale ale firmei pe Google si trimite alert pe Telegram
 * pentru fiecare review NOU (nu dintre cele deja vazute).
 *
 * Mesajul Telegram contine:
 * - text-ul review-ului + autor + nr stele
 * - un draft de raspuns generat automat (template per rating)
 * - link direct la GMB ca sa raspunzi
 *
 * Ruleaza zilnic via GitHub Actions impreuna cu update-review-count.mjs.
 *
 * State pastrat in agent/state/known-reviews.json (lista de review IDs deja vazute).
 *
 * Limitari:
 * - Places API returneaza max 5 review-uri (cele mai recente). Daca primesti >5/zi
 *   nu le vezi pe toate. La volum normal (1-5/luna) e ok.
 * - Bootstrap: prima rulare inregistreaza review-urile existente fara alert
 *   (evita spam Telegram cu cele 2 existente).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '648944715';
const STATE_FILE = resolve('agent/state/known-reviews.json');
const SEARCH_QUERY = 'Perfekt Sauber Service';
// locationRestriction (FILTRU STRICT) — Places API New accepta DOAR rectangle.
// Dreptunghi ~10km lat x ~10km lng centrat pe Reutstraße 9 Loffenau.
const LOCATION_RESTRICTION = {
  rectangle: {
    low:  { latitude: 48.830, longitude: 8.255 },
    high: { latitude: 48.920, longitude: 8.395 },
  },
};
// Link DIRECT la dashboard-ul GMB pentru a raspunde la review-uri.
// Dupa login (kontakt@perfektsauberservice.com), Google duce automat la review-urile firmei.
const GMB_REPLY_URL = 'https://business.google.com/reviews';

if (!API_KEY) {
  console.error('ERROR: GOOGLE_PLACES_API_KEY missing.');
  process.exit(1);
}
if (!TELEGRAM_BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN missing.');
  process.exit(1);
}

async function fetchReviews() {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.reviews',
    },
    body: JSON.stringify({ textQuery: SEARCH_QUERY, locationRestriction: LOCATION_RESTRICTION }),
  });
  if (!res.ok) {
    throw new Error(`Places API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.places?.[0]?.reviews || [];
}

function htmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function generateDraft(review) {
  const rating = review.rating || 5;
  const rawName = review.authorAttribution?.displayName || 'Kunde';
  const firstName = rawName.split(' ')[0]; // doar prenumele in raspuns

  if (rating === 5) {
    return `Vielen Dank für Ihre 5-Sterne-Bewertung, ${firstName}! Es freut uns sehr, dass Sie mit unserem Service zufrieden waren. Wir wünschen Ihnen alles Gute und hoffen, Sie bei einem nächsten Auftrag wiederzusehen.\n\nHerzliche Grüße,\nLaura — Perfekt Sauber Service`;
  }
  if (rating === 4) {
    return `Vielen Dank für Ihre Bewertung, ${firstName}! Wir freuen uns über Ihr Feedback. Falls es Bereiche gibt, in denen wir uns verbessern können, lassen Sie es uns gerne unter kontakt@perfektsauberservice.com wissen — wir nehmen jedes Feedback ernst.\n\nHerzliche Grüße,\nLaura — Perfekt Sauber Service`;
  }
  if (rating === 3) {
    return `Hallo ${firstName}, vielen Dank, dass Sie sich die Zeit genommen haben uns zu bewerten. Wir möchten gerne verstehen, was wir besser machen können — bitte kontaktieren Sie uns direkt unter +49 163 9087197 oder kontakt@perfektsauberservice.com, damit wir das Erlebnis verbessern können.\n\nHerzliche Grüße,\nLaura — Perfekt Sauber Service`;
  }
  // 1-2 sterne — apologetic + offer to make it right
  return `Hallo ${firstName}, es tut uns sehr leid zu hören, dass Sie nicht zufrieden waren. Das entspricht nicht unserem Anspruch an unsere Arbeit. Bitte rufen Sie mich persönlich unter +49 163 9087197 an oder schreiben Sie an kontakt@perfektsauberservice.com — wir möchten verstehen, was schiefgelaufen ist und es wenn möglich wieder gutmachen.\n\nMit besten Grüßen,\nLaura Craciun — Perfekt Sauber Service`;
}

function buildAlert(review) {
  const rating = review.rating || 5;
  const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  const name = htmlEscape(review.authorAttribution?.displayName || 'Anonym');
  const reviewText = (review.text?.text || review.originalText?.text || '').slice(0, 700);
  const escapedText = htmlEscape(reviewText);
  const draft = htmlEscape(generateDraft(review));
  // Link de raspuns: GMB admin (login proprietar). Daca e mesaj generic, foloseste pagina GMB admin generala.
  const reviewUrl = GMB_REPLY_URL;

  const lines = [
    `🌟 <b>NOU review pe Google!</b>`,
    ``,
    `${stars}  (${rating}/5)`,
    `👤 <b>${name}</b>`,
  ];
  if (reviewText) {
    lines.push(``, `💬 <i>${escapedText}</i>`);
  } else {
    lines.push(``, `<i>(fără text — doar rating)</i>`);
  }
  lines.push(
    ``,
    `✍️ <b>Draft răspuns (copiază + editează după preferință):</b>`,
    `<code>${draft}</code>`,
    ``,
    `🔗 <a href="${reviewUrl}">Răspunde direct pe Google</a>`
  );
  return lines.join('\n');
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) console.error('Telegram error:', JSON.stringify(data));
  return data.ok;
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { knownIds: [] };
  }
}

function saveState(s) {
  if (!existsSync(dirname(STATE_FILE))) mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

async function main() {
  const reviews = await fetchReviews();
  console.log(`Fetched ${reviews.length} reviews from Places API`);

  const state = loadState();
  const knownIds = new Set(state.knownIds || []);

  // Bootstrap: prima rulare = inregistreaza tot ce exista, fara alert
  if (knownIds.size === 0 && reviews.length > 0) {
    console.log(`Bootstrap: recording ${reviews.length} existing reviews without alerting.`);
    saveState({ knownIds: reviews.map(r => r.name), bootstrappedAt: new Date().toISOString() });
    await sendTelegram(
      `✅ <b>GMB Review Tracker activat</b>\n\n` +
      `Înregistrate ${reviews.length} review-uri existente.\n` +
      `De aici încolo primești alert pe Telegram pentru fiecare review NOU,\n` +
      `cu draft de răspuns gata de copiat.`
    );
    return;
  }

  const newReviews = reviews.filter(r => !knownIds.has(r.name));
  console.log(`${newReviews.length} new reviews to alert.`);

  if (newReviews.length === 0) {
    console.log('Nothing new. Done.');
    return;
  }

  for (const review of newReviews) {
    const text = buildAlert(review);
    const ok = await sendTelegram(text);
    if (ok) {
      knownIds.add(review.name);
      console.log(`Alerted for review by ${review.authorAttribution?.displayName || '?'} (${review.rating}★)`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  saveState({ ...state, knownIds: Array.from(knownIds) });
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
