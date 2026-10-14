// End-to-end test against a NON-production deploy (draft URL).
//   node agent/antifraud/e2e-test.mjs https://<draft>.netlify.app
// Simulated visitor IPs (af_test_ip) are honoured only outside production.
import { openStore } from './runner.mjs';
import { enc } from '../../netlify/antifraud/pipeline.mjs';

const base = process.argv[2];
const store = openStore('test');
const run = Date.now().toString(36);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];

const UA = n => `Mozilla/5.0 (Linux; Android 14; PSS-E2E-${run}-${n}) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36`;
async function hit(ip, gclid, path = '/entruempelung-rastatt', ua = UA(ip)) {
  const t = Date.now();
  const r = await fetch(`${base}${path}?gclid=${gclid}&af_test_ip=${ip}`, { headers: { 'user-agent': ua, 'accept-language': 'de-DE,de;q=0.9' } });
  await r.arrayBuffer();
  return { t, status: r.status, ttfbMs: Date.now() - t };
}

async function waitDecision(ip, sentAt, level, timeoutMs = 20000) {
  const e = enc(ip);
  for (let waited = 0; waited < timeoutMs; waited += 250) {
    const { blobs } = await store.list({ prefix: 'dec/' });
    for (const b of blobs.filter(b => b.key.endsWith(`_${e}`) && Number(b.key.slice(4, 17)) >= sentAt - 5000)) {
      const d = await store.get(b.key, { type: 'json' });
      if (d.level === level) return { d, seenAfterMs: Date.now() - sentAt };
    }
    await sleep(250);
  }
  return null;
}

async function eventStored(ip, sentAt) {
  const day = new Date().toISOString().slice(0, 10);
  for (let w = 0; w < 15000; w += 250) {
    const { blobs } = await store.list({ prefix: `ev/${day}/` });
    const hitKey = blobs.find(b => b.key.includes(`_${enc(ip)}_`) && Number(b.key.split('/')[2].slice(0, 13)) >= sentAt - 5000);
    if (hitKey) return { key: hitKey.key, seenAfterMs: Date.now() - sentAt, rec: await store.get(hitKey.key, { type: 'json' }) };
    await sleep(250);
  }
  return null;
}

const log = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

// 0) page speed: with and without a click id
const plain = []; const tagged = [];
for (let i = 0; i < 5; i++) {
  let t = Date.now(); await (await fetch(`${base}/entruempelung-rastatt`)).arrayBuffer(); plain.push(Date.now() - t);
  tagged.push((await hit(`192.0.2.${200 + i}`, `speed-${run}-${i}`)).ttfbMs);
}
const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
log('page not slowed by capture', med(tagged) < med(plain) + 150, `median ${med(plain)} ms without gclid vs ${med(tagged)} ms with gclid`);

// 1) single click stored with evidence hash
const ip1 = '192.0.2.11'; const s1 = await hit(ip1, `single-${run}`);
const e1 = await eventStored(ip1, s1.t);
log('single ad click captured and stored', !!e1 && e1.rec.sha256?.length === 64 && e1.rec.cid === `single-${run}`, e1 ? `visible in store after ${e1.seenAfterMs} ms; requestId=${e1.rec.requestId}; sha256=${e1.rec.sha256.slice(0, 12)}…` : 'not found');

// 2) reloads of the same gclid are not new clicks
const ip2 = '203.0.113.22';
for (let i = 0; i < 3; i++) await hit(ip2, `reload-${run}`);
await sleep(3000);
const d2 = await store.list({ prefix: 'dec/' });
log('3 reloads of one gclid -> no alert', !d2.blobs.some(b => b.key.endsWith(`_${enc(ip2)}`)), 'no decision above log level');

// 3) burst of 6 paid clicks from one IP
const ip3 = '198.51.100.7'; const levelsAt = {};
for (let i = 1; i <= 5; i++) {
  const s = await hit(ip3, `burst-${run}-${i}`);
  const want = { 2: 'analyze', 3: 'recommend_exclude' }[i];
  if (want) { const w = await waitDecision(ip3, s.t, want); levelsAt[i] = w ? `${want} in ${w.seenAfterMs} ms` : 'MISSING'; }
}
log('burst: click 2 alert, click 3 exclusion', !Object.values(levelsAt).includes('MISSING'), JSON.stringify(levelsAt));

// 4) datacenter visitor abroad (real Alibaba Cloud address, test store only)
const ip4 = '47.82.201.10'; let w4;
for (let i = 1; i <= 2; i++) { const s = await hit(ip4, `dc-${run}-${i}`); if (i === 2) w4 = await waitDecision(ip4, s.t, 'recommend_exclude'); }
log('datacenter (Alibaba) 2 clicks -> exclusion', !!w4, w4 ? `${w4.seenAfterMs} ms; reasons: ${w4.d.reasons.join(' | ')}` : 'missing');

// 5) executor (runner loop running separately): proposals -> Google Ads validateOnly
for (const ip of [ip3, ip4]) {
  const key = `rec/done/${enc(ip + '/32')}`; let d = null;
  for (let w = 0; w < 90000 && !d; w += 1000) { d = await store.get(key, { type: 'json' }); if (!d) await sleep(1000); }
  log(`Google Ads validated exclusion ${ip}/32 (runner loop)`, d?.status === 'validate_only', d ? `click->Google answer ${d.reactionMs} ms; ${JSON.stringify(d.executor.plan)}` : 'not processed within 90 s');
}
const pend = (await store.list({ prefix: 'rec/' })).blobs.filter(b => b.key.includes(enc(ip3)) && !b.key.startsWith('rec/seen/'));
log('only one proposal per IP', pend.length === 1, `${pend.length} record(s) for ${ip3}`);
// parallel burst: 5 simultaneous clicks -> one exclusion alert
const ip5 = '203.0.113.55';
await hit(ip5, `par-${run}-0`); await Promise.all([1, 2, 3, 4].map(i => hit(ip5, `par-${run}-${i}`)));
await sleep(6000);
const alerts = (await store.list({ prefix: `alert/${enc(ip5)}/recommend_exclude/` })).blobs.length;
const recs = (await store.list({ prefix: 'rec/' })).blobs.filter(b => b.key.includes(enc(ip5)) && !b.key.startsWith('rec/seen/')).length;
log('parallel burst -> one alert, one proposal', alerts === 1 && recs === 1, `${alerts} alert key(s), ${recs} proposal(s)`);
// static file is not processed
const st = Date.now(); await (await fetch(`${base}/css/cta-band.css?v=3&gclid=static-${run}&af_test_ip=203.0.113.99`)).arrayBuffer(); await sleep(2500);
const staticEv = (await store.list({ prefix: `ix/ip/${enc('203.0.113.99')}/` })).blobs.length;
log('static files skipped by the capture', staticEv === 0, `${staticEv} events for a CSS request`);

console.log(JSON.stringify({ summary: `${results.filter(r => r.ok).length}/${results.length} passed`, run }, null, 1));
