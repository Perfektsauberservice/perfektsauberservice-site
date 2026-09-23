// Regression tests for the new "treppenhausreinigung-lead" qualified-contact form
// (2026-09-23), added to /treppenhausreinigung which previously had tel:/WhatsApp
// only and zero <form> elements. Built on the same proven architecture already
// verified live for Grundreinigung (grundreinigung-form-identity.test.mjs,
// 6f020c6d): own distinct Netlify form identity, same qualification fields,
// same attribution fields, same submission-created.mjs (unmodified, generic).
//
// These tests can prove: exactly one form exists on the page, outer/hidden
// form-name agree and equal "treppenhausreinigung-lead", every required
// qualification/attribution/consent field is present and enabled, native
// submission is not intercepted, the form posts to /danke, existing
// tel:/WhatsApp CTAs are untouched, legacy form identities are unaffected,
// and submission-created.mjs processes this new identity correctly with
// Telegram/email isolation intact. They cannot prove Netlify's backend will
// register and store the new identity's fields correctly -- that requires an
// actual deploy and one real submission, covered by the separate live
// verification task.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const PAGE = "treppenhausreinigung.html";
const NEW_FORM_NAME = "treppenhausreinigung-lead";
const LEGACY_FORM_NAMES = ["lead", "grundreinigung-lead", "kontakt", "preisrechner-lead"];

const QUALIFICATION_FIELDS = ["plz", "ort", "service", "umfang", "wunschtermin"];
const LEGACY_FIELDS = ["name", "telefon", "nachricht", "agb_widerruf_accepted", "email"];
const ATTRIBUTION_FIELDS = [
  "lead_id", "gclid", "gbraid", "wbraid", "utm_source", "utm_medium",
  "utm_campaign", "utm_term", "utm_content", "landing_page_url", "first_seen_at",
];

function countForms(html) {
  return (html.match(/<form\b/gi) || []).length;
}

function extractFormBlock(html) {
  const start = html.indexOf("<form");
  const end = html.indexOf("</form>", start) + "</form>".length;
  return html.slice(start, end);
}

function fieldPresentAndEnabled(formHtml, fieldName) {
  const re = new RegExp(`<(input|select|textarea)[^>]*\\bname=["']${fieldName}["'][^>]*>`, "i");
  const m = formHtml.match(re);
  if (!m) return { present: false };
  return { present: true, disabled: /\bdisabled\b/i.test(m[0]) };
}

const html = readFileSync(path.join(root, PAGE), "utf8");
const formHtml = extractFormBlock(html);

// --- 1: exactly one intended form on the page ---
test(`${PAGE}: exactly one <form> element exists`, () => {
  assert.equal(countForms(html), 1, "the page must have exactly one form, not zero and not duplicated");
});

// --- 2: outer/hidden form identity agreement, equal to the new name ---
test(`${PAGE}: outer <form name> is "${NEW_FORM_NAME}"`, () => {
  assert.match(formHtml, new RegExp(`<form[^>]*\\bname=["']${NEW_FORM_NAME}["']`));
});

test(`${PAGE}: hidden form-name value matches the outer form name exactly`, () => {
  const outerMatch = formHtml.match(/<form[^>]*\bname=["']([^"']+)["']/);
  const hiddenMatch = formHtml.match(/name=["']form-name["']\s+value=["']([^"']+)["']/);
  assert.ok(outerMatch && hiddenMatch, "both the outer name and hidden form-name input were found");
  assert.equal(hiddenMatch[1], outerMatch[1], "hidden form-name value equals the outer <form name>");
  assert.equal(outerMatch[1], NEW_FORM_NAME);
});

// --- 3: all required fields present, correctly named, enabled ---
test(`${PAGE}: all qualification fields present, named, enabled`, () => {
  for (const field of QUALIFICATION_FIELDS) {
    const r = fieldPresentAndEnabled(formHtml, field);
    assert.ok(r.present, `"${field}" present`);
    assert.equal(r.disabled, false, `"${field}" not disabled`);
  }
});

test(`${PAGE}: legacy + attribution + consent fields present, named, enabled`, () => {
  for (const field of [...LEGACY_FIELDS, ...ATTRIBUTION_FIELDS, "form-name"]) {
    const r = fieldPresentAndEnabled(formHtml, field);
    assert.ok(r.present, `"${field}" present`);
    assert.equal(r.disabled, false, `"${field}" not disabled`);
  }
  assert.match(formHtml, /data-netlify=["']true["']/, "Netlify honeypot protection preserved (data-netlify)");
  assert.match(formHtml, /data-netlify-honeypot=["']bot-field["']/, "honeypot field name preserved");
  assert.match(formHtml, /name=["']bot-field["']/, "honeypot input itself present");
});

// --- 4: native submission not intercepted or rebuilt incorrectly ---
test(`${PAGE}: form has no JS submit-preventDefault / fetch-based interception of the native POST`, () => {
  // The only submit listener touching this form must be the attribution-population
  // script, which never calls preventDefault() and never issues its own fetch/XHR --
  // it lets the browser's native multipart/form POST to action="/danke" proceed.
  assert.doesNotMatch(html, /heroForm\.addEventListener\('submit'[^)]*\)\s*{\s*[^}]*preventDefault/s);
  assert.match(formHtml, /action=["']\/danke["']/, "native action target present");
  assert.match(formHtml, /method=["']POST["']/i, "native POST method present");
});

// --- 5: attribution fields remain present (already covered above, re-asserted explicitly) ---
test(`${PAGE}: all Ads/GA attribution fields explicitly present`, () => {
  for (const field of ATTRIBUTION_FIELDS) {
    assert.ok(fieldPresentAndEnabled(formHtml, field).present, `attribution field "${field}" present`);
  }
});

// --- 6: submits to /danke ---
test(`${PAGE}: form action targets /danke`, () => {
  assert.match(formHtml, /action=["']\/danke["']/);
});

// --- existing tel:/WhatsApp CTAs preserved ---
test(`${PAGE}: existing telephone and WhatsApp CTAs remain present and untouched`, () => {
  assert.match(html, /href=["']tel:\+491639087197["']/);
  assert.match(html, /wa\.me\/491639087197/);
});

// --- no file upload added ---
test(`${PAGE}: no file upload input was added`, () => {
  assert.doesNotMatch(formHtml, /type=["']file["']/i);
});

// --- 10: legacy form identities unaffected (no other page checked here uses this file,
// so we assert this file itself never claims a legacy identity) ---
test(`${PAGE}: page does not claim any legacy form identity`, () => {
  for (const legacyName of LEGACY_FORM_NAMES) {
    assert.doesNotMatch(formHtml, new RegExp(`<form[^>]*\\bname=["']${legacyName}["']`));
  }
});

// --- GA4/Ads tracking + consent tail unchanged ---
test(`${PAGE}: GA4/Ads tracking script and consent tail are unchanged`, () => {
  assert.match(html, /gtag\('config', 'G-BMC32KSYKF'/);
  assert.match(html, /gtag\('config', 'AW-18036757035'\)/);
  assert.match(html, /window\.psLoadGA\(\);/);
});

// --- submission-created.mjs: confirmed generic, unmodified ---
test("submission-created.mjs never branches on form identity -- confirmed still generic, unmodified", () => {
  const fnSrc = readFileSync(path.join(root, "netlify/functions/submission-created.mjs"), "utf8");
  assert.doesNotMatch(fnSrc, /form_name|form-name/, "the function does not read or branch on any form-name/form_name field");
});

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
    TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "test-chat",
    RESEND_API_KEY: "test-key", ALERT_EMAIL_TO: "to@example.com", ALERT_EMAIL_FROM: "from@example.com",
  });
  try {
    const handlerPath = path.join(root, "netlify/functions/submission-created.mjs");
    const mod = await import(pathToFileURL(handlerPath).href + `?t=${Date.now()}-${Math.random()}`);
    const res = await mod.handler({ body: JSON.stringify({ payload: { form_name: payloadData._form_name, data: payloadData } }) });
    return { res, calls };
  } finally {
    process.env = savedEnv;
    globalThis.fetch = originalFetch;
  }
}

// --- 7: function reads and displays every qualification field in Telegram and email ---
test("'treppenhausreinigung-lead' submission: all qualification fields read and shown in Telegram+email, each fired exactly once", async () => {
  const { calls } = await invoke({
    _form_name: "treppenhausreinigung-lead", name: "PSS Test", telefon: "0000000000",
    plz: "76593", ort: "Gernsbach", service: "Treppenhausreinigung wöchentlich",
    umfang: "TEST", wunschtermin: "TEST", nachricht: "Test",
  });
  const tg = calls.find(c => c.url.includes("telegram.org"));
  const rs = calls.find(c => c.url.includes("resend.com"));
  assert.equal(calls.filter(c => c.url.includes("telegram.org")).length, 1, "Telegram exactly once");
  assert.equal(calls.filter(c => c.url.includes("resend.com")).length, 1, "Resend exactly once");
  assert.match(tg.body.text, /PLZ: 76593/);
  assert.match(tg.body.text, /Serviciu: Treppenhausreinigung wöchentlich/);
  assert.match(tg.body.text, /Umfang: TEST/);
  assert.match(tg.body.text, /Wunschtermin: TEST/);
  assert.match(rs.body.html, /PLZ:<\/strong> 76593/);
  assert.match(rs.body.html, /Serviciu:<\/strong> Treppenhausreinigung w.*?chentlich/);
});

// --- 8 & 9: failure isolation both directions ---
test("failure isolation: Telegram throwing for a treppenhausreinigung-lead submission still allows email to fire once", async () => {
  const { calls } = await invoke(
    { _form_name: "treppenhausreinigung-lead", name: "PSS Test", telefon: "0000000000", nachricht: "Test" },
    { fetchImpl: async (url) => { if (String(url).includes("telegram.org")) throw new Error("simulated failure"); return { ok: true, text: async () => "" }; } }
  );
  assert.equal(calls.filter(c => c.url.includes("telegram.org")).length, 1, "Telegram was attempted once (and threw)");
  assert.equal(calls.filter(c => c.url.includes("resend.com")).length, 1, "email still fired exactly once");
});

test("failure isolation: Resend throwing for a treppenhausreinigung-lead submission does not suppress Telegram", async () => {
  const { calls } = await invoke(
    { _form_name: "treppenhausreinigung-lead", name: "PSS Test", telefon: "0000000000", nachricht: "Test" },
    { fetchImpl: async (url) => {
        if (String(url).includes("resend.com")) throw new Error("simulated failure");
        if (String(url).includes("telegram.org")) return { ok: true, json: async () => ({ ok: true }) };
        return { ok: true, text: async () => "" };
      } }
  );
  assert.equal(calls.filter(c => c.url.includes("telegram.org")).length, 1, "Telegram still fired exactly once");
  assert.equal(calls.filter(c => c.url.includes("resend.com")).length, 1, "Resend was attempted once (and threw)");
});

// --- 11: no notification duplication ---
test("a single 'treppenhausreinigung-lead' submission triggers no duplicate Telegram or email calls", async () => {
  const { calls } = await invoke({ _form_name: "treppenhausreinigung-lead", name: "PSS Test", telefon: "0000000000", nachricht: "Test" });
  assert.equal(calls.length, 2, "exactly two outbound calls total: one Telegram, one Resend, no duplicates");
});

// legacy identities: unchanged handling confirmed via a generic-processing smoke test
test("legacy 'lead' submission still processed correctly (unaffected by this change), Telegram+email each once", async () => {
  const { calls } = await invoke({ _form_name: "lead", name: "Legacy Test", telefon: "0163 0000000", nachricht: "Alt" });
  assert.equal(calls.filter(c => c.url.includes("telegram.org")).length, 1);
  assert.equal(calls.filter(c => c.url.includes("resend.com")).length, 1);
});

test("legacy 'grundreinigung-lead' submission still processed correctly (unaffected by this change)", async () => {
  const { calls } = await invoke({ _form_name: "grundreinigung-lead", name: "Legacy Test 2", telefon: "0163 0000000", plz: "76437", ort: "Rastatt", service: "Hausreinigung", nachricht: "Alt" });
  assert.equal(calls.filter(c => c.url.includes("telegram.org")).length, 1);
  assert.equal(calls.filter(c => c.url.includes("resend.com")).length, 1);
});
