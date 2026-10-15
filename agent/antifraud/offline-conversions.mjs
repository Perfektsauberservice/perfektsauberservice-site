// PSS Anti-Fraud — real customers back to Google Ads (offline conversion import file).
// Google's bidding then learns which clicks became real customers and buys fewer clicks like
// the fraudulent ones. This module ONLY builds the file; it does not create or change conversion
// actions in Google Ads (Laura's rule: no conversion changes by the system).
//   node agent/antifraud/offline-conversions.mjs [--days 30]
// Import (once per file): Google Ads -> Ziele -> Conversions -> Uploads -> "+" -> Datei hochladen.
// The conversion action names below must exist first (type "Import / Clicks"), created by Laura or the agency.
import { writeFileSync, mkdirSync } from 'node:fs';

export const CONVERSION_NAMES = {
  form: 'PSS Anfrage Formular (echt)',          // form sent from an ad click (strongest signal)
  contact: 'PSS Kontakt Klick (Telefon/WhatsApp)',
};

const gTime = t => {   // Google format "yyyy-MM-dd HH:mm:ss" in Europe/Berlin
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
};

export async function offlineConversionsCsv({ store, days = 7, now = Date.now() }) {
  const rows = []; const seen = new Set();
  for (const b of (await store.list({ prefix: 'lead/' })).blobs) {
    const l = await store.get(b.key, { type: 'json' }).catch(() => null);
    if (!l?.gclid || now - l.t > days * 864e5 || now - l.t > 89 * 864e5) continue;   // Google accepts clicks up to 90 days old
    const name = l.strength === 'form' ? CONVERSION_NAMES.form : CONVERSION_NAMES.contact;
    const key = `${l.gclid}|${name}`; if (seen.has(key)) continue; seen.add(key);
    rows.push([l.gclid, name, gTime(l.t), '', 'EUR']);
  }
  rows.sort((a, b) => a[2].localeCompare(b[2]));
  const csv = ['Parameters:TimeZone=Europe/Berlin', 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency', ...rows.map(r => r.join(','))].join('\n') + '\n';
  return { csv, count: rows.length, forms: rows.filter(r => r[1] === CONVERSION_NAMES.form).length };
}

export const IMPORT_HOWTO = [
  'Clienți reali din reclame → Google Ads (import conversii offline)',
  'O singură dată: Google Ads → Ziele → Conversions → + Neue Conversion-Aktion → Import → „Andere Datenquellen oder CRMs“ → Klicks, cu exact aceste nume:',
  `   • ${CONVERSION_NAMES.form}`,
  `   • ${CONVERSION_NAMES.contact}  (opțional, poate fi „sekundär“)`,
  'Săptămânal: Ziele → Conversions → Uploads → + → încarci fișierul CSV primit.',
  'Nu am creat și nu am modificat nimic în Google Ads.',
].join('\n');

async function main() {
  const { openStore, DATA_DIR } = await import('./runner.mjs');
  const i = process.argv.indexOf('--days'); const days = i > 0 ? Number(process.argv[i + 1]) : 30;
  const r = await offlineConversionsCsv({ store: openStore('prod'), days });
  mkdirSync(DATA_DIR, { recursive: true });
  const f = `${DATA_DIR}/offline-conversions-${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(f, r.csv);
  console.log(JSON.stringify({ file: f, rows: r.count, forms: r.forms }));
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('offline-conversions.mjs')) main();
