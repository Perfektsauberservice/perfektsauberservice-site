import test from 'node:test';
import assert from 'node:assert/strict';
import { processClick, sha256Hex, canonical } from '../netlify/antifraud/pipeline.mjs';
import { memoryStore } from './helpers/memory-store.mjs';


const T0 = Date.UTC(2026, 9, 14, 15, 0, 0);
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
const INFO = { '94.134.182.67': { org: 'AS8881 1&1 Versatel Deutschland GmbH', country: 'DE', city: 'Karlsruhe' },
  '47.82.201.10': { org: 'AS45102 Alibaba (US) Technology Co., Ltd.', country: 'SG', city: 'Singapore' } };

function setup() {
  const store = memoryStore(); const sent = []; let lookups = 0; let clock = T0;
  const deps = { store, mode: 'shadow', allowlist: [], now: () => clock,
    lookup: async ip => { lookups++; return INFO[ip] || {}; }, notify: async t => { sent.push(t); } };
  // neutral behaviour beacon for every click (6 s, some scroll, no touch): neither "dead" nor clearly human
  const click = async (i, over = {}) => {
    const ev = { t: T0 + i * 60e3, ip: '94.134.182.67', cid: `gclid-${i}`, cidType: 'gclid',
      path: '/entruempelung-rastatt', ua: UA, lang: 'de-DE', geo: { country: 'DE', subdivision: 'BW', city: 'Karlsruhe' }, fp: 'fp1', ...over };
    const r = await processClick(deps, ev);
    if (!over.noBeacon) await store.setJSON(`beh/${ev.ip.replace(/:/g, 'x')}/${(await sha256Hex(ev.cid)).slice(0, 16)}`, over.beh || { t: ev.t, dwell: 6000, scroll: 20, inter: 0 });
    return r;
  };
  return { store, sent, deps, click, lookups: () => lookups };
}

test('burst: alert at click 2, exclusion at click 3, one proposal and no duplicate alerts', async () => {
  const s = setup(); const levels = [];
  for (let i = 0; i < 6; i++) levels.push((await s.click(i)).decision.level);
  assert.deepEqual(levels, ['log', 'analyze', 'recommend_exclude', 'recommend_exclude', 'recommend_exclude', 'recommend_exclude']);
  const pending = (await s.store.list({ prefix: 'rec/pending/' })).blobs;
  assert.equal(pending.length, 1);
  const rec = await s.store.get(pending[0].key, { type: 'json' });
  assert.equal(rec.proposal.cidr, '94.134.182.67/32'); assert.equal(rec.mode, 'shadow');
  // one Telegram alert per level per 10-minute slot (no spam)
  assert.equal(s.sent.length, 2);
  assert.match(s.sent[1], /EXCLUDERE RECOMANDATĂ[\s\S]*NU s-a aplicat \(mod umbră\)/);
});

test('network info is looked up once and cached', async () => {
  const s = setup();
  for (let i = 0; i < 3; i++) await s.click(i);
  assert.equal(s.lookups(), 1);
});

test('every raw event is stored with a verifiable SHA-256 of its original content', async () => {
  const s = setup(); await s.click(0);
  const key = [...s.store.m.keys()].find(k => k.startsWith('ev/'));
  const rec = JSON.parse(s.store.m.get(key)); const { sha256, ...raw } = rec;
  assert.equal(await sha256Hex(canonical(raw)), sha256);
  assert.equal(rec.cid, 'gclid-0'); assert.equal(rec.network, '94.134.182.0/24');
});

test('cross-day: an IP flagged yesterday is escalated faster today', async () => {
  const s = setup();
  for (let i = 0; i < 6; i++) await s.click(i);
  const nextDay = 24 * 60;  // minutes
  const r = [];
  for (let i = 0; i < 3; i++) r.push((await s.click(nextDay + i * 2)).decision);
  assert.equal(r[2].level, 'recommend_exclude');
  assert.ok(r[2].reasons.some(x => x.includes('cross-day')));
});

test('rotating IPs with the same device are linked', async () => {
  const s = setup();
  const ips = ['176.7.204.123', '176.7.204.123', '176.7.208.68', '176.7.208.68', '176.7.201.161'];
  let last;
  for (let i = 0; i < ips.length; i++) last = await s.click(i * 300, { ip: ips[i], fp: 'same-phone' });
  assert.ok(last.decision.reasons.some(x => x.includes('IP rotation')));
});

test('datacenter visitor abroad is proposed for exclusion after 3 clicks', async () => {
  const s = setup(); let r;
  for (let i = 0; i < 3; i++) r = await s.click(i, { ip: '47.82.201.10', geo: { country: 'SG' }, fp: 'dc' });
  assert.equal(r.decision.level, 'recommend_exclude');
});

test('one exclusion proposal per IP even if the burst continues', async () => {
  const s = setup();
  for (let i = 0; i < 9; i++) await s.click(i);
  assert.equal((await s.store.list({ prefix: 'rec/pending/' })).blobs.length, 1);
});

test('parallel requests of one burst still create one proposal and one alert per level', async () => {
  const s = setup();
  await s.click(0); await s.click(1);
  await Promise.all([2, 3, 4, 5].map(i => s.click(i)));
  assert.equal((await s.store.list({ prefix: 'rec/pending/' })).blobs.length, 1);
  assert.equal(s.sent.filter(t => t.includes('EXCLUDERE')).length, 1);
});

test('behaviour: a previous ad visit with no human activity makes the 2nd click an exclusion', async () => {
  const s = setup();
  await s.click(0, { beh: { t: T0, dwell: 1200, scroll: 0, inter: 0 } });
  const r = await s.click(1);
  assert.equal(r.decision.level, 'recommend_exclude');
  assert.ok(r.decision.reasons.some(x => x.includes('without any human activity')));
});

test('behaviour: no beacon at all after 20 s counts as no human activity', async () => {
  const s = setup();
  await s.click(0, { noBeacon: true });
  assert.equal((await s.click(1)).decision.level, 'recommend_exclude');
});

test('behaviour: human-looking previous visits raise the threshold by 1 (customer comparing offers)', async () => {
  const s = setup(); const human = { t: T0, dwell: 45000, scroll: 70, inter: 6 };
  const levels = []; for (let i = 0; i < 4; i++) levels.push((await s.click(i, { beh: human })).decision.level);
  assert.deepEqual(levels, ['log', 'analyze', 'analyze', 'recommend_exclude']);   // 4th click, not 3rd
});

test('trap: an IP that requested the invisible trap link is excluded at its first paid click', async () => {
  const s = setup();
  await s.store.setJSON(`trap/94.134.182.67/${String(T0 - 3600e3).padStart(13, '0')}`, { t: T0 - 3600e3, ua: 'x' });
  const r = await s.click(0);
  assert.equal(r.decision.level, 'recommend_exclude');
  assert.ok(r.decision.reasons.some(x => x.includes('trap')));
});

test('processing time per click stays well under one second with a local store', async () => {
  const s = setup(); const r = await s.click(0);
  assert.ok(r.timings.done - r.timings.start < 1000);
});
