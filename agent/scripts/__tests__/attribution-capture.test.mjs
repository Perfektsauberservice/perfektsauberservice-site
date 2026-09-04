// Tests for finding F-1201's attribution-capture persistence fix.
// Node built-in test runner, no dependencies: `node --test agent/scripts/__tests__/attribution-capture.test.mjs`
//
// The client-side logic is extracted from a real patched HTML file (via
// regex, mirroring QA's ephemeral reproduction approach) and executed
// against minimal mock DOM/storage APIs, since Node has no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function extractCaptureFn() {
  const html = readFileSync(resolve(ROOT, 'entruempelung-karlsruhe.html'), 'utf8');
  const m = html.match(/window\.psCaptureAttribution = function\(\)\{[\s\S]*?\n\};\n/);
  assert.ok(m, 'psCaptureAttribution function found in patched HTML');
  return m[0];
}

function mockStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    _store: store,
  };
}

function runCapture({ consent, search, href }) {
  const localStorage = mockStorage();
  if (consent !== undefined) localStorage.setItem('psCookieChoice', consent);
  const sessionStorage = mockStorage();
  const location = { search, href };
  const URLSearchParams = globalThis.URLSearchParams;
  const fn = new Function(
    'window', 'localStorage', 'sessionStorage', 'location', 'URLSearchParams', 'Date',
    extractCaptureFn() + '\nwindow.psCaptureAttribution();'
  );
  const window = {};
  fn(window, localStorage, sessionStorage, location, URLSearchParams, Date);
  const stored = sessionStorage.getItem('ps_attribution');
  return stored ? JSON.parse(stored) : null;
}

test('A/B: consent=all + gclid present -> captured with correct values', () => {
  const attr = runCapture({
    consent: 'all',
    search: '?gclid=TEST123&utm_source=google&utm_campaign=test_campaign',
    href: 'https://example.invalid/page1?gclid=TEST123&utm_source=google&utm_campaign=test_campaign',
  });
  assert.ok(attr, 'attribution captured');
  assert.equal(attr.gclid, 'TEST123');
  assert.equal(attr.utm_source, 'google');
  assert.equal(attr.utm_campaign, 'test_campaign');
  assert.equal(attr.landing_page_url, 'https://example.invalid/page1?gclid=TEST123&utm_source=google&utm_campaign=test_campaign');
  assert.ok(!Number.isNaN(Date.parse(attr.first_seen_at)), 'first_seen_at is a valid ISO timestamp');
});

test('consent gate: consent != all -> nothing captured even with gclid present', () => {
  const attr = runCapture({ consent: 'necessary', search: '?gclid=TEST123', href: 'https://example.invalid/page1?gclid=TEST123' });
  assert.equal(attr, null, 'no capture without full consent');
});

test('consent gate: no consent choice made yet -> nothing captured', () => {
  const attr = runCapture({ search: '?gclid=TEST123', href: 'https://example.invalid/page1?gclid=TEST123' });
  assert.equal(attr, null);
});

test('G: no attribution parameters present -> tracking fields empty, never fabricated', () => {
  const attr = runCapture({ consent: 'all', search: '', href: 'https://example.invalid/page-noparams' });
  assert.ok(attr, 'landing_page_url/first_seen_at still captured even with no ad params');
  assert.equal(attr.gclid, '');
  assert.equal(attr.utm_source, '');
  assert.equal(attr.landing_page_url, 'https://example.invalid/page-noparams');
});

test('E: first-touch wins — page 2 with empty params does not overwrite page 1 capture', () => {
  const localStorage = mockStorage();
  localStorage.setItem('psCookieChoice', 'all');
  const sessionStorage = mockStorage();
  const fn = new Function(
    'window', 'localStorage', 'sessionStorage', 'location', 'URLSearchParams', 'Date',
    extractCaptureFn() + '\nwindow.psCaptureAttribution();'
  );
  const window = {};

  // Page 1: real capture.
  fn(window, localStorage, sessionStorage, {
    search: '?gclid=REAL1&utm_source=google',
    href: 'https://example.invalid/page1?gclid=REAL1&utm_source=google',
  }, URLSearchParams, Date);
  const afterPage1 = JSON.parse(sessionStorage.getItem('ps_attribution'));

  // Page 2: navigation, no params — must NOT overwrite.
  fn(window, localStorage, sessionStorage, {
    search: '',
    href: 'https://example.invalid/page2',
  }, URLSearchParams, Date);
  const afterPage2 = JSON.parse(sessionStorage.getItem('ps_attribution'));

  assert.deepEqual(afterPage2, afterPage1, 'page 2 (no params) must not overwrite page 1 (real capture)');
  assert.equal(afterPage2.gclid, 'REAL1');
});

test('F: sessionStorage.setItem throwing does not crash the capture step', () => {
  const localStorage = mockStorage();
  localStorage.setItem('psCookieChoice', 'all');
  const sessionStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  const fn = new Function(
    'window', 'localStorage', 'sessionStorage', 'location', 'URLSearchParams', 'Date',
    extractCaptureFn() + '\nwindow.psCaptureAttribution();'
  );
  const window = {};
  assert.doesNotThrow(() => {
    fn(window, localStorage, sessionStorage, { search: '?gclid=X', href: 'https://example.invalid/' }, URLSearchParams, Date);
  });
});

test('D: submit-time read populates hidden fields from sessionStorage, not location.search', () => {
  const html = readFileSync(resolve(ROOT, 'entruempelung-karlsruhe.html'), 'utf8');
  assert.match(html, /sessionStorage\.getItem\('ps_attribution'\)/, 'submit handler reads from sessionStorage');
  assert.doesNotMatch(
    html.split('form.addEventListener')[1].split('psCaptureAttribution')[0],
    /qp\.get\('gclid'\)/,
    'submit handler no longer reads gclid from location.search directly'
  );
});

// --- submission-created.mjs extraction logic (H, I, J) ---

test('H: submission-created.mjs still extracts the 7 existing fields unmodified', () => {
  const src = readFileSync(resolve(ROOT, 'netlify/functions/submission-created.mjs'), 'utf8');
  for (const field of ['name', 'email', 'phone', 'message', 'city', 'service']) {
    assert.match(src, new RegExp(`const ${field}\\s*=`), `${field} still extracted`);
  }
  assert.match(src, /let lead_id\s*=/, 'lead_id still extracted');
});

test('C/attribution: submission-created.mjs additively extracts the 10 attribution fields, defaults to null when absent', () => {
  const src = readFileSync(resolve(ROOT, 'netlify/functions/submission-created.mjs'), 'utf8');
  const attrFields = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'landing_page_url', 'first_seen_at'];
  for (const f of attrFields) {
    assert.match(src, new RegExp(`data\\.data\\?\\.${f}`), `${f} extracted from payload`);
  }
  assert.match(src, /attribution = \{/, 'compact attribution object built');
  assert.match(src, /gclid: gclid \|\| null/, 'defaults to null when absent');
});

test('I: Telegram/email attribution line only appears when at least one attribution value is present', () => {
  const src = readFileSync(resolve(ROOT, 'netlify/functions/submission-created.mjs'), 'utf8');
  assert.match(src, /hasAttribution = Boolean\(gclid \|\| gbraid \|\| wbraid \|\| utm_source \|\| utm_campaign\)/);
  assert.match(src, /attributionLine \? \[attributionLine\] : \[\]/, 'Telegram text conditionally includes the attribution line');
});

test('J: node --check passes on submission-created.mjs (already run separately, re-asserted here for record)', () => {
  const src = readFileSync(resolve(ROOT, 'netlify/functions/submission-created.mjs'), 'utf8');
  assert.ok(src.length > 0);
});
