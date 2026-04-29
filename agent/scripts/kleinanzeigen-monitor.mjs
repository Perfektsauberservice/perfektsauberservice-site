import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '648944715';
const SEEN_FILE = resolve('agent/config/kleinanzeigen-seen.json');

// PLZ-uri considerate "in zona Rastatt 50km" (76xxx + 77xxx + 75xxx margine)
const PLZ_RE = /^(75|76|77)\d{3}$/;

// Servicii de monitorizat — (cuvant cheie URL) + (cum e scris cu umlaut) + label
const SEARCHES = [
  { url: 'entruempelung',          match: 'entrumpelung',          service: 'Entrümpelung' },
  { url: 'haushaltsaufloesung',    match: 'haushaltsauflosung',    service: 'Haushaltsauflösung' },
  { url: 'wohnungsaufloesung',     match: 'wohnungsauflosung',     service: 'Wohnungsauflösung' },
  { url: 'kellerentruempelung',    match: 'kellerentrumpelung',    service: 'Kellerentrümpelung' },
  { url: 'dachbodenentruempelung', match: 'dachbodenentrumpelung', service: 'Dachbodenentrümpelung' },
  { url: 'gewerberaeumung',        match: 'gewerberaumung',        service: 'Gewerberäumung' },
  { url: 'wohnungsreinigung',      match: 'wohnungsreinigung',     service: 'Wohnungsreinigung' },
  { url: 'umzugsreinigung',        match: 'umzugsreinigung',       service: 'Umzugsreinigung' },
  { url: 'raeumung',               match: 'raumung',               service: 'Räumung' },
  { url: 'nachlassaufloesung',     match: 'nachlassauflosung',     service: 'Nachlassauflösung' },
  { url: 'bueroaufloesung',        match: 'buroauflosung',         service: 'Büroauflösung' },
  { url: 'messi',                  match: 'messi',                 service: 'Messi-Wohnung' },
];

function getSearchUrl(keyword) {
  // s-anzeige:gesuch = doar anunturi "Suche" (oameni care cauta servicii)
  return `https://www.kleinanzeigen.de/s-anzeige:gesuch/${keyword}/rastatt/r50/k0`;
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

wir haben Ihre Anzeige gesehen und würden Ihnen gerne ein kostenloses Angebot unterbreiten. Wir sind ein lokales Unternehmen aus der Region und führen ${service}en schnell, zuverlässig und zu fairen Preisen durch.

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
      return hay.includes(matchToken);
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
  console.log(`\nFinalizat. Scanat ${totalScanned} anunturi, ${totalRelevant} relevante, ${newCount} lead-uri noi trimise. ${errors.length} erori.`);

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

  // Heartbeat — doar daca >12h de la ultima confirmare (anti-spam la rulari frecvente)
  if (newCount === 0 && errors.length === 0) {
    const last = state._meta.lastHeartbeatAt || '';
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    if (last < twelveHoursAgo) {
      const now = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Berlin' });
      const ok = await sendTelegram(
        `✅ Kleinanzeigen monitor activ (${now})\n\nNiciun lead nou in ultimele ~12h pentru zona Rastatt 50km. Scanat ${totalScanned} anunturi, ${totalRelevant} relevante (deja vazute).`
      );
      if (ok) {
        state._meta.lastHeartbeatAt = new Date().toISOString();
        writeFileSync(SEEN_FILE, JSON.stringify(state, null, 2));
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
