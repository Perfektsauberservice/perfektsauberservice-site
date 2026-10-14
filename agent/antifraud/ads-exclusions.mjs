// PSS Anti-Click-Fraud — Google Ads IP/CIDR exclusion module.
//
// The ONLY write this module can send is campaignCriteria:mutate with
// IP_BLOCK create operations, or removes of IP_BLOCK criteria that this
// module itself created (recorded in the ledger). Everything else is refused
// by assertOnlyIpBlockOps() before any request leaves the machine.
// Real writes need BOTH the --enforce flag and AF_ENFORCE=1; otherwise every
// mutate is sent with validateOnly=true (Google checks it, nothing changes).

import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const MAX_IP_EXCLUSIONS = 500;
const API = 'v24';

export function loadEnv(path = process.env.AF_ADS_ENV || 'C:/tmp/google-ads/.env') {
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
}

export function assertOnlyIpBlockOps(operations, ownedResourceNames = new Set()) {
  if (!Array.isArray(operations) || !operations.length) throw new Error('no operations');
  for (const op of operations) {
    const keys = Object.keys(op);
    if (keys.length !== 1) throw new Error('refused: one action per operation');
    if (op.create) {
      const c = op.create; const allowed = ['campaign', 'negative', 'ipBlock'];
      if (Object.keys(c).some(k => !allowed.includes(k)) || c.negative !== true || !c.ipBlock?.ipAddress)
        throw new Error('refused: only negative IP_BLOCK criteria may be created');
      if (!/^customers\/\d+\/campaigns\/\d+$/.test(c.campaign)) throw new Error('refused: bad campaign');
      const [addr, len] = c.ipBlock.ipAddress.split('/');
      const v6 = addr.includes(':');
      if (!v6 && !(len === '32' || len === '24')) throw new Error('refused: IPv4 exclusions must be /32 or /24');
      if (v6 && len !== '128') throw new Error('refused: IPv6 exclusions must be /128');
    } else if (op.remove) {
      if (!ownedResourceNames.has(op.remove)) throw new Error(`refused: ${op.remove} was not created by PSS Anti-Fraud`);
    } else {
      throw new Error(`refused: operation "${keys[0]}" not allowed`);
    }
  }
}

export function adsClient(env = loadEnv(), fetchImpl = fetch) {
  const cid = (env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  let token = null, tokenAt = 0;
  async function auth() {
    if (token && Date.now() - tokenAt < 45 * 60e3) return token;
    const r = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
        refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
    if (!r.ok) throw new Error(`oauth ${r.status}`);
    token = (await r.json()).access_token; tokenAt = Date.now(); return token;
  }
  async function call(path, body) {
    const r = await fetchImpl(`https://googleads.googleapis.com/${API}/customers/${cid}/${path}`, { method: 'POST',
      headers: { authorization: `Bearer ${await auth()}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'login-customer-id': (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, ''), 'content-type': 'application/json' },
      body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) throw new Error(`ads ${path} ${r.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text || '{}');
  }
  async function search(query) {
    let out = [], pageToken;
    do { const r = await call('googleAds:search', { query, ...(pageToken ? { pageToken } : {}) }); out = out.concat(r.results || []); pageToken = r.nextPageToken; } while (pageToken);
    return out;
  }
  return { cid, search, call };
}

export async function currentExclusions(client) {
  const camps = await client.search("SELECT campaign.resource_name, campaign.name, campaign.status FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED') AND campaign.advertising_channel_type = 'SEARCH'");
  const rows = await client.search("SELECT campaign.resource_name, campaign_criterion.resource_name, campaign_criterion.ip_block.ip_address FROM campaign_criterion WHERE campaign_criterion.type = 'IP_BLOCK' AND campaign.status IN ('ENABLED', 'PAUSED')");
  return camps.map(c => {
    const own = rows.filter(r => r.campaign.resourceName === c.campaign.resourceName);
    return { resourceName: c.campaign.resourceName, name: c.campaign.name,
      ips: own.map(r => ({ ip: r.campaignCriterion.ipBlock.ipAddress, resourceName: r.campaignCriterion.resourceName })) };
  });
}

const norm = ip => (ip.includes('/') ? ip : ip.includes(':') ? `${ip}/128` : `${ip}/32`);

/** Plan + send (validateOnly unless enforce) one exclusion to every enabled AND paused Search campaign
 *  (paused ones are protected too, in case they are switched back on). */
export async function applyExclusion(client, cidr, { enforce = false, ledgerPath, now = () => Date.now() } = {}) {
  if (enforce && process.env.AF_ENFORCE !== '1') throw new Error('refused: enforce requested but AF_ENFORCE is not 1');
  const t0 = now();
  const campaigns = await currentExclusions(client);
  const plan = campaigns.map(c => {
    if (c.ips.some(x => norm(x.ip) === cidr)) return { campaign: c.name, action: 'already_excluded' };
    if (c.ips.length >= MAX_IP_EXCLUSIONS) return { campaign: c.name, action: 'capacity_full', count: c.ips.length };
    return { campaign: c.name, action: 'create', op: { create: { campaign: c.resourceName, negative: true, ipBlock: { ipAddress: cidr } } } };
  });
  const ops = plan.filter(p => p.op).map(p => p.op);
  let result = null;
  if (ops.length) {
    assertOnlyIpBlockOps(ops);
    result = await client.call('campaignCriteria:mutate', { operations: ops, validateOnly: !enforce, partialFailure: false });
  }
  let verified = null;
  if (enforce && ops.length) {
    const after = await currentExclusions(client);
    verified = plan.filter(p => p.op).every(p => after.find(c => c.name === p.campaign)?.ips.some(x => norm(x.ip) === cidr));
  }
  const entry = { t: t0, doneAt: now(), cidr, mode: enforce ? 'enforce' : 'validate_only',
    plan: plan.map(({ op, ...p }) => p), created: (result?.results || []).map(r => r.resourceName).filter(Boolean), verified };
  if (ledgerPath) { mkdirSync(dirname(ledgerPath), { recursive: true }); appendFileSync(ledgerPath, JSON.stringify(entry) + '\n'); }
  return entry;
}

/** Undo: remove only criteria recorded as created by this module. */
export async function undoExclusion(client, ledgerEntry, { enforce = false } = {}) {
  if (enforce && process.env.AF_ENFORCE !== '1') throw new Error('refused: enforce requested but AF_ENFORCE is not 1');
  const owned = new Set(ledgerEntry.created || []);
  const ops = [...owned].map(rn => ({ remove: rn }));
  if (!ops.length) return { removed: 0 };
  assertOnlyIpBlockOps(ops, owned);
  await client.call('campaignCriteria:mutate', { operations: ops, validateOnly: !enforce });
  return { removed: ops.length, mode: enforce ? 'enforce' : 'validate_only' };
}
