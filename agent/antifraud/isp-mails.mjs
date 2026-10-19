// One abuse mail per network operator, covering all of its IP addresses seen in the attack
// (attacker dossier + PSS captures). Each mail opens in Laura's own mail app (one tap on Telegram).
//   node agent/antifraud/isp-mails.mjs [--send]
import { readFileSync, existsSync } from 'node:fs';
import { openStore, DATA_DIR } from './runner.mjs';
import { registryLookup } from './abuse-reporter.mjs';
import { dec } from '../../netlify/antifraud/pipeline.mjs';

const fmt = t => new Date(t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour12: false }) + ' (Europe/Berlin)';

/** All attack-related IPs with the best timestamp we have for each, and where it comes from. */
export async function attackIps(store, { ipEvidencePath, extra = [] } = {}) {
  const rows = new Map();
  const add = (ip, t, source) => { const r = rows.get(ip) || { ip, seen: [] }; r.seen.push({ t, source }); rows.set(ip, r); };
  if (ipEvidencePath && existsSync(ipEvidencePath)) {
    for (const line of readFileSync(ipEvidencePath, 'utf8').replace(/^\ufeff/, '').trim().split('\n').slice(1)) {
      const [ip, first, source] = line.split(';');
      add(ip, Date.parse(first.length === 10 ? first + 'T12:00:00+02:00' : first.replace(' ', 'T') + ':00+02:00'), source.replace(/"/g, ''));
    }
  }
  const de = src => /click-protection tool/.test(src) ? 'von einem Klickschutz-Dienst gesperrt (Zeitpunkt laut Google-Ads-Änderungsverlauf)'
    : /ClickCease dashboard/.test(src) ? 'vom Klickschutz-Dienst als auffällig gemeldet' : src;
  for (const r of rows.values()) r.seen = r.seen.map(x => ({ ...x, source: de(x.source) }));
  const extraByIp = new Map(extra.map(x => [x.ip, x]));
  // exact visits recorded by PSS Anti-Fraud for these IPs (time to the second, Google click id)
  for (const b of (await store.list({ prefix: 'ev/' })).blobs) {
    const [ts, ipK] = b.key.split('/')[2].split('_');
    const ip = dec(ipK);
    if (!rows.has(ip)) continue;
    const ev = await store.get(b.key, { type: 'json' }).catch(() => null);
    add(ip, Number(ts), `Anzeigenklick erfasst (GCLID ${String(ev?.cid || '').slice(0, 24)}…, Seite ${ev?.path || ''})${extraByIp.get(ip)?.note ? ' — ' + extraByIp.get(ip).note : ''}`);
    extraByIp.get(ip) && (extraByIp.get(ip).used = true);
  }
  // extra observations only when no exact capture exists for that IP
  for (const x of extra) if (!x.used) add(x.ip, x.t, x.source);
  return [...rows.values()];
}

export async function groupByOperator(ips, lookup = registryLookup) {
  const groups = {};
  for (const r of ips) {
    const reg = await lookup(r.ip).catch(() => ({}));
    const abuse = (reg.abuseContacts || [])[0] || 'unbekannt';
    const g = groups[abuse] ||= { abuse, network: reg.network?.name || '', ranges: new Set(), ips: [] };
    if (reg.network?.cidr) g.ranges.add(reg.network.cidr);
    g.ips.push(r);
  }
  return Object.values(groups);
}

export function operatorMail(g, waves) {
  const list = g.ips.flatMap(r => r.seen.sort((a, b) => a.t - b.t).map(s => `- ${r.ip} — ${fmt(s.t)} — ${s.source}`)).join('\n');
  const waveText = waves.map(w => `- ${w.date.split('-').reverse().join('.')} ${w.hour}:00 Uhr: ${w.clicks} bezahlte Klicks (${w.places}, ${w.keywords.split(',')[0]})`).join('\n');
  const subject = `Missbrauchsmeldung – wiederholte Werbeklicks aus Ihrem Netz (${g.ips.length} IP-Adressen)`;
  const body = `Sehr geehrte Damen und Herren,

wir betreiben die Website perfektsauberservice.com (Perfekt Sauber Service, Inh. Laura Craciun, Reutstraße 9, 76597 Loffenau) und schalten Google-Ads-Anzeigen. Seit Ende September 2026 werden unsere Anzeigen wiederholt in kurzen Wellen angeklickt, ohne dass eine Kontaktaufnahme erfolgt. Folgende IP-Adressen aus Ihrem Netz (${g.network}${g.ranges.size ? ', ' + [...g.ranges].join(', ') : ''}) wurden dabei von Klickschutz-Systemen erfasst bzw. gesperrt (eine Zuordnung einzelner Adressen zu einzelnen Klickwellen ist nicht belegt):

${list}

Zum Zusammenhang – Klickwellen auf unsere Anzeigen (Quelle: Google Ads, Konto 984-766-7839):
${waveText}

Uns ist bewusst, dass ein Anschlussinhaber nicht zwingend die handelnde Person ist und dass Adressen (insbesondere im Mobilfunk) geteilt oder neu vergeben werden. Wir bitten Sie, die genannten Zeitpunkte im Rahmen Ihrer Abuse-Richtlinien zu prüfen und den Anschlussinhaber ggf. auf die missbräuchliche Nutzung hinzuweisen. Weitere Nachweise (Zeitstempel je Klick, Google-Klick-IDs, SHA-256-gesicherte Originaldatensätze) stellen wir gern zur Verfügung.

Mit freundlichen Grüßen
Laura Craciun
Perfekt Sauber Service
kontakt@perfektsauberservice.com
`;
  return { to: g.abuse, subject, body };
}

async function main() {
  const store = openStore('prod');
  const dir = [`${DATA_DIR}/attacker-dossier-2026-10-15`].find(existsSync);
  const ips = await attackIps(store, { ipEvidencePath: `${dir}/ip-evidence.csv`,
    extra: [{ ip: '94.134.182.69', t: Date.parse('2026-10-19T09:10:08+02:00'), source: 'Anzeigenklick, Seite nach 0,4 s verlassen und neu geladen', note: 'Seite nach 0,4 s verlassen' }] });
  const groups = (await groupByOperator(ips)).filter(g => g.abuse !== 'unbekannt');
  const waves = readFileSync(`${dir}/waves.csv`, 'utf8').replace(/^\ufeff/, '').trim().split('\n').slice(1).map(l => {
    const [d, h, clicks, , , places, kw] = l.split(';'); return { date: d.split('.').reverse().join('-'), hour: parseInt(h), clicks, places, keywords: kw.replace(/"/g, '') };
  });
  const mails = groups.map(g => ({ g, ...operatorMail(g, waves) }));
  for (const m of mails) console.log(`== ${m.to} (${m.g.network}): ${m.g.ips.map(r => r.ip).join(', ')}`);
  if (!process.argv.includes('--send')) { console.log('\n' + mails[0].subject + '\n\n' + mails[0].body); return; }
  const { loadEnv } = await import('./ads-exclusions.mjs');
  const tg = loadEnv('C:/tmp/pss-ads-agents/.env'); process.env.TELEGRAM_BOT_TOKEN = tg.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_CHAT_ID = tg.TELEGRAM_CHAT_ID;
  const { notifier } = await import('../../netlify/antifraud/server.mjs');
  const { send } = notifier({ deploy: { context: 'production' } });   // Laura only
  const buttons = [];
  for (const m of mails) {
    const token = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
    await store.setJSON(`mail/${token}`, { t: Date.now(), ip: m.g.ips.map(r => r.ip).join(', '), to: m.to, subject: m.subject, body: m.body });
    buttons.push({ text: `📧 ${m.g.network || m.to} (${m.g.ips.length} IP)`, url: `https://perfektsauberservice.com/af-mail/${token}` });
  }
  for (const b of buttons) await send(`📧 Mail de abuz — ${b.text.replace('📧 ', '')}\nApasă: se deschide aplicația ta de mail cu toate IP-urile acestui operator, orele și valurile de clicuri. Tu apeși Trimite.`, [b]);
  console.log('sent', buttons.length, 'buttons');
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('isp-mails.mjs')) main();
