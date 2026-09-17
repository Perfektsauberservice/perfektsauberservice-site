// Regression tests for netlify/functions/submission-created.mjs:
//   1. the additive qualification fields (plz, umfang, wunschtermin) added
//      for the new AG3_Grundreinigung form coverage (2026-09-17), and
//   2. the Telegram/Resend error-path isolation correction (2026-09-17,
//      Perplexity red-team follow-up) -- each channel must be attempted
//      independently of whether the other one throws.
//
// Imports the REAL, currently-shipped handler (not a reimplementation) and
// invokes it with a mocked fetch + mocked Telegram/Resend env vars, so any
// drift between this test and the actual deployed code is impossible.

import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const handlerPath = path.resolve(here, "../netlify/functions/submission-created.mjs");

async function invoke(payloadData, { fetchImpl } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl
    ? (url, opts) => { calls.push({ url: String(url), body: opts?.body ? JSON.parse(opts.body) : null }); return fetchImpl(url, opts); }
    : async (url, opts) => {
        calls.push({ url: String(url), body: opts?.body ? JSON.parse(opts.body) : null });
        if (String(url).includes("telegram.org")) return { ok: true, json: async () => ({ ok: true }) };
        return { ok: true, text: async () => "" };
      };

  const savedEnv = { ...process.env };
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "test-chat",
    RESEND_API_KEY: "test-key",
    ALERT_EMAIL_TO: "to@example.com",
    ALERT_EMAIL_FROM: "from@example.com",
  });

  try {
    const mod = await import(pathToFileURL(handlerPath).href + `?t=${Date.now()}-${Math.random()}`);
    const res = await mod.handler({ body: JSON.stringify({ payload: { data: payloadData } }) });
    return { res, calls };
  } finally {
    process.env = savedEnv;
    globalThis.fetch = originalFetch;
  }
}

const basicLead = { name: "Test Kunde", telefon: "0163 0000000", nachricht: "Bitte Angebot." };

test("1. Telegram success + email success: each attempted exactly once", async () => {
  const { calls, res } = await invoke(basicLead);
  const telegramCalls = calls.filter(c => c.url.includes("telegram.org"));
  const resendCalls = calls.filter(c => c.url.includes("resend.com"));
  assert.equal(telegramCalls.length, 1, "Telegram called exactly once");
  assert.equal(resendCalls.length, 1, "Resend called exactly once");
  assert.equal(res.statusCode, 200);
});

test("2. Telegram failure (throws): email still attempted exactly once", async () => {
  const { calls, res } = await invoke(basicLead, {
    fetchImpl: async (url) => {
      if (String(url).includes("telegram.org")) throw new Error("simulated Telegram network failure");
      return { ok: true, text: async () => "" };
    },
  });
  const telegramCalls = calls.filter(c => c.url.includes("telegram.org"));
  const resendCalls = calls.filter(c => c.url.includes("resend.com"));
  assert.equal(telegramCalls.length, 1, "Telegram was still attempted once (and threw)");
  assert.equal(resendCalls.length, 1, "email was still attempted exactly once despite the Telegram exception");
  assert.equal(res.statusCode, 200, "handler still returns 200, does not crash the whole invocation");
});

test("3. Email failure (throws): Telegram still attempted exactly once", async () => {
  const { calls, res } = await invoke(basicLead, {
    fetchImpl: async (url) => {
      if (String(url).includes("resend.com")) throw new Error("simulated Resend network failure");
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  const telegramCalls = calls.filter(c => c.url.includes("telegram.org"));
  const resendCalls = calls.filter(c => c.url.includes("resend.com"));
  assert.equal(telegramCalls.length, 1, "Telegram was still attempted exactly once, unaffected by the later email exception");
  assert.equal(resendCalls.length, 1, "email was still attempted once (and threw)");
  assert.equal(res.statusCode, 200);
});

test("4. Old submission without the new fields remains compatible", async () => {
  const { calls } = await invoke({
    name: "Alt-Formular Kunde",
    telefon: "0163 1111111",
    nachricht: "Entrümpelung bitte.",
  });
  const telegramCall = calls.find(c => c.url.includes("telegram.org"));
  assert.ok(telegramCall, "Telegram was still called for a form without the new fields");
  assert.match(telegramCall.body.text, /PLZ: —/);
  assert.match(telegramCall.body.text, /Umfang: —/);
  assert.match(telegramCall.body.text, /Wunschtermin: —/);
  assert.match(telegramCall.body.text, /Nume: Alt-Formular Kunde/);
  assert.equal(calls.length, 2, "still exactly one Telegram call and one Resend call");
});

test("5. New submission: qualification fields appear exactly once in each notification", async () => {
  const { calls } = await invoke({
    name: "Test Kunde",
    telefon: "0163 0000000",
    ort: "Rastatt",
    plz: "76437",
    service: "Wohnungsreinigung",
    umfang: "3-Zimmer-Wohnung, ca. 70 m²",
    wunschtermin: "nächste Woche",
    nachricht: "Bitte Angebot.",
  });

  const telegramCall = calls.find(c => c.url.includes("telegram.org"));
  const resendCall = calls.find(c => c.url.includes("resend.com"));

  for (const needle of ["PLZ: 76437", "Umfang: 3-Zimmer-Wohnung, ca. 70 m²", "Wunschtermin: nächste Woche"]) {
    const occurrences = telegramCall.body.text.split(needle).length - 1;
    assert.equal(occurrences, 1, `"${needle}" appears exactly once in the Telegram text`);
  }
  for (const needle of ["PLZ:</strong> 76437", "Umfang:</strong> 3-Zimmer-Wohnung", "Wunschtermin:</strong> nächste Woche"]) {
    const occurrences = resendCall.body.html.split(needle).length - 1;
    assert.equal(occurrences, 1, `"${needle}" appears exactly once in the email HTML`);
  }
});
