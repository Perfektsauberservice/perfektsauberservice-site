import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, classifyNetwork, uaVerdict } from '../netlify/antifraud/engine.mjs';
import { networkOf, hostCidr } from '../netlify/antifraud/ip.mjs';

const T0 = Date.UTC(2026, 9, 14, 15, 0, 0);
const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari';
const O2 = { org: 'AS6805 Telefonica Germany GmbH & Co.OHG', hostname: 'dynamic-176-007-201-161.176.7.pool.telefonica.de', country: 'DE' };
const VERSATEL = { org: 'AS8881 1&1 Versatel Deutschland GmbH', country: 'DE' };
const ALIBABA = { org: 'AS45102 Alibaba (US) Technology Co., Ltd.', country: 'SG' };
const RELAY = { org: 'AS13335 Cloudflare, Inc.', country: 'DE' };

const ev = (over = {}) => ({ t: T0, ip: '94.134.182.67', cid: 'c-last', ua: BROWSER, lang: 'de-DE', geo: { country: 'DE', subdivision: 'BW', city: 'Karlsruhe' }, ...over });
// n distinct paid clicks from one IP, the last one at T0, spaced by stepMs
const clicks = (n, stepMs) => Array.from({ length: n }, (_, i) => ({ t: T0 - (n - 1 - i) * stepMs, cid: i === n - 1 ? 'c-last' : `c${i}` }));

test('single paid click is only logged', () => {
  const r = evaluate(ev(), { ip: clicks(1, 0) }, VERSATEL);
  assert.equal(r.level, 'log'); assert.equal(r.proposal, null);
});

test('2 paid clicks within 5 minutes -> analysis', () => {
  const r = evaluate(ev(), { ip: clicks(2, 2 * 60e3) }, VERSATEL);
  assert.equal(r.level, 'analyze'); assert.equal(r.counts.c5, 2);
});

test('2 clicks 6 minutes apart do not trigger the 5-minute rule', () => {
  assert.equal(evaluate(ev(), { ip: clicks(2, 6 * 60e3) }, VERSATEL).level, 'log');
});

test('reloads (same gclid) are not counted as new paid clicks', () => {
  const hist = [{ t: T0 - 60e3, cid: 'c-last' }, { t: T0 - 30e3, cid: 'c-last' }, { t: T0, cid: 'c-last' }];
  const r = evaluate(ev(), { ip: hist }, VERSATEL);
  assert.equal(r.level, 'log'); assert.equal(r.counts.c5, 1); assert.equal(r.counts.reloads, 2);
});

test('2 paid clicks from an ordinary German IP -> alert only, no exclusion', () => {
  const r = evaluate(ev(), { ip: clicks(2, 2 * 60e3) }, VERSATEL);
  assert.equal(r.level, 'analyze'); assert.equal(r.proposal, null);
});

test('3 paid clicks in 10 minutes from one IP -> exclusion before a 4th click (Laura 14.10)', () => {
  const r = evaluate(ev(), { ip: clicks(3, 3 * 60e3) }, VERSATEL);
  assert.equal(r.level, 'recommend_exclude'); assert.equal(r.proposal.cidr, '94.134.182.67/32');
});

test('3 paid clicks spread over more than 10 minutes do not exclude', () => {
  assert.equal(evaluate(ev(), { ip: clicks(3, 6 * 60e3) }, VERSATEL).proposal, null);
});

test('server/datacenter IP is excluded already at the 2nd paid click', () => {
  const r = evaluate(ev({ ip: '47.82.201.10', geo: { country: 'SG' } }), { ip: clicks(2, 60e3) }, ALIBABA);
  assert.equal(r.level, 'recommend_exclude');
});

test('extreme burst (6 in 10 min) from one IP -> exclusion of that single IP', () => {
  const r = evaluate(ev(), { ip: clicks(6, 60e3) }, VERSATEL);
  assert.equal(r.level, 'recommend_exclude'); assert.equal(r.proposal.cidr, '94.134.182.67/32');
});

test('datacenter network + 3 clicks in 10 min -> exclusion with written reasons', () => {
  const r = evaluate(ev({ ip: '47.82.201.10', geo: { country: 'SG' } }), { ip: clicks(3, 2 * 60e3) }, ALIBABA);
  assert.equal(r.level, 'recommend_exclude');
  assert.ok(r.reasons.some(x => x.includes('AS45102')));
  assert.ok(r.reasons.some(x => x.includes('outside Germany')));
});

test('shared relay (iCloud Private Relay / WARP): 3 clicks only alert, exclusion from the 4th', () => {
  assert.equal(evaluate(ev({ ip: '104.28.62.25' }), { ip: clicks(3, 60e3) }, RELAY).proposal, null);
  assert.equal(evaluate(ev({ ip: '104.28.62.25' }), { ip: clicks(4, 60e3) }, RELAY).proposal.cidr, '104.28.62.25/32');
});

test('device fingerprint seen on several IPs (IP rotation) is correlated across days', () => {
  const fp = [
    { t: T0 - 2 * 864e5, ip: '176.7.204.123', cid: 'a' }, { t: T0 - 2 * 864e5 + 60e3, ip: '176.7.204.123', cid: 'b' },
    { t: T0 - 864e5, ip: '176.7.208.68', cid: 'c' }, { t: T0 - 3600e3, ip: '176.7.208.68', cid: 'd' }, { t: T0, ip: '176.7.201.161', cid: 'c-last' },
  ];
  const r = evaluate(ev({ ip: '176.7.201.161' }), { ip: clicks(1, 0), fp }, O2);
  assert.equal(r.level, 'analyze');
  assert.ok(r.reasons.some(x => x.includes('3 IPs')));
  assert.equal(r.proposal, null);   // weak signal alone never excludes
});

test('a shared browser fingerprint from a flagged IP does not make an ordinary visitor an offender', () => {
  const r = evaluate(ev({ ip: '176.7.9.9' }), { ip: clicks(2, 2 * 60e3), offenders: { fp: true } }, O2);
  assert.notEqual(r.level, 'recommend_exclude');
});

test('repeat offender on a new day + new burst -> exclusion', () => {
  const r = evaluate(ev(), { ip: clicks(3, 2 * 60e3), offenders: { ip: true } }, VERSATEL);
  assert.equal(r.level, 'recommend_exclude');
});

test('/24 is proposed for a fixed-line ISP after 2 flagged IPs, never wider', () => {
  const r = evaluate(ev({ ip: '94.134.182.87' }), { ip: clicks(6, 60e3), offenders: { netIps: ['94.134.182.72'] } }, VERSATEL);
  assert.equal(r.proposal.cidr, '94.134.182.0/24'); assert.equal(r.proposal.kind, 'cidr24');
});

test('mobile carrier (O2 CGNAT) needs 3 flagged IPs before a /24 is proposed', () => {
  const two = evaluate(ev({ ip: '176.7.201.200' }), { ip: clicks(6, 60e3), offenders: { netIps: ['176.7.201.161'] } }, O2);
  assert.equal(two.proposal.cidr, '176.7.201.200/32');
  const three = evaluate(ev({ ip: '176.7.201.200' }), { ip: clicks(6, 60e3), offenders: { netIps: ['176.7.201.161', '176.7.201.5'] } }, O2);
  assert.equal(three.proposal.cidr, '176.7.201.0/24');
});

test('Google ad-quality crawler and allowlisted IPs are ignored', () => {
  assert.equal(evaluate(ev({ ua: 'AdsBot-Google (+http://www.google.com/adsbot.html)' }), { ip: clicks(9, 10e3) }, VERSATEL).level, 'ignore');
  assert.equal(evaluate(ev(), { ip: clicks(9, 10e3) }, VERSATEL, { allowlist: ['94.134.182.67'] }).level, 'ignore');
});

test('3 IPs of one /24 clicking within an hour -> network alert', () => {
  const net = [{ t: T0 - 50 * 60e3, ip: '94.134.182.1', cid: 'x' }, { t: T0 - 20 * 60e3, ip: '94.134.182.2', cid: 'y' }, { t: T0, ip: '94.134.182.67', cid: 'c-last' }];
  const r = evaluate(ev(), { ip: clicks(1, 0), net }, VERSATEL);
  assert.equal(r.level, 'analyze'); assert.ok(r.reasons.some(x => x.includes('3 different IPs')));
});

test('network helpers', () => {
  assert.equal(networkOf('176.7.201.161'), '176.7.201.0/24');
  assert.equal(networkOf('2a02:810d:4b00:1::5'), '2a02:810d:4b00:0001::/64');
  assert.equal(hostCidr('2a02::1'), '2a02::1/128');
  assert.equal(classifyNetwork(O2).type, 'mobile');
  assert.equal(classifyNetwork(ALIBABA).type, 'datacenter');
  assert.equal(classifyNetwork(RELAY).type, 'relay');
  assert.equal(uaVerdict('python-requests/2.31'), 'bot');
});
