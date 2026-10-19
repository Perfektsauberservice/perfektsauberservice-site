// PSS Anti-Fraud — scheduled safety net (every 5 minutes, production only; no PC needed).
// Each run stays well under Netlify's ~30 s limit:
//   * always: leftover exclusion proposals, approved rotations, edge errors,
//     abuse-evidence dossier for each newly excluded IP (sent to Laura on Telegram, never to an ISP)
//   * hourly: spend anomaly check
//   * every 6 h, and only if a list is >= 450: rotation proposal with Telegram buttons
//   * every 15 min: ghost clicks / capture-broken check (finished hours); hourly: foreign API writes to IP lists
//   * daily: expiry of own mobile-IP exclusions (45 days)
//   * once a day after 20:30 Berlin: daily summary (+ zones; Monday threshold check) — in a run of its own
//   * Monday after 09:00: weekly report + Google refund evidence pack — in a run of its own
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
  const { notify, notifyTeam, send, sendDocument } = notifier(context, store);
  const log = { t: Date.now(), steps: [] };
  try {
    if (missing.length) throw new Error(`missing env ${missing.join(', ')}`);
    const client = adsClient(env);
    const enforce = enforceFor(context);
    // Telegram has no webhook: read rotation buttons, recipient approvals and /start requests here
    const { pollTelegram } = await import('../antifraud/telegram-poll.mjs');
    const tg = await pollTelegram({ store, botToken: process.env.TELEGRAM_BOT_TOKEN || globalThis.Netlify?.env?.get?.('TELEGRAM_BOT_TOKEN'),
      ownerChatId: process.env.TELEGRAM_CHAT_ID || globalThis.Netlify?.env?.get?.('TELEGRAM_CHAT_ID') }).catch(e => ({ error: String(e).slice(0, 120) }));
    log.steps.push(`telegram:${tg.updates ?? tg.error}`);

    const now = new Date();
    const hm = now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour12: false }).slice(0, 5);
    const today = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    const isMonday = now.toLocaleDateString('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }) === 'Mon';
    if (isMonday && hm >= '09:00' && (await store.setJSON(`cron/weekly/${today}`, { t: Date.now() }, { onlyIfNew: true }))?.modified !== false) {
      // 10) weekly report + 7) refund evidence pack for Google (sent to Laura, never submitted automatically)
      const mon = await import('../../agent/antifraud/monitors.mjs');
      const ins = await import('../../agent/antifraud/insights.mjs');
      await notifyTeam(await mon.weeklyReport({ client, store }));
      const day = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
      const pack = await ins.refundPack({ client, store, from: day(Date.now() - 7 * 864e5), to: day(Date.now() - 864e5), outRoot: null });
      if (pack.clicks > 0) {
        await notify(`💶 Pachet rambursare Google — ${pack.clicks} clicuri suspecte de la ${pack.ips} IP-uri (${pack.confirmedInAds} confirmate în Google Ads). Formular: https://support.google.com/google-ads/contact/click_quality — copiezi textul din antrag-de.txt și atașezi invalid-clicks.csv. Nu s-a trimis nimic automat.`);
        for (const n of ['antrag-de.txt', 'invalid-clicks.csv', 'manifest.sha256']) await sendDocument(`refund_${day(Date.now())}_${n}`, pack.files[n]);
      }
      // 4) real customers -> Google Ads import file (Laura only; nothing is changed in Google Ads)
      const oc = await import('../../agent/antifraud/offline-conversions.mjs');
      const conv = await oc.offlineConversionsCsv({ store, days: 7 });
      if (conv.count > 0) {
        await notify(`🎯 ${oc.IMPORT_HOWTO}
Fișierul de săptămâna aceasta: ${conv.count} clienți (${conv.forms} formulare).`);
        await sendDocument(`clienti-reali-google-ads_${day(Date.now())}.csv`, conv.csv);
      }
      log.steps.push(`weekly, refund:${pack.clicks}, conversions:${conv.count}`);
    } else if (hm >= '20:30' && (await store.setJSON(`cron/summary/${today}`, { t: Date.now() }, { onlyIfNew: true }))?.modified !== false) {
      const ins = await import('../../agent/antifraud/insights.mjs');
      let msg = await ins.summary({ client, store, day: today });
      const z = await ins.zones({ client, store, days: 7 }).catch(() => null);
      if (z) msg += `\n🗺️ ${z.proposal}`;
      if (now.toLocaleDateString('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }) === 'Mon') {
        const tu = await ins.tune({ client, store, days: 7 }).catch(() => null);
        if (tu) msg += `\n🎚️ ${tu.advice}`;
      }
      await notifyTeam(msg);
      log.steps.push('summary');
    } else {
      // 1b) retro signature check with Google's location (every 30 min) -> queues exclusions processed right below
      const monR = await import('../../agent/antifraud/monitors.mjs');
      await every(store, 'sigretro', 30 * 60e3, () => monR.signatureRetro({ client, store }));
      const done = await processProposals({ store, client, notify: notifyTeam, enforce, ledgerPath: null, executor: 'netlify-cron' });
      log.steps.push(`proposals:${done.length}`);
      const rot = await processRotationDecisions({ store, client, notify, enforce });
      log.steps.push(`rotations:${rot.length}`);
      // PSS Abuse Evidence Reporter: dossier for every IP that was really excluded -> Telegram (never to the ISP)
      const { autoCases } = await import('../../agent/antifraud/abuse-reporter.mjs');
      const cases = await autoCases({ store, client, notify, sendDocument, send, max: 1 });
      log.steps.push(`cases:${cases.length}`);
      await every(store, 'health', 15 * 60e3, since => healthCheck({ store, notify, since }));
      await every(store, 'spend', 60 * 60e3, () => spendCheck({ client, notify }));
      await every(store, 'purge', 24 * 3600e3, () => purge(store));
      const mon = await import('../../agent/antifraud/monitors.mjs');
      await every(store, 'hourly', 15 * 60e3, () => mon.hourlyCheck({ client, store, notify: notifyTeam }));                       // 2) ghost clicks + 3) capture broken
      await every(store, 'foreign', 60 * 60e3, last => mon.foreignWrites({ client, store, notify, sinceMs: last || Date.now() - 2 * 3600e3 }));   // 8)
      await every(store, 'expire', 24 * 3600e3, () => mon.expireMobile({ client, store, notify, enforce }));              // 4)
      // instant report to Laura for EVERY new ad click (Laura 19.10): one message per click, sent once the
      // click is >= 60 s old so the page behaviour signal is included; at most 5-6 minutes after the click
      {
        const cdi = await import('../../agent/antifraud/click-digest.mjs');
        const r = await cdi.clickDigest({ client, store, notify, sinceMs: new Date(`${today}T00:00:00+02:00`).getTime(), max: 20,
          sentPrefix: 'click/sent', perMessage: 1, minAgeMs: 60e3, title: '🖱️ Clic nou din reclame' });
        if (r.clicks) log.steps.push(`click-reports:${r.clicks}`);
      }
      // report of every ad click to the team (Laura + agency): every 4 h, hourly when busy (>= 5 new clicks),
      // final report after 20:10 (campaigns run until 20:00)
      {
        const cd = await import('../../agent/antifraud/click-digest.mjs');
        const dayStart = new Date(`${today}T00:00:00+02:00`).getTime();
        const last = (await store.get('cron/digest-last', { type: 'json' }).catch(() => null))?.t || 0;
        const sinceMs = Math.max(last, dayStart);
        const lastSent = last >= dayStart ? last : dayStart + 8 * 3600e3;          // first report of the day counts from 08:00
        const finalSentToday = !!(await store.get(`cron/digest-final/${today}`).catch(() => null));
        const newClicks = await cd.countNewClicks(store, sinceMs);
        const why = cd.shouldSend({ hm, now: Date.now(), lastSent, newClicks, finalSentToday });
        if (why) {
          const r = await cd.clickDigest({ client, store, notify: notifyTeam, sinceMs, max: 60 });
          await store.setJSON('cron/digest-last', { t: Date.now(), why, clicks: r.clicks });
          if (why === 'final') await store.setJSON(`cron/digest-final/${today}`, { t: Date.now() });
          log.steps.push(`digest:${why}:${r.clicks}`);
        } else if (hm >= '20:10' && !finalSentToday) {
          await store.setJSON(`cron/digest-final/${today}`, { t: Date.now(), clicks: 0 });   // nothing new: no empty message
        }
      }
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
    // Google-side temporary errors are logged, not alarmed (the next run 5 min later retries everything)
    const { isTransientError } = await import('../../agent/antifraud/ads-exclusions.mjs');
    if (isTransientError(e)) await store.setJSON(`health/transient/${Date.now()}`, { t: Date.now(), error: `af-cron: ${String(e).slice(0, 300)}` });
    else await store.setJSON(`health/error/${Date.now()}`, { t: Date.now(), error: `af-cron: ${String(e).slice(0, 300)}` });
  }
  return new Response('ok');
};

export const config = { schedule: '*/5 * * * *' };
