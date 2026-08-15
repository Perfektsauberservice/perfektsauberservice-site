import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages.json'), 'utf8'));
const EXPECTED_PHONE = '+491639087197';
const EXPECTED_WA = 'wa.me/491639087197';
const SLOW_LOAD_MS = 8000;

async function checkPage(browser, url) {
  const issues = [];
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const failedRequests = [];
  page.on('response', res => {
    const type = res.request().resourceType();
    if (res.status() >= 400 && (type === 'image' || type === 'document')) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  const start = Date.now();
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  } catch (e) {
    issues.push(`PAGE_LOAD_FAILED: ${e.message}`);
    await context.close();
    return { url, issues, loadTimeMs: null };
  }
  const loadTimeMs = Date.now() - start;

  if (!response || response.status() >= 400) {
    issues.push(`HTTP_ERROR: status=${response ? response.status() : 'none'}`);
  }
  if (loadTimeMs > SLOW_LOAD_MS) {
    issues.push(`SLOW_LOAD: ${loadTimeMs}ms`);
  }
  if (consoleErrors.length) {
    issues.push(`CONSOLE_ERRORS: ${consoleErrors.slice(0, 3).join(' | ')}`);
  }
  if (failedRequests.length) {
    issues.push(`FAILED_REQUESTS: ${failedRequests.slice(0, 5).join(' | ')}`);
  }

  const telHref = await page.locator('a[href^="tel:"]').first().getAttribute('href').catch(() => null);
  const waHref = await page.locator('a[href*="wa.me"]').first().getAttribute('href').catch(() => null);
  if (!telHref) issues.push('NO_TEL_LINK_FOUND');
  else if (!telHref.includes(EXPECTED_PHONE)) issues.push(`WRONG_TEL_NUMBER: ${telHref}`);
  if (!waHref) issues.push('NO_WHATSAPP_LINK_FOUND');
  else if (!waHref.includes(EXPECTED_WA)) issues.push(`WRONG_WHATSAPP_NUMBER: ${waHref}`);

  const heroTel = page.locator('.cta-row a[href^="tel:"]').first();
  const heroWa = page.locator('.cta-row a[href*="wa.me"]').first();
  const HIT_TEST_ATTEMPTS = 3;
  const HIT_TEST_RETRY_DELAY_MS = 400;
  for (const [label, locator] of [['phone', heroTel], ['whatsapp', heroWa]]) {
    const count = await locator.count();
    if (count === 0) { issues.push(`HERO_CTA_MISSING: ${label}`); continue; }

    let lastFailureReason = null;
    let passed = false;
    for (let attempt = 1; attempt <= HIT_TEST_ATTEMPTS; attempt++) {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      const box = await locator.boundingBox();
      if (!box) {
        lastFailureReason = `HERO_CTA_NOT_VISIBLE: ${label}`;
      } else {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const hit = await page.evaluate(({ cx, cy }) => {
          const el = document.elementFromPoint(cx, cy);
          if (!el) return { ok: false, blocker: null };
          const link = el.closest('a');
          const ok = !!(link && (link.href.startsWith('tel:') || link.href.includes('wa.me')));
          if (ok) return { ok: true };
          const id = el.id ? `#${el.id}` : '';
          const cls = el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).join('.')
            : '';
          return { ok: false, blocker: `${el.tagName.toLowerCase()}${id}${cls}` };
        }, { cx, cy });
        if (hit.ok) { passed = true; break; }
        lastFailureReason = `HERO_CTA_BLOCKED: ${label} at (${Math.round(cx)},${Math.round(cy)}) is covered by ${hit.blocker || 'another element'}`;
      }
      if (attempt < HIT_TEST_ATTEMPTS) await page.waitForTimeout(HIT_TEST_RETRY_DELAY_MS);
    }
    if (!passed && lastFailureReason) issues.push(lastFailureReason);
  }

  await context.close();
  return { url, issues, loadTimeMs };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  for (const url of PAGES) {
    console.log(`Checking ${url}...`);
    results.push(await checkPage(browser, url));
  }
  await browser.close();

  const withIssues = results.filter(r => r.issues.length > 0);
  console.log(`\n=== ${withIssues.length} of ${results.length} pages have issues ===`);
  for (const r of withIssues) {
    console.log(`\n${r.url}`);
    r.issues.forEach(i => console.log(`  - ${i}`));
  }

  if (withIssues.length > 0) {
    let body = `Automated daily site health check found problems on ${withIssues.length} of ${results.length} checked pages.\n\n`;
    for (const r of withIssues) {
      body += `### ${r.url}\n`;
      for (const i of r.issues) body += `- ${i}\n`;
      body += '\n';
    }
    fs.writeFileSync(path.join(__dirname, 'site-health-issue-body.md'), body);
  }

  fs.writeFileSync(path.join(__dirname, 'site-health-results.json'), JSON.stringify(results, null, 2));
  process.exit(withIssues.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  const body = `Site health check crashed before completing.\n\nError: ${e.message}\n\n${e.stack || ''}`;
  fs.writeFileSync(path.join(__dirname, 'site-health-issue-body.md'), body);
  process.exit(2);
});
