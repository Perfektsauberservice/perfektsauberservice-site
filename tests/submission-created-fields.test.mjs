// Regression test for the additive qualification fields (plz, umfang,
// wunschtermin) added to netlify/functions/submission-created.mjs for the
// new AG3_Grundreinigung form coverage (2026-09-17).
//
// Imports the REAL, currently-shipped handler (not a reimplementation) and
// invokes it with a mocked fetch + mocked Telegram/Resend env vars, so any
// drift between this test and the actual deployed code is impossible.
//
// What this proves:
//   1. New fields (plz, umfang, wunschtermin) are extracted and included in
//      both the Telegram text and the email HTML when present.
//   2. Existing pages that don't send these fields (e.g. the Entrümpelung
//      forms) still work exactly as before -- missing fields fall back to
//      '-' the same way city/service already did, no error, no regression.
//   3. Exactly one Telegram call and one Resend call happen per invocation
//      (no duplication introduced by the new fields).

import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const handlerPath = path.resolve(here, "../netlify/functions/submission-created.mjs");

async function invoke(payloadData, envOverrides = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: opts?.body ? JSON.parse(opts.body) : null });
    if (String(url).includes("telegram.org")) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, text: async () => "" };
  };

  const savedEnv = { ...process.env };
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "test-chat",
    RESEND_API_KEY: "test-key",
    ALERT_EMAIL_TO: "to@example.com",
    ALERT_EMAIL_FROM: "from@example.com",
    ...envOverrides,
  });

  try {
    // Bust the module cache with a query string so repeated invocations in
    // the same process still see fresh env vars where relevant; the module
    // itself has no top-level state, so a single import is fine too.
    const mod = await import(pathToFileURL(handlerPath).href);
    const res = await mod.handler({ body: JSON.stringify({ payload: { data: payloadData } }) });
    return { res, calls };
  } finally {
    process.env = savedEnv;
    globalThis.fetch = originalFetch;
  }
}

test("new qualification fields (plz, umfang, wunschtermin) reach Telegram and email", async () => {
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
  assert.ok(telegramCall, "Telegram was called");
  assert.match(telegramCall.body.text, /PLZ: 76437/);
  assert.match(telegramCall.body.text, /Umfang: 3-Zimmer-Wohnung, ca\. 70 m²/);
  assert.match(telegramCall.body.text, /Wunschtermin: nächste Woche/);

  const resendCall = calls.find(c => c.url.includes("resend.com"));
  assert.ok(resendCall, "Resend was called");
  assert.match(resendCall.body.html, /PLZ:<\/strong> 76437/);
  assert.match(resendCall.body.html, /Umfang:<\/strong> 3-Zimmer-Wohnung/);
  assert.match(resendCall.body.html, /Wunschtermin:<\/strong> nächste Woche/);

  assert.equal(calls.length, 2, "exactly one Telegram call and one Resend call, no duplication");
});

test("existing pages without the new fields still work (backward compatible fallback)", async () => {
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
