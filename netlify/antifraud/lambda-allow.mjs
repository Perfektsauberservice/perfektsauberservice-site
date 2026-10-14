// Mark a visitor IP as a real customer from inside a (Lambda-style) Netlify
// function. Fully isolated: any error is swallowed so lead notifications are
// never affected.
import { connectLambda, getStore } from '@netlify/blobs';
import { STORE_NAME } from './config.mjs';
import { markCustomer } from './pipeline.mjs';

export function clientIp(event) {
  const h = event?.headers || {};
  return h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || null;
}

export async function markCustomerFromLambda(event, ip, reason, page) {
  try {
    if (!ip) return false;
    connectLambda(event);
    return await markCustomer(getStore(STORE_NAME), ip, reason, page);
  } catch (err) {
    console.warn('antifraud allowlist skipped:', String(err?.message || err).slice(0, 160));
    return false;
  }
}
