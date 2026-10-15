import test from 'node:test';
import assert from 'node:assert/strict';
import { adsClient, isTransientError } from '../agent/antifraud/ads-exclusions.mjs';
import { processProposals, healthCheck } from '../agent/antifraud/runner.mjs';
import { memoryStore } from './helpers/memory-store.mjs';

const ENV = { GOOGLE_ADS_CUSTOMER_ID: '1', GOOGLE_ADS_DEVELOPER_TOKEN: 'd', GOOGLE_ADS_CLIENT_ID: 'c', GOOGLE_ADS_CLIENT_SECRET: 's', GOOGLE_ADS_REFRESH_TOKEN: 'r', GOOGLE_ADS_LOGIN_CUSTOMER_ID: '2' };
function flaky(failures, status = 500) {
  let n = 0; const calls = [];
  const f = async (url, init) => {
    if (url.includes('oauth2')) return new Response('{"access_token":"t"}');
    calls.push(url);
    if (n++ < failures) return new Response('{"error":{"status":"INTERNAL"}}', { status });
    return new Response(JSON.stringify(url.endsWith('googleAds:search') ? { results: [] } : {}));
  };
  return { f, calls };
}

test('reads are retried on Google 500 and succeed', async () => {
  const fx = flaky(2);
  const r = await adsClient(ENV, fx.f).call('googleAds:search', { query: 'x' }, { wait: [1, 1] });
  assert.deepEqual(r, { results: [] }); assert.equal(fx.calls.length, 3);
});

test('writes are not retried inside the client', async () => {
  const fx = flaky(1);
  await assert.rejects(adsClient(ENV, fx.f).call('campaignCriteria:mutate', { operations: [] }), /500/);
  assert.equal(fx.calls.length, 1);
});

test('a proposal that hits a temporary Google error stays queued (no alert) until the 3rd failure', async () => {
  const store = memoryStore(); const sent = [];
  await store.setJSON('rec/pending/1.2.3.4-32', { t: 1, proposal: { cidr: '1.2.3.4/32' } });
  const failing = { search: async () => { throw new Error('ads googleAds:search 500: INTERNAL'); }, call: async () => { throw new Error('ads x 500'); } };
  for (let i = 0; i < 2; i++) {
    assert.equal((await processProposals({ store, client: failing, notify: async t => sent.push(t), ledgerPath: null })).length, 0);
    assert.ok(await store.get('rec/pending/1.2.3.4-32'));
    assert.equal(await store.get('rec/claim/1.2.3.4-32'), null);
  }
  const third = await processProposals({ store, client: failing, notify: async t => sent.push(t), ledgerPath: null });
  assert.equal(third[0].status, 'error'); assert.equal(sent.length, 1);
});

test('transient errors alarm only when they persist', async () => {
  const store = memoryStore(); const sent = [];
  for (let i = 1; i <= 2; i++) await store.setJSON(`health/transient/${1000 + i}`, { t: 1000 + i });
  await healthCheck({ store, notify: async t => sent.push(t), since: 0 });
  assert.equal(sent.length, 0);
  for (let i = 3; i <= 6; i++) await store.setJSON(`health/transient/${1000 + i}`, { t: 1000 + i });
  await healthCheck({ store, notify: async t => sent.push(t), since: 0 });
  assert.match(sent[0], /Google Ads API indisponibil/);
  assert.ok(isTransientError(new Error('ads googleAds:search 500: {"error":{"status":"INTERNAL"}}')));
  assert.ok(!isTransientError(new Error('ads googleAds:search 401: UNAUTHENTICATED')));
});
