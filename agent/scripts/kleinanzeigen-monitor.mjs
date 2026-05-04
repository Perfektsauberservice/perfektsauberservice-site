import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '648944715';
const SEEN_FILE = resolve('agent/config/kleinanzeigen-seen.json');

// PLZ-uri considerate "in zona Rastatt 50km" (76xxx + 77xxx + 75xxx margine)
const PLZ_RE = /^(75|76|77)\d{3}$/;

// Servicii de monitorizat — (cuvant cheie URL) + (token normalizat pentru match) + label
// Toata nisa: Entrumpelung/Auflosung/Raumung + Reinigung (broad+specific) + Hausmeister.
// Match-ul foloseste 'normalize()' (lowercase + ä/ö/ü/ae/oe/ue/ß -> a/o/u/ss).
const SEARCHES = [
  // Entrümpelung / Auflösung / Räumung
  { url: 'entruempelung',          match: 'entrumpelung',          service: 'Entrümpelung' },
  { url: 'haushaltsaufloesung',    match: 'haushaltsauflosung',    service: 'Haushaltsauflösung' },
  { url: 'wohnungsaufloesung',     match: 'wohnungsauflosung',     service: 'Wohnungsauflösung' },
  { url: 'kellerentruempelung',    match: 'kellerentrumpelung',    service: 'Kellerentrümpelung' },
  { url: 'dachbodenentruempelung', match: 'dachbodenentrumpelung', service: 'Dachbodenentrümpelung' },
  { url: 'garagenentruempelung',   match: 'garagenentrumpelung',   service: 'Garagenentrümpelung' },
  { url: 'gewerberaeumung',        match: 'gewerberaumung',        service: 'Gewerberäumung' },
  { url: 'raeumung',               match: 'raumung',               service: 'Räumung' },
  { url: 'nachlassaufloesung',     match: 'nachlassauflosung',     service: 'Nachlassauflösung' },
  { url: 'bueroaufloesung',        match: 'buroauflosung',         service: 'Büroauflösung' },
  { url: 'messie',                 match: 'messie',                service: 'Messie-Wohnung' },

  // Reinigung — broad + variante specifice frecvente in Kleinanzeigen "Gesuche"
  { url: 'reinigung',              match: 'reinigung',             service: 'Reinigung' },
  { url: 'putzhilfe',              match: 'putzhilfe',             service: 'Putzhilfe / Reinigung' },
  { url: 'putzfrau',               match: 'putzfrau',              service: 'Putzhilfe / Reinigung' },
  { url: 'haushaltshilfe',         match: 'haushaltshilfe',        service: 'Haushaltshilfe / Reinigung' },
  { url: 'endreinigung',           match: 'endreinigung',          service: 'Endreinigung' },
  { url: 'gebaeudereinigung',      match: 'gebaudereinigung',      service: 'Gebäudereinigung' },

  // Hausmeisterservice
  { url: 'hausmeister',            match: 'hausmeister',           service: 'Hausmeisterservice' },
];

// === FILTRE LEAD-URI (exclude job postings + concurenti) ===

// Nivel 1: categorii Kleinanzeigen Stellenangebote (job postings).
// URL anunt: /s-anzeige/title/3394078820-109-8750 — 109/107/110 = Job. Exclude.
const JOB_CATEGORY_RE = /-(?:107|109|110)-\d+/;

// Nivel 2: cuvinte-cheie care indica job posting in titlu (substring post-normalize).
const JOB_KEYWORDS = [
  '(m/w/d)', 'minijob', 'vollzeit', 'teilzeit', 'voll-/teilzeit',
  'stellenangebot', 'stellenausschreibung', 'bewerbung', 'bewerben',
  'mitarbeiter', 'niederlassung', 'gehalt', 'lohn', 'anstellung',
  'sucht tatigkeit', 'sucht stelle', // persoana cauta JOB (post normalize: ä→a)
];

// Nivel 3: cuvinte-cheie care indica concurent (companie SAU persoana ofera servicii).
// Note: post-normalize, deci toate fara ä/ö/ü/ß.
const COMPETITOR_KEYWORDS = [
  // Plural (companie)
  'wir bieten', 'wir ubernehmen',
  'unser service', 'wir packen an',
  'unsere dienste', 'unsere dienstleistungen',
  'bieten ihnen', 'bieten wir',
  'festpreis', 'kostenloses angebot',
  'service gmbh', 'service ug', 'unser team',
  // Singular (persoana individuala care se ofera ca cleaner/Hausmeister)
  'ich biete', 'biete ich', 'biete an', 'biete ihnen',
  'ich heisse', 'mein name ist',
  'umgebung an', 'und umgebung an',
  // Forme legale companie
  ' gmbh', ' ug ', ' ug,', ' ug.', ' e.k.', ' e.k ',
  // Phrase-uri "company/cleaner-to-customer" (sales tone).
  'ihr zuverlassiger', 'ihr ansprechpartner', 'ansprechpartner fur',
  'wir helfen ihnen', 'wir sind ein', 'wir sind eine', 'sie brauchen',
  'kontaktieren sie uns', 'rufen sie uns', 'rufen sie mich',
  'ihrer wohnung', 'ihrer praxis', 'ihrer arzt', 'ihrer firma',
  'team der ', 'team von ', 'das gesamte team',
  // Titluri tipice de oferta (NU cerere)
  'professionelle reinigung', 'professionelle entrumpelung',
];

// Nivel 4: pattern-uri in TITLU care indica oferta (cleaner se ofera, NU client cere).
// Aplicat post-normalize. Exemple: "Reinigungskraft in Bruchsal", "Putzfrau bietet sich an".
const TITLE_OFFER_RE = /^(reinigungskraft|putzfrau|putzhilfe|haushaltshilfe|hausmeister)\s+(in|fur|bietet|sucht|aus)\s/;

function classifyAd(item) {
  // Nivel 1 — categoria URL = job posting
  if (JOB_CATEGORY_RE.test(item.link)) {
    return { skip: true, reason: 'job_url' };
  }
  // Nivel 2 — titlu cu pattern de job posting
  const titleNorm = normalize(item.title);
  for (const kw of JOB_KEYWORDS) {
    if (titleNorm.includes(kw)) {
      return { skip: true, reason: 'job_kw' };
    }
  }
  // Nivel 3 — titlu/descriere cu pattern concurent (companie/persoana ofera)
  const hayNorm = normalize(`${item.title} ${item.description}`);
  for (const kw of COMPETITOR_KEYWORDS) {
    if (hayNorm.includes(kw)) {
      return { skip: true, reason: 'concurent' };
    }
  }
  // Nivel 4 — titlu cu pattern tipic de oferta (Reinigungskraft in X, Putzfrau bietet, etc.)
  if (TITLE_OFFER_RE.test(titleNorm)) {
    return { skip: true, reason: 'concurent' };
  }
  return { skip: false };
}

function getSearchUrl(keyword) {
  // l8193 = location ID Kleinanzeigen pentru Rastatt; r50 = raza 50km.
  // Fara location ID anuntele se intorc din toata Germania (filtrul "rastatt" in URL e ignorat).
  return `https://www.kleinanzeigen.de/s-rastatt/anzeige:gesuch/${keyword}/k0l8193r50`;
}

// Normalizeaza pentru matching: lowercase + umlaut/ß -> ae/oe/ue/ss
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .replace(/ß/g, 'ss');
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extract(re, text) {
  const m = re.exec(text);
  return m ? m[1].trim() : '';
}

function parseListItems(html) {
  // Fiecare anunt e un <li class="ad-listitem ..."> care contine <article class="aditem" data-adid="..." data-href="...">
  const items = [];
  const liRe = /<li class="ad-listitem([^"]*)"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const liClasses = m[1];
    const liInner = m[2];

    const isTopAd = /\bis-topad\b/.test(liClasses);
    if (isTopAd) continue;

    const adidM = /<article[^>]*data-adid="(\d+)"[^>]*data-href="([^"]+)"/.exec(liInner);
    if (!adidM) continue;
    const id = adidM[1];
    const href = adidM[2];

    const locRaw = extract(/aditem-main--top--left">([\s\S]*?)<\/div>/, liInner);
    const locText = stripTags(locRaw);
    const plzM = /\b(\d{5})\b/.exec(locText);
    const plz = plzM ? plzM[1] : '';

    const titleRaw = extract(/<h2 class="text-module-begin">([\s\S]*?)<\/h2>/, liInner);
    const title = stripTags(titleRaw);

    const descRaw = extract(/aditem-main--middle--description">([\s\S]*?)<\/p>/, liInner);
    const description = stripTags(descRaw);

    const dateRaw = extract(/aditem-main--top--right">([\s\S]*?)<\/div>/, liInner);
    const dateText = stripTags(dateRaw);

    items.push({
      id,
      link: `https://www.kleinanzeigen.de${href}`,
      title,
      description,
      location: locText,
      plz,
      dateText
    });
  }
  return items;
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN) return false;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  const data = await res.json();
  if (!data.ok) console.error('Telegram error:', JSON.stringify(data));
  return data.ok;
}

function buildMessage(item, service) {
  const desc = item.description.slice(0, 240);
  const template =
`Guten Tag,

wir haben Ihre Anzeige gesehen und würden Ihnen gerne ein kostenloses Angebot unterbreiten. Wir sind ein lokales Unternehmen aus der Region und übernehmen Aufträge im Bereich ${service} schnell, zuverlässig und zu fairen Preisen.

Wann wäre ein kurzes Telefonat möglich?

Mit freundlichen Grüßen,
Laura – Perfekt Sauber Service
📞 +49 163 9087197
🌐 www.perfektsauberservice.com`;

  return [
    `🔔 <b>NOU lead Kleinanzeigen!</b>`,
    ``,
    `📋 <b>${item.title}</b>`,
    item.location ? `📍 ${item.location}` : '',
    item.dateText ? `🕒 ${item.dateText}` : '',
    desc ? `💬 ${desc}` : '',
    ``,
    `✍️ <b>Copiaza mesajul de mai jos si trimite-l:</b>`,
    `<code>${template}</code>`,
    ``,
    `🔗 <a href="${item.link}">Deschide anuntul pe Kleinanzeigen</a>`
  ].filter(l => l !== '').join('\n');
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN lipsa!');
    process.exit(1);
  }

  let state = {};
  if (existsSync(SEEN_FILE)) {
    try { state = JSON.parse(readFileSync(SEEN_FILE, 'utf8')); } catch {}
  }
  if (!state._meta) state._meta = {};

  let newCount = 0;
  let totalScanned = 0;
  let totalRelevant = 0;
  const errors = [];
  const filteredCounts = { job_url: 0, job_kw: 0, concurent: 0 };

  for (const search of SEARCHES) {
    const url = getSearchUrl(search.url);
    console.log(`Verific: ${url}`);

    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      const msg = `${search.url}: ${err.message}`;
      console.error(`  Eroare: ${msg}`);
      errors.push(msg);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const items = parseListItems(html);
    totalScanned += items.length;

    const matchToken = normalize(search.match);
    const relevant = items.filter(it => {
      if (!PLZ_RE.test(it.plz)) return false;
      const hay = normalize(`${it.title} ${it.description}`);
      if (!hay.includes(matchToken)) return false;

      // Nivel 1+2+3: exclude job postings si concurenti.
      const cls = classifyAd(it);
      if (cls.skip) {
        filteredCounts[cls.reason]++;
        return false;
      }
      return true;
    });
    totalRelevant += relevant.length;

    console.log(`  ${items.length} anunturi pe pagina, ${relevant.length} relevante (PLZ + keyword)`);

    for (const item of relevant) {
      if (state[item.id]) {
        console.log(`  VAZUT: ${item.title}`);
        continue;
      }

      state[item.id] = {
        seenAt: new Date().toISOString(),
        keyword: search.url,
        title: item.title,
        plz: item.plz
      };
      const ok = await sendTelegram(buildMessage(item, search.service));
      if (ok) {
        newCount++;
        console.log(`  NOU trimis: ${item.title} (${item.plz})`);
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    // Pauza scurta intre keyword-uri ca sa nu fim agresivi
    await new Promise(r => setTimeout(r, 1200));
  }

  // Curata intrari mai vechi de 30 zile
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const id of Object.keys(state)) {
    if (id === '_meta') continue;
    if (state[id].seenAt && state[id].seenAt < cutoff) delete state[id];
  }

  writeFileSync(SEEN_FILE, JSON.stringify(state, null, 2));
  const totalFiltered = filteredCounts.job_url + filteredCounts.job_kw + filteredCounts.concurent;
  console.log(`\nFinalizat. Scanat ${totalScanned} anunturi, ${totalRelevant} relevante, ${newCount} lead-uri noi trimise.`);
  console.log(`Filtrate ca irelevante: ${totalFiltered} (job_url=${filteredCounts.job_url}, job_kw=${filteredCounts.job_kw}, concurent=${filteredCounts.concurent}). ${errors.length} erori.`);

  // Erori -> raporteaza pe Telegram (oricand apar)
  if (errors.length > 0) {
    const lastErr = state._meta.lastErrorAt || '';
    const now = new Date().toISOString();
    // Anti-spam: max o data la 6h
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    if (lastErr < sixHoursAgo) {
      const ok = await sendTelegram(
        `⚠️ <b>Kleinanzeigen monitor — erori</b>\n\n${errors.map(e => `• ${e}`).join('\n')}\n\nDaca toate erorile sunt HTTP 500/403, posibil layout schimbat sau IP blocat.`
      );
      if (ok) {
        state._meta.lastErrorAt = now;
        writeFileSync(SEEN_FILE, JSON.stringify(state, null, 2));
      }
    }
  }

  // Heartbeat — la fiecare rulare daca nu sunt leaduri / erori (confirma ca botul e activ)
  if (newCount === 0 && errors.length === 0) {
    const now = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Berlin' });
    const filterLine = totalFiltered > 0
      ? `\n🔍 Filtrate ca irelevante: ${totalFiltered} (job_url=${filteredCounts.job_url}, job_kw=${filteredCounts.job_kw}, concurent=${filteredCounts.concurent})`
      : '';
    await sendTelegram(
      `✅ Kleinanzeigen verificat la ${now}\n\nNiciun anunt nou gasit in zona Rastatt 50km.\nScanat ${totalScanned} anunturi pe ${SEARCHES.length} cuvinte cheie.${filterLine}\nBotul ruleaza din 30 in 30 minute.`
    );
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
