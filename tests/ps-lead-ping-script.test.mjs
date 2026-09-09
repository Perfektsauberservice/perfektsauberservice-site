// Regression tests for js/ps-lead-ping.js — the new shared click-to-lead
// beacon script created as a Stage 1 pilot prerequisite. NOT wired to any
// page yet (no <script src> tag added anywhere); these tests execute the
// real, currently-shipped file content in a sandboxed vm context with
// minimal mocked browser APIs (sessionStorage, document, navigator,
// location), the same approach tests/consent-choice.test.mjs uses for
// inline page scripts.
//
// Run: node --test tests/ps-lead-ping-script.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_SRC = readFileSync(resolve(ROOT, 'js', 'ps-lead-ping.js'), 'utf8');

function mockStorage() {
  const store = {};
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

// Loads the real script into a fresh sandbox and returns handles to
// interact with it: the captured click listener, the mocked storages, and
// the list of sendBeacon calls made.
function loadScript({ sessionStorage, pathname } = {}) {
  const sess = sessionStorage || mockStorage();
  const beaconCalls = [];
  let clickListener = null;

  const documentMock = {
    addEventListener: (type, cb) => {
      if (type === 'click') clickListener = cb;
    },
  };
  const navigatorMock = {
    sendBeacon: (url, payload) => { beaconCalls.push({ url, payload: JSON.parse(payload) }); return true; },
  };
  const locationMock = { pathname: pathname || '/some-page.html' };

  const sandbox = {
    document: documentMock,
    navigator: navigatorMock,
    sessionStorage: sess,
    location: locationMock,
    console,
    Date,
    Math,
    JSON,
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_SRC, sandbox);

  assert.ok(typeof clickListener === 'function', 'script must register a click listener via document.addEventListener');

  return { clickListener, sessionStorage: sess, beaconCalls };
}

function click(clickListener, href, extra = {}) {
  const preventDefaultCalls = [];
  const stopPropagationCalls = [];
  const event = {
    target: mockAnchor(href),
    preventDefault: () => preventDefaultCalls.push(1),
    stopPropagation: () => stopPropagationCalls.push(1),
    ...extra,
  };
  clickListener(event);
  return { preventDefaultCalls, stopPropagationCalls };
}

test('tel: link click sends a single phone ping', () => {
  const { clickListener, beaconCalls } = loadScript();
  click(clickListener, 'tel:+4900000000');
  assert.equal(beaconCalls.length, 1);
  assert.equal(beaconCalls[0].payload.type, 'phone');
});

test('wa.me link click sends a single whatsapp ping', () => {
  const { clickListener, beaconCalls } = loadScript();
  click(clickListener, 'https://wa.me/4900000000');
  assert.equal(beaconCalls.length, 1);
  assert.equal(beaconCalls[0].payload.type, 'whatsapp');
});

test('mailto: link click sends a single email ping', () => {
  const { clickListener, beaconCalls } = loadScript();
  click(clickListener, 'mailto:kontakt@example.invalid');
  assert.equal(beaconCalls.length, 1);
  assert.equal(beaconCalls[0].payload.type, 'email');
});

test('unrelated link click sends no ping', () => {
  const { clickListener, beaconCalls } = loadScript();
  click(clickListener, 'https://example.invalid/other-page');
  assert.equal(beaconCalls.length, 0);
});

test('click not on an anchor sends no ping and does not throw', () => {
  const { clickListener, beaconCalls } = loadScript();
  const event = { target: { closest: () => null }, preventDefault: () => {}, stopPropagation: () => {} };
  assert.doesNotThrow(() => clickListener(event));
  assert.equal(beaconCalls.length, 0);
});

test('no duplicate ping from one shared listener event (single click -> exactly one sendBeacon call)', () => {
  const { clickListener, beaconCalls } = loadScript();
  click(clickListener, 'tel:+4900000000');
  assert.equal(beaconCalls.length, 1);
});

test('shared listener never calls preventDefault or stopPropagation (does not suppress existing click handlers)', () => {
  const { clickListener } = loadScript();
  const { preventDefaultCalls, stopPropagationCalls } = click(clickListener, 'tel:+4900000000');
  assert.equal(preventDefaultCalls.length, 0);
  assert.equal(stopPropagationCalls.length, 0);
});

test('payload shape matches the existing inline implementation contract: {type, page, ts, attribution} plus ps_session_id', () => {
  const { clickListener, beaconCalls } = loadScript({ pathname: '/kontakt.html' });
  click(clickListener, 'tel:+4900000000');
  const p = beaconCalls[0].payload;
  assert.equal(p.type, 'phone');
  assert.equal(p.page, '/kontakt.html');
  assert.ok(typeof p.ts === 'string' && !Number.isNaN(Date.parse(p.ts)));
  assert.ok(p.attribution && typeof p.attribution === 'object');
  assert.ok(typeof p.ps_session_id === 'string' && p.ps_session_id.length > 0);
});

test('ps_session_id created once and reused across multiple lead clicks in the same session', () => {
  const sess = mockStorage();
  const { clickListener, beaconCalls } = loadScript({ sessionStorage: sess });
  click(clickListener, 'tel:+4900000000');
  click(clickListener, 'mailto:kontakt@example.invalid');
  click(clickListener, 'https://wa.me/4900000000');
  assert.equal(beaconCalls.length, 3);
  const ids = beaconCalls.map((c) => c.payload.ps_session_id);
  assert.equal(ids[0], ids[1]);
  assert.equal(ids[1], ids[2]);
});

test('a new browser session (fresh sessionStorage) gets a different ps_session_id', () => {
  const sessA = mockStorage();
  const sessB = mockStorage();
  const scriptA = loadScript({ sessionStorage: sessA });
  const scriptB = loadScript({ sessionStorage: sessB });
  click(scriptA.clickListener, 'tel:+4900000000');
  click(scriptB.clickListener, 'tel:+4900000000');
  const idA = scriptA.beaconCalls[0].payload.ps_session_id;
  const idB = scriptB.beaconCalls[0].payload.ps_session_id;
  assert.notEqual(idA, idB);
});

test('ps_session_id contains no PII (only from Date.now()/Math.random(), no user data injected)', () => {
  const { clickListener, beaconCalls } = loadScript();
  click(clickListener, 'tel:+4900000000');
  const id = beaconCalls[0].payload.ps_session_id;
  assert.match(id, /^ps_[a-z0-9]+_[a-z0-9]+$/);
});

test('ps_session_id storage key is a dedicated key, distinct from ps_attribution (does not repurpose it)', () => {
  const sess = mockStorage();
  sess.setItem('ps_attribution', JSON.stringify({ gclid: 'ABC' }));
  const { clickListener, beaconCalls } = loadScript({ sessionStorage: sess });
  click(clickListener, 'tel:+4900000000');
  assert.ok(sess._store['ps_session_id'], 'a dedicated ps_session_id key must be written');
  assert.notEqual(sess._store['ps_session_id'], sess._store['ps_attribution']);
  // ps_attribution itself must be untouched (still the original value)
  assert.equal(sess._store['ps_attribution'], JSON.stringify({ gclid: 'ABC' }));
  // and it must still be forwarded as attribution in the payload
  assert.equal(beaconCalls[0].payload.attribution.gclid, 'ABC');
});

test('empty/absent ps_attribution is tolerated (payload still sent with attribution: {})', () => {
  const { clickListener, beaconCalls } = loadScript();
  click(clickListener, 'tel:+4900000000');
  assert.deepEqual(beaconCalls[0].payload.attribution, {});
});

test('existing ps_attribution is preserved and forwarded unchanged', () => {
  const sess = mockStorage();
  sess.setItem('ps_attribution', JSON.stringify({ gclid: 'GCLID_XYZ', utm_source: 'google', utm_campaign: 'c1' }));
  const { clickListener, beaconCalls } = loadScript({ sessionStorage: sess });
  click(clickListener, 'tel:+4900000000');
  assert.deepEqual(beaconCalls[0].payload.attribution, { gclid: 'GCLID_XYZ', utm_source: 'google', utm_campaign: 'c1' });
});

test('script degrades gracefully (never throws) when sessionStorage access throws (private-mode style failure), still sends the ping', () => {
  const throwingStorage = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('SecurityError'); },
  };
  const { clickListener, beaconCalls } = loadScript({ sessionStorage: throwingStorage });
  assert.doesNotThrow(() => click(clickListener, 'tel:+4900000000'));
  assert.equal(beaconCalls.length, 1);
  assert.equal(beaconCalls[0].payload.ps_session_id, '');
  assert.deepEqual(beaconCalls[0].payload.attribution, {});
});
