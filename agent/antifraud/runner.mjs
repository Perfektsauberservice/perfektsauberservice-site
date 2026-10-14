// PSS Anti-Click-Fraud — local runner (Laura's always-on PC).
//   node agent/antifraud/runner.mjs loop   [--store test|prod] [--interval 30] [--enforce]
//   node agent/antifraud/runner.mjs once   [--store test|prod]
//   node agent/antifraud/runner.mjs report [--store test|prod] [--hours 24]
//   node agent/antifraud/runner.mjs purge  [--store test|prod]
// Picks up exclusion proposals written by the edge function, sends them to
// Google Ads (validateOnly unless --enforce AND AF_ENFORCE=1), watches spend
// and system health, and sends Telegram alerts.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { getStore } from '@netlify/blobs';
import { adsClient, applyExclusion, loadEnv } from './ads-exclusions.mjs';
import { STORE_NAME, RULES } from '../../netlify/antifraud/config.mjs';

const SITE_ID = '89b24c5c-6d05-4123-9da9-f318deb1e044';
export const DATA_DIR = process.env.AF_DATA_DIR || 'C:/tmp/pss-antifraud-data';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = k => process.argv.includes(`--${k}`);

export function netlifyToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  const cfg = JSON.parse(readFileSync(`${process.env.APPDATA}/netlify/Config/config.json`, 'utf8'));
  return cfg.users[cfg.userId].auth.token;
}
export function openStore(kind = 'test') {
  return getStore({ name: kind === 'prod' ? STORE_NAME : `${STORE_NAME}-test`, siteID: SITE_ID, token: netlifyToken(), consistency: 'strong' });
}

// Telegram credentials come from the PSS Ads agents .env (current token);
// the old google-ads .env still holds a revoked token.
export function telegramEnv(path = process.env.AF_TELEGRAM_ENV || 'C:/tmp/pss-ads-agents/.env') {
  try { const e = loadEnv(path); if (e.TELEGRAM_BOT_TOKEN) return e; } catch { /* fall through */ }
  return loadEnv();
}

export function telegram(env = telegramEnv()) {
  env = { ...env, ...telegramEnv() };
  return async text => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }) });
    const body = await r.json().catch(() => ({}));
    if (!body.ok) throw new Error(`telegram ${r.status} ${body.description || ''}`);
    return body.result?.message_id;
  };
}

/** Process pending exclusion proposals. Returns processed records with reaction times. */
export async function processProposals({ store, client, notify, enforce = false, label = '' }) {
  const { blobs } = await store.list({ prefix: 'rec/pending/' });
  const out = [];
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: 'json' });
    if (!rec) continue;
    let exec;
    try { exec = await applyExclusion(client, rec.proposal.cidr, { enforce, ledgerPath: `${DATA_DIR}/ledger.jsonl` }); }
    catch (e) { exec = { error: String(e).slice(0, 300), doneAt: Date.now() }; }
    const done = { ...rec, status: exec.error ? 'error' : exec.mode, executor: exec, reactionMs: exec.doneAt - rec.t };
    await store.setJSON(b.key.replace('rec/pending/', 'rec/done/'), done);
    await store.delete(b.key);
    out.push(done);
    const plan = (exec.plan || []).map(p => `${p.campaign}: ${{ create: 's-ar adăuga', capacity_full: 'LISTA PLINĂ (500) — rotație necesară, aștept aprobarea', already_excluded: 'deja exclus' }[p.action] || p.action}`).join('\n');
    await notify(`${label}🛡️ PSS Anti-Fraud — modul excludere\n` + (exec.error ? `❌ Eroare Google Ads: ${exec.error}` :
      `${exec.mode === 'enforce' ? '✅ APLICAT' : '🧪 Validat de Google, NEAPLICAT (mod umbră)'}: ${rec.proposal.cidr}\n${plan}\n⏱️ ${Math.round(done.reactionMs / 1000)} s de la clic până la răspunsul Google`));
  }
  return out;
}

/** Spend / click anomaly for today, per hour (Ads data lags ~1-3 h). */
export async function spendCheck({ client, notify, label = '' }) {
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const rows = await client.search(`SELECT segments.hour, metrics.clicks, metrics.cost_micros FROM customer WHERE segments.date = '${day}'`);
  const alerts = rows.filter(r => Number(r.metrics.clicks || 0) >= 7).map(r => `ora ${r.segments.hour}:00 — ${r.metrics.clicks} clicuri, ${(Number(r.metrics.costMicros || 0) / 1e6).toFixed(2)} €`);
  const total = rows.reduce((s, r) => s + Number(r.metrics.costMicros || 0), 0) / 1e6;
  if (alerts.length) await notify(`${label}💸 PSS Anti-Fraud — consum neobișnuit azi (${day})\n${alerts.join('\n')}\nTotal azi: ${total.toFixed(2)} €`);
  return { day, total, alerts };
}

/** Health: errors written by the edge function since the last check. */
export async function healthCheck({ store, notify, since, label = '' }) {
  const { blobs } = await store.list({ prefix: 'health/error/' });
  const fresh = blobs.filter(b => Number(b.key.split('/').pop()) > since);
  if (fresh.length) {
    const e = await store.get(fresh[fresh.length - 1].key, { type: 'json' });
    await notify(`${label}⚠️ PSS Anti-Fraud — defecțiune captare (${fresh.length} erori)\n${String(e?.error).slice(0, 300)}`);
  }
  return fresh.length;
}

export async function purge(store, now = Date.now()) {
  const cutoff = now - RULES.retentionDays * 864e5; let n = 0;
  for (const prefix of ['ev/', 'ix/', 'alert/', 'health/error/', 'dec/']) {
    const { blobs } = await store.list({ prefix });
    for (const b of blobs) {
      const ts = Number((b.key.match(/(\d{13})_/) || b.key.match(/\/(\d{13})$/) || [])[1] || 0);
      const day = b.key.match(/^ev\/(\d{4}-\d{2}-\d{2})\//)?.[1];
      const t = ts || (day ? Date.parse(day) : 0) || (prefix === 'alert/' ? Number(b.key.split('/').pop()) * 600e3 : 0);
      if (t && t < cutoff) { await store.delete(b.key); n++; }
    }
  }
  return n;
}

export async function report(store, hours = 24) {
  const since = Date.now() - hours * 3600e3;
  const decs = [];
  for (const b of (await store.list({ prefix: 'dec/' })).blobs) {
    if (Number(b.key.slice(4, 17)) >= since) decs.push(await store.get(b.key, { type: 'json' }));
  }
  const done = [];
  for (const b of (await store.list({ prefix: 'rec/done/' })).blobs) { const r = await store.get(b.key, { type: 'json' }); if (r.t >= since) done.push(r); }
  const events = (await store.list({ prefix: 'ev/' })).blobs.filter(b => Number(b.key.split('/')[2].slice(0, 13)) >= since);
  const byIp = {};
  for (const d of decs) { const x = byIp[d.ip] ||= { ip: d.ip, network: d.network, asn: d.net?.asn, org: d.net?.org, type: d.net?.type, maxScore: 0, levels: new Set(), last: 0 }; x.maxScore = Math.max(x.maxScore, d.score); x.levels.add(d.level); x.last = Math.max(x.last, d.t); }
  const fmt = t => new Date(t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const lines = [`# PSS Anti-Fraud — raport ultimele ${hours} h (generat ${fmt(Date.now())})`, '',
    `- Vizite din reclame captate: **${events.length}**`, `- Decizii peste nivelul „log”: **${decs.length}**`, `- Propuneri de excludere procesate: **${done.length}**`, '',
    '| IP | Rețea | Furnizor | Tip | Scor max | Niveluri | Ultima dată |', '|---|---|---|---|---|---|---|',
    ...Object.values(byIp).sort((a, b) => b.maxScore - a.maxScore).map(x => `| ${x.ip} | ${x.network} | ${x.asn ? 'AS' + x.asn + ' ' : ''}${x.org || ''} | ${x.type} | ${x.maxScore} | ${[...x.levels].join(', ')} | ${fmt(x.last)} |`),
    '', '## Excluderi', '| Interval | Mod | Reacție (s) | Plan |', '|---|---|---|---|',
    ...done.map(r => `| ${r.proposal.cidr} | ${r.status} | ${Math.round(r.reactionMs / 1000)} | ${(r.executor.plan || []).map(p => p.campaign.replace(/\|/g, '·') + ': ' + p.action).join('; ')} |`)];
  return lines.join('\n');
}

/** Telegram message with inline buttons (rotation approval). */
export function telegramButtons() {
  const env = telegramEnv();
  return async (text, buttons) => {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true, reply_markup: { inline_keyboard: [buttons] } }) });
    const body = await r.json().catch(() => ({}));
    if (!body.ok) throw new Error(`telegram ${r.status} ${body.description || ''}`);
    return body.result?.message_id;
  };
}

/** 5) Rotation: when a campaign list is near the 500 limit, ask Laura (buttons) to remove the weakest entries. */
export async function proposeRotation({ store, client, send, label = '', threshold = 450, count = 50, plan = null }) {
  if ((await store.list({ prefix: 'rot/pending/' })).blobs.length) return null;          // one open proposal at a time
  const { planRotation } = await import('./rotation.mjs');
  const { rows, perCampaign } = plan || await planRotation(client, store);
  const fullest = Math.max(0, ...Object.values(perCampaign));
  if (fullest < threshold) return { skipped: true, fullest };
  const pick = rows.filter(r => r.keep < 30).slice(0, count);
  if (!pick.length) return { skipped: true, fullest, reason: 'no weak entries' };
  const id = Date.now().toString(36);
  const criteria = pick.flatMap(r => r.criteria.map(c => c.resourceName));
  await store.setJSON(`rot/pending/${id}`, { id, t: Date.now(), ips: pick.map(r => r.ip), criteria, fullest });
  const types = pick.reduce((m, r) => (m[r.type] = (m[r.type] || 0) + 1, m), {});
  await send(`${label}♻️ PSS Anti-Fraud — rotație listă IP (cea mai plină campanie: ${fullest}/500)\n` +
    `Propun scoaterea a ${pick.length} IP-uri slabe (${Object.entries(types).map(([k, v]) => `${v} ${k}`).join(', ')}), de pe ${criteria.length} poziții.\n` +
    `Exemple: ${pick.slice(0, 5).map(r => `${r.ip} (${r.country || '?'} ${r.org || ''})`).join('; ')}\n` +
    `Lista completă: C:\\tmp\\pss-antifraud-data\\rotation-${id}.csv`, [
    { text: '✅ Aprob scoaterea', callback_data: `afrot:${id}:y` }, { text: '❌ Nu', callback_data: `afrot:${id}:n` }]);
  writeFileSync(`${DATA_DIR}/rotation-${id}.csv`, '\ufeffip;keep;type;country;org;why\n' + pick.map(r => [r.ip, r.keep, r.type, r.country, `"${r.org}"`, `"${r.why}"`].join(';')).join('\n') + '\n');
  return { id, count: pick.length, criteria: criteria.length };
}

/** Execute approved rotations (removes only the criteria listed in the approved proposal). */
export async function processRotationDecisions({ store, client, notify, enforce = false, label = '' }) {
  const { assertOnlyIpBlockOps } = await import('./ads-exclusions.mjs');
  const done = [];
  for (const b of (await store.list({ prefix: 'rot/pending/' })).blobs) {
    const p = await store.get(b.key, { type: 'json' }); if (!p) continue;
    const d = await store.get(`rot/decision/${p.id}`, { type: 'json' });
    if (!d) {
      if (Date.now() - p.t > 48 * 3600e3) { await store.setJSON(`rot/done/${p.id}`, { ...p, status: 'expired' }); await store.delete(b.key); await notify(`${label}⌛ Rotația ${p.id} a expirat fără răspuns. Nu s-a scos nimic.`); }
      continue;
    }
    let status = 'rejected', error = null;
    if (d.approved) {
      try {
        const ops = p.criteria.map(rn => ({ remove: rn }));
        assertOnlyIpBlockOps(ops, new Set(p.criteria));
        for (let i = 0; i < ops.length; i += 500) await client.call('campaignCriteria:mutate', { operations: ops.slice(i, i + 500), validateOnly: !enforce, partialFailure: true });
        status = enforce ? 'removed' : 'validated_only';
      } catch (e) { status = 'error'; error = String(e).slice(0, 300); }
    }
    await store.setJSON(`rot/done/${p.id}`, { ...p, decision: d, status, error, doneAt: Date.now() });
    await store.delete(b.key);
    if (d.approved) await notify(`${label}♻️ Rotația ${p.id}: ${status === 'removed' ? `✅ scoase ${p.ips.length} IP-uri (${p.criteria.length} poziții)` : status === 'validated_only' ? '🧪 validată, NEAPLICATĂ (mod umbră)' : '❌ eroare: ' + error}`);
    done.push({ id: p.id, status });
  }
  return done;
}

async function main() {
  const cmd = process.argv[2] || 'once';
  const kind = arg('store', 'test');
  const store = openStore(kind);
  const env = loadEnv();
  const notify = telegram(env);
  const label = kind === 'prod' ? '' : '[TEST] ';
  mkdirSync(DATA_DIR, { recursive: true });
  if (cmd === 'report') { const md = await report(store, Number(arg('hours', 24))); writeFileSync(`${DATA_DIR}/report-${kind}.md`, md); console.log(md); return; }
  if (cmd === 'purge') { console.log('purged', await purge(store)); return; }
  const client = adsClient(env);
  const enforce = flag('enforce');
  let lastHealth = Date.now() - 3600e3, lastSpend = 0, lastPurge = 0, lastRotation = 0, lastSummaryDay = null;
  const send = telegramButtons();
  do {
    const t = Date.now();
    try {
      const done = await processProposals({ store, client, notify, enforce, label });
      if (done.length) console.log(new Date().toISOString(), 'processed', done.map(d => `${d.proposal.cidr} ${d.status} ${d.reactionMs}ms`).join(', '));
      if (t - lastHealth > 15 * 60e3) { await healthCheck({ store, notify, since: lastHealth, label }); lastHealth = t; }
      if (kind === 'prod' && t - lastSpend > 60 * 60e3) { await spendCheck({ client, notify, label }); lastSpend = t; }
      if (t - lastPurge > 24 * 3600e3) { await purge(store); lastPurge = t; }
      await processRotationDecisions({ store, client, notify, enforce, label });
      const full = done.some(d => (d.executor?.plan || []).some(p => p.action === 'capacity_full'));
      if (kind === 'prod' && (full || t - lastRotation > 6 * 3600e3)) { await proposeRotation({ store, client, send, label }); lastRotation = t; }
      // daily summary at 20:30 Berlin (+ zones; Monday also threshold check)
      const now = new Date(t); const hm = now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour12: false }).slice(0, 5);
      const today = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
      if (kind === 'prod' && hm >= '20:30' && lastSummaryDay !== today) {
        const ins = await import('./insights.mjs');
        const z = await ins.zones({ client, store, days: 14 }).catch(() => null);
        let msg = await ins.summary({ client, store, day: today });
        if (z) msg += `
🗺️ ${z.proposal}`;
        if (now.toLocaleDateString('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }) === 'Mon') { const tu = await ins.tune({ client, store, days: 7 }).catch(() => null); if (tu) msg += `
🎚️ ${tu.advice}`; }
        await notify(msg); lastSummaryDay = today;
      }
      await store.setJSON('health/runner', { t, kind, enforce });
    } catch (e) {
      console.error(e); await notify(`${label}⚠️ PSS Anti-Fraud — runner error: ${String(e).slice(0, 300)}`).catch(() => {});
    }
    if (cmd !== 'loop') break;
    await new Promise(r => setTimeout(r, Number(arg('interval', 30)) * 1000));
  } while (true);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main();
