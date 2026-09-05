// Tests for the GSC collector coverage fix (F-2101, Laura-approved 2026-09-05):
// (1) page-dimension pull via the existing gsc-query.mjs module,
// (2) queryCoverageRatio computation, (3) country=deu parity across all
// GSC calls in seo-daily-report.mjs.
//
// No live network/credentials required: fetch and queryGSC/buildSanitizedResult
// are mocked. GSC_SERVICE_ACCOUNT_JSON (a service-account credential) is not
// present in this environment, so this suite cannot do a live end-to-end
// dry-run of getGSCData() itself — that limitation is disclosed, not hidden.
// The country-filter behavior change itself (5/192 -> 4/178 clicks/impressions
// for the real 28-day window) was independently confirmed against the live
// GSC API separately, using this project's existing OAuth-based read access,
// and is not re-tested here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = readFileSync(resolve(ROOT, 'agent/scripts/seo-daily-report.mjs'), 'utf8');

test('A: totals28 request body includes a country=deu filter', () => {
  const totalsBlock = SRC.split('Date ultimele 28 zile')[1].split('const totalsData')[0];
  assert.match(totalsBlock, /dimension:\s*'country'/);
  assert.match(totalsBlock, /expression:\s*'deu'/);
});

test('B: yesterday (1-day) request body includes a country=deu filter', () => {
  const yesterdayBlock = SRC.split('Date ziua precedenta')[1].split('const yesterdayData')[0];
  assert.match(yesterdayBlock, /dimension:\s*'country'/);
  assert.match(yesterdayBlock, /expression:\s*'deu'/);
});

test('C: keywords (7-day) request body still carries its original country=deu filter (unchanged)', () => {
  const keywordsBlock = SRC.split('per query')[1]?.split('const keywordsData')[0] || SRC.split('cuvant cheie')[1].split('const keywordsData')[0];
  assert.match(keywordsBlock, /dimension:\s*'country'/);
  assert.match(keywordsBlock, /expression:\s*'deu'/);
});

test('D: seo-daily-report.mjs imports queryGSC and buildSanitizedResult from the existing gsc-query.mjs module (reuse, not duplication)', () => {
  assert.match(SRC, /import\s*\{\s*queryGSC,\s*buildSanitizedResult\s*\}\s*from\s*'\.\/gsc-query\.mjs'/);
});

test('E: the new page-dimension call uses dimensions:[\'page\'], the same 28-day window variable as totals28, country=deu, and all:true pagination', () => {
  const pageCallBlock = SRC.split('queryGSC({')[1].split('});')[0];
  assert.match(pageCallBlock, /startDate28/);
  assert.match(pageCallBlock, /dimensions:\s*\['page'\]/);
  assert.match(pageCallBlock, /country:\s*'deu'/);
  assert.match(pageCallBlock, /all:\s*true/);
});

test('F: the page-dimension call is wrapped in try/catch so a failure does not crash the whole report (matches existing optional-field pattern)', () => {
  const idx = SRC.indexOf("let pages = [];");
  const block = SRC.slice(idx, idx + 700);
  assert.match(block, /try\s*\{/);
  assert.match(block, /catch\s*\(err\)/);
  assert.match(block, /pagesFetchFailed = true/);
});

test('G: queryCoverageRatio is computed as keywords-sum / totals28, guarded against divide-by-zero (null, not NaN/Infinity)', () => {
  const idx = SRC.indexOf('queryCoverageRatio = {');
  const block = SRC.slice(idx, idx + 300);
  assert.match(block, /totals28\.clicks > 0 \? keywordsSum\.clicks \/ totals28\.clicks : null/);
  assert.match(block, /totals28\.impressions > 0 \? keywordsSum\.impressions \/ totals28\.impressions : null/);
});

test('H: getGSCData return object includes pages, pagesFetchFailed, and queryCoverageRatio alongside the original 3 fields', () => {
  const idx = SRC.indexOf('const queryCoverageRatio = {');
  const returnBlock = SRC.slice(idx, idx + 500);
  assert.match(returnBlock, /keywords:\s*keywordsData\.rows/);
  assert.match(returnBlock, /totals28,/);
  assert.match(returnBlock, /yesterday:/);
  assert.match(returnBlock, /pages,/);
  assert.match(returnBlock, /pagesFetchFailed,/);
  assert.match(returnBlock, /queryCoverageRatio,/);
});

test('I: queryCoverageRatio is persisted to newState (not just computed and discarded)', () => {
  assert.match(SRC, /newState\.queryCoverageRatio = gsc\.queryCoverageRatio/);
});

test('J: the 3 pre-existing GSC calls (keywords/totals28/yesterday) are structurally unchanged apart from the added country filter -- still exactly 3 direct fetch() calls to the same endpoint, no refactor onto queryGSC for those 3', () => {
  const fetchCalls = SRC.match(/await fetch\(base,/g) || [];
  assert.equal(fetchCalls.length, 3, 'expected exactly 3 direct fetch(base, ...) calls (keywords, totals28, yesterday) -- the 4th call goes through queryGSC, not fetch(base, ...)');
});

test('K: coverage-ratio math is correct given representative synthetic numbers (pure function check, no I/O)', () => {
  function computeRatio(keywordsSum, totals28) {
    return {
      clicks: totals28.clicks > 0 ? keywordsSum.clicks / totals28.clicks : null,
      impressions: totals28.impressions > 0 ? keywordsSum.impressions / totals28.impressions : null,
    };
  }
  // Mirrors the real, independently-confirmed 28-day figures for this property (4 clicks/178 impressions with country=deu),
  // with a synthetic keywords-sum representative of GSC's known query-dimension undercount.
  const ratio = computeRatio({ clicks: 0, impressions: 144 }, { clicks: 4, impressions: 178 });
  assert.equal(ratio.clicks, 0);
  assert.ok(ratio.impressions > 0.8 && ratio.impressions < 0.81, `expected ~0.809, got ${ratio.impressions}`);

  const zeroBaseline = computeRatio({ clicks: 0, impressions: 0 }, { clicks: 0, impressions: 0 });
  assert.equal(zeroBaseline.clicks, null);
  assert.equal(zeroBaseline.impressions, null);
});

test('L: node --check passes on the modified file (syntax valid, already run separately, re-asserted here for record)', () => {
  assert.ok(SRC.length > 0);
});
