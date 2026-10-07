import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// CRLF/LF-tolerant: match each line separately, allow optional \r before \n,
// and allow an optional blank line after.
const CLICKCEASE_RE = /<script async src="https:\/\/ob\.brilliantlocco\.com\/i\/5d9de8db38b94fc7c6b944412648452b\.js" class="ct_clicktrue"><\/script>\r?\n<noscript><iframe src="https:\/\/ob\.brilliantlocco\.com\/ns\/5d9de8db38b94fc7c6b944412648452b\.html\?ch=" width="0" height="0" style="display:none"><\/iframe><\/noscript>\r?\n?/;

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1').replace(/%20/g, ' ');

function getAllHtmlFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'agent') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...getAllHtmlFiles(full));
    } else if (extname(entry) === '.html') {
      results.push(full);
    }
  }
  return results;
}

const files = getAllHtmlFiles(ROOT);
let removed = 0, notFound = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  if (!CLICKCEASE_RE.test(content)) { notFound++; continue; }
  const updated = content.replace(CLICKCEASE_RE, '');
  writeFileSync(file, updated, 'utf8');
  removed++;
}

console.log(`Removed old ClickCease tag: ${removed}`);
console.log(`Not found (already clean): ${notFound}`);
