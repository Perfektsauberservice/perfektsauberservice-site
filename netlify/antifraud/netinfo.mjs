// Network info for an IP: ASN, holder, announced prefix, country/city.
// Primary source: RIPEstat (RIPE NCC, Amsterdam — EU, no key, no quota for our volume).
// Fallback: ipinfo.io. Output is ipinfo-shaped ({ org: 'AS123 Holder', country, city }) so the
// engine/classifier stay unchanged.
const RIPE = 'https://stat.ripe.net/data';
const j = async (fetchImpl, url) => { const r = await fetchImpl(url, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };

export async function lookupNet(ip, { fetchImpl = fetch, ipinfoToken = null } = {}) {
  try {
    const q = encodeURIComponent(ip);
    const [net, geo] = await Promise.all([
      j(fetchImpl, `${RIPE}/network-info/data.json?resource=${q}&sourceapp=pss-antifraud`),
      j(fetchImpl, `${RIPE}/maxmind-geo-lite/data.json?resource=${q}&sourceapp=pss-antifraud`).catch(() => null),
    ]);
    const asn = net?.data?.asns?.[0];
    if (!asn) throw new Error('no ASN from RIPEstat');
    const ov = await j(fetchImpl, `${RIPE}/as-overview/data.json?resource=AS${asn}&sourceapp=pss-antifraud`).catch(() => null);
    const loc = geo?.data?.located_resources?.[0]?.locations?.[0] || {};
    return { ip, org: `AS${asn} ${ov?.data?.holder || ''}`.trim(), prefix: net.data.prefix || null,
      country: loc.country || null, city: loc.city || null, source: 'ripestat' };
  } catch (primaryErr) {
    const r = await fetchImpl(`https://ipinfo.io/${encodeURIComponent(ip)}/json${ipinfoToken ? `?token=${ipinfoToken}` : ''}`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`netinfo failed: ${String(primaryErr).slice(0, 80)}; ipinfo ${r.status}`);
    return { ...(await r.json()), source: 'ipinfo' };
  }
}
