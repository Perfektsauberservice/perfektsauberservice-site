import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '648944715';
const SEEN_FILE = resolve('agent/config/kleinanzeigen-seen.json');

// Servicii de monitorizat pe Kleinanzeigen (50km in jurul Rastatt)
const SEARCHES = [
  { keyword: 'entruempelung',          service: 'Entrümpelung' },
  { keyword: 'haushaltsaufloesung',    service: 'Haushaltsauflösung' },
  { keyword: 'wohnungsaufloesung',     service: 'Wohnungsauflösung' },
  { keyword: 'kellerentruempelung',    service: 'Kellerentrümpelung' },
  { keyword: 'dachbodenentruempelung', service: 'Dachbodenentrümpelung' },
  { keyword: 'gewerberaeumung',        service: 'Gewerberäumung' },
  { keyword: 'wohnungsreinigung',      service: 'Wohnungsreinigung' },
  { keyword: 'umzugsreinigung',        service: 'Umzugsreinigung' },
];

function getRssUrl(keyword) {
  // s-anzeige:gesuch = doar anunturi "Suche" (oameni care cauta servicii)
  return `https://www.kleinanzeigen.de/s-anzeige:gesuch/${keyword}/rastatt/r50/k0.rss`;
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const link  = extractTag(itemXml, 'link');
    const desc  = extractTag(itemXml, 'description');
    const pub   = extractTag(itemXml, 'pubDate');
    const id    = link.split('/').filter(Boolean).pop() || link;
    if (title && link) items.push({ title, link, description: desc, pubDate: pub, id });
  }
  return items;
}

function extractTag(xml, tag) {
  const cdata = new RegExp(`<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(xml);
  if (cdata) return cdata[1].trim();
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return plain ? plain[1].trim() : '';
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
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
      disable_web_page_preview: true
    })
  });
  const data = await res.json();
  if (!data.ok) console.error('Telegram error:', JSON.stringify(data));
  return data.ok;
}

function buildMessage(item, service) {
  const desc = stripHtml(item.description).slice(0, 200);
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
    desc ? `💬 ${desc}` : '',
    ``,
    `✍️ <b>Copiaza mesajul de mai jos si trimite-l:</b>`,
    `<code>${template}</code>`,
    ``,
    `🔗 <a href="${item.link}">Deschide anuntul pe Kleinanzeigen</a>`
  ].filter(l => l !== null).join('\n');
}

async function main() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN lipsa!');
    process.exit(1);
  }

  // Incarca ID-urile vazute
  let seen = {};
  if (existsSync(SEEN_FILE)) {
    try { seen = JSON.parse(readFileSync(SEEN_FILE, 'utf8')); } catch {}
  }

  let newCount = 0;

  for (const search of SEARCHES) {
    const url = getRssUrl(search.keyword);
    console.log(`Verific: ${url}`);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15000)
      });

      if (!res.ok) {
        console.log(`  HTTP ${res.status} — skip`);
        continue;
      }

      const xml = await res.text();
      const items = parseRssItems(xml);
      console.log(`  Gasit ${items.length} anunturi pentru "${search.keyword}"`);

      for (const item of items) {
        if (seen[item.id]) {
          console.log(`  VAZUT: ${item.title}`);
          continue;
        }

        seen[item.id] = { seenAt: new Date().toISOString(), keyword: search.keyword };
        const msg = buildMessage(item, search.service);
        const ok = await sendTelegram(msg);
        if (ok) {
          newCount++;
          console.log(`  NOU trimis: ${item.title}`);
        }

        // Pauza intre mesaje sa nu supraincarcam Telegram
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (err) {
      console.error(`  Eroare pentru "${search.keyword}": ${err.message}`);
    }
  }

  // Sterge intrari mai vechi de 30 zile
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const id of Object.keys(seen)) {
    if (seen[id].seenAt < cutoff) delete seen[id];
  }

  writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
  console.log(`\nFinalizat. ${newCount} lead-uri noi trimise pe Telegram.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
