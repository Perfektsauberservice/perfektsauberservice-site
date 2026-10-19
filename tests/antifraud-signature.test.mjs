import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, matchSignature, classifyNetwork } from '../netlify/antifraud/engine.mjs';
import { signatureRetro } from '../agent/antifraud/monitors.mjs';
import { memoryStore } from './helpers/memory-store.mjs';

const T0 = Date.UTC(2026, 9, 15, 15, 0, 0);
const MOBILE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const O2 = { org: 'AS6805 TDDE-ASN1 Telefonica Germany GmbH & Co.OHG', country: 'DE' };
const TELEKOM = { org: 'AS3320 DTAG Deutsche Telekom AG', country: 'DE' };
const ev = o => ({ t: T0, ip: '176.7.201.161', cid: 'c-last', ua: MOBILE, lang: 'de-DE', path: '/haushaltsaufloesung-rastatt', geo: { country: 'DE', subdivision: 'BW', city: 'Karlsruhe' }, ...o });
const two = [{ t: T0 - 120e3, cid: 'c0' }, { t: T0, cid: 'c-last' }];

test('signature: O2 mobile, Karlsruhe, Haushaltsauflösung page -> exclusion at the 2nd paid click', () => {
  const r = evaluate(ev(), { ip: two }, O2);
  assert.equal(r.signature, 'bietigheim-daxlanden-auflösung');
  assert.equal(r.level, 'recommend_exclude');
  assert.ok(r.reasons.some(x => x.includes('attacker signature')));
});

test('signature: place seen directly (Bietigheim) works with any operator', () => {
  assert.ok(matchSignature(ev({ geo: { city: 'Bietigheim' } }), classifyNetwork(TELEKOM)));
});

test('no signature for ordinary visitors: desktop, Entrümpelung page, or Telekom in Karlsruhe', () => {
  assert.equal(matchSignature(ev({ ua: DESKTOP }), classifyNetwork(O2)), null);
  assert.equal(matchSignature(ev({ path: '/entruempelung-karlsruhe' }), classifyNetwork(O2)), null);
  assert.equal(matchSignature(ev(), classifyNetwork(TELEKOM)), null);
  assert.equal(matchSignature(ev({ geo: { city: 'Baden-Baden' } }), classifyNetwork(O2)), null);
});

test('one click with the signature is only logged (a customer may click once)', () => {
  assert.equal(evaluate(ev(), { ip: [{ t: T0, cid: 'c-last' }] }, O2).level, 'log');
});

test('retro check: Google places 2+ of our captured clicks in Daxlanden (mobile, Haushaltsauflösung) -> exclusion queued once', async () => {
  const store = memoryStore();
  const day = new Date(T0).toISOString().slice(0, 10);
  for (const [i, g] of ['G1', 'G2'].entries()) await store.setJSON(`ev/${day}/${T0 + i}_176.7.208.68_h${i}`, { t: T0 + i, ip: '176.7.208.68', cid: g });
  await store.setJSON(`ev/${day}/${T0 + 5}_80.1.1.1_hx`, { t: T0 + 5, ip: '80.1.1.1', cid: 'G9' });
  const client = { search: async q => q.includes('FROM click_view') ? [
    { clickView: { gclid: 'G1', locationOfPresence: { city: 'geo/1' }, keywordInfo: { text: 'haushaltsauflösung firma' } }, segments: { device: 'MOBILE' } },
    { clickView: { gclid: 'G2', locationOfPresence: { city: 'geo/1' }, keywordInfo: { text: 'haushaltsauflösung karlsruhe' } }, segments: { device: 'MOBILE' } },
    { clickView: { gclid: 'G9', locationOfPresence: { city: 'geo/2' }, keywordInfo: { text: 'entrümpelung achern' } }, segments: { device: 'MOBILE' } },
  ] : [{ geoTargetConstant: { resourceName: 'geo/1', name: 'Daxlanden' } }, { geoTargetConstant: { resourceName: 'geo/2', name: 'Achern' } }] };
  const q = await signatureRetro({ client, store, now: T0 + 3 * 3600e3 });
  assert.deepEqual(q, [{ ip: '176.7.208.68', clicks: 2 }]);
  assert.ok(await store.get('rec/pending/176.7.208.68-32', { type: 'json' }));
  assert.deepEqual(await signatureRetro({ client, store, now: T0 + 4 * 3600e3 }), []);   // not twice
});

test('Google network (AS15169 privacy proxy) is counted as a shared relay: no exclusion before the 4th click', () => {
  const G = { org: 'AS15169 GOOGLE - Google LLC', country: 'DE' };
  const three = [{ t: T0 - 120e3, cid: 'a' }, { t: T0 - 60e3, cid: 'b' }, { t: T0, cid: 'c-last' }];
  const r3 = evaluate(ev({ ip: '162.120.187.155', path: '/entruempelung-rastatt' }), { ip: three }, G);
  assert.equal(r3.net.type, 'relay'); assert.equal(r3.proposal, null); assert.notEqual(r3.level, 'ignore');
  const r4 = evaluate(ev({ ip: '162.120.187.155', path: '/entruempelung-rastatt' }), { ip: [{ t: T0 - 180e3, cid: 'z' }, ...three] }, G);
  assert.equal(r4.level, 'recommend_exclude');
});

test('a network already used by an excluded attacker IP is a strong signal (exclusion at the 2nd click, desktop too)', () => {
  const r = evaluate(ev({ ip: '94.134.182.69', ua: DESKTOP, path: '/entruempelung-rastatt' }), { ip: two, offenders: { netIps: ['94.134.182.67'] } }, { org: 'AS8881 VERSATEL 1&1 Versatel GmbH', country: 'DE' });
  assert.equal(r.level, 'recommend_exclude');
  assert.ok(r.reasons.some(x => x.includes('already used by an excluded attacker')));
});
