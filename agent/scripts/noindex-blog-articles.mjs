// Set 9 blog articles to noindex,follow + remove their URLs from
// sitemap.xml so Google deindexes the off-topic / thin pages.
//
// Idempotent. Run from repo root:
//   node agent/scripts/noindex-blog-articles.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const TARGETS = [
  // DELETE per audit (attracted only off-topic queries)
  'blog/entruempelung-gaggenau-entruempelung-bei-raeumungsklage--was-ist.html',
  'blog/entruempelung-gernsbach-wie-finde-ich-eine-serioese-entruempelungsfirma.html',
  // NOINDEX per audit (thin content + zero traffic, OR mostly off-topic)
  'blog/entruempelung-ettlingen-kosten--was-kostet-eine-entruempelung.html',
  'blog/entruempelung-karlsruhe-entruempelung-nach-brandschaden--spezielle-herausforderungen.html',
  'blog/entruempelung-kuppenheim-entruempelung-altbau--besonderheiten-und-herausforderungen.html',
  'blog/entruempelung-pforzheim-checkliste--schritt-fuer-schritt.html',
  'blog/was-kostet-eine-entruempelung-in-rastatt.html',
  'blog/wie-schnell-bekommt-man-einen-termin-fuer-eine-entruempelung-in-rastatt.html',
  'blog/wohnungsaufloesung-karlsruhe-kleine-wohnung-2-og-geraeumt.html',
];

let updated = 0;
const canonicals = [];

for (const rel of TARGETS) {
  const path = `${ROOT}/${rel}`;
  let html;
  try { html = await readFile(path, 'utf8'); }
  catch { console.log(`MISSING: ${rel}`); continue; }

  const before = html;
  html = html.replace(
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
    '<meta name="robots" content="noindex,follow">'
  );

  // Capture canonical URL for sitemap removal
  const canon = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  if (canon) canonicals.push(canon[1]);

  if (html !== before) {
    await writeFile(path, html, 'utf8');
    updated++;
    console.log(`noindex: ${rel}`);
  }
}

// Remove URLs from sitemap.xml
const sitemapPath = `${ROOT}/sitemap.xml`;
let sitemap = await readFile(sitemapPath, 'utf8');
let removed = 0;

for (const url of canonicals) {
  const escaped = url.replace(/[.*+?^${}()|[\\\]]/g, '\\$&');
  const re = new RegExp(
    `\\s*<url>\\s*<loc>${escaped}</loc>[\\s\\S]*?</url>`,
    'g'
  );
  const before = sitemap;
  sitemap = sitemap.replace(re, '');
  if (sitemap !== before) removed++;
}

await writeFile(sitemapPath, sitemap, 'utf8');

console.log();
console.log(`Articles updated to noindex: ${updated}`);
console.log(`Sitemap URLs removed: ${removed}`);
