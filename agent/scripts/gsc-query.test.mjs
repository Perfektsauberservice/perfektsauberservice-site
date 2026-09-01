/**
 * Local, secret-free tests for agent/scripts/gsc-query.mjs.
 *
 * Uses a synthetic (freshly generated, throwaway) RSA keypair as a stand-in
 * service account — never a real credential — and mocks global.fetch so no
 * network call or real GSC_SERVICE_ACCOUNT_JSON is required. Run with:
 *   node agent/scripts/gsc-query.test.mjs
 */

import assert from 'assert';
import { generateKeyPairSync } from 'crypto';
import { queryGSC, buildSanitizedResult, resolveDimensions } from './gsc-query.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      passed++;
      console.log(`  PASS  ${name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${name}\n        ${err.message}`);
    }
  })();
}

// ─── Synthetic (fake, non-secret) service account for testing only ────────

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

const FAKE_SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'test-fixture@example-project.iam.gserviceaccount.com',
  private_key: privateKey,
});

// ─── fetch mock ─────────────────────────────────────────────────────────

let mockQueue = [];
function mockFetch(url, opts) {
  const key = url.includes('oauth2.googleapis.com') ? 'token' : 'query';
  const handler = mockQueue.find((m) => m.key === key && (!m.once || !m.used));
  if (!handler) throw new Error(`No mock registered for ${key} call: ${url}`);
  handler.used = true;
  return Promise.resolve({
    ok: handler.status ? handler.status < 400 : true,
    status: handler.status || 200,
    json: async () => handler.response,
  });
}

function resetMocks() {
  mockQueue = [];
  global.fetch = mockFetch;
}

function mockToken() {
  mockQueue.push({ key: 'token', response: { access_token: 'fake-token-for-tests-only' } });
}

function mockQueryPage(rows, opts = {}) {
  mockQueue.push({ key: 'query', response: { rows }, once: true, ...opts });
}

// ─── Tests ──────────────────────────────────────────────────────────────

await test('dimensioned query: does NOT claim a guaranteed total — uses returned_rows_* and flags incompleteness', async () => {
  resetMocks();
  mockToken();
  mockQueryPage([
    { keys: ['/a'], clicks: 3, impressions: 100, ctr: 0.03, position: 5.1 },
    { keys: ['/b'], clicks: 0, impressions: 50, ctr: 0, position: 12.4 },
  ]);
  process.env.GSC_SERVICE_ACCOUNT_JSON = FAKE_SERVICE_ACCOUNT;

  const queryResult = await queryGSC({ startDate: '2026-08-03', endDate: '2026-08-30', dimensions: ['page'], rowLimit: 1000 });
  assert.strictEqual(queryResult.rows.length, 2);

  const sanitized = buildSanitizedResult({ startDate: '2026-08-03', endDate: '2026-08-30', dimensions: ['page'], filters: {}, queryResult });
  assert.strictEqual(sanitized.query_type, 'dimensioned');
  assert.strictEqual(sanitized.returned_rows_clicks, 3);
  assert.strictEqual(sanitized.returned_rows_impressions, 150);
  assert.strictEqual(sanitized.total_clicks, undefined, 'dimensioned query must not expose total_clicks as if it were a guaranteed total');
  assert.strictEqual(sanitized.total_impressions, undefined);
  assert.strictEqual(sanitized.metadata.gsc_rows_not_guaranteed_complete, true);
  assert.strictEqual(sanitized.row_count, 2);
  assert.strictEqual(sanitized.source, 'GOOGLE_SEARCH_CONSOLE_API');
  assert.ok(sanitized.captured_at);
});

await test('aggregate query (dimensions: []): reports real total_clicks/total_impressions, not row-completeness-limited', async () => {
  resetMocks();
  mockToken();
  // GSC returns a single summary row for a fully aggregate query, typically with no `keys` field at all.
  mockQueryPage([{ clicks: 2, impressions: 207, ctr: 0.0097, position: 45.3 }]);
  process.env.GSC_SERVICE_ACCOUNT_JSON = FAKE_SERVICE_ACCOUNT;

  const queryResult = await queryGSC({ startDate: '2026-08-03', endDate: '2026-08-30', dimensions: [], filters: { country: 'deu' } });
  const sanitized = buildSanitizedResult({ startDate: '2026-08-03', endDate: '2026-08-30', dimensions: [], filters: { country: 'deu' }, queryResult });

  assert.strictEqual(sanitized.query_type, 'aggregate');
  assert.strictEqual(sanitized.total_clicks, 2);
  assert.strictEqual(sanitized.total_impressions, 207);
  assert.strictEqual(sanitized.returned_rows_clicks, undefined, 'aggregate query must not use the dimensioned-query field names');
  assert.strictEqual(sanitized.returned_rows_impressions, undefined);
  assert.strictEqual(sanitized.metadata.gsc_rows_not_guaranteed_complete, false);
});

await test('resolveDimensions: "none" deterministically maps to [] (aggregate), never [""]', () => {
  assert.deepStrictEqual(resolveDimensions('none'), []);
  assert.deepStrictEqual(resolveDimensions('None'), []);
  assert.deepStrictEqual(resolveDimensions('  none  '), []);
  assert.deepStrictEqual(resolveDimensions('page'), ['page']);
  assert.deepStrictEqual(resolveDimensions('page,query'), ['page', 'query']);
  assert.deepStrictEqual(resolveDimensions(undefined), ['page']); // backward-compatible default
});

await test('aggregate request body: dimensions: [] is sent as-is to the API, never [""]', async () => {
  resetMocks();
  mockToken();
  let capturedBody = null;
  global.fetch = (url, opts) => {
    if (url.includes('oauth2.googleapis.com')) return mockFetch(url, opts);
    capturedBody = JSON.parse(opts.body);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ rows: [{ clicks: 1, impressions: 1 }] }) });
  };
  process.env.GSC_SERVICE_ACCOUNT_JSON = FAKE_SERVICE_ACCOUNT;

  await queryGSC({ startDate: '2026-08-03', endDate: '2026-08-30', dimensions: resolveDimensions('none') });
  assert.deepStrictEqual(capturedBody.dimensions, []);
});

await test('pagination: fetches until a partial page, respects MAX_PAGES safety cap conceptually', async () => {
  resetMocks();
  mockToken();
  const fullPage = Array.from({ length: 3 }, (_, i) => ({ keys: [`/p${i}`], clicks: 1, impressions: 10 }));
  mockQueryPage(fullPage, { once: true });
  mockQueryPage(fullPage, { once: true });
  mockQueryPage([{ keys: ['/last'], clicks: 1, impressions: 10 }], { once: true }); // partial page stops pagination

  const queryResult = await queryGSC({ startDate: '2026-08-03', endDate: '2026-08-30', dimensions: ['page'], rowLimit: 3, all: true });
  assert.strictEqual(queryResult.pagesFetched, 3);
  assert.strictEqual(queryResult.rows.length, 7);
  assert.strictEqual(queryResult.rowLimitHit, false);
});

await test('without all:true, only fetches a single page even if it is full', async () => {
  resetMocks();
  mockToken();
  const fullPage = Array.from({ length: 3 }, (_, i) => ({ keys: [`/p${i}`], clicks: 1, impressions: 10 }));
  mockQueryPage(fullPage, { once: true });

  const queryResult = await queryGSC({ startDate: '2026-08-03', endDate: '2026-08-30', dimensions: ['page'], rowLimit: 3, all: false });
  assert.strictEqual(queryResult.pagesFetched, 1);
  assert.strictEqual(queryResult.rowLimitHit, true);
});

await test('filters: country + page-contains produce the expected dimensionFilterGroups shape', async () => {
  resetMocks();
  mockToken();
  let capturedBody = null;
  global.fetch = (url, opts) => {
    if (url.includes('oauth2.googleapis.com')) return mockFetch(url, opts);
    capturedBody = JSON.parse(opts.body);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ rows: [] }) });
  };

  await queryGSC({
    startDate: '2026-08-03',
    endDate: '2026-08-30',
    dimensions: ['page'],
    filters: { country: 'deu', page: { contains: '/blog/' } },
  });

  assert.deepStrictEqual(capturedBody.dimensionFilterGroups, [
    {
      filters: [
        { dimension: 'country', operator: 'equals', expression: 'deu' },
        { dimension: 'page', operator: 'contains', expression: '/blog/' },
      ],
    },
  ]);
});

await test('missing startDate/endDate throws before any network call', async () => {
  resetMocks();
  await assert.rejects(() => queryGSC({ dimensions: ['page'] }), /requires startDate and endDate/);
});

await test('missing credential (no env, no .env entry) throws a clear, non-leaking error', async () => {
  resetMocks();
  const saved = process.env.GSC_SERVICE_ACCOUNT_JSON;
  delete process.env.GSC_SERVICE_ACCOUNT_JSON;
  try {
    await assert.rejects(
      () => queryGSC({ startDate: '2026-08-03', endDate: '2026-08-30' }),
      /GSC_SERVICE_ACCOUNT_JSON not found/
    );
  } finally {
    if (saved) process.env.GSC_SERVICE_ACCOUNT_JSON = saved;
  }
});

await test('sanitized output never contains the private key or access token material', async () => {
  resetMocks();
  mockToken();
  mockQueryPage([{ keys: ['/a'], clicks: 1, impressions: 10 }]);
  process.env.GSC_SERVICE_ACCOUNT_JSON = FAKE_SERVICE_ACCOUNT;

  const queryResult = await queryGSC({ startDate: '2026-08-03', endDate: '2026-08-30', dimensions: ['page'] });
  const sanitized = buildSanitizedResult({ startDate: '2026-08-03', endDate: '2026-08-30', dimensions: ['page'], filters: {}, queryResult });
  const serialized = JSON.stringify(sanitized);

  assert.ok(!serialized.includes('BEGIN RSA PRIVATE KEY'));
  assert.ok(!serialized.includes('private_key'));
  assert.ok(!serialized.includes('fake-token-for-tests-only'));
  assert.ok(!serialized.includes('client_email'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
