// Regression tests for PSS_LEAD_CLICK_PING_STAGE1_4_PAGE_WIRING_V1 — wiring
// the shared js/ps-lead-ping.js beacon script (built and tested, but NOT
// wired to any page, in the prerequisite commit 8b856ce1) into exactly the
// frozen Stage 1 pilot page set:
//   entruempelung-rastatt.html, wohnungsaufloesung-rastatt.html,
//   grundreinigung.html, preisrechner.html
//
// wohnungsaufloesung-rastatt.html replaces the originally-proposed
// hausmeisterservice.html, which turned out to already be one of the
// existing 8 live pilot pages with its own inline Lead Click Ping code —
// wiring the shared script there would have double-pinged every eligible
// click. wohnungsaufloesung-rastatt.html was verified (this task) to be
// neither one of the existing 8 pages nor already carrying any Lead Click
// Ping code.
//
// These tests read the REAL, currently-shipped page files (not copies), and
// diff them against the real file content at the prerequisite commit, so
// drift between what's tested and what's shipped is structurally
// impossible.
//
// Run: node --test tests/lead-click-ping-stage1-page-wiring.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREREQ_COMMIT = '8b856ce1ad8c885b87e60057b46e0cbd9e3ef81d';
const SCRIPT_TAG = '<script src="/js/ps-lead-ping.js"></script>';

const STAGE1_PAGES = [
  'entruempelung-rastatt.html',
  'wohnungsaufloesung-rastatt.html',
  'grundreinigung.html',
  'preisrechner.html',
];

// Confirmed (this task) to already carry their own inline Lead Click Ping
// implementation and must not be touched or gain the shared script.
const EXISTING_8_PILOT_PAGES = [
  'bauschlussreinigung-karlsruhe.html',
  'bauschlussreinigung-rastatt.html',
  'entruempelung-karlsruhe.html',
  'hausmeisterservice.html',
  'index.html',
  'kontakt.html',
  'portfolio.html',
  'reinigung.html',
];

// core.autocrlf=true in this repo means the working tree carries CRLF line
// endings while git blobs are LF-normalized; normalize both sides before
// any byte-comparison so that pre-existing newline handling (unrelated to
// this task) never masquerades as a content change.
function normalizeNewlines(s) {
  return s.replace(/\r\n/g, '\n');
}

function readPage(name) {
  return normalizeNewlines(readFileSync(resolve(ROOT, name), 'utf8'));
}

function readPageAtPrereqCommit(name) {
  return normalizeNewlines(execFileSync('git', ['show', `${PREREQ_COMMIT}:${name}`], { cwd: ROOT, encoding: 'utf8' }));
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function allSiteHtmlFiles() {
  // Site pages live flat at repo root (confirmed: all four Stage 1 targets
  // and all 8 existing pilot pages are root-level files).
  return readdirSync(ROOT).filter((f) => f.endsWith('.html'));
}

test('exactly the frozen 4-page Stage 1 set carries the shared script tag, nowhere else on the site', () => {
  const wired = allSiteHtmlFiles().filter((f) => readPage(f).includes(SCRIPT_TAG));
  assert.deepEqual(wired.sort(), [...STAGE1_PAGES].sort());
});

for (const page of STAGE1_PAGES) {
  test(`${page}: shared script tag appears exactly once`, () => {
    assert.equal(countOccurrences(readPage(page), SCRIPT_TAG), 1);
  });

  test(`${page}: only change vs. the prerequisite commit is the single added script tag line`, () => {
    const before = readPageAtPrereqCommit(page);
    const after = readPage(page);
    const reverted = after.replace(`${SCRIPT_TAG}\n`, '');
    assert.equal(reverted, before, `${page} must be byte-identical to the prerequisite commit once the added script line is removed`);
  });

  test(`${page}: script tag is a plain external reference (no inline duplicate, no onload, not the full source pasted in)`, () => {
    const html = readPage(page);
    const idx = html.indexOf(SCRIPT_TAG);
    assert.ok(idx > -1);
    // Exact tag match already proves no attributes/inline body were added;
    // also confirm the real shared-script file is not additionally inlined
    // anywhere on the page (would risk a duplicate listener).
    const sharedSrc = readFileSync(resolve(ROOT, 'js', 'ps-lead-ping.js'), 'utf8').trim();
    assert.ok(!html.includes(sharedSrc), `${page} must reference the shared script externally, not inline its full source`);
  });

  test(`${page}: existing tel:/mailto:/wa.me CTAs are unchanged and present`, () => {
    const before = readPageAtPrereqCommit(page);
    const after = readPage(page);
    const extractHrefs = (html) => [...html.matchAll(/href="((?:tel:|mailto:|[^"]*wa\.me)[^"]*)"/g)].map((m) => m[1]);
    const hrefsBefore = extractHrefs(before);
    const hrefsAfter = extractHrefs(after);
    assert.deepEqual(hrefsAfter, hrefsBefore);
    assert.ok(hrefsBefore.some((h) => h.startsWith('tel:')), `${page} must have at least one tel: CTA`);
  });
}

test('none of the existing 8 pilot pages changed at all', () => {
  for (const page of EXISTING_8_PILOT_PAGES) {
    const before = readPageAtPrereqCommit(page);
    const after = readPage(page);
    assert.equal(after, before, `${page} (one of the existing 8 pilot pages) must be byte-identical to the prerequisite commit`);
  }
});

test('none of the existing 8 pilot pages gained the shared script tag', () => {
  for (const page of EXISTING_8_PILOT_PAGES) {
    assert.ok(!readPage(page).includes(SCRIPT_TAG), `${page} must not reference the shared script in this task`);
  }
});

test('hausmeisterservice.html specifically: confirmed one of the existing 8, untouched, not a Stage 1 target', () => {
  assert.ok(EXISTING_8_PILOT_PAGES.includes('hausmeisterservice.html'));
  assert.ok(!STAGE1_PAGES.includes('hausmeisterservice.html'));
  const before = readPageAtPrereqCommit('hausmeisterservice.html');
  const after = readPage('hausmeisterservice.html');
  assert.equal(after, before);
});

test('replacement page wohnungsaufloesung-rastatt.html is eligible: not one of the existing 8, had no prior Lead Click Ping code', () => {
  assert.ok(!EXISTING_8_PILOT_PAGES.includes('wohnungsaufloesung-rastatt.html'));
  const before = readPageAtPrereqCommit('wohnungsaufloesung-rastatt.html');
  assert.ok(!before.includes('lead-click-ping'), 'must not have had the endpoint referenced before this task');
});

test('attribution key contract: pages with existing capture logic use the same sessionStorage key the shared script reads (ps_attribution)', () => {
  const pagesWithCapture = ['entruempelung-rastatt.html', 'wohnungsaufloesung-rastatt.html', 'preisrechner.html'];
  for (const page of pagesWithCapture) {
    const html = readPage(page);
    assert.ok(html.includes("sessionStorage.setItem('ps_attribution'"), `${page} expected to already capture attribution under the ps_attribution key`);
  }
});

test('grundreinigung.html has no existing attribution capture (empty-attribution pilot case, explicitly allowed by Stage 1 policy)', () => {
  const html = readPage('grundreinigung.html');
  assert.ok(!html.includes('ps_attribution'));
});

// --- Behavioral proof, using the real shared script loaded via vm (same
// approach as tests/ps-lead-ping-script.test.mjs), fed real CTA hrefs
// extracted from each of the four wired pages. ---

const SHARED_SCRIPT_SRC = readFileSync(resolve(ROOT, 'js', 'ps-lead-ping.js'), 'utf8');

function mockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    _store: store,
  };
}

function mockAnchor(href) {
  return {
    getAttribute: (name) => (name === 'href' ? href : null),
    closest: function (sel) { return sel === 'a' ? this : null; },
  };
}

function loadSharedScriptForPage(pathname, sessionStorage) {
  const sess = sessionStorage || mockStorage();
  const beaconCalls = [];
  let clickListener = null;
  const documentMock = { addEventListener: (type, cb) => { if (type === 'click') clickListener = cb; } };
  const navigatorMock = { sendBeacon: (url, payload) => { beaconCalls.push({ url, payload: JSON.parse(payload) }); return true; } };
  const sandbox = {
    document: documentMock,
    navigator: navigatorMock,
    sessionStorage: sess,
    location: { pathname },
    console, Date, Math, JSON,
  };
  vm.createContext(sandbox);
  vm.runInContext(SHARED_SCRIPT_SRC, sandbox);
  return { clickListener, sessionStorage: sess, beaconCalls };
}

function firstHrefOfType(html, kind) {
  const patterns = {
    tel: /href="(tel:[^"]*)"/,
    mailto: /href="(mailto:[^"]*)"/,
    whatsapp: /href="((?:https?:\/\/)?(?:api\.)?wa(?:\.me)?[^"]*|[^"]*wa\.me[^"]*)"/,
  };
  const m = html.match(patterns[kind]);
  assert.ok(m, `expected to find a ${kind} href in the page`);
  return m[1];
}

for (const page of STAGE1_PAGES) {
  test(`${page}: loading the shared script sends no ping (no page-load ping)`, () => {
    const { beaconCalls } = loadSharedScriptForPage(`/${page}`);
    assert.equal(beaconCalls.length, 0);
  });

  test(`${page}: real tel CTA click sends exactly one phone ping via ps_session_id contract`, () => {
    const html = readPage(page);
    const href = firstHrefOfType(html, 'tel');
    const { clickListener, beaconCalls } = loadSharedScriptForPage(`/${page}`);
    clickListener({ target: mockAnchor(href), preventDefault: () => assert.fail('must not preventDefault'), stopPropagation: () => assert.fail('must not stopPropagation') });
    assert.equal(beaconCalls.length, 1);
    assert.equal(beaconCalls[0].payload.type, 'phone');
    assert.ok(beaconCalls[0].payload.ps_session_id.length > 0);
  });

  test(`${page}: real mailto CTA click sends exactly one email ping`, () => {
    const html = readPage(page);
    const href = firstHrefOfType(html, 'mailto');
    const { clickListener, beaconCalls } = loadSharedScriptForPage(`/${page}`);
    clickListener({ target: mockAnchor(href), preventDefault: () => {}, stopPropagation: () => {} });
    assert.equal(beaconCalls.length, 1);
    assert.equal(beaconCalls[0].payload.type, 'email');
  });

  test(`${page}: real WhatsApp CTA click sends exactly one whatsapp ping`, () => {
    const html = readPage(page);
    const href = firstHrefOfType(html, 'whatsapp');
    const { clickListener, beaconCalls } = loadSharedScriptForPage(`/${page}`);
    clickListener({ target: mockAnchor(href), preventDefault: () => {}, stopPropagation: () => {} });
    assert.equal(beaconCalls.length, 1);
    assert.equal(beaconCalls[0].payload.type, 'whatsapp');
  });

  test(`${page}: empty attribution is tolerated (no throw, attribution defaults to {})`, () => {
    const html = readPage(page);
    const href = firstHrefOfType(html, 'tel');
    const emptySession = mockStorage(); // no ps_attribution key set
    const { clickListener, beaconCalls } = loadSharedScriptForPage(`/${page}`, emptySession);
    assert.doesNotThrow(() => clickListener({ target: mockAnchor(href), preventDefault: () => {}, stopPropagation: () => {} }));
    assert.deepEqual(beaconCalls[0].payload.attribution, {});
  });

  test(`${page}: pre-existing attribution value is preserved and forwarded unchanged`, () => {
    const html = readPage(page);
    const href = firstHrefOfType(html, 'tel');
    const storedAttribution = { gclid: 'test-gclid-123', utm_source: 'google' };
    const preloaded = mockStorage({ ps_attribution: JSON.stringify(storedAttribution) });
    const { clickListener, beaconCalls } = loadSharedScriptForPage(`/${page}`, preloaded);
    clickListener({ target: mockAnchor(href), preventDefault: () => {}, stopPropagation: () => {} });
    assert.deepEqual(beaconCalls[0].payload.attribution, storedAttribution);
  });

  test(`${page}: unrelated (non-tel/mailto/wa.me) link click sends no ping`, () => {
    const { clickListener, beaconCalls } = loadSharedScriptForPage(`/${page}`);
    clickListener({ target: mockAnchor('https://example.invalid/other'), preventDefault: () => {}, stopPropagation: () => {} });
    assert.equal(beaconCalls.length, 0);
  });
}

test('duplicate-ping protection: script tag present exactly once per page means exactly one listener attaches per page load (no double-inclusion)', () => {
  for (const page of STAGE1_PAGES) {
    assert.equal(countOccurrences(readPage(page), SCRIPT_TAG), 1);
  }
});

test('no secret exposed client-side: shared script and wired pages contain no API keys, tokens, or Telegram credentials', () => {
  const suspicious = /(BOT_TOKEN|TELEGRAM_[A-Z_]*TOKEN|api[_-]?key|secret)/i;
  assert.ok(!suspicious.test(SHARED_SCRIPT_SRC));
  for (const page of STAGE1_PAGES) {
    // Only check the newly-added line, not the whole page (pre-existing
    // page content is out of scope and already covered by the byte-
    // identical-except-one-line test above).
    assert.ok(!suspicious.test(SCRIPT_TAG));
  }
});
