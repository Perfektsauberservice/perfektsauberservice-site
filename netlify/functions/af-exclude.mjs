// PSS Anti-Fraud — immediate exclusion executor (Netlify Function, no PC needed).
// Triggered by the af-capture edge function right after it queues an exclusion
// proposal. It accepts NO input: it only processes proposals already queued in
// Netlify Blobs by the system, so nobody can push foreign IPs through it.
// Writes go through ads-exclusions.mjs (guard: only IP_BLOCK exclusions).
import { adsClient } from '../../agent/antifraud/ads-exclusions.mjs';
import { processProposals } from '../../agent/antifraud/runner.mjs';
import { adsEnvFromNetlify, storeFor, enforceFor, notifier } from '../antifraud/server.mjs';

export default async (req, context) => {
  const store = storeFor(context);
  const { env, missing } = adsEnvFromNetlify();
  if (missing.length) {
    await store.setJSON(`health/error/${Date.now()}`, { t: Date.now(), error: `af-exclude: missing env ${missing.join(', ')}` });
    return Response.json({ ok: false, missing }, { status: 503 });
  }
  const { notifyTeam } = notifier(context, store);
  const t0 = Date.now();
  const done = await processProposals({ store, client: adsClient(env), notify: notifyTeam, enforce: enforceFor(context),
    ledgerPath: null, executor: 'netlify' });
  await store.setJSON('health/af-exclude', { t: Date.now(), processed: done.length, ms: Date.now() - t0, enforce: enforceFor(context) });
  return Response.json({ ok: true, processed: done.map(d => ({ cidr: d.proposal.cidr, status: d.status, reactionMs: d.reactionMs })) });
};
