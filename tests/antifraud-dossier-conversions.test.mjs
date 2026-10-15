import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineConversionsCsv, CONVERSION_NAMES } from '../agent/antifraud/offline-conversions.mjs';
import { renderDossier } from '../agent/antifraud/attacker-dossier.mjs';
import { markCustomer } from '../netlify/antifraud/pipeline.mjs';
import { ATTACKER_SIGNATURES } from '../netlify/antifraud/config.mjs';
import { memoryStore } from './helpers/memory-store.mjs';
import { createHash } from 'node:crypto';

test('offline conversion file: Google import format, form vs contact, no duplicates, only clicks with gclid', async () => {
  const store = memoryStore();
  await markCustomer(store, '1.2.3.4', 'form submission', '/x', 'form', 'GCLID_FORM');
  await markCustomer(store, '1.2.3.4', 'form submission', '/x', 'form', 'GCLID_FORM');      // duplicate
  await markCustomer(store, '5.6.7.8', 'whatsapp click', '/y', 'contact', 'GCLID_TAP');
  await markCustomer(store, '9.9.9.9', 'phone click', '/z', 'contact', '');                 // no gclid -> not exportable
  const r = await offlineConversionsCsv({ store, days: 7 });
  const lines = r.csv.trim().split('\n');
  assert.equal(lines[0], 'Parameters:TimeZone=Europe/Berlin');
  assert.equal(lines[1], 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency');
  assert.equal(r.count, 2); assert.equal(r.forms, 1);
  assert.ok(lines.some(l => l.startsWith(`GCLID_FORM,${CONVERSION_NAMES.form},`)));
  assert.match(lines[2], /,\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},,EUR$/);
});

test('attacker dossier: German statement does not claim who acted; IP link to waves marked as unproven; manifest verifies', () => {
  const D = { sig: ATTACKER_SIGNATURES[0], from: '2026-09-01', to: '2026-10-14', totClicks: 100, totInvalid: 20, avgCpc: 1.5,
    waves: [{ date: '2026-10-05', hour: 17, clicks: 22, cost: 23.5, sigShare: 0.79, places: 'Bietigheim', keywords: 'haushaltsauflösung firma' }],
    sigClicks: [{ d: '2026-10-05', gclid: 'G1', camp: 'c', ag: 'a', kw: 'haushaltsauflösung firma', place: 'Bietigheim', dev: 'MOBILE' }],
    ipRows: [{ ip: '176.7.201.161', firstSeen: '2026-10-06', source: 'x', network: 'MOBILE-POOL-NET', range: '176.7.0.0/16', abuse: 'abuse.de@telefonica.com' }],
    waveCost: 23.5, sigCostEst: 1.5 };
  const files = renderDossier(D);
  assert.match(files['sachverhalt-de.md'], /Seit dem 05\.10\.2026/);
  assert.match(files['sachverhalt-de.md'], /Wir behaupten nicht, dass ein bestimmter Anschlussinhaber gehandelt hat/);
  assert.match(files['sachverhalt-de.md'], /Zuordnung einzelner Adressen zu einzelnen Wellen ist nicht belegt/);
  assert.match(files['report-ro.md'], /NU este dovedită/);
  for (const line of files['manifest.sha256'].trim().split('\n')) {
    const [h, n] = line.split('  ');
    assert.equal(createHash('sha256').update(Buffer.from(files[n], 'utf8')).digest('hex'), h);
  }
});
