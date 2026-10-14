// PSS Abuse Evidence Reporter — builds an evidence case for one suspicious IP.
//   node agent/antifraud/abuse-reporter.mjs <ip> [--store test|prod] [--hours 72] [--no-ads]
// Output: C:/tmp/pss-antifraud-data/cases/<date>_<ip>/ with the original event
// records, a CSV timeline, case.json, report.md, draft e-mails (DE + EN) and a
// SHA-256 manifest. NOTHING is sent to anyone; Laura gets a Telegram notice.
//
// Evidence rules:
//  * Only events this system recorded for THIS IP are evidence (each with its
//    original SHA-256, re-verified here). Aggregated Ads clicks/costs are never
//    attributed to an IP.
//  * A gclid found in Google Ads click_view proves Google registered an ad click
//    with that id (campaign/keyword/device); it does not prove the charge.
//  * The network owner is not assumed to be the person who clicked.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonical, sha256Hex, enc } from '../../netlify/antifraud/pipeline.mjs';
import { networkOf } from '../../netlify/antifraud/ip.mjs';
import { DATA_DIR } from './runner.mjs';

const fmtBerlin = t => new Date(t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour12: false });
const iso = t => new Date(t).toISOString();

export async function collectEvents(store, ip, sinceMs) {
  const out = [];
  for (let d = new Date(sinceMs); d.getTime() <= Date.now() + 864e5; d = new Date(d.getTime() + 864e5)) {
    const day = d.toISOString().slice(0, 10);
    const { blobs } = await store.list({ prefix: `ev/${day}/` });
    for (const b of blobs.filter(b => b.key.includes(`_${enc(ip)}_`))) {
      const rec = await store.get(b.key, { type: 'json' });
      if (rec && rec.t >= sinceMs) {
        const { sha256, ...raw } = rec;
        out.push({ key: b.key, rec, integrity: (await sha256Hex(canonical(raw))) === sha256 ? 'OK' : 'MISMATCH' });
      }
    }
  }
  return out.sort((a, b) => a.rec.t - b.rec.t);
}

export async function collectDecisions(store, ip, sinceMs) {
  const out = [];
  for (const b of (await store.list({ prefix: 'dec/' })).blobs) {
    if (b.key.endsWith(`_${enc(ip)}`) && Number(b.key.slice(4, 17)) >= sinceMs) out.push(await store.get(b.key, { type: 'json' }));
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Official abuse contact + network registration (RIPE stat + RDAP). */
export async function registryLookup(ip, fetchImpl = fetch) {
  const out = { ip, source: [] };
  try {
    const r = await (await fetchImpl(`https://stat.ripe.net/data/abuse-contact-finder/data.json?resource=${ip}`)).json();
    out.abuseContacts = r?.data?.abuse_contacts || [];
    out.authoritativeRir = r?.data?.authoritative_rir || null;
    out.source.push('RIPEstat abuse-contact-finder');
  } catch (e) { out.abuseError = String(e).slice(0, 120); }
  try {
    const RDAP = { ripe: 'https://rdap.db.ripe.net/ip/', arin: 'https://rdap.arin.net/registry/ip/', apnic: 'https://rdap.apnic.net/ip/',
      lacnic: 'https://rdap.lacnic.net/rdap/ip/', afrinic: 'https://rdap.afrinic.net/rdap/ip/' };
    const base = RDAP[String(out.authoritativeRir || '').toLowerCase()] || 'https://rdap.org/ip/';
    const r = await (await fetchImpl(base + ip, { headers: { accept: 'application/rdap+json', 'user-agent': 'PSS-Abuse-Evidence/1.0 (kontakt@perfektsauberservice.com)' }, redirect: 'follow' })).json();
    out.network = { handle: r.handle, name: r.name, country: r.country, start: r.startAddress, end: r.endAddress,
      cidr: (r.cidr0_cidrs || []).map(c => `${c.v4prefix || c.v6prefix}/${c.length}`).join(', ') || null };
    const vcards = (r.entities || []).flatMap(e => [e, ...(e.entities || [])]);
    const abuse = vcards.filter(e => (e.roles || []).includes('abuse'))
      .flatMap(e => (e.vcardArray?.[1] || []).filter(x => x[0] === 'email').map(x => x[3]));
    out.abuseContacts = [...new Set([...(out.abuseContacts || []), ...abuse])];
    out.registrant = vcards.filter(e => (e.roles || []).includes('registrant')).map(e => (e.vcardArray?.[1] || []).find(x => x[0] === 'fn')?.[3]).filter(Boolean);
    out.source.push(`RDAP ${base}`);
  } catch (e) { out.rdapError = String(e).slice(0, 120); }
  return out;
}

/** Google Ads click_view lookup for each recorded gclid (read-only). */
export async function adsMatches(client, events) {
  const out = {};
  for (const { rec } of events.filter(e => e.rec.cidType === 'gclid')) {
    const day = new Date(rec.t).toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });   // try account day +-1
    for (const d of [new Date(rec.t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }), day]) {
      try {
        const rows = await client.search(`SELECT click_view.gclid, campaign.name, ad_group.name, click_view.keyword_info.text, segments.device, click_view.location_of_presence.city FROM click_view WHERE segments.date = '${d}' AND click_view.gclid = '${rec.cid.replace(/'/g, '')}'`);
        if (rows.length) { out[rec.cid] = { date: d, campaign: rows[0].campaign?.name, adGroup: rows[0].adGroup?.name, keyword: rows[0].clickView?.keywordInfo?.text, device: rows[0].segments?.device }; break; }
      } catch (e) { out[rec.cid] = { error: String(e).slice(0, 160) }; break; }
    }
    if (!out[rec.cid]) out[rec.cid] = { date: null, found: false };
  }
  return out;
}

export function analyse(events, decisions, ads) {
  const clicks = [...new Map(events.map(e => [e.rec.cid, e.rec])).values()];
  const times = clicks.map(c => c.t).sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000);
  let max10 = 0;
  for (let i = 0; i < times.length; i++) max10 = Math.max(max10, times.filter(t => t >= times[i] && t - times[i] <= 600e3).length);
  const uas = [...new Set(events.map(e => e.rec.ua))];
  const adsConfirmed = Object.values(ads || {}).filter(x => x.campaign).length;
  const patterns = [], patternsDe = [];
  const p = (en, de) => { patterns.push(en); patternsDe.push(de); };
  if (max10 >= 4) p(`rapid repetition: ${max10} distinct ad-click ids within 10 minutes`, `schnelle Wiederholung: ${max10} unterschiedliche Anzeigenklicks innerhalb von 10 Minuten`);
  if (gaps.length && Math.min(...gaps) < 60) p(`shortest interval between two distinct ad clicks: ${Math.min(...gaps).toFixed(1)} s`, `kürzester Abstand zwischen zwei Anzeigenklicks: ${Math.min(...gaps).toFixed(1)} s`);
  if (events.length > clicks.length) p(`${events.length - clicks.length} page reloads with an already used click id`, `${events.length - clicks.length} erneute Aufrufe mit bereits verwendeter Klick-ID`);
  if (uas.some(u => /(bot|headless|curl|python|selenium|puppeteer|playwright)/i.test(u))) p('automated user agent observed', 'automatisierter User-Agent festgestellt');
  if (events.some(e => !e.rec.lang)) p('requests without Accept-Language header', 'Anfragen ohne Accept-Language-Header');
  const reasons = [...new Set(decisions.flatMap(d => d.reasons || []))];
  let confidence = 'LOW';
  if (max10 >= 4 || (clicks.length >= 3 && reasons.some(r => /datacenter|outside Germany|automated|already flagged/.test(r)))) confidence = 'MEDIUM';
  if (max10 >= 6 && adsConfirmed >= 3 && events.every(e => e.integrity === 'OK')) confidence = 'HIGH';
  return { clicks: clicks.length, requests: events.length, max10, firstSeen: times[0], lastSeen: times[times.length - 1], userAgents: uas, patterns, patternsDe, reasons, adsConfirmed, confidence };
}

function emailDE(c) {
  return `Betreff: Missbrauchsmeldung – automatisierte bzw. wiederholte Werbeklicks von ${c.ip}

Sehr geehrte Damen und Herren,

wir betreiben die Website perfektsauberservice.com (Perfekt Sauber Service, Inh. Laura Craciun, Reutstraße 9, 76597 Loffenau) und schalten Google-Ads-Anzeigen. Von der IP-Adresse ${c.ip}, die laut Registry (${c.registry.network?.name || 'n/a'}${c.registry.network?.handle ? ', ' + c.registry.network.handle : ''}) zu Ihrem Netz gehört, haben wir folgende Zugriffe über Werbelinks festgestellt:

- Netz: ${c.asn || 'n/a'} ${c.provider || ''}, registrierter Bereich ${c.registeredRange || 'n/a'}
- Zeitraum: ${fmtBerlin(c.analysis.firstSeen)} bis ${fmtBerlin(c.analysis.lastSeen)} (Europe/Berlin)
- ${c.analysis.clicks} unterschiedliche Anzeigenklicks, ${c.analysis.requests} Seitenaufrufe insgesamt
- maximal ${c.analysis.max10} Anzeigenklicks innerhalb von 10 Minuten
${c.analysis.patterns.map(p => `- ${p}`).join('\n')}

Die einzelnen Zeitstempel (UTC) liegen in der beigefügten CSV-Datei; die Originaldatensätze sind mit SHA-256-Prüfsummen gesichert.

Uns ist bewusst, dass der Inhaber des Anschlusses nicht zwingend die handelnde Person ist und dass IP-Adressen geteilt oder neu vergeben werden können. Wir bitten Sie, den Vorgang im Rahmen Ihrer Abuse-Richtlinien zu prüfen. Weitere Informationen stellen wir auf Anfrage gern zur Verfügung.

Mit freundlichen Grüßen
Laura Craciun
Perfekt Sauber Service
kontakt@perfektsauberservice.com
`;
}

function emailEN(c) {
  return `Subject: Abuse report – repeated/automated ad clicks from ${c.ip}

Dear abuse team,

we operate perfektsauberservice.com (Perfekt Sauber Service, Laura Craciun, Reutstraße 9, 76597 Loffenau, Germany) and run Google Ads. From IP address ${c.ip}, registered to your network (${c.registry.network?.name || 'n/a'}${c.registry.network?.handle ? ', ' + c.registry.network.handle : ''}), we recorded:

- network: ${c.asn || 'n/a'} ${c.provider || ''}, registered range ${c.registeredRange || 'n/a'}
- period: ${iso(c.analysis.firstSeen)} to ${iso(c.analysis.lastSeen)} (UTC)
- ${c.analysis.clicks} distinct ad clicks, ${c.analysis.requests} page requests in total
- up to ${c.analysis.max10} ad clicks within 10 minutes
${c.analysis.patterns.map(p => `- ${p}`).join('\n')}

Per-request UTC timestamps and requested pages are in the attached isp-attachment.csv; the original records are kept by us with SHA-256 checksums.

We are aware that the subscriber is not necessarily the person responsible and that addresses can be shared or reassigned. We kindly ask you to review this under your abuse policy. Further details are available on request.

Kind regards,
Laura Craciun
Perfekt Sauber Service
kontakt@perfektsauberservice.com
`;
}

export async function buildCase({ store, ip, hours = 72, client = null, notify = null, fetchImpl = fetch, outRoot = `${DATA_DIR}/cases` }) {
  const since = Date.now() - hours * 3600e3;
  const events = await collectEvents(store, ip, since);
  if (!events.length) return { ip, empty: true };
  const decisions = await collectDecisions(store, ip, since);
  const netinfo = await store.get(`netinfo/${enc(ip)}`, { type: 'json' }).catch(() => null);
  const registry = await registryLookup(ip, fetchImpl);
  const ads = client ? await adsMatches(client, events) : {};
  const analysis = analyse(events, decisions, ads);
  const asnNum = String(netinfo?.org || '').match(/^AS(\d+)/)?.[1] || null;
  const provider = String(netinfo?.org || '').replace(/^AS\d+\s*/, '') || registry.network?.name || null;
  const c = { ip, network: networkOf(ip), asn: asnNum ? `AS${asnNum}` : null, provider, registeredRange: registry.network?.cidr || (registry.network?.start ? `${registry.network.start}–${registry.network.end}` : null),
    netinfo, registry, analysis, builtAt: iso(Date.now()), hours,
    gclids: [...new Set(events.filter(e => e.rec.cidType === 'gclid').map(e => e.rec.cid))],
    evidenceNote: 'Evidence = only the events recorded for this IP. Aggregated Ads clicks/costs are not attributed to the IP. The network owner is not assumed to be the person who clicked.' };
  const caseId = `${new Date().toISOString().slice(0, 10)}_${enc(ip)}`;
  const timeline = events.map(({ rec, integrity }) => {
    const ad = ads[rec.cid];
    return `| ${fmtBerlin(rec.t)} | ${iso(rec.t)} | ${rec.path} | ${rec.cidType}=${rec.cid} | ${ad?.campaign ? `${ad.campaign} / ${ad.keyword || ''} / ${ad.device || ''}` : (client ? 'negăsit în Ads' : 'neverificat')} | ${integrity} |`;
  });
  const files = {
    'raw-events.jsonl': events.map(e => JSON.stringify(e.rec)).join('\n') + '\n',
    'events.csv': ['utc;europe_berlin;ip;path;click_id_type;click_id;user_agent;accept_language;netlify_request_id;record_sha256;integrity;google_ads_match']
      .concat(events.map(({ rec, integrity }) => [iso(rec.t), fmtBerlin(rec.t), rec.ip, rec.path, rec.cidType, rec.cid, `"${(rec.ua || '').replace(/"/g, "'")}"`, rec.lang, rec.requestId, rec.sha256, integrity,
        ads[rec.cid]?.campaign ? `${ads[rec.cid].campaign} / ${ads[rec.cid].keyword || ''}` : (client ? 'not found' : 'not checked')].join(';'))).join('\n') + '\n',
    // for the ISP: time (UTC), IP, requested page and the Google click id of each ad click
    'isp-attachment.csv': ['utc;ip;requested_page;google_click_id'].concat(events.map(({ rec }) => `${iso(rec.t)};${rec.ip};https://perfektsauberservice.com${rec.path};${rec.cid}`)).join('\n') + '\n',
    'case.json': JSON.stringify({ ...c, decisions, ads }, null, 1),
    'report.md': [`# Dosar abuz ${ip} — încredere ${analysis.confidence}`, '',
      `- **IP:** ${ip} · rețea /24: ${c.network}`,
      `- **ASN:** ${c.asn || '—'} · **Furnizor:** ${c.provider || '—'}`,
      `- **Interval înregistrat (RIR):** ${c.registeredRange || '—'} · ${registry.network?.name || '—'} (${registry.network?.handle || '—'}, ${registry.network?.country || '—'})`,
      `- **Contact abuse oficial:** ${(registry.abuseContacts || []).join(', ') || 'NEGĂSIT'} (sursa: ${registry.source.join(' + ')})`,
      `- **GCLID-uri:** ${c.gclids.length} — ${c.gclids.join(', ') || '—'}`,
      `- Perioada: ${fmtBerlin(analysis.firstSeen)} – ${fmtBerlin(analysis.lastSeen)} (Europe/Berlin)`,
      `- Clicuri publicitare distincte: ${analysis.clicks} · cereri totale: ${analysis.requests} · max în 10 min: ${analysis.max10}`,
      `- Confirmate în Google Ads (click_view, după gclid): ${analysis.adsConfirmed}${client ? '' : ' (neverificat)'}`,
      `- Integritate înregistrări: ${events.filter(e => e.integrity === 'OK').length}/${events.length} OK`, '',
      '## Cronologie (fiecare accesare înregistrată)', '| Europe/Berlin | UTC | Pagina | ID clic | Google Ads (campanie / cuvânt / dispozitiv) | Integritate |', '|---|---|---|---|---|---|', ...timeline, '',
      '## Dovezi tehnice', `- Fiecare înregistrare are SHA-256 al conținutului original (verificat acum: ${events.filter(e => e.integrity === 'OK').length}/${events.length} OK) și ID-ul cererii Netlify (x-nf-request-id), verificabil în jurnalele Netlify.`,
      `- User-Agent: ${analysis.userAgents.map(u => `\`${String(u).slice(0, 90)}\``).join('; ') || '—'}`, `- Fișierele dosarului sunt sigilate în manifest.sha256.`, '',
      '## Tipare', ...analysis.patterns.map(p => `- ${p}`), '', '## Motivele motorului', ...analysis.reasons.map(r => `- ${r}`), '',
      '## Limite', '- Proprietarul rețelei NU este presupus a fi persoana care a dat clic.', '- Costurile/clicurile agregate din Ads NU sunt atribuite acestui IP.',
      '- IP-urile mobile (CGNAT) pot fi folosite simultan de mai mulți abonați.'].join('\n') + '\n',
    'email-abuse-de.txt': emailDE(c),
    'email-abuse-en.txt': emailEN(c),
  };
  files['manifest.sha256'] = Object.keys(files).map(n => `${createHash('sha256').update(Buffer.from(files[n], 'utf8')).digest('hex')}  ${n}`).join('\n') + '\n';
  let dir = null;
  if (outRoot) {   // on the PC: also write the folder; on Netlify (outRoot = null) the files stay in memory / the store
    dir = `${outRoot}/${caseId}`;
    mkdirSync(dir, { recursive: true });
    for (const [n, body] of Object.entries(files)) writeFileSync(`${dir}/${n}`, body);
  }
  if (notify) await notify(`📁 PSS Abuse Evidence — dosar pregătit: ${ip}\nASN ${c.asn || '—'} · ${c.provider || '—'} · interval ${c.registeredRange || '—'}\nÎncredere: ${analysis.confidence} · ${analysis.clicks} clicuri publicitare (${c.gclids.length} GCLID), max ${analysis.max10}/10 min\nContact abuse: ${(registry.abuseContacts || []).join(', ') || 'negăsit'}\n${dir ? '📂 ' + dir + '\n' : ''}⛔ Nu s-a trimis nimic către furnizor — aștept aprobarea ta.`);
  return { dir, caseId, files, ...c };
}

/** Automatic dossiers (run by af-cron on Netlify): one case per IP that was really excluded.
 *  Files are kept in the store (case/<caseId>/<file>) and sent to Laura on Telegram.
 *  Nothing is ever sent to an ISP. */
export async function autoCases({ store, client, notify, sendDocument, max = 2, fetchImpl = fetch }) {
  const built = [];
  for (const b of (await store.list({ prefix: 'rec/done/' })).blobs) {
    if (built.length >= max) break;
    const rec = await store.get(b.key, { type: 'json' });
    if (!rec || rec.status !== 'enforce' || rec.proposal?.kind !== 'ip' || !rec.ip) continue;
    const mark = await store.setJSON(`case/marker/${enc(rec.ip)}`, { t: Date.now() }, { onlyIfNew: true });
    if (mark?.modified === false) continue;
    const c = await buildCase({ store, ip: rec.ip, hours: 72, client, notify, fetchImpl, outRoot: null });
    if (c.empty) continue;
    for (const [name, body] of Object.entries(c.files)) await store.set(`case/${c.caseId}/${name}`, body);
    if (sendDocument) {
      for (const name of ['report.md', 'email-abuse-de.txt', 'isp-attachment.csv', 'events.csv', 'manifest.sha256']) {
        await sendDocument(`${c.caseId}_${name}`, c.files[name], name === 'report.md' ? `Dosar ${rec.ip}` : '');
      }
    }
    built.push({ ip: rec.ip, caseId: c.caseId, confidence: c.analysis.confidence });
  }
  return built;
}

/** Export a dossier stored on Netlify to the PC:  node agent/antifraud/abuse-reporter.mjs export <caseId|ip> */
export async function exportCase(store, idOrIp, outRoot = `${DATA_DIR}/cases`) {
  const keys = (await store.list({ prefix: 'case/' })).blobs.map(b => b.key).filter(k => !k.startsWith('case/marker/') && k.split('/')[1].includes(enc(idOrIp)));
  const out = [];
  for (const k of keys) {
    const [, caseId, name] = k.split('/');
    mkdirSync(`${outRoot}/${caseId}`, { recursive: true });
    writeFileSync(`${outRoot}/${caseId}/${name}`, await store.get(k));
    out.push(`${outRoot}/${caseId}/${name}`);
  }
  return out;
}

async function main() {
  const { openStore, telegram } = await import('./runner.mjs');
  const { adsClient, loadEnv } = await import('./ads-exclusions.mjs');
  const a = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  if (process.argv[2] === 'export') {
    console.log((await exportCase(openStore(a('store', 'prod')), process.argv[3])).join('\n') || 'no stored case found');
    return;
  }
  const ip = process.argv[2];
  const env = loadEnv();
  const r = await buildCase({ store: openStore(a('store', 'test')), ip, hours: Number(a('hours', 72)),
    client: process.argv.includes('--no-ads') ? null : adsClient(env), notify: telegram(env) });
  console.log(JSON.stringify({ dir: r.dir, empty: r.empty, confidence: r.analysis?.confidence, abuse: r.registry?.abuseContacts, network: r.registry?.network }, null, 1));
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('abuse-reporter.mjs')) main();
