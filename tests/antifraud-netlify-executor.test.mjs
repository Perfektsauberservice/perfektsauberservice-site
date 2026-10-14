import test from 'node:test';
import assert from 'node:assert/strict';
import { processClick } from '../netlify/antifraud/pipeline.mjs';
import { processProposals } from '../agent/antifraud/runner.mjs';
import { adsClient } from '../agent/antifraud/ads-exclusions.mjs';
import { memoryStore } from './helpers/memory-store.mjs';

const T0 = Date.UTC(2026, 9, 15, 10, 0, 0);
const ENV = { GOOGLE_ADS_CUSTOMER_ID: '984-766-7839', GOOGLE_ADS_DEVELOPER_TOKEN: 'd', GOOGLE_ADS_CLIENT_ID: 'c', GOOGLE_ADS_CLIENT_SECRET: 's', GOOGLE_ADS_REFRESH_TOKEN: 'r', GOOGLE_ADS_LOGIN_CUSTOMER_ID: '241-696-8847' };

function fakeAds() {
  const mutates = [];
  const f = async (url, init) => {
    if (url.includes('oauth2')) return new Response('{"access_token":"t"}');
    const body = JSON.parse(init.body);
    if (url.endsWith('googleAds:search')) return new Response(JSON.stringify({ results: body.query.includes('FROM campaign WHERE') ? [{ campaign: { resourceName: 'customers/9847667839/campaigns/1', name: 'rastatt' } }] : [] }));
    mutates.push(body); return new Response('{}');
  };
  return { client: adsClient(ENV, f), mutates };
}

test('edge pipeline triggers the Netlify executor exactly once per proposal', async () => {
  const store = memoryStore(); let triggers = 0;
  const deps = { store, mode: 'enforce', allowlist: [], now: () => T0, lookup: async () => ({ org: 'AS8881 1&1', country: 'DE' }), notify: null, trigger: async () => { triggers++; } };
  for (let i = 0; i < 6; i++) await processClick(deps, { t: T0 + i * 60e3, ip: '94.134.182.67', cid: `g${i}`, cidType: 'gclid', path: '/x', ua: 'Mozilla/5.0', lang: 'de', geo: { country: 'DE' }, fp: 'f' });
  assert.equal(triggers, 1);
});

test('two executors at the same time (Netlify function + cron/PC) send each exclusion only once', async () => {
  const store = memoryStore();
  await store.setJSON('rec/pending/94.134.182.67-32', { t: T0, proposal: { cidr: '94.134.182.67/32' } });
  const a = fakeAds(), b = fakeAds();
  const [ra, rb] = await Promise.all([
    processProposals({ store, client: a.client, notify: async () => {}, ledgerPath: null, executor: 'netlify' }),
    processProposals({ store, client: b.client, notify: async () => {}, ledgerPath: null, executor: 'netlify-cron' }),
  ]);
  assert.equal(ra.length + rb.length, 1);
  assert.equal(a.mutates.length + b.mutates.length, 1);
  assert.equal(a.mutates.concat(b.mutates)[0].validateOnly, true);           // no enforce flag -> validate only
  assert.equal((await store.list({ prefix: 'ledger/' })).blobs.length, 1);   // ledger kept in the store (no disk on Netlify)
});
