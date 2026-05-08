/**
 * update-review-count.mjs
 *
 * Fetcheaza Google Places API pentru Perfekt Sauber Service si actualizeaza
 * review count + rating in toate paginile HTML din site (~311 fisiere).
 *
 * Ruleaza zilnic via GitHub Actions (.github/workflows/pss-gmb-reviews-update.yml).
 * Necesita secret GOOGLE_PLACES_API_KEY.
 *
 * Place identificat prin search text (nume + adresa), nu prin Place ID hardcodat.
 * State pastrat in agent/state/gmb-reviews.json — daca nu se schimba, no-op.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const STATE_FILE = resolve('agent/state/gmb-reviews.json');
const SEARCH_QUERY = 'Perfekt Sauber Service';
// locationRestriction (FILTRU STRICT, nu bias) — doar firme din 5km de Loffenau.
// Coordonatele GMB Reutstraße 9 din URL Maps verificat 2026-05-08.
// 5km exclude Rastatt (~12km), Karlsruhe (~30km), Heilbronn (~80km).
const LOCATION_RESTRICTION = {
  circle: {
    center: { latitude: 48.8746857, longitude: 8.3247404 },
    radius: 5000,
  },
};

if (!API_KEY) {
  console.error('ERROR: GOOGLE_PLACES_API_KEY env missing.');
  process.exit(1);
}

async function findPlace() {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: SEARCH_QUERY, locationRestriction: LOCATION_RESTRICTION }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Places API error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  if (!data.places || data.places.length === 0) {
    throw new Error(`No place found for query: ${SEARCH_QUERY}`);
  }
  return data.places[0];
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(s) {
  if (!existsSync(dirname(STATE_FILE))) mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function patchAllHtml(newCount, newRatingDecimal, newRatingComma) {
  const files = readdirSync(resolve('.')).filter(f => f.endsWith('.html'));
  let patched = 0;
  for (const f of files) {
    const path = resolve(f);
    const orig = readFileSync(path, 'utf8');
    let modified = orig;

    // 1. JSON-LD reviewCount: "X" → "newCount"
    modified = modified.replace(/"reviewCount"\s*:\s*"(\d+)"/g, `"reviewCount":"${newCount}"`);

    // 2. JSON-LD ratingValue: "X.Y" → "newRatingDecimal"
    modified = modified.replace(/"ratingValue"\s*:\s*"\d\.\d"/g, `"ratingValue":"${newRatingDecimal}"`);

    // 3. Visible trust strip: "X Rezensionen" / "X Bewertungen"
    modified = modified.replace(/(\d+)\s+Rezensionen/g, `${newCount} Rezensionen`);
    modified = modified.replace(/(\d+)\s+Bewertungen/g, `${newCount} Bewertungen`);

    // 4. Visible rating in trust strip: "<b>5,0</b> Google" → "<b>newRatingComma</b> Google"
    modified = modified.replace(/(<b>)\d[,.]\d(<\/b>)\s+Google/g, `$1${newRatingComma}$2 Google`);

    if (modified !== orig) {
      writeFileSync(path, modified);
      patched++;
    }
  }
  return patched;
}

async function main() {
  const place = await findPlace();
  const newCount = place.userRatingCount || 0;
  const newRatingNumber = place.rating || 5.0;
  const newRatingDecimal = newRatingNumber.toFixed(1); // "5.0"
  const newRatingComma = newRatingDecimal.replace('.', ','); // "5,0"

  console.log(`Place: ${place.displayName?.text || '?'}`);
  console.log(`Address: ${place.formattedAddress || '?'}`);
  console.log(`Rating: ${newRatingNumber} | Reviews: ${newCount}`);

  const oldState = loadState();
  if (oldState.reviewCount === newCount && oldState.ratingDecimal === newRatingDecimal) {
    console.log('No change vs. previous state. Exit.');
    return;
  }

  // Safety: never reduce review count below known value (Google sometimes glitches)
  if (oldState.reviewCount && newCount < oldState.reviewCount) {
    console.warn(`WARN: API returned ${newCount} reviews but state has ${oldState.reviewCount}. Skipping update — manual check required.`);
    process.exit(0); // No error — just don't update
  }

  console.log(`Update: ${oldState.reviewCount || '?'} → ${newCount} reviews, ${oldState.ratingDecimal || '?'} → ${newRatingDecimal} rating`);

  const patched = patchAllHtml(newCount, newRatingDecimal, newRatingComma);
  console.log(`Patched ${patched} HTML files.`);

  saveState({
    reviewCount: newCount,
    ratingDecimal: newRatingDecimal,
    ratingComma: newRatingComma,
    placeName: place.displayName?.text,
    address: place.formattedAddress,
    placeId: place.id,
    updatedAt: new Date().toISOString(),
  });
  console.log('State saved.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
