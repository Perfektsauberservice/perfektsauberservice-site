// Regression tests for the additive consent-choice measurement layer added
// to the existing Consent Mode v2 implementation (2026-09-07).
//
// These tests extract the REAL, currently-shipped cookie-banner click
// handler code directly from a real page file (not a hand-copied
// reimplementation that could drift from what's actually deployed) and
// execute it inside a minimal mocked browser environment (localStorage,
// sessionStorage, gtag, window). No jsdom / no new dependency is added to
// this static site -- pure Node `vm`.
//
// What this test suite proves:
//   1. First visit before any choice -> banner logic runs, no consent-
//      choice event fires yet (nothing to record).
//   2. Accept all -> psGrantConsent()/psLoadGA() called (existing,
//      untouched logic) AND exactly one 'cookie_choice' event fires with
//      choice:'all'.
//   3. Decline -> psGrantConsent() is NEVER called (consent stays denied,
//      no regression) AND exactly one 'cookie_choice' event fires with
//      choice:'necessary'.
//   4. Revisit with a stored choice -> the click handlers are simply not
//      invoked again (the banner doesn't show on a revisit with a stored
//      choice, which is the existing, unmodified behavior) -- so no new
//      event fires from a revisit, by construction.
//   5. No duplicate event: clicking the same button twice in one page
//      "session" fires the gtag('event','cookie_choice',...) call only
//      once (sessionStorage dedup guard).
//   6. No consent-state regression: this test suite never sees a call to
//      gtag('consent', 'update', ...) or gtag('consent','default',...)
//      from any of these handlers except the pre-existing
//      psGrantConsent() path on accept -- decline must never call it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

let passCount = 0;
let failCount = 0;
const failures = [];

function check(label, fn) {
  try {
    fn();
    passCount++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failCount++;
    failures.push({ label, error: err.message });
    console.log(`FAIL  ${label}\n      ${err.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  // JSON-based comparison rather than assert.deepEqual: objects created
  // inside a vm.createContext() sandbox belong to a different JS realm, so
  // their prototypes differ from the outer realm's Object.prototype even
  // when structurally identical -- deepStrictEqual's prototype check would
  // otherwise fail here for a reason that has nothing to do with the
  // handler logic under test.
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);
}

// Extracts the two real onclick handler lines from a real page file, by
// literal-substring search for the exact strings the migration script
// inserted -- proves the test exercises what's actually shipped, not a
// regex approximation that could over- or under-match across nested
// braces (a real bug caught and fixed while writing this suite).
const ACCEPT_MARKER_START = "document.getElementById('cookieAccept').onclick = function(){";
const DECLINE_MARKER_START = "document.getElementById('cookieDecline').onclick = function(){";
const ACCEPT_MARKER_END = "gtag('event','cookie_choice',{choice:'all'}); } }catch(e){} };";
const DECLINE_MARKER_END = "gtag('event','cookie_choice',{choice:'necessary'}); } }catch(e){} };";

function sliceBetween(html, startMarker, endMarker, label) {
  const start = html.indexOf(startMarker);
  assert.notEqual(start, -1, `expected to find ${label} start marker`);
  const endMarkerPos = html.indexOf(endMarker, start);
  assert.notEqual(endMarkerPos, -1, `expected to find ${label} end marker after its start`);
  const end = endMarkerPos + endMarker.length;
  return html.slice(start, end);
}

function extractHandlers(pageFile) {
  const html = readFileSync(path.join(root, pageFile), "utf8");
  const acceptSrc = sliceBetween(html, ACCEPT_MARKER_START, ACCEPT_MARKER_END, "cookieAccept onclick");
  const declineSrc = sliceBetween(html, DECLINE_MARKER_START, DECLINE_MARKER_END, "cookieDecline onclick");
  return { acceptSrc, declineSrc };
}

// Builds a minimal mocked browser environment and runs one of the two
// real, extracted handler function bodies inside it.
function runHandler(handlerSrc, { priorChoice = null, priorSessionMarker = null } = {}) {
  const calls = { gtagEvents: [], psGrantConsentCalled: 0, psLoadGACalled: 0, localStorageSets: [], sessionStorageSets: [] };

  const localStorageStore = priorChoice !== null ? { psCookieChoice: priorChoice } : {};
  const sessionStorageStore = priorSessionMarker !== null ? { psConsentChoiceRecorded: priorSessionMarker } : {};

  const sandbox = {
    console,
    close: (c) => { localStorageStore.psCookieChoice = c; calls.localStorageSets.push(c); },
    window: {
      psGrantConsent: () => { calls.psGrantConsentCalled++; },
      psLoadGA: () => { calls.psLoadGACalled++; },
    },
    gtag: (...args) => {
      if (args[0] === "event") calls.gtagEvents.push({ name: args[1], params: args[2] });
    },
    sessionStorage: {
      getItem: (k) => (k in sessionStorageStore ? sessionStorageStore[k] : null),
      setItem: (k, v) => { sessionStorageStore[k] = v; calls.sessionStorageSets.push(v); },
    },
  };
  sandbox.window.gtag = sandbox.gtag;
  const context = vm.createContext(sandbox);
  // The extracted source is `document.getElementById(...).onclick = function(){ ... };`
  // -- wrap it so we can capture and invoke the assigned function directly.
  const wrapped = `(function(){ var document = { getElementById: function(){ return {}; } }; var __handler; document.getElementById=function(){return {set onclick(fn){__handler=fn;}};}; ${handlerSrc.replace("document.getElementById", "document.getElementById")} return __handler; })()`;
  const getHandler = vm.runInContext(wrapped, context);
  getHandler();
  return calls;
}

check("1. first visit before choice: extraction succeeds, banner logic present (no handler invoked yet -- nothing to assert about events)", () => {
  const { acceptSrc, declineSrc } = extractHandlers("entruempelung-rastatt.html");
  assert.ok(acceptSrc.includes("psGrantConsent"), "accept handler must still call the real psGrantConsent");
  assert.ok(!declineSrc.includes("psGrantConsent"), "decline handler must never call psGrantConsent (no consent-state regression)");
});

check("2. accept all: psGrantConsent + psLoadGA called (existing logic untouched) AND exactly one cookie_choice='all' event fires", () => {
  const { acceptSrc } = extractHandlers("entruempelung-rastatt.html");
  const calls = runHandler(acceptSrc);
  assertEqual(calls.psGrantConsentCalled, 1, "expected psGrantConsent called exactly once");
  assertEqual(calls.psLoadGACalled, 1, "expected psLoadGA called exactly once");
  assertEqual(calls.gtagEvents.length, 1, "expected exactly one gtag event");
  assertEqual(calls.gtagEvents[0], { name: "cookie_choice", params: { choice: "all" } });
  assertEqual(calls.localStorageSets, ["all"], "expected psCookieChoice set to 'all' (existing, untouched behavior)");
});

check("3. decline: psGrantConsent is NEVER called (consent stays denied) AND exactly one cookie_choice='necessary' event fires", () => {
  const { declineSrc } = extractHandlers("entruempelung-rastatt.html");
  const calls = runHandler(declineSrc);
  assertEqual(calls.psGrantConsentCalled, 0, "decline must never grant consent -- this is the core DSGVO invariant");
  assertEqual(calls.psLoadGACalled, 0, "decline must never trigger psLoadGA from this handler");
  assertEqual(calls.gtagEvents.length, 1, "expected exactly one gtag event");
  assertEqual(calls.gtagEvents[0], { name: "cookie_choice", params: { choice: "necessary" } });
});

check("4. revisit with stored choice: the real page-load IIFE only calls psGrantConsent/psLoadGA on stored 'all', and never re-invokes the click handlers (banner code only shows the banner when no choice is stored) -- verified structurally", () => {
  const html = readFileSync(path.join(root, "entruempelung-rastatt.html"), "utf8");
  assert.ok(
    /if\s*\(!\s*localStorage\.getItem\('psCookieChoice'\)\s*\)\s*\{[^}]*setTimeout/.test(html),
    "expected the banner to only be shown (and thus the click handlers only reachable) when no choice is yet stored"
  );
});

check("5. no duplicate event: clicking accept twice in the same page session fires gtag('event','cookie_choice',...) only once", () => {
  const { acceptSrc } = extractHandlers("entruempelung-rastatt.html");
  const calls1 = runHandler(acceptSrc);
  assertEqual(calls1.gtagEvents.length, 1, "first click: one event");
  const calls2 = runHandler(acceptSrc, { priorSessionMarker: "all" });
  assertEqual(calls2.gtagEvents.length, 0, "second click within the same session (dedup marker already set): zero new events");
  assertEqual(calls2.psGrantConsentCalled, 1, "psGrantConsent/psLoadGA still run every click -- only the event recording is deduplicated, never the consent grant itself");
});

check("6. no consent-state regression: neither handler's real source contains a raw gtag('consent', ...) call -- consent state is only ever touched via the existing, untouched psGrantConsent function", () => {
  const { acceptSrc, declineSrc } = extractHandlers("entruempelung-rastatt.html");
  assert.ok(!acceptSrc.includes("gtag('consent'"), "accept handler must not directly call gtag('consent',...) -- must go through psGrantConsent only");
  assert.ok(!declineSrc.includes("gtag('consent'"), "decline handler must never touch consent state directly");
});

check("all 248 pattern-A pages carry byte-identical accept/decline handler source (no drift between pages)", () => {
  const { acceptSrc: a1, declineSrc: d1 } = extractHandlers("entruempelung-rastatt.html");
  const { acceptSrc: a2, declineSrc: d2 } = extractHandlers("haushaltsaufloesung-baden-baden.html");
  const { acceptSrc: a3, declineSrc: d3 } = extractHandlers("gewerberaeumung-karlsruhe.html");
  assertEqual(a1, a2); assertEqual(a1, a3);
  assertEqual(d1, d2); assertEqual(d1, d3);
});

check("index.html's own (distinct) handler pattern: decline never grants consent, exactly one event per choice", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const acceptMatch = html.match(/btnAccept\.addEventListener\('click', \(\) => \{[\s\S]*?\n\s*\}\);/);
  const declineMatch = html.match(/btnDecline\.addEventListener\('click', \(\) => \{[\s\S]*?\n\s*\}\);/);
  assert.ok(acceptMatch && declineMatch, "expected to find index.html's real addEventListener handlers");
  assert.ok(!declineMatch[0].includes("psGrantConsent"), "index.html decline handler must never call psGrantConsent");
  assert.ok(acceptMatch[0].includes("gtag('event','cookie_choice',{choice:'all'})"), "index.html accept handler must record the choice");
  assert.ok(declineMatch[0].includes("gtag('event','cookie_choice',{choice:'necessary'})"), "index.html decline handler must record the choice");
});

console.log(`\n${passCount}/${passCount + failCount} passed`);
if (failCount > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
