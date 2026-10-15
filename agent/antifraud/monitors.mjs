// PSS Anti-Click-Fraud — monitors run by af-cron (Netlify) or from the PC.
//   hourlyCheck         2) ghost clicks (paid in Ads, never reached the site) + 3) capture broken
//   foreignWrites       8) IP-list changes made through the API by anything other than PSS Anti-Fraud
//   expireMobile        4) own exclusions of mobile/CGNAT IPs expire after N days (IP goes to someone else)
//   leadsReport         6) ad click -> real customer (form / phone / WhatsApp) per campaign, keyword, place
//   weeklyReport       10) weekly Telegram report (Mondays)
import { undoExclusion } from './ads-exclusions.mjs';
import { RULES } from '../../netlify/antifraud/config.mjs';
import { dec, enc } from '../../netlify/antifraud/pipeline.mjs';

const berlinDay = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const berlinHour = t => Number(new Date(t).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour12: false }).slice(0, 2));
const dayStart = day => new Date(`${day}T00:00:00+02:00`).getTime();   // CEST; good enough for hour buckets until 25.10

async function geoNames(client, ids) {
  const out = {}; const list = [...ids].filter(Boolean);
  for (let i = 0; i < list.length; i += 50) {
    for (const r of await client.search(`SELECT geo_target_constant.resource_name, geo_target_constant.name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${list.slice(i, i + 50).map(x => `'${x}'`).join(',')})`)) out[r.geoTargetConstant.resourceName] = r.geoTargetConstant.name;
  }
  return out;
}

/** Distinct ad clicks captured on the site per Berlin hour for a day. */
async function capturedPerHour(store, day) {
  const d0 = dayStart(day), per = {}, cids = new Set();
  for (const utcDay of new Set([new Date(d0).toISOString().slice(0, 10), new Date(d0 + 864e5 - 1).toISOString().slice(0, 10)])) {
    for (const b of (await store.list({ prefix: `ev/${utcDay}/` })).blobs) {
      const [ts, , cidHash] = b.key.split('/')[2].split('_');
      const t = Number(ts);
      if (t < d0 || t >= d0 + 864e5 || cids.has(cidHash)) continue;
      cids.add(cidHash);
      const h = berlinHour(t); per[h] = (per[h] || 0) + 1;
    }
  }
  return per;
}

/** 2) + 3): checks every finished hour (>= 2 h old, Ads data delay) once. */
export async function hourlyCheck({ client, store, notify, now = Date.now(), minClicks = 3 }) {
  const day = berlinDay(now);
  const liveSince = (await store.get('health/live-since', { type: 'json' }).catch(() => null))?.t || 0;
  const ads = await client.search(`SELECT segments.hour, metrics.clicks FROM customer WHERE segments.date = '${day}'`);
  const site = await capturedPerHour(store, day);
  const alerts = [];
  for (const r of ads) {
    const h = Number(r.segments.hour), clicks = Number(r.metrics.clicks || 0);
    const hourStart = dayStart(day) + h * 3600e3;
    if (now - hourStart < 3 * 3600e3 || hourStart < liveSince) continue;      // hour finished >= 2 h ago, and system was live
    if ((await store.setJSON(`cron/hour/${day}-${h}`, { t: now }, { onlyIfNew: true }))?.modified === false) continue;
    const seen = site[h] || 0;
    if (clicks >= minClicks && seen === 0) alerts.push({ type: 'capture', h, clicks, seen });
    else if (clicks - seen >= minClicks) alerts.push({ type: 'ghost', h, clicks, seen });
  }
  if (!alerts.length) return [];
  let where = '';
  if (alerts.some(a => a.type === 'ghost')) {
    const seenCids = new Set();
    const d0 = dayStart(day);
    for (const b of (await store.list({ prefix: `ev/${new Date(d0 + 12 * 3600e3).toISOString().slice(0, 10)}/` })).blobs) {
      const rec = await store.get(b.key, { type: 'json' }).catch(() => null); if (rec?.cid) seenCids.add(rec.cid);
    }
    const cv = await client.search(`SELECT click_view.gclid, click_view.location_of_presence.city, click_view.keyword_info.text, segments.device FROM click_view WHERE segments.date = '${day}'`);
    const ghosts = cv.filter(c => c.clickView?.gclid && !seenCids.has(c.clickView.gclid));
    const names = await geoNames(client, new Set(ghosts.map(g => g.clickView?.locationOfPresence?.city)));
    const by = {};
    for (const g of ghosts) { const k = `${names[g.clickView?.locationOfPresence?.city] || '?'} · ${g.segments?.device} · ${g.clickView?.keywordInfo?.text || '—'}`; by[k] = (by[k] || 0) + 1; }
    where = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `   ${k} ×${v}`).join('\n');
  }
  for (const a of alerts) {
    await notify(a.type === 'capture'
      ? `⚠️ PSS Anti-Fraud — CAPTARE POSIBIL DEFECTĂ\nOra ${a.h}:00–${a.h + 1}:00: Google Ads raportează ${a.clicks} clicuri, site-ul nu a captat niciunul. Verific funcția af-capture.`
      : `👻 PSS Anti-Fraud — clicuri fantomă\nOra ${a.h}:00–${a.h + 1}:00: ${a.clicks} clicuri plătite în Google Ads, doar ${a.seen} au ajuns pe site (${a.clicks - a.seen} n-au încărcat pagina — de obicei roboți; IP-ul lor nu-l avem, deci nu se pot bloca după IP).${where ? `\nDe unde (azi, clicuri fără vizită):\n${where}` : ''}\nPropunere pentru agenție: verificați zona / programul.`);
  }
  return alerts;
}

/** 8) API changes to IP exclusions not made by PSS Anti-Fraud (e.g. ClickCease / Fraud Blocker still connected). */
export async function foreignWrites({ client, store, notify, sinceMs }) {
  const from = new Date(sinceMs).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace('T', ' ');
  const to = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const rows = await client.search(`SELECT change_event.change_date_time, change_event.user_email, change_event.client_type, change_event.resource_change_operation, change_event.change_resource_name, change_event.new_resource, change_event.old_resource, campaign.name FROM change_event WHERE change_event.change_date_time >= '${from}' AND change_event.change_date_time <= '${to}' AND change_event.change_resource_type = 'CAMPAIGN_CRITERION' LIMIT 2000`);
  const known = new Set();
  for (const b of (await store.list({ prefix: 'ledger/' })).blobs) {
    const e = await store.get(b.key, { type: 'json' }).catch(() => null);
    for (const rn of [...(e?.created || []), ...(e?.removed || [])]) known.add(rn);
  }
  const foreign = rows.filter(r => r.changeEvent.clientType === 'GOOGLE_ADS_API' && !known.has(r.changeEvent.changeResourceName)
    && (r.changeEvent.newResource?.campaignCriterion?.ipBlock || r.changeEvent.oldResource?.campaignCriterion?.ipBlock || r.changeEvent.resourceChangeOperation === 'REMOVE'));
  if (foreign.length) {
    const sample = foreign.slice(0, 5).map(r => `   ${r.changeEvent.changeDateTime.slice(0, 16)} ${r.changeEvent.resourceChangeOperation} ${(r.changeEvent.newResource?.campaignCriterion?.ipBlock || r.changeEvent.oldResource?.campaignCriterion?.ipBlock || {}).ipAddress || ''} · ${r.campaign?.name || ''}`).join('\n');
    await notify(`🕵️ PSS Anti-Fraud — modificări din afară în listele de IP\n${foreign.length} modificări făcute prin API de altă aplicație decât PSS Anti-Fraud (cont ${foreign[0].changeEvent.userEmail}).\n${sample}\nProbabil ClickCease / Fraud Blocker încă au acces: https://myaccount.google.com/connections`);
  }
  return foreign.length;
}

/** 4) Own exclusions of mobile (CGNAT) IPs expire after RULES.mobileExclusionDays. Only criteria this system created. */
export async function expireMobile({ client, store, notify, enforce, now = Date.now(), days = RULES.mobileExclusionDays }) {
  const out = [];
  for (const b of (await store.list({ prefix: 'ledger/' })).blobs) {
    const e = await store.get(b.key, { type: 'json' }).catch(() => null);
    if (!e || e.mode !== 'enforce' || e.undone || !e.created?.length || !e.cidr?.endsWith('/32')) continue;
    if (now - e.t < days * 864e5) continue;
    const done = await store.get(`rec/done/${enc(e.cidr)}`, { type: 'json' }).catch(() => null);
    if (done?.net?.type !== 'mobile') continue;
    const u = await undoExclusion(client, e, { enforce });
    if (enforce) await store.setJSON(b.key, { ...e, undone: now, undoReason: `mobile IP expired after ${days} days` });
    out.push({ cidr: e.cidr, removed: u.removed });
  }
  if (out.length) await notify(`♻️ PSS Anti-Fraud — expirare automată\nAm scos ${out.length} excluderi vechi de IP-uri mobile (peste ${days} zile; IP-urile mobile ajung la alți oameni): ${out.map(o => o.cidr).join(', ')}${enforce ? '' : ' — doar validat (mod umbră)'}`);
  return out;
}

/** 6) Ad click -> real customer, per campaign / keyword / place (last N days). */
export async function leadsReport({ client, store, days = 7, now = Date.now() }) {
  const leads = {};
  for (const b of (await store.list({ prefix: 'lead/' })).blobs) { const l = await store.get(b.key, { type: 'json' }).catch(() => null); if (l?.gclid && now - l.t < (days + 1) * 864e5) leads[l.gclid] = l; }
  const rows = {}; let clicks = 0;
  const cityIds = new Set(); const all = [];
  for (let i = 0; i < days; i++) {
    const day = berlinDay(now - (i + 1) * 864e5);
    for (const r of await client.search(`SELECT click_view.gclid, campaign.name, click_view.keyword_info.text, click_view.location_of_presence.city FROM click_view WHERE segments.date = '${day}'`)) {
      all.push(r); cityIds.add(r.clickView?.locationOfPresence?.city);
    }
  }
  const names = await geoNames(client, cityIds);
  for (const r of all) {
    clicks++;
    const k = `${r.campaign?.name?.replace(/^amgads \| /, '') || '?'} · ${r.clickView?.keywordInfo?.text || '—'} · ${names[r.clickView?.locationOfPresence?.city] || '?'}`;
    const x = rows[k] ||= { clicks: 0, leads: 0 }; x.clicks++;
    if (leads[r.clickView?.gclid]) x.leads++;
  }
  const list = Object.entries(rows).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.leads - a.leads || b.clicks - a.clicks);
  return { days, clicks, leads: Object.keys(leads).length, matched: list.reduce((s, x) => s + x.leads, 0), rows: list };
}

/** 10) Weekly report text. */
export async function weeklyReport({ client, store, now = Date.now() }) {
  const from = berlinDay(now - 7 * 864e5), to = berlinDay(now - 864e5);
  const m = (await client.search(`SELECT metrics.clicks, metrics.invalid_clicks, metrics.cost_micros, metrics.average_cpc FROM customer WHERE segments.date BETWEEN '${from}' AND '${to}'`))[0]?.metrics || {};
  const cpc = Number(m.averageCpc || 0) / 1e6 || 2;
  const since = now - 7 * 864e5;
  const decs = [];
  for (const b of (await store.list({ prefix: 'dec/' })).blobs) if (Number(b.key.slice(4, 17)) >= since) decs.push(await store.get(b.key, { type: 'json' }));
  const suspicious = new Set(decs.filter(d => d && d.level !== 'log' && d.level !== 'ignore').map(d => d.cidHash)).size;
  const excl = [];
  for (const b of (await store.list({ prefix: 'rec/done/' })).blobs) { const r = await store.get(b.key, { type: 'json' }); if (r?.t >= since && r.status === 'enforce') excl.push(r); }
  const top = {}; for (const d of decs.filter(d => d?.level === 'recommend_exclude')) top[`${d.net?.asn ? 'AS' + d.net.asn : ''} ${d.net?.org || ''}`.trim() || '?'] = (top[`${d.net?.asn ? 'AS' + d.net.asn : ''} ${d.net?.org || ''}`.trim() || '?'] || 0) + 1;
  const lr = await leadsReport({ client, store, days: 7, now }).catch(() => null);
  const ins = await import('./insights.mjs');
  const z = await ins.zones({ client, store, days: 7 }).catch(() => null);
  return [
    `📅 PSS Anti-Fraud — raport săptămânal ${from} … ${to}`,
    `Google Ads: ${m.clicks || 0} clicuri, ${(Number(m.costMicros || 0) / 1e6).toFixed(2)} €, ${m.invalidClicks || 0} invalide recunoscute de Google (nu se plătesc)`,
    `Clicuri suspecte prinse de noi: ${suspicious} (~${(suspicious * cpc).toFixed(2)} € la CPC ${cpc.toFixed(2)} €)`,
    `Excluderi aplicate: ${excl.length}${excl.length ? ' — ' + excl.slice(0, 8).map(e => e.proposal.cidr).join(', ') : ''}`,
    Object.keys(top).length ? `Surse principale: ${Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ×${v}`).join('; ')}` : 'Surse principale: —',
    lr ? `Clienți reali din reclame (formular / telefon / WhatsApp cu gclid): ${lr.matched} din ${lr.clicks} clicuri${lr.rows.filter(r => r.leads).length ? '\n' + lr.rows.filter(r => r.leads).slice(0, 5).map(r => `   ✅ ${r.k}: ${r.leads} clienți / ${r.clicks} clicuri`).join('\n') : ''}` : '',
    z ? `🗺️ ${z.proposal}` : '',
  ].filter(Boolean).join('\n');
}
