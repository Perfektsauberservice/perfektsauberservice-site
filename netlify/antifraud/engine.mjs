// PSS Anti-Click-Fraud — scoring engine (pure, no I/O).
//
// A "paid click" is one distinct Google click id (gclid/gbraid/wbraid).
// A page reload keeps the same id, so it is counted as a reload, never as a
// new click. Every point of the score carries a written reason.

import { RULES, WEIGHTS, DATACENTER_ASNS, RELAY_ASNS, MOBILE_CARRIER_ASNS, MOBILE_HOSTNAME_RE,
  BOT_UA_RE, GOOGLE_VERIFIER_UA_RE, TARGET_COUNTRY, TARGET_SUBDIVISIONS } from './config.mjs';
import { networkOf, hostCidr } from './ip.mjs';

export function classifyNetwork(info = {}) {
  const asn = Number(String(info.org || '').match(/^AS(\d+)/)?.[1] || info.asn || 0) || null;
  const org = String(info.org || '').replace(/^AS\d+\s*/, '');
  let type = 'isp';
  if (!asn) type = 'unknown';
  else if (RELAY_ASNS.has(asn)) type = 'relay';
  else if (DATACENTER_ASNS.has(asn)) type = 'datacenter';
  else if (MOBILE_CARRIER_ASNS.has(asn) && (asn === 6805 || MOBILE_HOSTNAME_RE.test(info.hostname || ''))) type = 'mobile';
  return { asn, org, type, country: info.country || null, city: info.city || null, region: info.region || null };
}

export function uaVerdict(ua = '') {
  if (GOOGLE_VERIFIER_UA_RE.test(ua)) return 'google_verifier';
  if (!ua || BOT_UA_RE.test(ua)) return 'bot';
  return 'browser';
}

// Distinct click ids inside [now - windowMs, now].
function distinct(list, now, windowMs, key = 'cid') {
  return new Set(list.filter(x => now - x.t <= windowMs).map(x => x[key])).size;
}

/**
 * @param event   { t, ip, cid, ua, lang, geo:{country, subdivision, city}, fp }
 * @param history { ip:[{t,cid}], net:[{t,ip,cid}], fp:[{t,ip,cid}],
 *                  offenders:{ ip:boolean, fp:boolean, netIps:string[] } }  (event itself included)
 * @param netinfo raw ipinfo-style record ({org, hostname, country, city})
 */
export function evaluate(event, history, netinfo = {}, opts = {}) {
  const now = event.t;
  const net = classifyNetwork(netinfo);
  const ua = uaVerdict(event.ua);
  const reasons = [];
  let score = 0;
  const add = (w, why) => { score += w; reasons.push(`+${w} ${why}`); };

  if (ua === 'google_verifier') return { level: 'ignore', score: 0, reasons: ['Google ad-quality crawler (AdsBot/Googlebot) — not a paid click'], net, ua };
  if ((opts.allowlist || []).includes(event.ip)) return { level: 'ignore', score: 0, reasons: ['IP on PSS allowlist'], net, ua };

  const ipList = history.ip || [];
  const c5 = distinct(ipList, now, RULES.analyzeWindowMs);
  const c10 = distinct(ipList, now, RULES.evaluateWindowMs);
  const c60 = distinct(ipList, now, RULES.hourWindowMs);
  const reloads = ipList.filter(x => x.cid === event.cid).length - 1;
  const netIps = new Set((history.net || []).filter(x => now - x.t <= RULES.networkWindowMs).map(x => x.ip)).size;
  const fpList = (history.fp || []).filter(x => now - x.t <= RULES.lookbackMs);
  const fpIps = new Set(fpList.map(x => x.ip)).size;
  const fpClicks = new Set(fpList.map(x => x.cid)).size;
  const off = history.offenders || {};

  let level = 'log';
  if (c5 >= RULES.analyzeClicks) { level = 'analyze'; add(WEIGHTS.analyze, `${c5} paid clicks from this IP in 5 min`); }
  if (c10 >= RULES.evaluateClicks) { level = 'evaluate'; add(WEIGHTS.evaluate, `${c10} paid clicks from this IP in 10 min (> 3)`); }
  if (c60 >= RULES.hourClicks) add(WEIGHTS.hour, `${c60} paid clicks from this IP in 60 min`);
  if (netIps >= RULES.networkIps) { add(WEIGHTS.network, `${netIps} different IPs from network ${networkOf(event.ip)} clicked within 60 min`); if (level === 'log') level = 'analyze'; }
  if (fpIps >= RULES.fingerprintIps && fpClicks >= RULES.fingerprintClicks) {
    add(WEIGHTS.fingerprint, `same device fingerprint on ${fpIps} IPs, ${fpClicks} paid clicks in 14 days (IP rotation)`);
    if (level === 'log') level = 'analyze';
  }
  if (off.ip || off.fp) add(WEIGHTS.repeatOffender, `already flagged earlier (${[off.ip && 'IP', off.fp && 'device'].filter(Boolean).join(' + ')}) — cross-day repeat`);
  if (net.type === 'datacenter') add(WEIGHTS.datacenter, `datacenter/hosting network AS${net.asn} ${net.org}`);
  const country = event.geo?.country || net.country;
  if (country && country !== TARGET_COUNTRY) add(WEIGHTS.foreign, `outside Germany (${country})`);
  else if (event.geo?.subdivision && !TARGET_SUBDIVISIONS.includes(event.geo.subdivision)) add(WEIGHTS.outsideRegion, `outside Baden-Württemberg (${event.geo.subdivision})`);
  if (ua === 'bot') add(WEIGHTS.botUa, `automated user agent "${String(event.ua || '(empty)').slice(0, 60)}"`);
  if (!event.lang) add(WEIGHTS.noAcceptLanguage, 'browser sends no language header');

  const strong = net.type === 'datacenter' || ua === 'bot' || (country && country !== TARGET_COUNTRY) || off.ip || off.fp
    || (fpIps >= RULES.fingerprintIps && fpClicks >= RULES.fingerprintClicks);
  // Exclusion proposal: frequency alone is never enough (Laura's rule), except an extreme burst.
  const burst = c10 >= RULES.evaluateClicks + 2;
  let proposal = null;
  if (score >= RULES.recommendScore && (c10 >= RULES.evaluateClicks || (c10 >= 3 && strong)) && (strong || burst)) {
    if (net.type === 'relay') {
      reasons.push('no exclusion: shared relay network (iCloud Private Relay / WARP) used by many real people');
    } else {
      level = 'recommend_exclude';
      proposal = { cidr: hostCidr(event.ip), kind: 'ip' };
      const offenders = new Set([...(off.netIps || []), event.ip]);
      const need = net.type === 'mobile' ? RULES.cidrOffendersMobile : RULES.cidrOffenders;
      const nw = networkOf(event.ip);
      if (offenders.size >= need && nw && nw.endsWith('/24')) {
        proposal = { cidr: nw, kind: 'cidr24', offenders: [...offenders] };
        reasons.push(`${offenders.size} flagged IPs inside ${nw} -> narrow /24 range proposed (never wider)`);
      }
    }
  }
  return { level, score, reasons, proposal, net, ua, counts: { c5, c10, c60, reloads, netIps, fpIps, fpClicks } };
}
