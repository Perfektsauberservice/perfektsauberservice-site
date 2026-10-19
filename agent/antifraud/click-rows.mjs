// One row per ad click for a Berlin day: time, IP, operator, place, device, page, behaviour, keyword,
// verdict. Shared by the clicks table page (/af-clicks/<token>) and the per-click Telegram card.
import { dec, enc } from '../../netlify/antifraud/pipeline.mjs';
import { networkOf } from '../../netlify/antifraud/ip.mjs';
import { classifyNetwork } from '../../netlify/antifraud/engine.mjs';
import { isTestIp } from './monitors.mjs';
import { describeDevice, verdict } from './click-digest.mjs';

const hms = t => new Date(t).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour12: false });

export function shortOperator(org = '') {
  const s = String(org).replace(/^AS\d+\s*/, '');
  if (/versatel|1&1/i.test(s)) return '1&1';
  if (/telekom|dtag/i.test(s)) return 'Telekom';
  if (/vodafone|vodanet/i.test(s)) return 'Vodafone';
  if (/telefonica|tdde/i.test(s)) return 'O2';
  if (/google/i.test(s)) return 'rețeaua Google';
  if (/cloudflare|akamai|fastly/i.test(s)) return 'rețea partajată (iCloud/Cloudflare)';
  return s.split(/\s+/).slice(0, 2).join(' ') || '?';
}

export async function clickRows({ store, client = null, day }) {
  const d0 = new Date(`${day}T00:00:00+02:00`).getTime(), d1 = d0 + 864e5;
  const firsts = new Map();
  for (const utcDay of new Set([new Date(d0).toISOString().slice(0, 10), new Date(d1 - 1).toISOString().slice(0, 10)])) {
    for (const b of (await store.list({ prefix: `ev/${utcDay}/` })).blobs) {
      const [ts, ipK, cidHash] = b.key.split('/')[2].split('_');
      const t = Number(ts), ip = dec(ipK);
      if (t < d0 || t >= d1 || isTestIp(ip)) continue;
      const f = firsts.get(cidHash);
      if (f) { f.requests++; if (t < f.t) Object.assign(f, { t, key: b.key }); continue; }
      firsts.set(cidHash, { t, ip, cidHash, key: b.key, requests: 1 });
    }
  }
  const ads = {};
  if (client) {
    try {
      for (const r of await client.search(`SELECT click_view.gclid, campaign.name, click_view.keyword_info.text FROM click_view WHERE segments.date = '${day}'`))
        ads[r.clickView?.gclid] = { campaign: r.campaign?.name, keyword: r.clickView?.keywordInfo?.text };
    } catch { /* Google data not yet available */ }
  }
  const decs = (await store.list({ prefix: 'dec/' })).blobs.map(b => b.key);
  const rows = [];
  for (const c of [...firsts.values()].sort((a, b) => a.t - b.t)) {
    const r = await store.get(c.key, { type: 'json' }).catch(() => null);
    if (!r || /^PSS-LIVE-CHECK/.test(r.cid || '')) continue;
    const ni = await store.get(`netinfo/${enc(c.ip)}`, { type: 'json' }).catch(() => null);
    const beh = await store.get(`beh/${enc(c.ip)}/${c.cidHash}`, { type: 'json' }).catch(() => null);
    const customer = await store.get(`allow/ip/${enc(c.ip)}`, { type: 'json' }).catch(() => null);
    const dk = decs.filter(k => k.endsWith(`_${enc(c.ip)}`) && Math.abs(Number(k.slice(4, 17)) - c.t) < 5000).pop();
    const decision = dk ? await store.get(dk, { type: 'json' }).catch(() => null) : null;
    const net = networkOf(c.ip);
    const attackerNet = !!net && (await store.list({ prefix: `off/net/${enc(net)}/` })).blobs.length > 0;
    const v = verdict({ decision, beh, customer, attackerNet, sharedNet: classifyNetwork(ni || {}).type === 'relay' });
    const ad = ads[r.cid];
    rows.push({
      cidHash: c.cidHash, t: c.t, time: hms(c.t).slice(0, 5), timeFull: hms(c.t), ip: c.ip,
      network: `${shortOperator(ni?.org)}${(r.geo?.city || ni?.city) ? ', ' + (r.geo?.city || ni?.city) : ''}`,
      operatorFull: ni?.org || '', device: describeDevice(r.ua).split(' cu ')[1]?.split(',')[0] || describeDevice(r.ua),
      deviceFull: describeDevice(r.ua), page: r.path, reloads: c.requests - 1,
      behaviour: beh ? `${Math.round(beh.dwell / 1000)} s, ${beh.scroll}%${beh.inter ? `, ${beh.inter} atingeri` : ''}` : 'fără semnal',
      keyword: ad?.keyword || '', campaign: ad?.campaign || '', icon: v.icon, verdict: v.text,
      reasons: decision?.level && decision.level !== 'log' ? decision.reasons.slice(0, 3) : [],
    });
  }
  return rows;
}

const escHtml = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Link to the clicks table page; creates the secret token on first use. */
export async function clicksTableUrl(store, siteUrl = 'https://perfektsauberservice.com') {
  let cfg = await store.get('cfg/clicks-token', { type: 'json' }).catch(() => null);
  if (!cfg?.token) {
    cfg = { token: [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join(''), t: Date.now() };
    await store.setJSON('cfg/clicks-token', cfg);
  }
  return `${siteUrl}/af-clicks/${cfg.token}`;
}

/** Telegram card (HTML) for one click row. */
export function clickCard(r) {
  return [
    `${r.icon} <b>Clic nou din reclame · ${escHtml(r.time)}</b>`,
    `<b>Concluzie:</b> ${escHtml(r.verdict)}`,
    `<b>IP:</b> ${escHtml(r.ip)}`,
    `<b>Rețea, loc:</b> ${escHtml(r.network)}`,
    `<b>Dispozitiv:</b> ${escHtml(r.deviceFull)}`,
    `<b>Pe pagină:</b> ${escHtml(r.behaviour)}${r.reloads ? ', apoi reîncărcare' : ''} (${escHtml(r.page)})`,
    `<b>Cuvânt cheie:</b> ${escHtml(r.keyword || 'încă neconfirmat de Google')}${r.campaign ? ` · ${escHtml(r.campaign)}` : ''}`,
    ...(r.reasons.length ? [`<b>Motive:</b> ${escHtml(r.reasons.join(' · '))}`] : []),
  ].join('\n');
}

/** Send one card per new click (>= minAgeMs old so the behaviour signal is in), each click once. */
export async function clickCards({ store, client, sendHtml, day, now = Date.now(), minAgeMs = 60e3, max = 15 }) {
  const rows = (await clickRows({ store, client, day })).filter(r => now - r.t >= minAgeMs);
  const url = await clicksTableUrl(store);
  let sent = 0;
  for (const r of rows) {
    if (sent >= max) break;
    const w = await store.setJSON(`click/sent/${r.cidHash}`, { t: now }, { onlyIfNew: true });
    if (w?.modified === false) continue;
    await sendHtml(clickCard(r), [{ text: '📊 Tabelul de azi', url }]);
    sent++;
  }
  return { clicks: sent };
}
