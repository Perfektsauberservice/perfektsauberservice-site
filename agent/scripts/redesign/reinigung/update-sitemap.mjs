// Append the 37 new Reinigung URLs (3 hubs + 34 city×service) into sitemap.xml
// Idempotent: skips URLs that are already present.

import fs from 'node:fs';
import { CITIES, ALL_TIER1_CITIES } from './cities.mjs';
import { SERVICES } from './services.mjs';

const SITE = 'https://perfektsauberservice.com';
const sitemapPath = 'sitemap.xml';

const COVERAGE = {
  bueroreinigung: ['achern','buehl','ettlingen','gaggenau','gernsbach','karlsruhe','muggensturm','pforzheim','rheinstetten','sinzheim','stutensee'],
  endreinigung:   ['achern','buehl','ettlingen','gaggenau','gernsbach','muggensturm','pforzheim','rheinstetten','sinzheim','stutensee'],
  grundreinigung: ALL_TIER1_CITIES,
  unterhaltsreinigung: ALL_TIER1_CITIES,
  fensterreinigung:    ALL_TIER1_CITIES,
};

const today = new Date().toISOString();

const urls = [];
// Service hubs
for (const s of Object.keys(SERVICES)) {
  urls.push({ loc: `${SITE}/${s}`, priority: '0.9', changefreq: 'monthly' });
}
// City × service
for (const [s, cities] of Object.entries(COVERAGE)) {
  for (const c of cities) {
    urls.push({ loc: `${SITE}/${s}-${c}`, priority: '0.8', changefreq: 'monthly' });
  }
}

const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const existingLocs = new Set();
for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) existingLocs.add(m[1]);

let added = 0, skipped = 0;
const newEntries = urls.filter(u => {
  if (existingLocs.has(u.loc)) { skipped++; return false; }
  added++; return true;
}).map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <priority>${u.priority}</priority>
    <changefreq>${u.changefreq}</changefreq>
  </url>`).join('\n');

if (newEntries) {
  const updated = sitemap.replace('</urlset>', `${newEntries}\n</urlset>`);
  fs.writeFileSync(sitemapPath, updated);
}
console.log(`sitemap: ${added} added, ${skipped} skipped (already present)`);
