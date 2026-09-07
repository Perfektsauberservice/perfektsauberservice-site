// Deterministic fixture tests for the merged SEO Telegram report
// (2026-09-07 gap-closure pass, per Laura's revalidation spec):
//   - symmetric position-move threshold (section 6)
//   - signal-present content path: movers/drops/new-clicks/new-article (section 7 A-D)
//   - partial-fetch failure alert path (section 7 E-F)
//   - single logical send path (section 8)
//
// Imports the real exported pure functions from seo-daily-report.mjs --
// importing does NOT trigger a live run (see the isMainModule guard at the
// bottom of that file). No network, no credentials, no live GSC/Telegram.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  MIN_MOVE_DELTA,
  MIN_MOVE_IMPRESSIONS,
  computeDeltas,
  computeWarnings,
  computeHasSignal,
  buildReport,
} from '../seo-daily-report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = readFileSync(resolve(ROOT, 'agent/scripts/seo-daily-report.mjs'), 'utf8');

// ─── Helpers ──────────────────────────────────────────────────────────────

function snapshot(rows) {
  return { date: '2026-09-06', queries: rows };
}

function row(q, position, impressions = 10) {
  return { q, page: '/x', position, impressions, clicks: 0, ctr: 0 };
}

function fakeGsc({ clicks28 = 5, keywords = [] } = {}) {
  return {
    keywords,
    totals28: { clicks: clicks28, impressions: 100, ctr: 0.05, position: 40 },
    yesterday: { clicks: 0, impressions: 10, ctr: 0, position: 40 },
  };
}

const baseReportArgs = {
  pageSpeed: null,
  audit: null,
  backlinks: null,
  keywordSuggestions: [],
  isFirstDeltaRun: false,
};

// ─── Section 6: threshold boundary regression (both directions) ──────────

test('threshold: +0.4 position change is excluded from both ups and downs', () => {
  const d = computeDeltas([row('a', 80.4)], snapshot([row('a', 80.0)]));
  assert.equal(d.ups.length, 0);
  assert.equal(d.downs.length, 0);
});

test('threshold: +2 position change is excluded', () => {
  const d = computeDeltas([row('a', 82)], snapshot([row('a', 80)]));
  assert.equal(d.ups.length, 0);
  assert.equal(d.downs.length, 0);
});

test('threshold: +4.9 position change is excluded (just under the boundary)', () => {
  const d = computeDeltas([row('a', 84.9)], snapshot([row('a', 80)]));
  assert.equal(d.ups.length, 0);
  assert.equal(d.downs.length, 0);
});

test('threshold: +5 exactly is eligible as a DROP when impressions >= 5', () => {
  const d = computeDeltas([row('a', 85, 10)], snapshot([row('a', 80, 10)]));
  assert.equal(d.downs.length, 1, `expected MIN_MOVE_DELTA=${MIN_MOVE_DELTA} boundary to be inclusive`);
  assert.equal(d.ups.length, 0);
});

test('threshold: -4.9 position change is excluded (just under the boundary)', () => {
  const d = computeDeltas([row('a', 75.1)], snapshot([row('a', 80)]));
  assert.equal(d.ups.length, 0);
  assert.equal(d.downs.length, 0);
});

test('threshold: -5 exactly is eligible as a TOP MOVER UP when impressions >= 5', () => {
  const d = computeDeltas([row('a', 75, 10)], snapshot([row('a', 80, 10)]));
  assert.equal(d.ups.length, 1);
  assert.equal(d.downs.length, 0);
});

test('threshold: a large move (-10) with low impressions on both days is excluded', () => {
  const d = computeDeltas(
    [row('a', 70, MIN_MOVE_IMPRESSIONS - 1)],
    snapshot([row('a', 80, MIN_MOVE_IMPRESSIONS - 1)]),
  );
  assert.equal(d.ups.length, 0, 'a big position swing on a near-zero-impression query must not count as a mover');
});

test('threshold: impressions on EITHER day meeting the floor is sufficient (not both)', () => {
  const d = computeDeltas([row('a', 75, 0)], snapshot([row('a', 80, 10)]));
  assert.equal(d.ups.length, 1, 'yesterday had enough impressions even though today has none yet');
});

// ─── Section 7A: qualifying TOP MOVERS UP item ────────────────────────────

test('7A: one qualifying mover produces hasSignal=true and a Miscari pozitive section, without fabricating clicks/blog data', () => {
  const deltas = computeDeltas([row('entrümpelung rastatt', 75, 10)], snapshot([row('entrümpelung rastatt', 80, 10)]));
  const warnings = computeWarnings({ gscFetchFailed: false, trackedQueriesFetchFailed: false, pagesFetchFailed: false });
  const hasSignal = computeHasSignal({ warnings, clicksDiff: 0, blogIsNew: false, deltas, isFirstDeltaRun: false });
  assert.equal(hasSignal, true);

  const gsc = fakeGsc({ clicks28: 5 });
  const report = buildReport({ ...baseReportArgs, gsc, prevState: { clicks28: 5, blogCount: 118 }, blogCount: 118, deltas, warnings });
  assert.match(report, /Miscari pozitive/);
  assert.match(report, /entrümpelung rastatt/);
  assert.doesNotMatch(report, /Scaderi/, 'no drops occurred -- section must not appear');
  assert.doesNotMatch(report, /articole noi/, 'blog count unchanged -- must not claim new articles');
  assert.match(report, /\(\+0 fata de ieri\)/, 'clicks unchanged -- must report +0, not fabricate a change');
});

// ─── Section 7B: qualifying DROP ───────────────────────────────────────────

test('7B: one qualifying drop produces hasSignal=true and a Scaderi section, without fabricating a movers-up section', () => {
  const deltas = computeDeltas([row('büroreinigung rastatt', 85, 10)], snapshot([row('büroreinigung rastatt', 80, 10)]));
  const warnings = computeWarnings({ gscFetchFailed: false, trackedQueriesFetchFailed: false, pagesFetchFailed: false });
  const hasSignal = computeHasSignal({ warnings, clicksDiff: 0, blogIsNew: false, deltas, isFirstDeltaRun: false });
  assert.equal(hasSignal, true);

  const gsc = fakeGsc({ clicks28: 5 });
  const report = buildReport({ ...baseReportArgs, gsc, prevState: { clicks28: 5, blogCount: 118 }, blogCount: 118, deltas, warnings });
  assert.match(report, /Scaderi/);
  assert.match(report, /büroreinigung rastatt/);
  assert.doesNotMatch(report, /Miscari pozitive/, 'no ups occurred -- section must not appear');
});

// ─── Section 7C: new clicks ─────────────────────────────────────────────

test('7C: a click increase alone triggers hasSignal=true and shows the real diff', () => {
  const warnings = computeWarnings({ gscFetchFailed: false, trackedQueriesFetchFailed: false, pagesFetchFailed: false });
  const clicksDiff = 8 - 5; // today 8, yesterday-tracked baseline 5
  const hasSignal = computeHasSignal({ warnings, clicksDiff, blogIsNew: false, deltas: null, isFirstDeltaRun: false });
  assert.equal(hasSignal, true);

  const gsc = fakeGsc({ clicks28: 8 });
  const report = buildReport({ ...baseReportArgs, gsc, prevState: { clicks28: 5, blogCount: 118 }, blogCount: 118, deltas: null, warnings });
  assert.match(report, /\(\+3 fata de ieri\)/);
  assert.doesNotMatch(report, /Miscari pozitive|Scaderi/, 'no move data supplied -- movers sections must not appear');
});

// ─── Section 7D: new article ────────────────────────────────────────────

test('7D: a blog-count increase alone triggers hasSignal=true and shows the real new-article count', () => {
  const warnings = computeWarnings({ gscFetchFailed: false, trackedQueriesFetchFailed: false, pagesFetchFailed: false });
  const hasSignal = computeHasSignal({ warnings, clicksDiff: 0, blogIsNew: true, deltas: null, isFirstDeltaRun: false });
  assert.equal(hasSignal, true);

  const gsc = fakeGsc({ clicks28: 5 });
  const report = buildReport({ ...baseReportArgs, gsc, prevState: { clicks28: 5, blogCount: 118 }, blogCount: 120, deltas: null, warnings });
  assert.match(report, /\+2 articole noi ieri/);
});

// ─── Section 7E: tracked-query partial fetch failure ──────────────────────

test('7E: tracked-query fetch failure alone triggers hasSignal=true, shows a named warning, and does not fabricate a "0 movers" section', () => {
  const warnings = computeWarnings({ gscFetchFailed: false, trackedQueriesFetchFailed: true, pagesFetchFailed: false });
  assert.deepEqual(warnings, ['Cuvinte cheie tinta (miscari de pozitie) indisponibile']);
  const hasSignal = computeHasSignal({ warnings, clicksDiff: 0, blogIsNew: false, deltas: null, isFirstDeltaRun: false });
  assert.equal(hasSignal, true, 'a degraded fetch must never look identical to a quiet day');

  const gsc = fakeGsc({ clicks28: 5 });
  // deltas is null here -- exactly what main() does when trackedQueriesFetchFailed is true.
  const report = buildReport({ ...baseReportArgs, gsc, prevState: { clicks28: 5, blogCount: 118 }, blogCount: 118, deltas: null, warnings });
  assert.match(report, /Date indisponibile azi/);
  assert.match(report, /Cuvinte cheie tinta \(miscari de pozitie\) indisponibile/);
  assert.doesNotMatch(report, /Miscari pozitive|Scaderi|Cuvinte noi indexate/, 'must not print any movers content when the underlying fetch failed');
});

// ─── Section 7F: page-dimension partial fetch failure ─────────────────────

test('7F: page-dimension fetch failure alone triggers hasSignal=true and shows a named warning', () => {
  const warnings = computeWarnings({ gscFetchFailed: false, trackedQueriesFetchFailed: false, pagesFetchFailed: true });
  assert.deepEqual(warnings, ['Date GSC per pagina indisponibile']);
  const hasSignal = computeHasSignal({ warnings, clicksDiff: 0, blogIsNew: false, deltas: null, isFirstDeltaRun: false });
  assert.equal(hasSignal, true);

  const gsc = fakeGsc({ clicks28: 5 });
  const report = buildReport({ ...baseReportArgs, gsc, prevState: { clicks28: 5, blogCount: 118 }, blogCount: 118, deltas: null, warnings });
  assert.match(report, /Date indisponibile azi/);
  assert.match(report, /Date GSC per pagina indisponibile/);
});

// ─── Total GSC failure (whole-fetch outage) ───────────────────────────────

test('total GSC failure alone triggers hasSignal=true, warns, and the GSC section says data unavailable (not zeros)', () => {
  const warnings = computeWarnings({ gscFetchFailed: true, trackedQueriesFetchFailed: false, pagesFetchFailed: false });
  assert.deepEqual(warnings, ['Date GSC generale (totaluri, top cuvinte cheie) indisponibile']);
  const hasSignal = computeHasSignal({ warnings, clicksDiff: 0, blogIsNew: false, deltas: null, isFirstDeltaRun: false });
  assert.equal(hasSignal, true);

  const report = buildReport({ ...baseReportArgs, gsc: null, prevState: { clicks28: 5, blogCount: 118 }, blogCount: 118, deltas: null, warnings });
  assert.match(report, /Date indisponibile azi/);
  assert.match(report, /GSC.*date indisponibile/);
});

// ─── Silence path stays correct when everything is genuinely healthy+quiet ──

test('no warnings + no click/blog/move signal => hasSignal is false (silence preserved)', () => {
  const warnings = computeWarnings({ gscFetchFailed: false, trackedQueriesFetchFailed: false, pagesFetchFailed: false });
  const deltas = computeDeltas([row('a', 80.1, 10)], snapshot([row('a', 80.0, 10)])); // sub-threshold noise
  const hasSignal = computeHasSignal({ warnings, clicksDiff: 0, blogIsNew: false, deltas, isFirstDeltaRun: false });
  assert.equal(hasSignal, false);
});

// ─── Section 8: single logical send path ──────────────────────────────────

test('8: exactly one top-level sendTelegram(report) call site, gated by a single hasSignal branch', () => {
  const mainBlock = SRC.slice(SRC.indexOf('async function main()'));
  const sendCalls = mainBlock.match(/await sendTelegram\(report\)/g) || [];
  assert.equal(sendCalls.length, 1, 'main() must call sendTelegram(report) exactly once per run');
});

test('8: sendTelegram\'s internal message-chunk recursion is a length-split of ONE report, not a second logical report', () => {
  // The two recursive calls inside sendTelegram() split `message` (the same
  // string) in half on Telegram\'s "message is too long" error -- this is
  // chunking one logical report, never a second independent send.
  const fnBlock = SRC.slice(SRC.indexOf('async function sendTelegram'), SRC.indexOf('async function getGoogleAccessToken'));
  assert.match(fnBlock, /message is too long/);
  assert.match(fnBlock, /sendTelegram\(message\.slice\(0, half\)\)/);
  assert.match(fnBlock, /sendTelegram\(message\.slice\(half\)\)/);
});

// ─── Regression: the deleted duplicate report source must stay deleted ────

test('regression: gsc-delta-tracker.mjs and its standalone workflow must not be reintroduced', () => {
  assert.equal(existsSync(resolve(ROOT, 'agent/scripts/gsc-delta-tracker.mjs')), false);
  assert.equal(existsSync(resolve(ROOT, '.github/workflows/pss-gsc-delta-tracker.yml')), false);
});
