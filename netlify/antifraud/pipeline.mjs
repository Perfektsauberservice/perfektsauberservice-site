// PSS Anti-Click-Fraud — processing pipeline for one ad-click visit.
// Storage is any Netlify-Blobs-compatible store: get(key,{type:'json'}),
// setJSON(key,value), list({prefix}) -> {blobs:[{key}]}. Keys are append-only
// so bursts of parallel requests never overwrite each other.

import { evaluate } from './engine.mjs';
import { networkOf } from './ip.mjs';
import { RULES } from './config.mjs';

// Blob keys: no '%' escapes (Netlify Blobs decodes them back to '/').
// Reversible mapping: '/' -> '-', ':' -> 'x' (neither appears in IPs/CIDRs/hex).
/** Mark an IP as a real customer (phone/WhatsApp click or form). Called by the lead functions. */
// strength 'form'    = submitted the contact form -> never excluded (30 days)
// strength 'contact' = tapped phone/WhatsApp/e-mail -> exclusion threshold +2 for 24 h (a tap alone
//                      must not buy immunity: anyone can trigger it)
export async function markCustomer(store, ip, reason, page = '', strength = 'contact', gclid = '') {
  // ad click -> real customer link (weekly report: customers per campaign / keyword / place)
  if (gclid) await store.setJSON(`lead/${(await sha256Hex(String(gclid))).slice(0, 24)}`, { t: Date.now(), gclid: String(gclid).slice(0, 200), reason, strength });
  if (!ip) return !!gclid;
  const key = `allow/ip/${enc(ip)}`;
  const prev = await store.get(key, { type: 'json' }).catch(() => null);
  if (prev?.strength === 'form' && strength !== 'form') return true;   // never downgrade
  await store.setJSON(key, { t: Date.now(), reason, strength, page: String(page).slice(0, 120) });
  return true;
}

export const enc = s => String(s).replace(/\//g, '-').replace(/:/g, 'x');
export const dec = s => String(s).replace(/-/g, '/').replace(/x/g, ':');

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function canonical(obj) {
  if (Array.isArray(obj)) return '[' + obj.map(canonical).join(',') + ']';
  if (obj && typeof obj === 'object') return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
  return JSON.stringify(obj);
}

// Index key: <prefix>/<entity>/<13-digit ts>_<ip>_<cid hash>
async function indexed(store, prefix, entity, sinceMs) {
  const { blobs } = await store.list({ prefix: `${prefix}/${enc(entity)}/` });
  return blobs.map(b => {
    const [ts, ip, cid] = b.key.split('/').pop().split('_');
    return { t: Number(ts), ip: dec(ip), cid };
  }).filter(x => x.t >= sinceMs);
}

export async function getNetinfo(store, ip, lookup, now) {
  const key = `netinfo/${enc(ip)}`;
  const cached = await store.get(key, { type: 'json' }).catch(() => null);
  if (cached && now - cached.fetchedAt < RULES.retentionDays * 864e5) return cached;
  try {
    const info = await lookup(ip);
    const rec = { ...info, fetchedAt: now };
    await store.setJSON(key, rec);
    return rec;
  } catch (e) {
    return { error: String(e).slice(0, 120), fetchedAt: now };
  }
}

/**
 * @param deps { store, lookup(ip)->ipinfo json, notify(text)->Promise, now()->ms, mode:'shadow'|'enforce', allowlist:[] }
 * @param event { t, ip, cid, cidType, path, query, ua, lang, geo, fp, requestId, referer, context }
 */
export async function processClick(deps, event) {
  const timings = { start: deps.now() };
  const { store } = deps;
  const net = networkOf(event.ip);
  const cidHash = (await sha256Hex(event.cid)).slice(0, 16);
  const ts = String(event.t).padStart(13, '0');

  // 1) raw evidence record (original data + integrity hash)
  const raw = { ...event, network: net, cidHash, schema: 'pss-af-event-v1' };
  const rawHash = await sha256Hex(canonical(raw));
  const day = new Date(event.t).toISOString().slice(0, 10);
  await store.setJSON(`ev/${day}/${ts}_${enc(event.ip)}_${cidHash}`, { ...raw, sha256: rawHash });
  // 2) correlation indexes
  const row = `${ts}_${enc(event.ip)}_${cidHash}`;
  await Promise.all([
    store.setJSON(`ix/ip/${enc(event.ip)}/${row}`, 1),
    net && store.setJSON(`ix/net/${enc(net)}/${row}`, 1),
    event.fp && store.setJSON(`ix/fp/${enc(event.fp)}/${row}`, 1),
  ]);
  timings.stored = deps.now();
  if (event.context === 'production') store.setJSON('health/live-since', { t: event.t }, { onlyIfNew: true }).catch(() => {});

  // 3) history + network info
  const since = event.t - RULES.lookbackMs;
  const [ipH, netH, fpH, offIp, offFp, offNet, info, customer, behKeys, trapKeys] = await Promise.all([
    indexed(store, 'ix/ip', event.ip, since),
    net ? indexed(store, 'ix/net', net, since) : [],
    event.fp ? indexed(store, 'ix/fp', event.fp, since) : [],
    store.get(`off/ip/${enc(event.ip)}`, { type: 'json' }).catch(() => null),
    event.fp ? store.get(`off/fp/${enc(event.fp)}`, { type: 'json' }).catch(() => null) : null,
    net ? store.list({ prefix: `off/net/${enc(net)}/` }).then(r => r.blobs.map(b => dec(b.key.split('/').pop()))) : [],
    getNetinfo(store, event.ip, deps.lookup, event.t),
    store.get(`allow/ip/${enc(event.ip)}`, { type: 'json' }).catch(() => null),   // real customer (call / WhatsApp / form)
    store.list({ prefix: `beh/${enc(event.ip)}/` }).then(r => r.blobs).catch(() => []),
    store.list({ prefix: `trap/${enc(event.ip)}/` }).then(r => r.blobs).catch(() => []),
  ]);
  timings.loaded = deps.now();

  // 4) evaluate (the current click is part of the history)
  const history = {
    ip: ipH.map(x => ({ t: x.t, cid: x.cid })),
    net: netH, fp: fpH,
    offenders: { ip: !!offIp, fp: !!offFp, netIps: offNet },
  };
  // behaviour of the previous ad visits from this IP (last 10 min) + trap hits (last 24 h)
  const behavior = { dead: 0, alive: 0 };
  const prior = [...new Map(ipH.filter(x => x.cid !== cidHash && event.t - x.t <= RULES.evaluateWindowMs).map(x => [x.cid, x])).values()];
  const behByCid = new Map(behKeys.map(b => [b.key.split('/').pop(), b.key]));
  for (const p of prior) {
    const bk = behByCid.get(p.cid);
    const b = bk ? await store.get(bk, { type: 'json' }).catch(() => null) : null;
    if (b) { if (b.dwell < RULES.deadDwellMs && !b.inter && b.scroll < 10) behavior.dead++; else if (b.inter > 0 || b.dwell >= 10000) behavior.alive++; }
    else if (event.t - p.t > RULES.beaconGraceMs) behavior.dead++;
  }
  const trap = trapKeys.some(b => event.t - Number(b.key.split('/').pop()) < 864e5);

  const formCustomer = customer && customer.strength === 'form' && event.t - customer.t < 30 * 864e5;
  const contactCustomer = customer && !formCustomer && event.t - customer.t < 864e5;
  const allowlist = formCustomer ? [...(deps.allowlist || []), event.ip] : deps.allowlist;
  const verdict = evaluate({ ...event, cid: cidHash }, history, info, { allowlist, extraClicks: contactCustomer ? 2 : 0, behavior, trap });
  if (formCustomer) verdict.reasons = [`real customer: form sent from this IP (${new Date(customer.t).toLocaleDateString('de-DE')}) — never excluded`];
  else if (contactCustomer) verdict.reasons.push(`contact click (${customer.reason}) from this IP in the last 24 h — exclusion threshold +2`);
  timings.evaluated = deps.now();

  // 5) persist decision; offenders + proposals feed cross-day correlation and the executor
  const decision = { t: event.t, ip: event.ip, network: net, cidHash, path: event.path, level: verdict.level,
    score: verdict.score, reasons: verdict.reasons, proposal: verdict.proposal, net: verdict.net,
    counts: verdict.counts, signature: verdict.signature, mode: deps.mode, evidence: `ev/${day}/${ts}_${enc(event.ip)}_${cidHash}` };
  if (['analyze', 'evaluate', 'recommend_exclude'].includes(verdict.level)) {
    await store.setJSON(`dec/${ts}_${enc(event.ip)}`, decision);
  }
  if (verdict.level === 'recommend_exclude') {
    await Promise.all([
      store.setJSON(`off/ip/${enc(event.ip)}`, { t: event.t, score: verdict.score }),
      event.fp && store.setJSON(`off/fp/${enc(event.fp)}`, { t: event.t, ip: event.ip }),
      net && store.setJSON(`off/net/${enc(net)}/${enc(event.ip)}`, { t: event.t }),
      // exactly one proposal per IP / range, even with parallel requests (atomic create-only marker)
      store.setJSON(`rec/seen/${enc(verdict.proposal.cidr)}`, { t: event.t }, { onlyIfNew: true }).then(async w => {
        if (!(w?.modified ?? true)) return;
        await store.setJSON(`rec/pending/${enc(verdict.proposal.cidr)}`, { ...decision, status: 'pending' });
        timings.queued = deps.now();
        if (deps.trigger) await deps.trigger().catch(() => {});   // Netlify executor; the 5-min cron is the safety net
      }),
    ]);
  }
  timings.persisted = deps.now();

  // 6) Telegram alert for anything above plain logging (deduplicated per IP+level per 10 min)
  let alerted = false;
  if (decision.level !== 'log' && decision.level !== 'ignore' && deps.notify) {
    const slot = Math.floor(event.t / 600e3);
    const dkey = `alert/${enc(event.ip)}/${decision.level}/${slot}`;
    const w = await store.setJSON(dkey, 1, { onlyIfNew: true });   // atomic: parallel requests alert once
    if (w?.modified ?? true) {
      await deps.notify(formatAlert(decision, event), decision);
      alerted = true;
    }
  }
  timings.done = deps.now();
  return { decision, timings, alerted };
}

const LEVEL_RO = {
  analyze: '🟡 ANALIZĂ', evaluate: '🟠 EVALUARE EXCLUDERE', recommend_exclude: '🔴 EXCLUDERE RECOMANDATĂ',
};

export function formatAlert(d, e) {
  const when = new Date(d.t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  return [
    `${LEVEL_RO[d.level] || d.level} — PSS Anti-Fraud${d.mode === 'shadow' ? ' (MOD UMBRĂ)' : ''}`,
    `🕒 ${when} (Europe/Berlin)`,
    `🌐 IP ${d.ip} · rețea ${d.network || '—'}`,
    `🏢 ${d.net?.asn ? 'AS' + d.net.asn + ' ' : ''}${d.net?.org || 'furnizor necunoscut'} · tip ${d.net?.type || '?'}`,
    `📍 ${[e.geo?.city, e.geo?.subdivision, e.geo?.country].filter(Boolean).join(', ') || '—'} · pagina ${d.path}`,
    `📊 scor ${d.score} · clicuri plătite 5min=${d.counts?.c5} 10min=${d.counts?.c10} 60min=${d.counts?.c60} · reîncărcări ${d.counts?.reloads}`,
    ...d.reasons.map(r => `• ${r}`),
    d.proposal ? (d.mode === 'shadow' ? `➡️ Propunere excludere: ${d.proposal.cidr} — NU s-a aplicat (mod umbră)` : `⛔ Excludere trimisă modulului Google Ads: ${d.proposal.cidr} (confirmarea APLICAT vine separat)`) : '',
  ].filter(Boolean).join('\n');
}
