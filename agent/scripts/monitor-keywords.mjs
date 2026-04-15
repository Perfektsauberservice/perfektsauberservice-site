/**
 * Agent 12 — Competitor Monitor
 *
 * Ruleaza in fiecare luni si verifica:
 * 1. Pozitia site-ului pe Google pentru cuvintele cheie principale
 * 2. Daca apare in Local Pack (cutia cu 3 firme pe harta)
 * 3. Cine sunt competitorii din Local Pack + recenziile lor
 *
 * Necesita: SERPER_API_KEY (gratuit la serper.dev — 2500 cautari/luna)
 *
 * Utilizare:
 *   node agent/scripts/monitor-keywords.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const STATE_PATH = join(ROOT, 'agent', 'state', 'keyword-rankings.json');

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '648944715';
const OWN_DOMAIN = 'perfektsauberservice.com';
const OWN_NAME_FRAGMENT = 'perfekt sauber';

// ─── Cuvinte cheie de urmarit ─────────────────────────────────────────────────

const KEYWORDS = [
  { query: 'Entrümpelung Rastatt',          city: 'Rastatt',      service: 'Entrümpelung' },
  { query: 'Haushaltsauflösung Rastatt',    city: 'Rastatt',      service: 'Haushaltsauflösung' },
  { query: 'Wohnungsauflösung Rastatt',     city: 'Rastatt',      service: 'Wohnungsauflösung' },
  { query: 'Entrümpelung Baden-Baden',      city: 'Baden-Baden',  service: 'Entrümpelung' },
  { query: 'Haushaltsauflösung Baden-Baden',city: 'Baden-Baden',  service: 'Haushaltsauflösung' },
  { query: 'Entrümpelung Karlsruhe',        city: 'Karlsruhe',    service: 'Entrümpelung' },
  { query: 'Haushaltsauflösung Karlsruhe',  city: 'Karlsruhe',    service: 'Haushaltsauflösung' },
  { query: 'Entrümpelung Gaggenau',         city: 'Gaggenau',     service: 'Entrümpelung' },
  { query: 'Entrümpelung Bühl',             city: 'Bühl',         service: 'Entrümpelung' },
  { query: 'Entrümpelung Ettlingen',        city: 'Ettlingen',    service: 'Entrümpelung' },
  { query: 'Kellerentrümpelung Rastatt',    city: 'Rastatt',      service: 'Kellerentrümpelung' },
  { query: 'Gewerberäumung Rastatt',        city: 'Rastatt',      service: 'Gewerberäumung' },
];

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) console.warn('Telegram warning:', await res.text());
  } catch (err) {
    console.warn('Telegram error:', err.message);
  }
}

function buildTelegramReport(weekData) {
  const { date, keywords, competitorList } = weekData;
  const ranked = keywords.filter(k => k.position);
  const inPack = keywords.filter(k => k.inLocalPack);

  let msg = `📊 <b>Raport saptamanal PSS — ${date}</b>\n\n`;

  msg += `Pozitii gasite: <b>${ranked.length}/${keywords.length}</b>\n`;
  msg += `In Local Pack: <b>${inPack.length}/${keywords.length}</b>\n\n`;

  msg += `<b>Keyword Rankings:</b>\n`;
  for (const k of keywords) {
    const pos = k.position ? `#${k.position}` : 'N/A';
    const prev = k.positionPrev;
    let trend = '';
    if (prev !== null && k.position !== null) {
      const diff = prev - k.position;
      trend = diff > 0 ? ` ↑${diff}` : diff < 0 ? ` ↓${Math.abs(diff)}` : ' =';
    }
    const pack = k.inLocalPack ? ' ✅' : '';
    msg += `  ${pos}${trend} — ${k.query}${pack}\n`;
  }

  if (competitorList && competitorList.length > 0) {
    msg += `\n<b>Top Competitori (Local Pack):</b>\n`;
    for (const c of competitorList.slice(0, 5)) {
      const rating = c.rating !== null ? `★${c.rating}` : '';
      const reviews = c.reviews !== null ? `${c.reviews} rec.` : '';
      const newRev = c.reviewsPrev !== null && c.reviews !== null && c.reviews !== c.reviewsPrev
        ? ` (+${c.reviews - c.reviewsPrev} nou)` : '';
      msg += `  <b>${c.name}</b> — ${rating} ${reviews}${newRev} (${c.appearsFor.length} cautari)\n`;
    }
  }

  return msg;
}

// ─── Serper API ───────────────────────────────────────────────────────────────

async function serperCall(query, type = 'search') {
  const res = await fetch(`https://google.serper.dev/${type}`, {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, gl: 'de', hl: 'de', num: 10 }),
  });
  if (!res.ok) throw new Error(`Serper ${type} error ${res.status}: ${await res.text()}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Analiza rezultate ────────────────────────────────────────────────────────

function findOwnPosition(organic = []) {
  for (let i = 0; i < organic.length; i++) {
    const link = (organic[i].link || '').toLowerCase();
    if (link.includes(OWN_DOMAIN)) return i + 1;
  }
  return null;
}

function isOwnBusiness(place) {
  const website = (place.website || '').toLowerCase();
  const title = (place.title || '').toLowerCase();
  return website.includes(OWN_DOMAIN) || title.includes(OWN_NAME_FRAGMENT);
}

function findInLocalPack(places = []) {
  return places.some(p => isOwnBusiness(p));
}

function extractCompetitors(places = []) {
  return places
    .filter(p => !isOwnBusiness(p))
    .slice(0, 3)
    .map(p => ({
      name: p.title || '',
      rating: p.rating ?? null,
      reviews: p.ratingCount ?? p.reviewsCount ?? null,
      address: p.address || '',
      website: p.website || '',
    }));
}

function getTopOrganic(organic = []) {
  return organic
    .filter(r => {
      const link = (r.link || '').toLowerCase();
      return !link.includes(OWN_DOMAIN);
    })
    .slice(0, 3)
    .map(r => ({
      title: r.title || '',
      link: r.link || '',
      snippet: r.snippet || '',
    }));
}

// ─── State helpers ────────────────────────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_PATH)) return { weeks: [] };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { weeks: [] };
  }
}

function saveState(state) {
  const dir = join(ROOT, 'agent', 'state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function getPrevData(state, query) {
  if (state.weeks.length === 0) return null;
  const last = state.weeks[state.weeks.length - 1];
  return (last.keywords || []).find(k => k.query === query) || null;
}

function getPrevCompetitor(state, name) {
  if (state.weeks.length < 2) return null;
  const prev = state.weeks[state.weeks.length - 2];
  return (prev.competitorList || []).find(c => c.name === name) || null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊  PSS Competitor Monitor — start\n');

  if (!SERPER_API_KEY) {
    console.error('❌  SERPER_API_KEY lipseste. Adauga-l in Netlify/GitHub Secrets.');
    process.exit(1);
  }

  const state = loadState();
  const today = new Date().toISOString().split('T')[0];

  const weekData = {
    date: today,
    keywords: [],
    competitorMap: {},
  };

  // ── Verifica fiecare keyword ──────────────────────────────────────────────
  for (const kw of KEYWORDS) {
    process.stdout.write(`  🔍  ${kw.query} ... `);

    try {
      const [organicData, placesData] = await Promise.all([
        serperCall(kw.query, 'search'),
        serperCall(kw.query, 'places'),
      ]);

      const organic = organicData.organic || [];
      const places = placesData.places || [];

      const position = findOwnPosition(organic);
      const inLocalPack = findInLocalPack(places);
      const competitors = extractCompetitors(places);
      const topOrganic = getTopOrganic(organic);
      const prev = getPrevData(state, kw.query);

      weekData.keywords.push({
        query: kw.query,
        city: kw.city,
        service: kw.service,
        position,
        positionPrev: prev?.position ?? null,
        inLocalPack,
        inLocalPackPrev: prev?.inLocalPack ?? null,
        competitors,
        topOrganic,
      });

      // Acumuleaza competitori globali
      for (const c of competitors) {
        if (!c.name) continue;
        if (!weekData.competitorMap[c.name]) {
          weekData.competitorMap[c.name] = {
            name: c.name,
            rating: c.rating,
            reviews: c.reviews,
            address: c.address,
            website: c.website,
            appearsFor: [],
          };
        }
        weekData.competitorMap[c.name].appearsFor.push(kw.query);
        if (c.reviews !== null) weekData.competitorMap[c.name].reviews = c.reviews;
        if (c.rating !== null) weekData.competitorMap[c.name].rating = c.rating;
      }

      const pos = position ? `#${position}` : 'top10';
      const pack = inLocalPack ? '✅ pack' : '—';
      console.log(`${pos} | ${pack}`);

      await sleep(400);
    } catch (err) {
      console.log(`❌ ${err.message}`);
      weekData.keywords.push({
        query: kw.query,
        city: kw.city,
        service: kw.service,
        position: null,
        positionPrev: null,
        inLocalPack: false,
        inLocalPackPrev: null,
        competitors: [],
        topOrganic: [],
        error: err.message,
      });
    }
  }

  // Transforma competitorMap in array
  weekData.competitorList = Object.values(weekData.competitorMap).sort(
    (a, b) => b.appearsFor.length - a.appearsFor.length
  );
  delete weekData.competitorMap;

  // Adauga trend recenzii vs saptamana trecuta
  for (const c of weekData.competitorList) {
    const prev = getPrevCompetitor(state, c.name);
    c.reviewsPrev = prev?.reviews ?? null;
    c.ratingPrev = prev?.rating ?? null;
  }

  state.weeks.push(weekData);
  if (state.weeks.length > 12) state.weeks = state.weeks.slice(-12);
  saveState(state);

  // ── Sumar ─────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════');
  console.log('  SUMAR SAPTAMANA', today);
  console.log('══════════════════════════════════');

  const ranked = weekData.keywords.filter(k => k.position);
  const inPack = weekData.keywords.filter(k => k.inLocalPack);
  console.log(`Pozitii gasite: ${ranked.length}/${weekData.keywords.length}`);
  console.log(`In Local Pack:  ${inPack.length}/${weekData.keywords.length}`);

  console.log('\nKeyword Rankings:');
  for (const k of weekData.keywords) {
    const pos = k.position ? `#${k.position}` : 'N/A ';
    const prev = k.positionPrev;
    let trend = '';
    if (prev !== null && k.position !== null) {
      const diff = prev - k.position;
      trend = diff > 0 ? ` ↑${diff}` : diff < 0 ? ` ↓${Math.abs(diff)}` : ' =';
    }
    const pack = k.inLocalPack ? ' [Local Pack ✅]' : '';
    console.log(`  ${pos}${trend.padEnd(4)} ${k.query}${pack}`);
  }

  if (weekData.competitorList.length > 0) {
    console.log('\nTop Competitori:');
    for (const c of weekData.competitorList.slice(0, 5)) {
      const reviews = c.reviews !== null ? `${c.reviews} recenzii` : '';
      const rating = c.rating !== null ? `★${c.rating}` : '';
      const newReviews = c.reviewsPrev !== null && c.reviews !== null
        ? ` (+${c.reviews - c.reviewsPrev} nou)` : '';
      console.log(`  ${c.name} — ${rating} ${reviews}${newReviews} (apare in ${c.appearsFor.length} cautari)`);
    }
  }

  console.log('\n✅  Salvat in agent/state/keyword-rankings.json');

  // ── Trimite raport pe Telegram ────────────────────────────────────────────
  const telegramMsg = buildTelegramReport(weekData);
  await sendTelegram(telegramMsg);
  if (TELEGRAM_BOT_TOKEN) console.log('✅  Raport trimis pe Telegram.');
}

main().catch(err => {
  console.error('\n❌  Eroare fatala:', err.message);
  process.exit(1);
});
