import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { processClick } from '../netlify/antifraud/pipeline.mjs';
import { buildCase } from '../agent/antifraud/abuse-reporter.mjs';
import { memoryStore } from './helpers/memory-store.mjs';

const fakeRegistry = async url => new Response(JSON.stringify(url.includes('ripe.net/data/abuse')
  ? { data: { abuse_contacts: ['abuse@1und1.net'], authoritative_rir: 'ripe' } }
  : { handle: '94.134.176.0 - 94.134.183.255', name: 'VT-Customer', country: 'DE', cidr0_cidrs: [{ v4prefix: '94.134.176.0', length: 21 }], entities: [] }));

async function seeded() {
  const store = memoryStore(); const t0 = Date.now() - 3600e3;
  const deps = { store, mode: 'shadow', allowlist: [], now: () => Date.now(), lookup: async () => ({ org: 'AS8881 1&1 Versatel Deutschland GmbH', country: 'DE' }), notify: null };
  for (let i = 0; i < 6; i++) await processClick(deps, { t: t0 + i * 40e3, ip: '94.134.182.67', cid: `G${i}`, cidType: 'gclid', path: '/entruempelung-rastatt', ua: 'Mozilla/5.0 Android', lang: 'de-DE', geo: { country: 'DE' }, fp: 'f' });
  await processClick(deps, { t: t0 + 300e3, ip: '94.134.182.67', cid: 'G5', cidType: 'gclid', path: '/entruempelung-rastatt', ua: 'Mozilla/5.0 Android', lang: 'de-DE', geo: { country: 'DE' }, fp: 'f' });  // reload
  await processClick(deps, { t: t0, ip: '1.1.1.1', cid: 'OTHER', cidType: 'gclid', path: '/', ua: 'x', lang: 'de', geo: {}, fp: 'g' });
  return store;
}

test('case contains only this IP, verified records, registry abuse contact and minimal ISP attachment', async () => {
  const store = await seeded(); const out = mkdtempSync(join(tmpdir(), 'pss-case-'));
  const notes = [];
  const fakeAds = { search: async q => (q.includes("'G1'") || q.includes("'G2'") || q.includes("'G3'")) ? [{ campaign: { name: 'amgads | search_rastatt' }, adGroup: { name: 'Haushaltsauflösung' }, clickView: { keywordInfo: { text: 'haushaltsauflösung rastatt' } }, segments: { device: 'MOBILE' } }] : [] };
  const c = await buildCase({ store, ip: '94.134.182.67', hours: 3, client: fakeAds, notify: async t => notes.push(t), fetchImpl: fakeRegistry, outRoot: out });
  assert.equal(c.analysis.clicks, 6); assert.equal(c.analysis.requests, 7); assert.equal(c.analysis.adsConfirmed, 3);
  assert.deepEqual(c.registry.abuseContacts, ['abuse@1und1.net']);
  assert.equal(c.analysis.confidence, 'HIGH');
  const csv = readFileSync(join(c.dir, 'events.csv'), 'utf8');
  assert.ok(!csv.includes('1.1.1.1'));                               // other visitors never leak into a case
  assert.equal(csv.trim().split('\n').length, 8);                    // header + 7 requests
  assert.ok(csv.split('\n').slice(1).every(l => !l || l.includes(';OK;')));   // every record's SHA-256 re-verified
  const isp = readFileSync(join(c.dir, 'isp-attachment.csv'), 'utf8');
  assert.ok(isp.includes(';G1') && !isp.includes('Mozilla'));        // GCLID included (Laura 15.10), no device data for the ISP
  const report = readFileSync(join(c.dir, 'report.md'), 'utf8');
  assert.match(report, /\*\*ASN:\*\* AS8881 · \*\*Furnizor:\*\* 1&1 Versatel/);
  assert.match(report, /## Cronologie/);
  assert.equal(c.gclids.length, 6);
  assert.ok(c.files['manifest.sha256'].includes('email-abuse-de.txt'));
  const de = readFileSync(join(c.dir, 'email-abuse-de.txt'), 'utf8');
  assert.match(de, /nicht zwingend die handelnde Person/);
  assert.match(notes[0], /Nu s-a trimis nimic/);
});

test('manifest detects any later change to an exported file', async () => {
  const store = await seeded(); const out = mkdtempSync(join(tmpdir(), 'pss-case-'));
  const c = await buildCase({ store, ip: '94.134.182.67', hours: 3, fetchImpl: fakeRegistry, outRoot: out });
  const lines = readFileSync(join(c.dir, 'manifest.sha256'), 'utf8').trim().split('\n');
  const check = () => lines.every(l => { const [h, n] = l.split('  '); return createHash('sha256').update(readFileSync(join(c.dir, n))).digest('hex') === h; });
  assert.ok(check());
  writeFileSync(join(c.dir, 'events.csv'), 'tampered');
  assert.ok(!check());
});

test('automatic dossier: once per really-excluded IP, stored and sent to Laura as files, never to the ISP', async () => {
  const { autoCases } = await import('../agent/antifraud/abuse-reporter.mjs');
  const store = await seeded();
  await store.setJSON('rec/done/94.134.182.67-32', { t: Date.now(), ip: '94.134.182.67', status: 'enforce', proposal: { cidr: '94.134.182.67/32', kind: 'ip' } });
  await store.setJSON('rec/done/1.1.1.1-32', { t: Date.now(), ip: '1.1.1.1', status: 'validate_only', proposal: { cidr: '1.1.1.1/32', kind: 'ip' } });
  const docs = [], notes = [];
  const run = () => autoCases({ store, client: null, notify: async t => notes.push(t), sendDocument: async (n, body) => docs.push({ n, body }), fetchImpl: fakeRegistry });
  const first = await run();
  assert.equal(first.length, 1); assert.equal(first[0].ip, '94.134.182.67');          // validate-only exclusions get no dossier
  assert.deepEqual(docs.map(d => d.n.split('_').pop()).sort(), ['email-abuse-de.txt', 'events.csv', 'isp-attachment.csv', 'manifest.sha256', 'report.md'].map(n => n.split('_').pop()).sort());
  assert.ok((await store.list({ prefix: `case/${first[0].caseId}/` })).blobs.length >= 8);
  assert.match(notes[0], /Nu s-a trimis nimic către furnizor/);
  assert.equal((await run()).length, 0);                                             // not rebuilt / resent
});

test('an IP without recorded events produces no case', async () => {
  const c = await buildCase({ store: await seeded(), ip: '9.9.9.9', hours: 3, fetchImpl: fakeRegistry, outRoot: mkdtempSync(join(tmpdir(), 'pss-case-')) });
  assert.equal(c.empty, true);
});

test('abuse mail: one-tap link with German text + evidence rows, token stored, nothing sent', async () => {
  const { buildCase, prepareAbuseMail } = await import('../agent/antifraud/abuse-reporter.mjs');
  const store = await seeded();
  const c = await buildCase({ store, ip: '94.134.182.67', hours: 3, fetchImpl: fakeRegistry, outRoot: null });
  const m = await prepareAbuseMail(store, c);
  assert.equal(m.to, 'abuse@1und1.net');
  assert.match(m.url, /^https:\/\/perfektsauberservice\.com\/af-mail\/[a-f0-9]{24}$/);
  const rec = await store.get(`mail/${m.url.split('/').pop()}`, { type: 'json' });
  assert.match(rec.subject, /Missbrauchsmeldung/);
  assert.match(rec.body, /Auszug der Zugriffe \(7\)/);
  assert.match(rec.body, /nicht zwingend die handelnde Person/);
  assert.ok(!/^Betreff:/m.test(rec.body));
});
