import test from 'node:test';
import assert from 'node:assert/strict';
import { clickDigest, describeDevice, shouldSend } from '../agent/antifraud/click-digest.mjs';
import { sha256Hex } from '../netlify/antifraud/pipeline.mjs';
import { memoryStore } from './helpers/memory-store.mjs';

const T = Date.parse('2026-10-15T11:18:53+02:00');

test('device description', () => {
  assert.equal(describeDevice('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130 Mobile Safari/537.36'), 'telefon Samsung cu Android, browserul Samsung');
  assert.equal(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), 'telefon cu iPhone, Safari');
});

test('hourly digest: one block per ad click with operator, place, device, campaign, page, behaviour and verdict', async () => {
  const store = memoryStore();
  const cidHash = (await sha256Hex('GCLID1')).slice(0, 16);
  await store.setJSON(`ev/2026-10-15/${T}_80.142.89.24_${cidHash}`, { t: T, ip: '80.142.89.24', cid: 'GCLID1', path: '/preise', ua: 'Mozilla/5.0 (Linux; Android 10; K) SamsungBrowser/28.0 Mobile Safari', geo: { city: 'Achern', subdivision: 'BW', country: 'DE' } });
  await store.setJSON('netinfo/80.142.89.24', { org: 'AS3320 DTAG Deutsche Telekom AG' });
  await store.setJSON(`beh/80.142.89.24/${cidHash}`, { t: T, dwell: 26622, scroll: 6, inter: 4 });
  // a test-address click and the live check are never reported
  await store.setJSON(`ev/2026-10-15/${T + 1}_192.0.2.9_aaaa`, { t: T + 1, ip: '192.0.2.9', cid: 'X' });
  const sent = [];
  const client = { search: async () => [{ clickView: { gclid: 'GCLID1', keywordInfo: { text: 'haushaltsauflösung firma' } }, campaign: { name: 'amgads | search_baden baden' } }] };
  const r = await clickDigest({ client, store, notify: async t => sent.push(t), sinceMs: T - 3600e3, now: T + 3600e3 });
  assert.equal(r.clicks, 1);
  assert.match(sent[0], /clicuri din reclame 2026-10-15, 10:18–12:18: 1/);
  assert.match(sent[0], /🟢 15\.10\.2026, 11:18:53 — pare om real/);
  assert.match(sent[0], /IP 80\.142\.89\.24 · AS3320 DTAG Deutsche Telekom AG/);
  assert.match(sent[0], /Achern, BW, DE · telefon Samsung cu Android, browserul Samsung/);
  assert.match(sent[0], /amgads \| search_baden baden · „haushaltsauflösung firma” · pagina \/preise/);
  assert.match(sent[0], /a stat 27 s, 4 atingeri, derulat 6%/);
  // the same click is never reported twice, whatever the time window
  const again = await clickDigest({ client, store, notify: async t => sent.push(t), sinceMs: T - 12 * 3600e3, now: T + 5 * 3600e3 });
  assert.equal(again.clicks, 0); assert.equal(sent.length, 1);
});

test('no new clicks -> no message', async () => {
  const sent = [];
  const r = await clickDigest({ client: { search: async () => [] }, store: memoryStore(), notify: async t => sent.push(t), sinceMs: T - 3600e3, now: T });
  assert.equal(r.clicks, 0); assert.equal(sent.length, 0);
});

test('schedule: every 4 h, hourly when >= 5 new clicks, final after 20:10, never empty', () => {
  const h = 3600e3, now = 1e12;
  assert.equal(shouldSend({ hm: '11:00', now, lastSent: now - 3 * h, newClicks: 2, finalSentToday: false }), false);       // < 4 h, quiet
  assert.equal(shouldSend({ hm: '12:10', now, lastSent: now - 4 * h, newClicks: 1, finalSentToday: false }), 'regular');   // 4 h passed
  assert.equal(shouldSend({ hm: '10:15', now, lastSent: now - 1 * h, newClicks: 6, finalSentToday: false }), 'busy');      // many clicks -> hourly
  assert.equal(shouldSend({ hm: '10:15', now, lastSent: now - 0.5 * h, newClicks: 9, finalSentToday: false }), false);    // at most once per hour
  assert.equal(shouldSend({ hm: '20:12', now, lastSent: now - 1 * h, newClicks: 1, finalSentToday: false }), 'final');
  assert.equal(shouldSend({ hm: '20:12', now, lastSent: now - 1 * h, newClicks: 1, finalSentToday: true }), false);
  assert.equal(shouldSend({ hm: '16:10', now, lastSent: now - 5 * h, newClicks: 0, finalSentToday: false }), false);       // nothing new
  assert.equal(shouldSend({ hm: '07:30', now, lastSent: now - 9 * h, newClicks: 3, finalSentToday: false }), false);       // before ads start
});

test('per-click report: one message per click, waits 60 s for the behaviour signal, each click once', async () => {
  const store = memoryStore(); const sent = [];
  const h1 = (await sha256Hex('A1')).slice(0, 16), h2 = (await sha256Hex('A2')).slice(0, 16);
  await store.setJSON(`ev/2026-10-15/${T}_80.1.1.1_${h1}`, { t: T, ip: '80.1.1.1', cid: 'A1', path: '/preise', ua: 'iPhone', geo: {} });
  await store.setJSON(`ev/2026-10-15/${T + 30e3}_80.2.2.2_${h2}`, { t: T + 30e3, ip: '80.2.2.2', cid: 'A2', path: '/x', ua: 'Android', geo: {} });
  const client = { search: async () => [] };
  const opts = { client, store, notify: async t => sent.push(t), sinceMs: T - 3600e3, sentPrefix: 'click/sent', perMessage: 1, minAgeMs: 60e3, title: '🖱️ Clic nou din reclame' };
  await clickDigest({ ...opts, now: T + 70e3 });          // A1 is 70 s old, A2 only 40 s
  assert.equal(sent.length, 1); assert.match(sent[0], /^🖱️ Clic nou din reclame\n\n.*80\.1\.1\.1/s);
  await clickDigest({ ...opts, now: T + 200e3 });
  assert.equal(sent.length, 2); assert.match(sent[1], /80\.2\.2\.2/);
  await clickDigest({ ...opts, now: T + 400e3 });
  assert.equal(sent.length, 2);                            // never twice
});
