// PSS Anti-Fraud — scheduled safety net (every 5 minutes, production only; no PC needed).
// Each run stays well under Netlify's ~30 s limit:
//   * always: leftover exclusion proposals, approved rotations, edge errors
//   * hourly: spend anomaly check
//   * every 6 h, and only if a list is >= 450: rotation proposal with Telegram buttons
//   * once a day after 20:30 Berlin: daily summary (+ zones; Monday threshold check) — in a run of its own
import { adsClient } from '../../agent/antifraud/ads-exclusions.mjs';
import { processProposals, processRotationDecisions, proposeRotation, spendCheck, healthCheck, purge } from '../../agent/antifraud/runner.mjs';
import { adsEnvFromNetlify, storeFor, enforceFor, notifier } from '../antifraud/server.mjs';

const every = async (store, key, ms, fn) => {
  const last = (await store.get(`cron/${key}`, { type: 'json' }).catch(() => null))?.t || 0;
  if (Date.now() - last < ms) return null;
  await store.setJSON(`cron/${key}`, { t: Date.now() });
  return fn(last);
};

export default async (req, context) => {
  const store = storeFor(context);
  const { env, missing } = adsEnvFromNetlify();
  const { notify, send } = notifier(context);
  const log = { t: Date.now(), steps: [] };
  try {
    if (missing.length) throw new Error(`missing env ${missing.join(', ')}`);
    const client = adsClient(env);
    const enforce = enforceFor(context);

    const now = new Date();
    const hm = now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour12: false }).slice(0, 5);
    const today = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    if (hm >= '20:30' && (await store.setJSON(`cron/summary/${today}`, { t: Date.now() }, { onlyIfNew: true }))?.modified !== false) {
      const ins = await import('../../agent/antifraud/insights.mjs');
      let msg = await ins.summary({ client, store, day: today });
      const z = await ins.zones({ client, store, days: 7 }).catch(() => null);
      if (z) msg += `\n🗺️ ${z.proposal}`;
      if (now.toLocaleDateString('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }) === 'Mon') {
        const tu = await ins.tune({ client, store, days: 7 }).catch(() => null);
        if (tu) msg += `\n🎚️ ${tu.advice}`;
      }
      await notify(msg);
      log.steps.push('summary');
    } else {
      const done = await processProposals({ store, client, notify, enforce, ledgerPath: null, executor: 'netlify-cron' });
      log.steps.push(`proposals:${done.length}`);
      const rot = await processRotationDecisions({ store, client, notify, enforce });
      log.steps.push(`rotations:${rot.length}`);
      await every(store, 'health', 15 * 60e3, since => healthCheck({ store, notify, since }));
      await every(store, 'spend', 60 * 60e3, () => spendCheck({ client, notify }));
      await every(store, 'purge', 24 * 3600e3, () => purge(store));
      const full = done.some(d => (d.executor?.plan || []).some(p => p.action === 'capacity_full'));
      const counts = await client.search("SELECT campaign.name, campaign_criterion.criterion_id FROM campaign_criterion WHERE campaign_criterion.type = 'IP_BLOCK' AND campaign.status != 'REMOVED'");
      const per = counts.reduce((m, r) => (m[r.campaign.name] = (m[r.campaign.name] || 0) + 1, m), {});
      const fullest = Math.max(0, ...Object.values(per));
      if (full || fullest >= 450) await every(store, 'rotation', full ? 0 : 6 * 3600e3, () => proposeRotation({ store, client, send }));
      log.steps.push(`fullest:${fullest}`);
    }
    await store.setJSON('health/af-cron', { ...log, ms: Date.now() - log.t, ok: true });
  } catch (e) {
    await store.setJSON('health/af-cron', { ...log, ms: Date.now() - log.t, ok: false, error: String(e).slice(0, 300) });
    await store.setJSON(`health/error/${Date.now()}`, { t: Date.now(), error: `af-cron: ${String(e).slice(0, 300)}` });
  }
  return new Response('ok');
};

export const config = { schedule: '*/5 * * * *' };
