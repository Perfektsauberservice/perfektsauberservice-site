// Mark a visitor IP as a real customer from inside a (Lambda-style) Netlify
// function. Fully isolated: any error is swallowed so lead notifications are
// never affected.
import { connectLambda, getStore } from '@netlify/blobs';
import { STORE_NAME } from './config.mjs';
import { markCustomer } from './pipeline.mjs';

// Behind Netlify's edge chain, x-nf-client-connection-ip is the first internal hop and
// X-Forwarded-For is "<client>, <netlify hops...>". The real client is the entry right
// before that first hop (entries further left could be client-supplied, i.e. spoofed).
export function clientIp(event) {
  const h = event?.headers || {};
  const xff = String(h['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  const hop = h['x-nf-client-connection-ip'];
  const i = hop ? xff.indexOf(hop) : -1;
  if (i > 0) return xff[i - 1];
  if (i === -1 && hop) return hop;            // no edge hop in front: the connection ip is the client
  return xff[0] || h['client-ip'] || null;
}

// Which headers carried which address (diagnostic, stored with the allowlist entry).
export function ipSources(event) {
  const h = event?.headers || {};
  return { nf: h['x-nf-client-connection-ip'] || null, clientIp: h['client-ip'] || null, xff: h['x-forwarded-for'] || null };
}

export async function markCustomerFromLambda(event, ip, reason, page, strength = 'contact') {
  try {
    if (!ip) return false;
    connectLambda(event);
    const ok = await markCustomer(getStore(STORE_NAME), ip, reason, page, strength);
    return ok;
  } catch (err) {
    console.warn('antifraud allowlist skipped:', String(err?.message || err).slice(0, 160));
    return false;
  }
}
