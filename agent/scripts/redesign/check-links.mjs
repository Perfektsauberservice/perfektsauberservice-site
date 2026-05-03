// Audit all internal links across the repo. Reports broken hrefs (target file
// doesn't exist), grouped by error type.

import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const SKIP_DIRS = ['node_modules','_archived','.git','agent','content','dashboard','public','netlify'];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.includes(e.name)) continue;
      out.push(...walk(full));
    } else if (e.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

// Map every URL → target file (relative to repo root)
function urlToFile(url, sourceFile) {
  // Strip query + fragment
  const cleanPath = url.split('#')[0].split('?')[0];
  if (!cleanPath) return null; // pure anchor

  let target;
  if (cleanPath.startsWith('/')) {
    // absolute from repo root
    target = cleanPath.slice(1);
  } else {
    // relative to source file
    target = path.posix.join(path.posix.dirname(sourceFile.replace(/\\/g, '/').replace(REPO.replace(/\\/g, '/') + '/', '')), cleanPath);
  }
  if (!target) target = 'index.html';
  if (target.endsWith('/')) target += 'index.html';
  // Add .html if no extension
  if (!path.extname(target)) target += '.html';
  return target;
}

function exists(target) {
  if (!target) return true;
  // First try exact path
  const abs = path.join(REPO, target);
  if (fs.existsSync(abs)) return true;
  // Try without .html (some pages may have moved to dirs)
  const noHtml = abs.replace(/\.html$/, '');
  if (fs.existsSync(noHtml) && fs.statSync(noHtml).isFile()) return true;
  // Try as directory with index.html
  if (fs.existsSync(noHtml) && fs.statSync(noHtml).isDirectory()) {
    if (fs.existsSync(path.join(noHtml, 'index.html'))) return true;
  }
  return false;
}

const htmlFiles = walk(REPO);
console.log(`Scanning ${htmlFiles.length} HTML files...`);

const broken = []; // { source, url, target }
const linkCount = { internal: 0, external: 0, anchor: 0, mailto: 0, tel: 0 };

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const sourceRel = file.replace(/\\/g, '/').replace(REPO.replace(/\\/g, '/') + '/', '');

  // Find all href="..." values
  const matches = [...html.matchAll(/href="([^"]+)"/g)];
  for (const m of matches) {
    const url = m[1];
    if (url.startsWith('mailto:')) { linkCount.mailto++; continue; }
    if (url.startsWith('tel:')) { linkCount.tel++; continue; }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // Treat perfektsauberservice.com URLs as internal
      if (url.includes('perfektsauberservice.com')) {
        const internalPath = url.replace(/^https?:\/\/[^\/]+/, '');
        linkCount.internal++;
        const target = urlToFile(internalPath, file);
        if (target && !exists(target)) {
          broken.push({ source: sourceRel, url, target });
        }
      } else {
        linkCount.external++;
      }
      continue;
    }
    if (url.startsWith('#')) { linkCount.anchor++; continue; }
    if (url.startsWith('javascript:') || url === '') continue;

    linkCount.internal++;
    const target = urlToFile(url, file);
    if (target && !exists(target)) {
      broken.push({ source: sourceRel, url, target });
    }
  }
}

console.log('\n=== Link counts ===');
console.log(linkCount);

if (broken.length === 0) {
  console.log('\n✓ All internal links resolve to real files');
  process.exit(0);
}

// Group broken links by URL (most common breakage)
const byUrl = new Map();
for (const b of broken) {
  if (!byUrl.has(b.url)) byUrl.set(b.url, []);
  byUrl.get(b.url).push(b.source);
}

console.log(`\n=== ${broken.length} broken link instances across ${byUrl.size} unique URLs ===\n`);

const sorted = [...byUrl.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [url, sources] of sorted.slice(0, 30)) {
  console.log(`✗ ${url}  →  used in ${sources.length} files`);
  for (const s of sources.slice(0, 3)) console.log(`    - ${s}`);
  if (sources.length > 3) console.log(`    ... +${sources.length - 3} more`);
}

if (sorted.length > 30) console.log(`\n(${sorted.length - 30} more broken URLs not shown)`);
