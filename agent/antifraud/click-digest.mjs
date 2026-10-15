// PSS Anti-Fraud — hourly "new clicks" report for Laura (Telegram), one block per ad click:
// time, IP, operator, place, device, campaign, page, behaviour, what the system decided and why.
import { dec, enc } from '../../netlify/antifraud/pipeline.mjs';
import { isTestIp } from './monitors.mjs';

const fmt = t => new Date(t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
const berlinDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

export function describeDevice(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '?';
  const brand = /SamsungBrowser|SM-[A-Z0-9]+/.test(ua) ? 'Samsung' : /Pixel/.test(ua) ? 'Google Pixel' : /Xiaomi|Redmi|MI \d/.test(ua) ? 'Xiaomi' : /HUAWEI|HONOR/i.test(ua) ? 'Huawei/Honor' : '';
  const browser = /SamsungBrowser/.test(ua) ? 'browserul Samsung' : /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'browser necunoscut';
  const kind = /Mobile|iPhone|Android/.test(ua) && !/iPad|Tablet/.test(ua) ? 'telefon' : /iPad|Tablet/.test(ua) ? 'tabletă' : 'calculator';
  return `${kind}${brand ? ' ' + brand : ''} cu ${os}, ${browser}`;
}

function verdict({ decision, beh, customer }) {
  if (customer) return { icon: '📞', text: `client real (${customer.reason}) — nu se exclude` };
  if (decision?.level === 'recommend_exclude') return { icon: '🔴', text: `SUSPECT — exclus (${decision.proposal?.cidr || ''})` };
  if (decision?.level === 'evaluate' || decision?.level === 'analyze') return { icon: '🟡', text: 'de urmărit (clicuri repetate)' };
  if (beh && (beh.inter > 0 || beh.dwell >= 10000)) return { icon: '🟢', text: 'pare om real' };
  if (beh && beh.dwell < 4000 && !beh.inter && beh.scroll < 10) return { icon: '🟠', text: 'fără activitate de om (a plecat imediat)' };
  if (!beh) return { icon: '⚪', text: 'fără semnal din pagină (a închis repede sau nu rulează JavaScript)' };
  return { icon: '🟢', text: 'vizită normală' };
}

export async function clickDigest({ client, store, notify, sinceMs, now = Date.now(), max = 12 }) {
  // first event of each ad click since the last digest
  const clicks = new Map();
  for (const utcDay of new Set([new Date(sinceMs).toISOString().slice(0, 10), new Date(now).toISOString().slice(0, 10)])) {
    for (const b of (await store.list({ prefix: `ev/${utcDay}/` })).blobs) {
      const [ts, ipK, cidHash] = b.key.split('/')[2].split('_');
      const t = Number(ts), ip = dec(ipK);
      if (t < sinceMs || t > now || isTestIp(ip)) continue;
      const c = clicks.get(cidHash);
      if (c) { c.requests++; continue; }
      clicks.set(cidHash, { t, ip, cidHash, key: b.key, requests: 1 });
    }
  }
  const list = [...clicks.values()].sort((a, b) => a.t - b.t);
  const real = [];
  for (const c of list) {
    const rec = await store.get(c.key, { type: 'json' }).catch(() => null);
    if (!rec || /^PSS-LIVE-CHECK/.test(rec.cid || '')) continue;
    real.push({ ...c, rec });
  }
  if (!real.length) return { clicks: 0 };

  // campaign / keyword from Google Ads (click_view by gclid; Ads data can lag a few hours)
  const ads = {};
  for (const day of new Set(real.map(c => berlinDay(c.t)))) {
    try {
      for (const r of await client.search(`SELECT click_view.gclid, campaign.name, click_view.keyword_info.text, metrics.clicks FROM click_view WHERE segments.date = '${day}'`)) ads[r.clickView?.gclid] = { campaign: r.campaign?.name, keyword: r.clickView?.keywordInfo?.text };
    } catch { /* not yet available */ }
  }
  const decs = (await store.list({ prefix: 'dec/' })).blobs.map(b => b.key);
  const blocks = [];
  for (const c of real.slice(0, max)) {
    const r = c.rec;
    const ni = await store.get(`netinfo/${enc(c.ip)}`, { type: 'json' }).catch(() => null);
    const beh = await store.get(`beh/${enc(c.ip)}/${c.cidHash}`, { type: 'json' }).catch(() => null);
    const customer = await store.get(`allow/ip/${enc(c.ip)}`, { type: 'json' }).catch(() => null);
    const dk = decs.filter(k => k.endsWith(`_${enc(c.ip)}`) && Math.abs(Number(k.slice(4, 17)) - c.t) < 5000).pop();
    const decision = dk ? await store.get(dk, { type: 'json' }).catch(() => null) : null;
    const v = verdict({ decision, beh, customer });
    const ad = ads[r.cid];
    const place = [r.geo?.city || ni?.city, r.geo?.subdivision, r.geo?.country || ni?.country].filter(Boolean).join(', ') || '—';
    blocks.push([
      `${v.icon} ${fmt(c.t)} — ${v.text}`,
      `🌐 IP ${c.ip} · ${ni?.org || 'operator necunoscut'}`,
      `📍 ${place} · ${describeDevice(r.ua)}`,
      `📢 ${ad ? `${ad.campaign} · „${ad.keyword || '—'}”` : 'campania: încă neconfirmată de Google Ads'} · pagina ${r.path}${c.requests > 1 ? ` · ${c.requests - 1} reîncărcări` : ''}`,
      `👆 ${beh ? `a stat ${Math.round(beh.dwell / 1000)} s, ${beh.inter} atingeri, derulat ${beh.scroll}%` : 'fără semnal din pagină'}`,
      ...(decision?.reasons?.length && decision.level !== 'log' ? [`🧠 ${decision.reasons.slice(0, 3).join(' · ')}`] : []),
    ].join('\n'));
  }
  const header = `🖱️ PSS Anti-Fraud — clicuri noi din reclame (${fmt(sinceMs).slice(-8, -3)}–${fmt(now).slice(-8, -3)}): ${real.length}`;
  const more = real.length > max ? `\n… și încă ${real.length - max} clicuri (vezi raportul zilnic)` : '';
  await notify(`${header}\n\n${blocks.join('\n\n')}${more}`);
  return { clicks: real.length };
}
