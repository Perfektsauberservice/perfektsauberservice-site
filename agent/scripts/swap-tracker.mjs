import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const CLICKCEASE_RE = /<script async src="https:\/\/ob\.brilliantlocco\.com\/i\/5d9de8db38b94fc7c6b944412648452b\.js" class="ct_clicktrue"><\/script>\n<noscript><iframe src="https:\/\/ob\.brilliantlocco\.com\/ns\/5d9de8db38b94fc7c6b944412648452b\.html\?ch=" width="0" height="0" style="display:none"><\/iframe><\/noscript>\n?/;

const FRAUDBLOCKER_SCRIPT = `<!-- Fraud Blocker Tracker -->
<script type="text/javascript">
(function () {
  var h = document.getElementsByTagName('head')[0];
  var s = document.createElement('script');
  s.async = 1;
  s.src = "https://monitor.fraudblocker.com/fbt.js?sid=Va5dgNKby6QDNtWBh-HJS";
  h.appendChild(s);
})();
</script>
<noscript>
  <a href="https://fraudblocker.com" rel="nofollow">
    <img src="https://monitor.fraudblocker.com/fbt.gif?sid=Va5dgNKby6QDNtWBh-HJS" alt="Fraud Blocker" />
  </a>
</noscript>
<!-- End Fraud Blocker Tracker -->
`;

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
let swapped = 0, addedOnly = 0, skipped = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  if (content.includes('fraudblocker.com')) { skipped++; continue; }
  if (!content.includes('<head>')) { skipped++; continue; }

  let updated;
  if (CLICKCEASE_RE.test(content)) {
    updated = content.replace(CLICKCEASE_RE, FRAUDBLOCKER_SCRIPT);
    swapped++;
  } else {
    updated = content.replace('<head>', `<head>\n${FRAUDBLOCKER_SCRIPT}`);
    addedOnly++;
  }
  writeFileSync(file, updated, 'utf8');
}

console.log(`Swapped (ClickCease -> Fraud Blocker): ${swapped}`);
console.log(`Added fresh (no ClickCease found): ${addedOnly}`);
console.log(`Skipped (already has fraudblocker or no <head>): ${skipped}`);
