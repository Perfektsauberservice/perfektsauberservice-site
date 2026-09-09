// Regression tests for the Stage 1 prerequisite hardening of
// netlify/functions/lead-click-ping.mjs: the function used to return an
// unconditional HTTP 200 on every path (including Telegram rejecting the
// request, Telegram being unreachable, and internal exceptions), which
// defeated Netlify's own function-error-rate monitoring. This suite proves
// the fixed function returns truthful, differentiated statuses and that no
// secret (bot token / chat id) or raw Telegram response ever leaks into the
// response body returned to the browser.
//
// Run: node --test tests/lead-click-ping-truthful-status.test.mjs

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/lead-click-ping.mjs';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function setTelegramEnv() {
  process.env.TELEGRAM_BOT_TOKEN = 'SECRET_BOT_TOKEN_12345';
  process.env.TELEGRAM_CHAT_ID = 'SECRET_CHAT_ID_67890';
}

function clearTelegramEnv() {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
}

function mockFetchOk() {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: {} }),
  });
}

function mockFetchRejected(status, secretPayload) {
  globalThis.fetch = async () => ({
    ok: false,
    status,
    json: async () => ({ ok: false, description: secretPayload || 'Bad Request', error_code: status }),
  });
}

function mockFetchNetworkFailure() {
  globalThis.fetch = async () => {
    throw new Error('getaddrinfo ENOTFOUND api.telegram.org');
  };
}

function validEvent(overrides = {}) {
  return {
    body: JSON.stringify({
      type: 'phone',
      page: '/kontakt.html',
      ts: new Date().toISOString(),
      attribution: {},
      ...overrides,
    }),
  };
}

beforeEach(() => {
  setTelegramEnv();
});

after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

test('successful accepted ping -> 200, body OK', async () => {
  mockFetchOk();
  const res = await handler(validEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'OK');
});

test('invalid type -> 400 (not 200, not silently accepted)', async () => {
  mockFetchOk();
  const res = await handler(validEvent({ type: 'carrier-pigeon' }));
  assert.equal(res.statusCode, 400);
});

test('malformed page (no leading slash) -> 400', async () => {
  mockFetchOk();
  const res = await handler(validEvent({ page: 'kontakt.html' }));
  assert.equal(res.statusCode, 400);
});

test('missing Telegram config -> 500 (internal/config failure), never 200', async () => {
  clearTelegramEnv();
  mockFetchOk(); // should never even be called
  const res = await handler(validEvent());
  assert.equal(res.statusCode, 500);
  assert.equal(res.body, 'no-telegram-config');
});

test('unexpected internal exception (malformed JSON body) -> 500, never 200', async () => {
  mockFetchOk();
  const res = await handler({ body: '{not-json' });
  assert.equal(res.statusCode, 500);
});

test('Telegram 4xx rejects the request -> non-200 (502)', async () => {
  mockFetchRejected(400, 'SECRET_INTERNAL_DETAIL_4xx');
  const res = await handler(validEvent());
  assert.notEqual(res.statusCode, 200);
  assert.equal(res.statusCode, 502);
});

test('Telegram 5xx failure -> non-200 (502)', async () => {
  mockFetchRejected(500, 'SECRET_INTERNAL_DETAIL_5xx');
  const res = await handler(validEvent());
  assert.notEqual(res.statusCode, 200);
  assert.equal(res.statusCode, 502);
});

test('network failure reaching Telegram -> non-200 (502)', async () => {
  mockFetchNetworkFailure();
  const res = await handler(validEvent());
  assert.notEqual(res.statusCode, 200);
  assert.equal(res.statusCode, 502);
});

test('no secret leakage: bot token/chat id never appear in any response body', async () => {
  for (const mock of [mockFetchOk, () => mockFetchRejected(400), () => mockFetchRejected(500), mockFetchNetworkFailure]) {
    mock();
    const res = await handler(validEvent());
    assert.ok(!res.body.includes('SECRET_BOT_TOKEN_12345'), 'bot token leaked in response body');
    assert.ok(!res.body.includes('SECRET_CHAT_ID_67890'), 'chat id leaked in response body');
  }
});

test('no raw Telegram response leakage in rejected-request body', async () => {
  mockFetchRejected(400, 'SECRET_INTERNAL_DETAIL_4xx');
  const res = await handler(validEvent());
  assert.ok(!res.body.includes('SECRET_INTERNAL_DETAIL_4xx'), 'raw Telegram description leaked into response body');
});

test('empty ps_attribution is tolerated (pilot policy: EMPTY_PS_ATTRIBUTION_ALLOWED_FOR_PILOT)', async () => {
  mockFetchOk();
  const res = await handler(validEvent({ attribution: {} }));
  assert.equal(res.statusCode, 200);
});

test('existing attribution (gclid/utm) is preserved and reaches the Telegram message text', async () => {
  let capturedBody;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const res = await handler(validEvent({
    attribution: { gclid: 'GCLID_ABC', utm_source: 'google', utm_campaign: 'test_campaign' },
  }));
  assert.equal(res.statusCode, 200);
  assert.match(capturedBody.text, /gclid=GCLID_ABC/);
  assert.match(capturedBody.text, /utm_source=google/);
  assert.match(capturedBody.text, /utm_campaign=test_campaign/);
});

test('ps_session_id, when present, is surfaced in the Telegram text for correlation', async () => {
  let capturedBody;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const res = await handler(validEvent({ ps_session_id: 'ps_abc123_xyz789' }));
  assert.equal(res.statusCode, 200);
  assert.match(capturedBody.text, /ps_abc123_xyz789/);
});

test('no ps_session_id (existing 8-pilot-page payload shape) -> text is byte-identical to the pre-existing format (no "Sesiune" line)', async () => {
  let capturedBody;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  await handler(validEvent());
  assert.ok(!capturedBody.text.includes('Sesiune'), 'session line must not appear when no ps_session_id is sent');
});
