import test from 'node:test';
import assert from 'node:assert/strict';
import { hourlyCheck, foreignWrites, expireMobile, leadsReport } from '../agent/antifraud/monitors.mjs';
import { markCustomer, sha256Hex } from '../netlify/antifraud/pipeline.mjs';
import { memoryStore } from './helpers/memory-store.mjs';

const DAY = '2026-10-15';
const at = (h, m = 0) => Date.parse(`${DAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`);

function client({ hours = [], clicks = [], changes = [] } = {}) {
  const mutates = [];
  return { mutates,
    search: async q => {
      if (q.includes('FROM customer')) return hours.map(([h, c]) => ({ segments: { hour: h }, metrics: { clicks: c } }));
      if (q.includes('FROM click_view')) return clicks;
      if (q.includes('FROM geo_target_constant')) return [{ geoTargetConstant: { resourceName: 'geoTargetConstants/9', name: 'Daxlanden' } }];
      if (q.includes('FROM change_event')) return changes;
      if (q.includes('FROM campaign WHERE')) return [];
      return [];
    },
    call: async (path, body) => { mutates.push(body); return {}; } };
}

async function seedEvent(store, t, ip, cid) {
  await store.setJSON(`ev/${new Date(t).toISOString().slice(0, 10)}/${String(t).padStart(13, '0')}_${ip}_${(await sha256Hex(cid)).slice(0, 16)}`, { t, ip, cid });
}

test('ghost clicks: paid clicks in an hour that never reached the site -> one alert per hour, with places', async () => {
  const store = memoryStore(); const sent = [];
  await store.setJSON('health/live-since', { t: at(0) });
  await seedEvent(store, at(12, 10), '1.1.1.1', 'SEEN');
  const c = client({ hours: [[12, 6]], clicks: [
    { clickView: { gclid: 'SEEN', locationOfPresence: { city: 'geoTargetConstants/9' }, keywordInfo: { text: 'k' } }, segments: { device: 'MOBILE' } },
    ...[1, 2, 3, 4, 5].map(i => ({ clickView: { gclid: `G${i}`, locationOfPresence: { city: 'geoTargetConstants/9' }, keywordInfo: { text: 'haushaltsauflösung rastatt' } }, segments: { device: 'MOBILE' } })),
  ] });
  const a = await hourlyCheck({ client: c, store, notify: async t => sent.push(t), now: at(16) });
  assert.equal(a[0].type, 'ghost'); assert.equal(a[0].clicks - a[0].seen, 5);
  assert.match(sent[0], /clicuri fantomă[\s\S]*Daxlanden · MOBILE · haushaltsauflösung rastatt ×5/);
  assert.equal((await hourlyCheck({ client: c, store, notify: async t => sent.push(t), now: at(16, 30) })).length, 0);   // once per hour
});

test('capture broken: Google reports clicks, the site captured none -> alert', async () => {
  const store = memoryStore(); const sent = [];
  await store.setJSON('health/live-since', { t: at(0) });
  const a = await hourlyCheck({ client: client({ hours: [[10, 4]] }), store, notify: async t => sent.push(t), now: at(14) });
  assert.equal(a[0].type, 'capture'); assert.match(sent[0], /CAPTARE POSIBIL DEFECTĂ/);
});

test('hours that are too recent (Ads delay) or before go-live are not judged', async () => {
  const store = memoryStore();
  await store.setJSON('health/live-since', { t: at(11) });
  const a = await hourlyCheck({ client: client({ hours: [[9, 8], [13, 8]] }), store, notify: async () => {}, now: at(15) });
  assert.equal(a.length, 0);
});

test('foreign writes: API changes to IP lists not in the PSS ledger are reported, own ones are not', async () => {
  const store = memoryStore(); const sent = [];
  await store.setJSON('ledger/1_94.134.182.67-32', { created: ['customers/1/campaignCriteria/1~OWN'] });
  const ce = (rn, ip, op = 'CREATE') => ({ changeEvent: { changeDateTime: `${DAY} 02:16:00`, userEmail: 'kontakt@perfektsauberservice.com', clientType: 'GOOGLE_ADS_API', resourceChangeOperation: op, changeResourceName: rn, newResource: { campaignCriterion: { ipBlock: { ipAddress: ip } } } }, campaign: { name: 'amgads | search_rastatt' } });
  const n = await foreignWrites({ client: client({ changes: [ce('customers/1/campaignCriteria/1~OWN', '94.134.182.67/32'), ce('customers/1/campaignCriteria/1~X', '176.7.196.66/32')] }), store, notify: async t => sent.push(t), sinceMs: at(0) });
  assert.equal(n, 1); assert.match(sent[0], /176\.7\.196\.66/);
});

test('expiry: own mobile-IP exclusions older than 45 days are removed; fixed-line and young ones stay', async () => {
  const store = memoryStore(); const sent = []; const now = at(12);
  const old = now - 50 * 864e5;
  await store.setJSON('ledger/a', { t: old, mode: 'enforce', cidr: '176.7.1.1/32', created: ['customers/1/campaignCriteria/1~M'] });
  await store.setJSON('rec/done/176.7.1.1-32', { net: { type: 'mobile' } });
  await store.setJSON('ledger/b', { t: old, mode: 'enforce', cidr: '94.134.182.67/32', created: ['customers/1/campaignCriteria/1~F'] });
  await store.setJSON('rec/done/94.134.182.67-32', { net: { type: 'isp' } });
  await store.setJSON('ledger/c', { t: now - 10 * 864e5, mode: 'enforce', cidr: '176.7.2.2/32', created: ['customers/1/campaignCriteria/1~Y'] });
  await store.setJSON('rec/done/176.7.2.2-32', { net: { type: 'mobile' } });
  const c = client();
  process.env.AF_ENFORCE = '1';   // real-write guard (as on production)
  const out = await expireMobile({ client: c, store, notify: async t => sent.push(t), enforce: true, now });
  assert.deepEqual(out.map(o => o.cidr), ['176.7.1.1/32']);
  assert.deepEqual(c.mutates[0].operations, [{ remove: 'customers/1/campaignCriteria/1~M' }]);
  assert.ok((await store.get('ledger/a', { type: 'json' })).undone);
  assert.equal((await expireMobile({ client: c, store, notify: async () => {}, enforce: true, now })).length, 0);   // not twice
  delete process.env.AF_ENFORCE;
});

test('ad click -> real customer: form / tap with gclid are counted per campaign, keyword and place', async () => {
  const store = memoryStore();
  await markCustomer(store, '1.2.3.4', 'form submission', '/x', 'form', 'GOOD');
  const now = at(12);
  const c = client({ clicks: [
    { clickView: { gclid: 'GOOD', keywordInfo: { text: 'entrümpelung rastatt' }, locationOfPresence: { city: 'geoTargetConstants/9' } }, campaign: { name: 'amgads | search_rastatt' } },
    { clickView: { gclid: 'BAD', keywordInfo: { text: 'haushaltsauflösung rastatt' }, locationOfPresence: { city: 'geoTargetConstants/9' } }, campaign: { name: 'amgads | search_rastatt' } },
  ] });
  const r = await leadsReport({ client: c, store, days: 1, now });
  assert.equal(r.matched, 1);
  assert.equal(r.rows[0].k, 'search_rastatt · entrümpelung rastatt · Daxlanden'); assert.equal(r.rows[0].leads, 1);
});
