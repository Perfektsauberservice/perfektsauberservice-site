// IP helpers: version detection, network grouping and exclusion CIDRs.

export function ipVersion(ip) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip || '')) return 4;
  if ((ip || '').includes(':')) return 6;
  return 0;
}

function expandV6(ip) {
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const fill = ip.includes('::') ? Array(8 - h.length - t.length).fill('0') : [];
  return [...h, ...fill, ...t].map(x => x.padStart(4, '0'));
}

// Network key used for correlation: IPv4 /24, IPv6 /64.
export function networkOf(ip) {
  const v = ipVersion(ip);
  if (v === 4) return ip.split('.').slice(0, 3).join('.') + '.0/24';
  if (v === 6) return expandV6(ip).slice(0, 4).join(':') + '::/64';
  return null;
}

// Exclusion entries Google Ads accepts for IP_BLOCK criteria.
export function hostCidr(ip) {
  return ipVersion(ip) === 6 ? `${ip}/128` : `${ip}/32`;
}

export function isPrivate(ip) {
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i.test(ip || '');
}
