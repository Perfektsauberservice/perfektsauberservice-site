// Mass migration orchestrator.
// Detects page type from filename + content and routes to the right renderer.
// Default output dir: _preview/  (so live pages are not touched)
// Use --inplace to overwrite live files (only after user approval).

import fs from 'node:fs';
import path from 'node:path';
import { parseCityService } from './lib/parse-city-service.mjs';
import { renderCityService } from './lib/render-city-service.mjs';
import { renderStatic } from './lib/render-static.mjs';
import { renderHub } from './lib/render-hub.mjs';
import { renderHomepage } from './lib/render-homepage.mjs';
import { renderBlog } from './lib/render-blog.mjs';

const SERVICE_PREFIXES = [
  'bueroaufloesung', 'bueroreinigung', 'dachbodenentruempelung', 'endreinigung',
  'entruempelung', 'garagenentruempelung', 'gewerberaeumung', 'haushaltsaufloesung',
  'hausmeisterservice', 'kellerentruempelung', 'nachlassaufloesung',
  'unterhaltsreinigung', 'wohnungsaufloesung', 'fettabschneider',
];
const STATIC_PAGES = new Set([
  'impressum.html', 'datenschutz.html', 'agb.html', '410.html', 'danke.html',
  'kontakt.html', 'ueber.html', 'ueber-uns.html', 'messi.html',
]);
const HUB_PAGES = new Set([
  'leistungen.html', 'einsatzgebiete.html', 'portfolio.html', 'blog.html',
  'preisrechner.html', 'hausmeisterservice.html',
]);
const SKIP = new Set([
  // Fragments / non-pages
  'einsatzgebiete-block.html',
]);

function detectType(filename) {
  const base = path.basename(filename);
  // Anything inside blog/ dir → blog article
  if (filename.replace(/\\/g, '/').startsWith('blog/')) return 'blog';
  if (SKIP.has(base)) return 'skip';
  if (base === 'index.html') return 'homepage';
  if (HUB_PAGES.has(base)) return 'hub';
  if (STATIC_PAGES.has(base)) return 'static';
  // city × service: <service>-<city>.html
  for (const s of SERVICE_PREFIXES) {
    if (base.startsWith(s + '-') && base.endsWith('.html')) return 'city-service';
  }
  // messi-wohnung-<city>.html
  if (base.startsWith('messi-wohnung-')) return 'city-service';
  return 'unknown';
}

function migrateOne(file, outDir, opts) {
  const type = detectType(file);
  if (type === 'skip') return { file, type, status: 'skipped' };

  try {
    let out;
    if (type === 'city-service') {
      out = renderCityService(parseCityService(file));
    } else if (type === 'static') {
      out = renderStatic(file);
    } else if (type === 'hub') {
      out = renderHub(file);
    } else if (type === 'homepage') {
      out = renderHomepage(file);
    } else if (type === 'blog') {
      out = renderBlog(file);
    } else {
      return { file, type, status: 'pending' };
    }
    // Preserve subdirectory structure (blog/foo.html → outDir/blog/foo.html)
    const rel = file.replace(/\\/g, '/');
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out);
    return { file, type, status: 'ok', bytes: out.length, dest };
  } catch (e) {
    return { file, type, status: 'error', error: e.message };
  }
}

function main() {
  const args = process.argv.slice(2);
  const inplace = args.includes('--inplace');
  const outDir = inplace ? '.' : '_preview';
  const explicit = args.filter(a => !a.startsWith('--'));

  let files;
  if (explicit.length > 0) {
    files = explicit;
  } else {
    files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
    // Include blog/*.html
    if (fs.existsSync('blog')) {
      const blogFiles = fs.readdirSync('blog').filter(f => f.endsWith('.html'));
      files = files.concat(blogFiles.map(f => path.join('blog', f)));
    }
  }

  const results = files.map(f => migrateOne(f, outDir, { inplace }));

  // Group by status & type for summary
  const byType = {};
  const byStatus = { ok: 0, error: 0, skipped: 0, pending: 0 };
  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byType[r.type] = (byType[r.type] || 0) + 1;
  }

  console.log('\n=== Migration summary ===');
  console.log('Page types found:', byType);
  console.log('Status:', byStatus);
  console.log('Output dir:', outDir);

  const errors = results.filter(r => r.status === 'error');
  if (errors.length) {
    console.log('\n=== ERRORS ===');
    for (const e of errors) console.log(`  ${e.file}: ${e.error}`);
  }

  const pending = results.filter(r => r.status === 'pending');
  if (pending.length && !args.includes('--quiet')) {
    console.log(`\n${pending.length} pages need a non-city-service template (still TODO):`);
    const sample = {};
    for (const p of pending) sample[p.type] = (sample[p.type] || []);
    for (const p of pending) sample[p.type].push(p.file);
    for (const [t, fs2] of Object.entries(sample)) {
      console.log(`  [${t}] ${fs2.length} file(s):`, fs2.slice(0, 3).join(', ') + (fs2.length > 3 ? ` (+${fs2.length - 3} more)` : ''));
    }
  }
}

main();
