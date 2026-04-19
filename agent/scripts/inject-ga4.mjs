import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const GA4_ID = 'G-BMC32KSYKF';

const GA4_SCRIPT = `<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA4_ID}');
</script>`;

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
  if (content.includes('googletagmanager.com/gtag')) continue;
  if (!content.includes('</head>')) continue;
  const updated = content.replace('</head>', `${GA4_SCRIPT}\n</head>`);
  writeFileSync(file, updated, 'utf8');
  count++;
}

console.log(`GA4 injectat in ${count} fisiere.`);
