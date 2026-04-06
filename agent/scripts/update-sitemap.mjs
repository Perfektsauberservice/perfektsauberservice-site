/**
 * Agent 4 — Sitemap Auto-Updater
 * Scaneza toate paginile HTML si regenereaza sitemap.xml complet.
 * Ruleaza automat dupa fiecare articol publicat.
 */

import { readdirSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BASE_URL = 'https://perfektsauberservice.com';

// Pagini excluse din sitemap (noindex sau pagini tehnice)
const EXCLUDE = new Set([
  'danke.html',
  '410.html',
  'datenschutz.html',
  'impressum.html',
  'einsatzgebiete-block.html',
]);

// Foldere excluse din root
const EXCLUDE_DIRS = new Set(['dashboard', 'agent', 'netlify', 'images', 'content', '.github']);

function getLastmod(filePath) {
  try {
    return statSync(filePath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function getPriority(file) {
  if (file === 'index.html') return '1.0';
  if (['leistungen.html', 'einsatzgebiete.html', 'blog.html', 'preisrechner.html'].includes(file)) return '0.9';
  // Orase principale
  const mainCities = ['rastatt', 'baden-baden', 'karlsruhe', 'gaggenau'];
  const isMainCity = mainCities.some(c => file.includes(c));
  const isMainService = ['entruempelung-', 'haushaltsaufloesung-', 'wohnungsaufloesung-', 'gewerberaeumung-'].some(s => file.startsWith(s));
  if (isMainCity && isMainService) return '0.8';
  return '0.7';
}

function getChangefreq(file, isBlog) {
  if (isBlog) return 'monthly';
  if (file === 'index.html') return 'weekly';
  if (file === 'blog.html') return 'daily';
  return 'monthly';
}

// Colecteaza paginile root
const rootFiles = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isFile() && d.name.endsWith('.html') && !EXCLUDE.has(d.name))
  .map(d => d.name)
  .sort();

// Colecteaza articolele din blog/
let blogFiles = [];
try {
  blogFiles = readdirSync(join(ROOT, 'blog'))
    .filter(f => f.endsWith('.html'))
    .sort();
} catch {
  console.log('Folder blog/ inexistent — sarit.');
}

// Construieste XML
const today = new Date().toISOString();
let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

for (const file of rootFiles) {
  const url = file === 'index.html' ? `${BASE_URL}/` : `${BASE_URL}/${file}`;
  const lastmod = getLastmod(join(ROOT, file));
  const priority = getPriority(file);
  const changefreq = getChangefreq(file, false);
  xml += `  <url>\n`;
  xml += `    <loc>${url}</loc>\n`;
  xml += `    <lastmod>${lastmod}</lastmod>\n`;
  xml += `    <priority>${priority}</priority>\n`;
  xml += `    <changefreq>${changefreq}</changefreq>\n`;
  xml += `  </url>\n`;
}

for (const file of blogFiles) {
  const url = `${BASE_URL}/blog/${file}`;
  const lastmod = getLastmod(join(ROOT, 'blog', file));
  xml += `  <url>\n`;
  xml += `    <loc>${url}</loc>\n`;
  xml += `    <lastmod>${lastmod}</lastmod>\n`;
  xml += `    <priority>0.7</priority>\n`;
  xml += `    <changefreq>monthly</changefreq>\n`;
  xml += `  </url>\n`;
}

xml += `</urlset>\n`;

const sitemapPath = join(ROOT, 'sitemap.xml');
writeFileSync(sitemapPath, xml, 'utf-8');

const total = rootFiles.length + blogFiles.length;
console.log(`✅ Sitemap actualizat: ${total} URL-uri (${rootFiles.length} pagini + ${blogFiles.length} articole blog)`);

// Ping Google Search Console
try {
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(BASE_URL + '/sitemap.xml')}`;
  const res = await fetch(pingUrl);
  console.log(`📡 Google pingat: HTTP ${res.status}`);
} catch (e) {
  console.log(`⚠️  Google ping esuat (non-critic): ${e.message}`);
}
