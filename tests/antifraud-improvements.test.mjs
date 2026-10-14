import test from 'node:test';
import assert from 'node:assert/strict';
import { processClick, markCustomer } from '../netlify/antifraud/pipeline.mjs';
import { handleAntifraudCallback } from '../netlify/antifraud/telegram-callback.mjs';
import { proposeRotation, processRotationDecisions } from '../agent/antifraud/runner.mjs';
import { reconcile } from '../agent/antifraud/insights.mjs';
import { memoryStore } from './helpers/memory-store.mjs';

const T0 = Date.UTC(2026, 9, 15, 10, 0, 0);
const deps = store => ({ store, mode: 'enforce', allowlist: [], now: () => T0, lookup: async () => ({ org: 'AS8881 1&1 Versatel', country: 'DE' }), notify: null });
const click = (store, i, ip = '94.134.182.67') => processClick(deps(store), { t: T0 + i * 60e3, ip, cid: `g${i}`, cidType: 'gclid', path: '/x', ua: 'Mozilla/5.0', lang: 'de', geo: { country: 'DE' }, fp: 'f' });

test('contact tap raises the threshold by 2 but does not buy immunity', async () => {
  const store = memoryStore();
  await markCustomer(store, '94.134.182.67', 'whatsapp click', '/x', 'contact');
  const levels = []; for (let i = 0; i < 5; i++) levels.push((await click(store, i)).decision.level);
  assert.deepEqual(levels.slice(2), ['analyze', 'evaluate', 'recommend_exclude']);   // excluded at 5, not 3
});

test('client IP behind the Netlify edge chain is taken right before the first Netlify hop', async () => {
  const { clientIp } = await import('../netlify/antifraud/lambda-allow.mjs');
  assert.equal(clientIp({ headers: { 'x-nf-client-connection-ip': '18.199.220.255', 'x-forwarded-for': '2003:d4::1, 18.199.220.255, 18.194.154.250' } }), '2003:d4::1');
  assert.equal(clientIp({ headers: { 'x-nf-client-connection-ip': '18.199.220.255', 'x-forwarded-for': '6.6.6.6, 2003:d4::1, 18.199.220.255' } }), '2003:d4::1');  // spoofed left entry ignored
  assert.equal(clientIp({ headers: { 'x-nf-client-connection-ip': '87.185.200.14' } }), '87.185.200.14');
});

test('form sender (real customer) is never excluded, even with many clicks', async () => {
  const store = memoryStore();
  await markCustomer(store, '94.134.182.67', 'form submission', '/entruempelung-rastatt', 'form');
  let r; for (let i = 0; i < 5; i++) r = await click(store, i);
  assert.equal(r.decision.level, 'ignore');
  assert.match(r.decision.reasons[0], /real customer/);
  assert.equal((await store.list({ prefix: 'rec/pending/' })).blobs.length, 0);
});

test('telegram callback records the decision once, only from Laura\'s chat', async () => {
  const store = memoryStore(); const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{"ok":true}'); };
  const cq = (chat, data) => ({ id: 'q1', data, from: { id: 1 }, message: { chat: { id: chat } } });
  assert.equal(await handleAntifraudCallback(cq(999, 'afrot:abc123:y'), { botToken: 't', allowedChatId: '648944715', store, fetchImpl }), true);
  assert.equal(await store.get('rot/decision/abc123', { type: 'json' }), null);              // stranger ignored
  await handleAntifraudCallback(cq(648944715, 'afrot:abc123:y'), { botToken: 't', allowedChatId: '648944715', store, fetchImpl });
  await handleAntifraudCallback(cq(648944715, 'afrot:abc123:n'), { botToken: 't', allowedChatId: '648944715', store, fetchImpl });
  assert.equal((await store.get('rot/decision/abc123', { type: 'json' })).approved, true);   // first answer wins
  assert.equal(await handleAntifraudCallback(cq(648944715, 'something-else'), { botToken: 't', allowedChatId: '648944715', store, fetchImpl }), false);
});

function fakeClient() {
  const mutates = [];
  return { mutates, call: async (path, body) => { mutates.push({ path, body }); return {}; }, search: async () => [] };
}

test('rotation: proposal only near the limit; nothing removed until Laura approves; only listed criteria removed', async () => {
  const store = memoryStore(); const sent = []; const client = fakeClient();
  const rows = [
    { ip: '172.225.60.180/32', keep: -40, type: 'relay', country: 'AU', org: 'Akamai', why: '', criteria: [{ resourceName: 'customers/1/campaignCriteria/1~1' }, { resourceName: 'customers/1/campaignCriteria/2~1' }] },
    { ip: '94.134.182.87/32', keep: 120, type: 'isp', country: 'DE', org: '1&1', why: '', criteria: [{ resourceName: 'customers/1/campaignCriteria/1~2' }] },
  ];
  const send = async (t, b) => sent.push({ t, b });
  assert.equal((await proposeRotation({ store, client, send, plan: { rows, perCampaign: { a: 300 } } })).skipped, true);
  const p = await proposeRotation({ store, client, send, plan: { rows, perCampaign: { a: 495 } } });
  assert.equal(p.count, 1); assert.equal(sent[0].b[0].callback_data, `afrot:${p.id}:y`);
  assert.equal((await processRotationDecisions({ store, client, notify: async () => {}, enforce: true })).length, 0);   // no decision yet
  assert.equal(client.mutates.length, 0);
  await store.setJSON(`rot/decision/${p.id}`, { approved: true, t: Date.now() });
  const done = await processRotationDecisions({ store, client, notify: async () => {}, enforce: true });
  assert.equal(done[0].status, 'removed');
  assert.deepEqual(client.mutates[0].body.operations, [{ remove: 'customers/1/campaignCriteria/1~1' }, { remove: 'customers/1/campaignCriteria/2~1' }]);
  assert.equal(client.mutates[0].body.validateOnly, false);
});

test('rotation rejected -> nothing removed', async () => {
  const store = memoryStore(); const client = fakeClient();
  const rows = [{ ip: '1.2.3.4/32', keep: 0, type: 'isp', criteria: [{ resourceName: 'customers/1/campaignCriteria/1~9' }] }];
  const p = await proposeRotation({ store, client, send: async () => {}, plan: { rows, perCampaign: { a: 500 } } });
  await store.setJSON(`rot/decision/${p.id}`, { approved: false, t: Date.now() });
  assert.equal((await processRotationDecisions({ store, client, notify: async () => {}, enforce: true }))[0].status, 'rejected');
  assert.equal(client.mutates.length, 0);
});

test('reconcile: paid clicks that never reached the site are counted per place/keyword', async () => {
  const store = memoryStore();
  const day = '2026-10-15';
  const t = Date.parse(`${day}T10:00:00+02:00`);
  await store.setJSON(`ev/2026-10-15/${t}_1.1.1.1_aa`, { cid: 'SEEN', t });
  const client = { search: async q => q.includes('FROM click_view') ? [
    { clickView: { gclid: 'SEEN', locationOfPresence: { city: 'geoTargetConstants/1' }, keywordInfo: { text: 'k' } }, segments: { device: 'MOBILE' } },
    { clickView: { gclid: 'GHOST1', locationOfPresence: { city: 'geoTargetConstants/2' }, keywordInfo: { text: 'haushaltsauflösung rastatt' } }, segments: { device: 'MOBILE' } },
    { clickView: { gclid: 'GHOST2', locationOfPresence: { city: 'geoTargetConstants/2' }, keywordInfo: { text: 'haushaltsauflösung rastatt' } }, segments: { device: 'MOBILE' } },
  ] : [{ geoTargetConstant: { resourceName: 'geoTargetConstants/2', name: 'Daxlanden' } }] };
  const r = await reconcile({ client, store, day });
  assert.equal(r.paidClicks, 3); assert.equal(r.missing, 2);
  assert.deepEqual(r.missingBy[0], ['Daxlanden · MOBILE · haushaltsauflösung rastatt', 2]);
});
