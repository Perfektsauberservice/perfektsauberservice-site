// PSS Anti-Click-Fraud — rules and network lists (V1).
// Pure data: imported by the edge function, the local runner and the tests.

export const STORE_NAME = 'pss-antifraud';

// Laura's rules (2026-10-14): 2 paid clicks / 5 min -> alert; 3 paid clicks / 10 min -> exclusion
// (2 with a strong signal). 'evaluate' (4 / 10 min) remains only as an alert level.
export const RULES = {
  analyzeClicks: 2, analyzeWindowMs: 5 * 60e3,
  evaluateClicks: 4, evaluateWindowMs: 10 * 60e3,
  hourClicks: 5, hourWindowMs: 60 * 60e3,
  networkIps: 3, networkWindowMs: 60 * 60e3,        // distinct IPs clicking from one /24 (or IPv6 /64)
  fingerprintIps: 3, fingerprintClicks: 5,          // same header fingerprint on >=3 IPs, >=5 paid clicks (weak signal: many phones share it)
  lookbackMs: 14 * 24 * 3600e3,                     // cross-day correlation window
  excludeClicks: 3,                                 // paid clicks / 10 min from one IP -> exclusion
  excludeClicksStrong: 2,                           // with a strong signal (server, bot, abroad, flagged before)
  excludeClicksRelay: 4,                            // shared relay egress (iCloud Private Relay / WARP)
  dayClicks: 3, dayWindowMs: 24 * 3600e3,           // Laura 22.10: more than 2 paid clicks from one IP in 24 h -> exclusion, however human it looks
  cidrOffenders: 2,                                 // offender IPs in one /24 before a /24 is proposed
  cidrOffendersMobile: 3,                           // stricter for mobile/CGNAT carriers
  retentionDays: 30,
  deadDwellMs: 4000,                                // visit shorter than this, with no scroll/touch = no human activity
  beaconGraceMs: 20000,                             // no beacon at all after this long = no human activity
  mobileExclusionDays: 45,                          // own exclusions of mobile (CGNAT) IPs expire, the IP goes to someone else

};

export const WEIGHTS = {
  analyze: 25, evaluate: 45, hour: 15, network: 20, fingerprint: 15,
  repeatOffender: 45, repeatDevice: 10, datacenter: 40, foreign: 25, outsideRegion: 10,
  botUa: 40, noAcceptLanguage: 10, trap: 60, deadVisit: 35, signature: 30, knownNetwork: 35,
};

// Target region of the campaigns: Baden-Württemberg, Germany.
export const TARGET_COUNTRY = 'DE';
export const TARGET_SUBDIVISIONS = ['BW'];

// Hosting / cloud / datacenter networks: no real customer searches from here.
export const DATACENTER_ASNS = new Set([
  45102, 37963, 24429,          // Alibaba
  16509, 14618, 8987,           // Amazon AWS
  396982, 19527,                // Google Cloud
  8075, 8068,                   // Microsoft Azure
  14061,                        // DigitalOcean
  16276,                        // OVH
  24940, 213230,                // Hetzner
  51167,                        // Contabo
  63949,                        // Akamai Linode
  20473,                        // Vultr / Choopa
  132203, 45090,                // Tencent
  136907, 55990,                // Huawei Cloud
  9009,                         // M247
  60068, 212238,                // Datacamp / CDN77
  62240,                        // Clouvider
  60781, 16265, 28753,          // Leaseweb
  46606, 26347,                 // Unified Layer / DreamHost
  31898,                        // Oracle Cloud
  12876,                        // Scaleway
  197540,                       // netcup
  8560,                         // IONOS hosting
  40021, 53667, 399629,         // Contabo US / FranTech / BL Networks
]);

// Shared egress networks used by many real people at once (iCloud Private
// Relay, Cloudflare WARP, Fastly/Akamai relays). Never excluded automatically.
export const RELAY_ASNS = new Set([13335, 36183, 54113, 20940, 16625]);

// German mobile carriers: one IP is shared by many subscribers (CGNAT) and
// changes often -> stricter evidence before excluding, never wider than /24.
export const MOBILE_CARRIER_ASNS = new Set([6805, 3209, 3320]);
export const MOBILE_HOSTNAME_RE = /(pool\.telefonica\.de|mobile|\.mnet\.|dyn\.telefonica|customer\.vodafone|\.ipv4\.mobile)/i;

export const BOT_UA_RE = /(bot|crawl|spider|headless|phantom|puppeteer|playwright|selenium|python-requests|curl\/|wget|httpclient|go-http|java\/|scrapy|axios|node-fetch)/i;
// Google's own ad-quality crawlers visit landing pages; never count them.
export const GOOGLE_VERIFIER_UA_RE = /(AdsBot-Google|Mediapartners-Google|Google-Adwords|Google-InspectionTool|Googlebot)/i;

// Known attacker signatures, learned from the click history (Laura approved 15.10.2026).
// Since 08.09.2026 the click waves come from Bietigheim / Daxlanden (Karlsruhe), always mobile,
// always on Haushalts-/Wohnungsauflösung, mostly 17-19h. A match is a STRONG signal (exclusion at
// the 2nd paid click). Google's own location ("Daxlanden") arrives hours later, so at click time
// the match uses what the site sees: device, landing page, IP place and operator.
export const ATTACKER_SIGNATURES = [
  {
    id: 'bietigheim-daxlanden-auflösung',
    label: 'tiparul valurilor din Bietigheim / Daxlanden (mobil, Haushalts-/Wohnungsauflösung)',
    pathRe: /(haushalts|wohnungs)aufloesung/i,
    mobileOnly: true,
    cities: ['Bietigheim', 'Daxlanden', 'Karlsruhe-Daxlanden'],                 // place seen directly
    asnCities: { 6805: ['Karlsruhe', 'Rastatt', 'Bietigheim', 'Durmersheim', 'Rheinstetten'] },   // O2 mobile pools seen in the waves
    adsPlaces: ['Bietigheim', 'Daxlanden'],                                    // Google click_view location (retro check)
    adsKeywordRe: /(haushalts|wohnungs)aufl[öo]sung/i,
  },
];
