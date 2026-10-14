import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOnlyIpBlockOps, applyExclusion, undoExclusion, adsClient } from '../agent/antifraud/ads-exclusions.mjs';

const CAMP = 'customers/9847667839/campaigns/1';
const ok = { create: { campaign: CAMP, negative: true, ipBlock: { ipAddress: '94.134.182.67/32' } } };

test('guard accepts only negative IP_BLOCK creates (/32, /24, IPv6 /128)', () => {
  assertOnlyIpBlockOps([ok]);
  assertOnlyIpBlockOps([{ create: { ...ok.create, ipBlock: { ipAddress: '94.134.182.0/24' } } }]);
  assertOnlyIpBlockOps([{ create: { ...ok.create, ipBlock: { ipAddress: '2a02::1/128' } } }]);
});

test('guard refuses anything that is not an IP exclusion', () => {
  const bad = [
    [{ update: { resourceName: CAMP, status: 'PAUSED' } }],                                        // campaign change
    [{ create: { ...ok.create, keyword: { text: 'x' } } }],                                          // keyword
    [{ create: { ...ok.create, negative: false } }],                                                 // positive criterion
    [{ create: { ...ok.create, ipBlock: { ipAddress: '176.7.0.0/16' } } }],                         // wider than /24
    [{ create: { campaign: CAMP, negative: true, location: { geoTargetConstant: 'geoTargetConstants/1' } } }],
    [{ remove: 'customers/9847667839/campaignCriteria/1~999' }],                                     // not created by us
    [],
  ];
  for (const ops of bad) assert.throws(() => assertOnlyIpBlockOps(ops), /refused|no operations/);
});

function fakeFetch(state) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, body: init.body });
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 't' }));
    const body = JSON.parse(init.body);
    if (url.endsWith('googleAds:search')) {
      if (body.query.includes('FROM campaign WHERE')) return new Response(JSON.stringify({ results: state.campaigns.map(c => ({ campaign: { resourceName: c.rn, name: c.name } })) }));
      return new Response(JSON.stringify({ results: state.campaigns.flatMap(c => c.ips.map((ip, i) => ({ campaign: { resourceName: c.rn }, campaignCriterion: { resourceName: `${c.rn}~${i}`, ipBlock: { ipAddress: ip } } }))) }));
    }
    if (url.endsWith('campaignCriteria:mutate')) {
      state.mutates.push(body);
      return new Response(JSON.stringify(body.validateOnly ? {} : { results: body.operations.map((_, i) => ({ resourceName: `new~${i}` })) }));
    }
    throw new Error('unexpected ' + url);
  };
  return { f, calls };
}
const ENV = { GOOGLE_ADS_CUSTOMER_ID: '984-766-7839', GOOGLE_ADS_DEVELOPER_TOKEN: 'd', GOOGLE_ADS_CLIENT_ID: 'c', GOOGLE_ADS_CLIENT_SECRET: 's', GOOGLE_ADS_REFRESH_TOKEN: 'r', GOOGLE_ADS_LOGIN_CUSTOMER_ID: '241-696-8847' };

test('shadow apply sends validateOnly=true to every enabled campaign and changes nothing', async () => {
  const state = { mutates: [], campaigns: [{ rn: 'customers/9847667839/campaigns/1', name: 'rastatt', ips: ['1.2.3.4/32'] }, { rn: 'customers/9847667839/campaigns/2', name: 'baden', ips: [] }] };
  const client = adsClient(ENV, fakeFetch(state).f);
  const r = await applyExclusion(client, '94.134.182.67/32');
  assert.equal(state.mutates.length, 1); assert.equal(state.mutates[0].validateOnly, true);
  assert.equal(state.mutates[0].operations.length, 2); assert.equal(r.mode, 'validate_only'); assert.deepEqual(r.created, []);
});

test('full list (500) is reported as capacity_full and nothing is removed automatically', async () => {
  const full = Array.from({ length: 500 }, (_, i) => `10.0.${i >> 8}.${i & 255}/32`);
  const state = { mutates: [], campaigns: [{ rn: 'customers/9847667839/campaigns/1', name: 'rastatt', ips: full }] };
  const r = await applyExclusion(adsClient(ENV, fakeFetch(state).f), '94.134.182.67/32');
  assert.equal(r.plan[0].action, 'capacity_full'); assert.equal(state.mutates.length, 0);
});

test('already excluded IP is skipped', async () => {
  const state = { mutates: [], campaigns: [{ rn: 'customers/9847667839/campaigns/1', name: 'rastatt', ips: ['94.134.182.67/32'] }] };
  const r = await applyExclusion(adsClient(ENV, fakeFetch(state).f), '94.134.182.67/32');
  assert.equal(r.plan[0].action, 'already_excluded'); assert.equal(state.mutates.length, 0);
});

test('real writes are refused unless AF_ENFORCE=1', async () => {
  delete process.env.AF_ENFORCE;
  const state = { mutates: [], campaigns: [] };
  await assert.rejects(applyExclusion(adsClient(ENV, fakeFetch(state).f), '94.134.182.67/32', { enforce: true }), /AF_ENFORCE/);
});

test('undo removes only criteria the module created', async () => {
  const state = { mutates: [], campaigns: [] };
  const r = await undoExclusion(adsClient(ENV, fakeFetch(state).f), { created: ['customers/9847667839/campaignCriteria/1~5'] });
  assert.equal(r.removed, 1); assert.equal(state.mutates[0].validateOnly, true);
});
