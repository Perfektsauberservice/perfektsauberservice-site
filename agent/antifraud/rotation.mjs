// PSS Anti-Click-Fraud — rotation planner for the 500-IP limit (REPORT ONLY).
//   node agent/antifraud/rotation.mjs [--store test|prod]
// Ranks every current IP exclusion by how much it is worth keeping, using:
//   * abuse evidence recorded by this system (offender records, decisions)
//   * who added it and when (Google Ads change history, last 30 days)
//   * current risk of the network (local DE/BW ISP vs. datacenter abroad vs. shared relay)
// It never removes anything; removals need Laura's approval.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { adsClient, loadEnv } from './ads-exclusions.mjs';
import { classifyNetwork } from '../../netlify/antifraud/engine.mjs';
import { enc } from '../../netlify/antifraud/pipeline.mjs';
import { DATA_DIR, openStore } from './runner.mjs';

export function keepScore({ evidence, origin, net, ageDays, isRange }) {
  const why = []; let s = 50;
  const add = (w, r) => { s += w; why.push(`${w > 0 ? '+' : ''}${w} ${r}`); };
  if (evidence?.offender) add(60, 'flagged by PSS Anti-Fraud (recorded abuse evidence)');
  if (evidence?.decisions) add(Math.min(20, evidence.decisions * 5), `${evidence.decisions} suspicious decisions recorded`);
  if (isRange) add(15, 'range covers a rotating source');
  if (net.type === 'relay') add(-60, 'shared relay (iCloud Private Relay/WARP): blocks real customers');
  if (net.type === 'datacenter' && net.country && net.country !== 'DE') add(-35, `datacenter abroad (${net.country}) — cannot see BW-targeted ads`);
  else if (net.country && net.country !== 'DE') add(-25, `outside Germany (${net.country}) — campaigns target Baden-Württemberg only`);
  if (net.country === 'DE' && net.type !== 'relay') add(20, 'German network (where the real suspicious clicks come from)');
  if (origin?.client === 'GOOGLE_ADS_API' && !evidence?.offender) add(-5, 'added by an external API tool without PSS evidence');
  if (ageDays > 21 && !evidence?.decisions) add(-10, `no recorded activity, excluded for ${ageDays} days`);
  return { score: s, why };
}

async function origins(client) {
  const rows = await client.search("SELECT change_event.change_date_time, change_event.user_email, change_event.client_type, change_event.resource_change_operation, change_event.new_resource, campaign.name FROM change_event WHERE change_event.change_date_time >= '" +
    new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10) + "' AND change_event.change_date_time <= '" + new Date(Date.now() + 864e5).toISOString().slice(0, 10) +
    "' AND change_event.change_resource_type = 'CAMPAIGN_CRITERION' AND change_event.resource_change_operation = 'CREATE' LIMIT 10000");
  const first = {};
  for (const r of rows) {
    const ip = r.changeEvent.newResource?.campaignCriterion?.ipBlock?.ipAddress;
    if (!ip) continue;
    const t = r.changeEvent.changeDateTime;
    if (!first[ip] || t < first[ip].t) first[ip] = { t, user: r.changeEvent.userEmail, client: r.changeEvent.clientType };
  }
  return first;
}

async function netinfoCached(ip, cache) {
  const host = ip.split('/')[0];
  if (cache[host]) return cache[host];
  const r = await fetch(`https://ipinfo.io/${host}/json${process.env.IPINFO_TOKEN ? '?token=' + process.env.IPINFO_TOKEN : ''}`);
  cache[host] = r.ok ? await r.json() : {};
  return cache[host];
}

/** Rank all current IP exclusions (all non-removed campaigns). Returns rows sorted weakest first,
 *  each with the criterion resource names to remove if Laura approves. */
export async function planRotation(client, store) {
  // network-info cache: local file on the PC; on Netlify (no disk) the store's netinfo/ entries
  const cachePath = `${DATA_DIR}/netinfo-cache.json`;
  let cache = {};
  try { mkdirSync(DATA_DIR, { recursive: true }); if (existsSync(cachePath)) cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { /* Netlify */ }
  for (const b of (await store.list({ prefix: 'netinfo/' })).blobs) {
    const host = b.key.slice('netinfo/'.length).replace(/-/g, '/').replace(/x/g, ':');
    if (!cache[host]) cache[host] = await store.get(b.key, { type: 'json' }).catch(() => ({})) || {};
  }
  const crit = await client.search("SELECT campaign.name, campaign.status, campaign_criterion.resource_name, campaign_criterion.ip_block.ip_address FROM campaign_criterion WHERE campaign_criterion.type = 'IP_BLOCK' AND campaign.status != 'REMOVED'");
  const byIp = {}, perCamp = {};
  for (const r of crit) {
    (byIp[r.campaignCriterion.ipBlock.ipAddress] ||= []).push({ campaign: r.campaign.name, resourceName: r.campaignCriterion.resourceName });
    perCamp[r.campaign.name] = (perCamp[r.campaign.name] || 0) + 1;
  }
  const orig = await origins(client);
  const decKeys = (await store.list({ prefix: 'dec/' })).blobs.map(b => b.key);   // list once, not per IP
  const rows = [];
  for (const ip of Object.keys(byIp)) {
    const host = ip.split('/')[0];
    const net = classifyNetwork(await netinfoCached(ip, cache));
    const offender = await store.get(`off/ip/${enc(host)}`, { type: 'json' }).catch(() => null);
    const customer = await store.get(`allow/ip/${enc(host)}`, { type: 'json' }).catch(() => null);
    const decisions = decKeys.filter(k => k.endsWith(`_${enc(host)}`)).length;
    const o = orig[ip] || orig[host + '/32'] || null;
    const ageDays = o ? Math.floor((Date.now() - Date.parse(o.t.replace(' ', 'T') + '+02:00')) / 864e5) : null;
    const k = keepScore({ evidence: { offender: !!offender, decisions }, origin: o, net, ageDays, isRange: ip.endsWith('/24') });
    if (customer) { k.score -= 100; k.why.push('-100 real customer (call/WhatsApp/form) — exclusion blocks a client'); }
    rows.push({ ip, criteria: byIp[ip], campaigns: byIp[ip].length, addedBy: o ? `${o.user} via ${o.client === 'GOOGLE_ADS_API' ? 'API' : 'web'} ${o.t.slice(0, 16)}` : 'older than 30 days / unknown',
      country: net.country, asn: net.asn, org: net.org, type: net.type, keep: k.score, why: k.why.join('; ') });
  }
  try { writeFileSync(cachePath, JSON.stringify(cache)); } catch { /* Netlify */ }
  rows.sort((a, b) => a.keep - b.keep);
  return { rows, perCampaign: perCamp };
}

async function main() {
  const kind = (process.argv.includes('--store') && process.argv[process.argv.indexOf('--store') + 1]) || 'test';
  const { rows, perCampaign } = await planRotation(adsClient(loadEnv()), openStore(kind));
  const csv = ['ip;campaigns;added_by;country;asn;org;network_type;keep_score;reasons'].concat(rows.map(r => [r.ip, r.campaigns, r.addedBy, r.country, r.asn, `"${r.org}"`, r.type, r.keep, `"${r.why}"`].join(';'))).join('\n');
  const out = `${DATA_DIR}/rotation-plan-${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(out, '﻿' + csv + '\n');
  const counts = rows.reduce((m, r) => (m[r.type] = (m[r.type] || 0) + 1, m), {});
  console.log(JSON.stringify({ file: out, uniqueExclusions: rows.length, perCampaign, byNetworkType: counts,
    removalCandidates: rows.filter(r => r.keep < 30).length, lowest: rows.slice(0, 8).map(r => `${r.ip} ${r.country} ${r.org} keep=${r.keep}`) }, null, 1));
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('rotation.mjs')) main();
