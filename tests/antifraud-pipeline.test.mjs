import test from 'node:test';
import assert from 'node:assert/strict';
import { processClick, sha256Hex, canonical } from '../netlify/antifraud/pipeline.mjs';

export function memoryStore() {
  const m = new Map();
  return {
    m,
    async get(k, o) { if (!m.has(k)) return null; return o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k); },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async list({ prefix }) { return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}

const T0 = Date.UTC(2026, 9, 14, 15, 0, 0);
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
const INFO = { '94.134.182.67': { org: 'AS8881 1&1 Versatel Deutschland GmbH', country: 'DE', city: 'Karlsruhe' },
  '47.82.201.10': { org: 'AS45102 Alibaba (US) Technology Co., Ltd.', country: 'SG', city: 'Singapore' } };

function setup() {
  const store = memoryStore(); const sent = []; let lookups = 0; let clock = T0;
  const deps = { store, mode: 'shadow', allowlist: [], now: () => clock,
    lookup: async ip => { lookups++; return INFO[ip] || {}; }, notify: async t => { sent.push(t); } };
  const click = (i, over = {}) => processClick(deps, { t: T0 + i * 60e3, ip: '94.134.182.67', cid: `gclid-${i}`, cidType: 'gclid',
    path: '/entruempelung-rastatt', ua: UA, lang: 'de-DE', geo: { country: 'DE', subdivision: 'BW', city: 'Karlsruhe' }, fp: 'fp1', ...over });
  return { store, sent, deps, click, lookups: () => lookups };
}

test('burst of 6 paid clicks: analysis at click 2, evaluation at click 4, exclusion proposal at click 6', async () => {
  const s = setup(); const levels = [];
  for (let i = 0; i < 6; i++) levels.push((await s.click(i)).decision.level);
  assert.deepEqual(levels, ['log', 'analyze', 'analyze', 'evaluate', 'evaluate', 'recommend_exclude']);
  const pending = (await s.store.list({ prefix: 'rec/pending/' })).blobs;
  assert.equal(pending.length, 1);
  const rec = await s.store.get(pending[0].key, { type: 'json' });
  assert.equal(rec.proposal.cidr, '94.134.182.67/32'); assert.equal(rec.mode, 'shadow');
  // one Telegram alert per level per 10-minute slot (no spam)
  assert.equal(s.sent.length, 3);
  assert.match(s.sent[2], /EXCLUDERE RECOMANDATĂ[\s\S]*NU s-a aplicat \(mod umbră\)/);
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
  const ips = ['176.7.204.123', '176.7.204.123', '176.7.208.68', '176.7.201.161'];
  let last;
  for (let i = 0; i < ips.length; i++) last = await s.click(i * 300, { ip: ips[i], fp: 'same-phone' });
  assert.ok(last.decision.reasons.some(x => x.includes('IP rotation')));
});

test('datacenter visitor abroad is proposed for exclusion after 3 clicks', async () => {
  const s = setup(); let r;
  for (let i = 0; i < 3; i++) r = await s.click(i, { ip: '47.82.201.10', geo: { country: 'SG' }, fp: 'dc' });
  assert.equal(r.decision.level, 'recommend_exclude');
});

test('processing time per click stays well under one second with a local store', async () => {
  const s = setup(); const r = await s.click(0);
  assert.ok(r.timings.done - r.timings.start < 1000);
});
