// PSS Anti-Click-Fraud — read-only insights (no Google Ads writes).
//   node agent/antifraud/insights.mjs reconcile [YYYY-MM-DD]   paid clicks in Google Ads vs visits captured on the site
//   node agent/antifraud/insights.mjs zones [days]             where suspicious clicks come from -> proposal for the agency
//   node agent/antifraud/insights.mjs summary [YYYY-MM-DD]     daily Telegram summary
//   node agent/antifraud/insights.mjs tune [days]              threshold check vs Google invalid clicks
//   node agent/antifraud/insights.mjs refund <from> <to>       evidence pack for a Google invalid-click investigation
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { adsClient, loadEnv } from './ads-exclusions.mjs';
import { openStore, telegram, DATA_DIR } from './runner.mjs';
import { dec } from '../../netlify/antifraud/pipeline.mjs';

const berlinDay = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const eur = m => (Number(m || 0) / 1e6).toFixed(2);

async function geoNames(client, ids) {
  const out = {}; const list = [...ids].filter(Boolean);
  for (let i = 0; i < list.length; i += 50) {
    const q = `SELECT geo_target_constant.resource_name, geo_target_constant.name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${list.slice(i, i + 50).map(x => `'${x}'`).join(',')})`;
    for (const r of await client.search(q)) out[r.geoTargetConstant.resourceName] = r.geoTargetConstant.name;
  }
  return out;
}

/** Events captured on the site for a Berlin calendar day (keys are UTC-day based: scan both days). */
export async function siteEvents(store, day) {
  const d0 = new Date(`${day}T00:00:00+02:00`).getTime(), d1 = d0 + 864e5;
  const out = [];
  for (const utcDay of new Set([new Date(d0).toISOString().slice(0, 10), new Date(d1 - 1).toISOString().slice(0, 10)])) {
    for (const b of (await store.list({ prefix: `ev/${utcDay}/` })).blobs) {
      const [ts, ip] = b.key.split('/')[2].split('_');
      if (Number(ts) >= d0 && Number(ts) < d1) out.push({ key: b.key, t: Number(ts), ip: dec(ip) });
    }
  }
  return out;
}

/** First captured production event = start of coverage (days before/at it are partial). */
export async function liveSince(store) {
  let first = Infinity;
  for (const b of (await store.list({ prefix: 'ev/' })).blobs) first = Math.min(first, Number(b.key.split('/')[2].slice(0, 13)));
  return Number.isFinite(first) ? first : null;
}

/** 2) Google Ads paid clicks vs captured visits. A paid click that never reached the site is a bot/abandon signal. */
export async function reconcile({ client, store, day = berlinDay() }) {
  const clicks = await client.search(`SELECT click_view.gclid, campaign.name, click_view.keyword_info.text, click_view.location_of_presence.city, segments.device FROM click_view WHERE segments.date = '${day}'`);
  const ev = await siteEvents(store, day);
  const seen = new Set();
  for (const e of ev) { const r = await store.get(e.key, { type: 'json' }); if (r?.cid) seen.add(r.cid); }
  const missing = clicks.filter(c => c.clickView?.gclid && !seen.has(c.clickView.gclid));
  const names = await geoNames(client, new Set(missing.map(m => m.clickView?.locationOfPresence?.city)));
  const byWhere = {};
  for (const m of missing) { const k = `${names[m.clickView?.locationOfPresence?.city] || '?'} · ${m.segments?.device} · ${m.clickView?.keywordInfo?.text || '—'}`; byWhere[k] = (byWhere[k] || 0) + 1; }
  const since = await liveSince(store);
  const partial = !since || since > new Date(`${day}T00:00:00+02:00`).getTime();
  return { day, partial, liveSince: since ? new Date(since).toISOString() : null, paidClicks: clicks.length, siteVisits: seen.size, matched: clicks.length - missing.length, missing: missing.length,
    missingRate: clicks.length ? missing.length / clicks.length : 0, missingBy: Object.entries(byWhere).sort((a, b) => b[1] - a[1]) };
}

/** 4) Zones: where clicks concentrate + how many suspicious IPs we saw there. Proposal text only. */
export async function zones({ client, store, days = 14 }) {
  const per = {};
  for (let i = 1; i <= days; i++) {
    const day = berlinDay(Date.now() - i * 864e5);
    for (const r of await client.search(`SELECT click_view.location_of_presence.city, segments.device, campaign.name FROM click_view WHERE segments.date = '${day}'`)) {
      const city = r.clickView?.locationOfPresence?.city; if (!city) continue;
      const x = per[city] ||= { clicks: 0, mobile: 0, days: new Set() }; x.clicks++; if (r.segments?.device === 'MOBILE') x.mobile++; x.days.add(day);
    }
  }
  const names = await geoNames(client, new Set(Object.keys(per)));
  const flagged = {};
  for (const b of (await store.list({ prefix: 'dec/' })).blobs) {
    const d = await store.get(b.key, { type: 'json' });
    if (d?.level === 'recommend_exclude' && Date.now() - d.t < days * 864e5) { const c = d.net?.city || '?'; flagged[c] = (flagged[c] || 0) + 1; }
  }
  const total = Object.values(per).reduce((s, x) => s + x.clicks, 0);
  const rows = Object.entries(per).map(([id, x]) => ({ city: names[id] || id, clicks: x.clicks, share: x.clicks / (total || 1), mobileShare: x.mobile / x.clicks, activeDays: x.days.size, flaggedIps: flagged[names[id]] || 0 }))
    .sort((a, b) => b.clicks - a.clicks);
  const suspicious = rows.filter(r => r.share >= 0.10 && r.mobileShare >= 0.75);
  const proposal = suspicious.length
    ? `Propunere pentru agenție (NU s-a aplicat nimic): verificați excluderea sau reducerea licitării pentru ${suspicious.map(r => `${r.city} (${Math.round(r.share * 100)}% din clicuri, ${Math.round(r.mobileShare * 100)}% mobil)`).join(', ')} — concentrare mare de clicuri pe mobil, tiparul valurilor suspecte.`
    : 'Nicio zonă nu depășește pragul (≥10% din clicuri și ≥75% mobil).';
  return { days, total, rows: rows.slice(0, 12), proposal };
}

/** 7) Threshold check: our flags vs Google invalid clicks, and excluded IPs that later became customers. */
export async function tune({ client, store, days = 7 }) {
  const out = [];
  for (let i = 1; i <= days; i++) {
    const day = berlinDay(Date.now() - i * 864e5);
    const r = (await client.search(`SELECT metrics.clicks, metrics.invalid_clicks FROM customer WHERE segments.date = '${day}'`))[0]?.metrics || {};
    const ev = await siteEvents(store, day);
    const ips = new Set(ev.map(e => e.ip));
    let flagged = 0;
    for (const ip of ips) if (await store.get(`off/ip/${ip.replace(/\//g, '-').replace(/:/g, 'x')}`).catch(() => null)) flagged++;
    out.push({ day, googleClicks: Number(r.clicks || 0), googleInvalid: Number(r.invalidClicks || 0), siteVisits: ev.length, uniqueIps: ips.size, excludedIps: flagged });
  }
  const falsePositives = [];
  for (const b of (await store.list({ prefix: 'allow/ip/' })).blobs) {
    const ipKey = b.key.split('/').pop();
    if (await store.get(`off/ip/${ipKey}`).catch(() => null)) falsePositives.push(dec(ipKey));
  }
  const advice = falsePositives.length ? `⚠️ ${falsePositives.length} IP-uri excluse au devenit apoi clienți reali → pragul e prea strict, de anulat excluderea: ${falsePositives.join(', ')}` : 'Niciun client real exclus din greșeală.';
  return { days: out, falsePositives, advice };
}

/** 6) Daily summary text. */
export async function summary({ client, store, day = berlinDay() }) {
  const ads = (await client.search(`SELECT metrics.clicks, metrics.invalid_clicks, metrics.cost_micros, metrics.average_cpc FROM customer WHERE segments.date = '${day}'`))[0]?.metrics || {};
  const ev = await siteEvents(store, day);
  const d0 = new Date(`${day}T00:00:00+02:00`).getTime();
  const decs = [];
  for (const b of (await store.list({ prefix: 'dec/' })).blobs) if (Number(b.key.slice(4, 17)) >= d0 && Number(b.key.slice(4, 17)) < d0 + 864e5) decs.push(await store.get(b.key, { type: 'json' }));
  const excl = [];
  for (const b of (await store.list({ prefix: 'rec/done/' })).blobs) { const r = await store.get(b.key, { type: 'json' }); if (r?.t >= d0 && r.t < d0 + 864e5 && !/^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(r.proposal?.cidr || '')) excl.push(r); }
  const suspiciousClicks = new Set(decs.filter(d => d.level !== 'log').map(d => d.cidHash)).size;
  const cpc = Number(ads.averageCpc || 0) / 1e6 || 2;
  let rec = null; try { rec = await reconcile({ client, store, day }); } catch { /* click_view may lag */ }
  const customers = (await store.list({ prefix: 'allow/ip/' })).blobs.length;
  return [
    `📊 PSS Anti-Fraud — rezumat ${day}`,
    `Google Ads: ${ads.clicks || 0} clicuri plătite, ${eur(ads.costMicros)} €, ${ads.invalidClicks || 0} marcate invalide de Google (nu se plătesc)`,
    `Site: ${ev.length} vizite din reclame captate, ${new Set(ev.map(e => e.ip)).size} IP-uri`,
    rec?.partial ? `Comparația Ads ↔ site: zi PARȚIALĂ (captarea live a pornit ${new Date(rec.liveSince).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}) — nu e dovadă` :
    rec ? `Clicuri plătite care NU au ajuns pe site: ${rec.missing}/${rec.paidClicks}${rec.missing ? ` (top: ${rec.missingBy.slice(0, 2).map(([k, v]) => `${k} ×${v}`).join('; ')})` : ''}` : 'Comparația Ads ↔ site: date Google încă neprocesate',
    `Clicuri suspecte: ${suspiciousClicks} (~${(suspiciousClicks * cpc).toFixed(2)} € la CPC mediu ${cpc.toFixed(2)} €)`,
    `Excluderi: ${excl.filter(e => e.status === 'enforce').length} aplicate, ${excl.filter(e => e.status === 'validate_only').length} doar validate${excl.length ? ' — ' + excl.map(e => e.proposal.cidr).join(', ') : ''}`,
    `Clienți reali pe lista albă (total): ${customers}`,
  ].join('\n');
}

/** 8) Evidence pack for Google's invalid-click investigation form (nothing is submitted). */
export async function refundPack({ client, store, from, to, outRoot = DATA_DIR }) {
  const rows = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 864e5) {
    const day = new Date(t).toISOString().slice(0, 10);
    const ev = await siteEvents(store, day);
    const byIp = {};
    for (const e of ev) (byIp[e.ip] ||= []).push(e);
    for (const [ip, list] of Object.entries(byIp)) {
      if (!(await store.get(`off/ip/${ip.replace(/\//g, '-').replace(/:/g, 'x')}`).catch(() => null))) continue;
      for (const e of list) {
        const r = await store.get(e.key, { type: 'json' });
        let ad = null;
        if (r?.cidType === 'gclid') {
          const m = await client.search(`SELECT campaign.name, click_view.keyword_info.text FROM click_view WHERE segments.date = '${day}' AND click_view.gclid = '${String(r.cid).replace(/'/g, '')}'`).catch(() => []);
          ad = m[0] || null;
        }
        rows.push({ utc: new Date(r.t).toISOString(), ip, gclid: r.cid, page: r.path, campaign: ad?.campaign?.name || '', keyword: ad?.clickView?.keywordInfo?.text || '', inAds: !!ad, sha256: r.sha256 });
      }
    }
  }
  const csv = ['utc;ip;gclid;landing_page;campaign;keyword;found_in_google_ads_click_view;record_sha256'].concat(rows.map(r => [r.utc, r.ip, r.gclid, r.page, r.campaign, r.keyword, r.inAds, r.sha256].join(';'))).join('\n') + '\n';
  const confirmed = rows.filter(r => r.inAds);
  const camps = [...new Set(confirmed.map(r => r.campaign))].join(', ') || '—';
  const de = `Betreff: Antrag auf Prüfung ungültiger Klicks – Konto 984-766-7839 (Perfekt Sauber Service)

Sehr geehrtes Google-Ads-Team,

wir bitten um Prüfung ungültiger Klicks im Zeitraum ${from} bis ${to} in den Kampagnen ${camps}.
Unser serverseitiges Protokoll hat ${rows.length} Anzeigenklicks von ${new Set(rows.map(r => r.ip)).size} IP-Adressen mit auffälligem Muster erfasst (mehrere Klicks derselben IP innerhalb weniger Minuten ohne Kontaktaufnahme); ${confirmed.length} dieser GCLIDs sind in click_view unseres Kontos nachweisbar.
Die Liste mit Zeitstempel (UTC), IP, GCLID, Zielseite, Kampagne und Keyword liegt bei (invalid-clicks.csv). Die betroffenen IPs wurden bereits ausgeschlossen.

Mit freundlichen Grüßen
Laura Craciun, Perfekt Sauber Service
`;
  const files = {
    'invalid-clicks.csv': '﻿' + csv,
    'antrag-de.txt': de,
    'README.txt': 'Formular: Google Ads Hilfe -> "Ungültige Klicks melden" (support.google.com/google-ads/contact/click_quality). Text aus antrag-de.txt kopieren, invalid-clicks.csv anhängen. NICHTS wurde automatisch gesendet.\n',
  };
  files['manifest.sha256'] = Object.keys(files).map(n => `${createHash('sha256').update(Buffer.from(files[n], 'utf8')).digest('hex')}  ${n}`).join('\n') + '\n';
  let dir = null;
  if (outRoot) { dir = `${outRoot}/refund-${from}_${to}`; mkdirSync(dir, { recursive: true }); for (const [n, body] of Object.entries(files)) writeFileSync(`${dir}/${n}`, body); }
  return { dir, files, clicks: rows.length, confirmedInAds: confirmed.length, ips: new Set(rows.map(r => r.ip)).size };
}

async function main() {
  const [cmd, a1, a2] = process.argv.slice(2);
  const store = openStore(process.env.AF_STORE || 'prod');
  const client = adsClient(loadEnv());
  let out;
  if (cmd === 'reconcile') out = await reconcile({ client, store, day: a1 || berlinDay() });
  else if (cmd === 'zones') out = await zones({ client, store, days: Number(a1 || 14) });
  else if (cmd === 'tune') out = await tune({ client, store, days: Number(a1 || 7) });
  else if (cmd === 'refund') out = await refundPack({ client, store, from: a1, to: a2 || a1 });
  else if (cmd === 'summary') { out = await summary({ client, store, day: a1 || berlinDay() }); if (process.argv.includes('--send')) await telegram()(out); }
  else { console.log('commands: reconcile | zones | summary [--send] | tune | refund <from> <to>'); return; }
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('insights.mjs')) main();
