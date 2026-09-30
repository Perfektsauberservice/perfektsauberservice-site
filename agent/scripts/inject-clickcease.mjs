import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const CLICKCEASE_SCRIPT = `<script async src="https://ob.brilliantlocco.com/i/5d9de8db38b94fc7c6b944412648452b.js" class="ct_clicktrue"></script>
<noscript><iframe src="https://ob.brilliantlocco.com/ns/5d9de8db38b94fc7c6b944412648452b.html?ch=" width="0" height="0" style="display:none"></iframe></noscript>`;

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
let count = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  if (content.includes('brilliantlocco.com')) continue;
  if (!content.includes('<head>')) continue;
  const updated = content.replace('<head>', `<head>\n${CLICKCEASE_SCRIPT}`);
  writeFileSync(file, updated, 'utf8');
  count++;
}

console.log(`ClickCease injectat in ${count} fisiere.`);
