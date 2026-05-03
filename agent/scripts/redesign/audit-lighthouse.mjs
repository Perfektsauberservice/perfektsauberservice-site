// Level-2 audit using Google PageSpeed Insights API (cloud-hosted Lighthouse).
// No local install needed — PSI returns the same scores Google uses internally.
// Free tier: 5 unauthenticated requests/sec. We test 8 pages × 2 strategies.

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const SITE = 'https://perfektsauberservice.com';

const URLS = [
  { name: 'Homepage',           url: `${SITE}/` },
  { name: 'City × service',     url: `${SITE}/bueroaufloesung-karlsruhe` },
  { name: 'Reinigung-City',     url: `${SITE}/grundreinigung-karlsruhe` },
  { name: 'Calculator',         url: `${SITE}/preisrechner` },
  { name: 'Blog article',       url: `${SITE}/blog/entruempelung-achern-entruempelung-im-winter--tipps-fuer` },
];

const STRATEGIES = ['mobile'];   // Most important for SEO, cuts API calls in half

const SLEEP_BETWEEN_MS = 12000;  // Stay under PSI rate limit
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const CATEGORIES = ['performance', 'seo', 'accessibility', 'best-practices'];

async function runPsi(url, strategy, attempt = 1) {
  const params = new URLSearchParams({ url, strategy });
  for (const c of CATEGORIES) params.append('category', c);
  const fetchUrl = `${PSI_BASE}?${params}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(fetchUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.status === 429 && attempt < 4) {
      const wait = 30000 * attempt;
      process.stdout.write(`(429, waiting ${wait/1000}s...) `);
      await sleep(wait);
      return runPsi(url, strategy, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (e) {
    clearTimeout(t);
    return { error: e.message };
  }
}

function extractMetrics(data) {
  if (data.error) return { error: data.error };
  const lh = data.lighthouseResult;
  if (!lh) return { error: 'no lighthouseResult' };

  const cats = lh.categories;
  const audits = lh.audits;

  return {
    perf:    Math.round((cats.performance?.score || 0) * 100),
    seo:     Math.round((cats.seo?.score || 0) * 100),
    a11y:    Math.round((cats.accessibility?.score || 0) * 100),
    bp:      Math.round((cats['best-practices']?.score || 0) * 100),
    fcp:     audits['first-contentful-paint']?.displayValue || '—',
    lcp:     audits['largest-contentful-paint']?.displayValue || '—',
    cls:     audits['cumulative-layout-shift']?.displayValue || '—',
    tbt:     audits['total-blocking-time']?.displayValue || '—',
    si:      audits['speed-index']?.displayValue || '—',
    failedAudits: Object.entries(audits)
      .filter(([k, a]) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'manual' && a.scoreDisplayMode !== 'notApplicable')
      .map(([k, a]) => ({ id: k, title: a.title, score: a.score, displayValue: a.displayValue || '' }))
      .filter(a => !['cumulative-layout-shift','first-contentful-paint','largest-contentful-paint','total-blocking-time','speed-index','interactive','max-potential-fid','server-response-time'].includes(a.id))
      .slice(0, 8),
  };
}

function color(score) {
  if (score >= 90) return '\x1b[32m'; // green
  if (score >= 50) return '\x1b[33m'; // yellow
  return '\x1b[31m';                  // red
}
const RESET = '\x1b[0m';
function bar(score) {
  return `${color(score)}${String(score).padStart(3)}${RESET}`;
}

console.log('=== Level-2 audit: PageSpeed Insights (Lighthouse cloud) ===\n');

const results = [];
let i = 0;
for (const { name, url } of URLS) {
  process.stdout.write(`[${++i}/${URLS.length}] ${name.padEnd(25)} `);
  const m = {};
  for (const strat of STRATEGIES) {
    const d = await runPsi(url, strat);
    m[strat] = extractMetrics(d);
    process.stdout.write(`${strat[0]}=${m[strat].perf ?? '?'} `);
    await sleep(SLEEP_BETWEEN_MS);
  }
  console.log();
  results.push({ name, url, ...m });
}

console.log('\n\n=========================================================');
console.log('RESULTS BY PAGE (mobile / desktop)');
console.log('=========================================================');

for (const r of results) {
  console.log(`\n## ${r.name}  —  ${r.url}`);
  if (r.mobile.error) {
    console.log(`   ⚠ mobile error: ${r.mobile.error}`);
    continue;
  }
  console.log(`              Perf  SEO  A11y  BP    FCP       LCP       CLS    TBT`);
  console.log(`   Mobile     ${bar(r.mobile.perf)}   ${bar(r.mobile.seo)}  ${bar(r.mobile.a11y)}   ${bar(r.mobile.bp)}    ${r.mobile.fcp.padEnd(8)}  ${r.mobile.lcp.padEnd(8)}  ${r.mobile.cls.padEnd(6)} ${r.mobile.tbt}`);
  if (!r.desktop.error) {
    console.log(`   Desktop    ${bar(r.desktop.perf)}   ${bar(r.desktop.seo)}  ${bar(r.desktop.a11y)}   ${bar(r.desktop.bp)}    ${r.desktop.fcp.padEnd(8)}  ${r.desktop.lcp.padEnd(8)}  ${r.desktop.cls.padEnd(6)} ${r.desktop.tbt}`);
  }
  if (r.mobile.failedAudits.length > 0) {
    console.log('   Top issues (mobile):');
    for (const a of r.mobile.failedAudits.slice(0, 4)) {
      console.log(`     · ${a.title}${a.displayValue ? ' — ' + a.displayValue : ''}`);
    }
  }
}

console.log('\n\n=========================================================');
console.log('SUMMARY (averages across all pages)');
console.log('=========================================================');

function avg(arr) { return arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0; }
const ok = results.filter(r => !r.mobile.error);
const mAvg = {
  perf: avg(ok.map(r => r.mobile.perf)),
  seo:  avg(ok.map(r => r.mobile.seo)),
  a11y: avg(ok.map(r => r.mobile.a11y)),
  bp:   avg(ok.map(r => r.mobile.bp)),
};
const dAvg = {
  perf: avg(ok.filter(r => !r.desktop.error).map(r => r.desktop.perf)),
  seo:  avg(ok.filter(r => !r.desktop.error).map(r => r.desktop.seo)),
  a11y: avg(ok.filter(r => !r.desktop.error).map(r => r.desktop.a11y)),
  bp:   avg(ok.filter(r => !r.desktop.error).map(r => r.desktop.bp)),
};
console.log(`              Perf  SEO  A11y  BP`);
console.log(`   Mobile avg ${bar(mAvg.perf)}   ${bar(mAvg.seo)}  ${bar(mAvg.a11y)}   ${bar(mAvg.bp)}`);
console.log(`   Desktop avg${bar(dAvg.perf)}   ${bar(dAvg.seo)}  ${bar(dAvg.a11y)}   ${bar(dAvg.bp)}`);

// Most common issues across pages
const issueFreq = new Map();
for (const r of ok) {
  for (const a of (r.mobile.failedAudits || [])) {
    if (!issueFreq.has(a.title)) issueFreq.set(a.title, 0);
    issueFreq.set(a.title, issueFreq.get(a.title) + 1);
  }
}
if (issueFreq.size > 0) {
  console.log('\nMost frequent issues across pages (mobile):');
  const sorted = [...issueFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [title, n] of sorted) {
    console.log(`  · ${title}  (on ${n}/${ok.length} pages)`);
  }
}
