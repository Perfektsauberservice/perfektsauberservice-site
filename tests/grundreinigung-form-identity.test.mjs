// Regression tests for the distinct "grundreinigung-lead" form identity
// (2026-09-17), created after the shared-"lead" static-schema hotfix failed:
// a genuine headed-browser POST proved plz/ort/service/umfang/wunschtermin
// reached Netlify correctly, but Netlify's own backend silently dropped
// those five fields from the stored record for the shared "lead" form. The
// fix gives the three Grundreinigung pages their own form identity instead.
//
// These tests can prove: the three pages consistently use the new identity,
// the outer <form name> and hidden form-name input agree, every legacy
// field the browser would natively submit is present/named/enabled, the
// five qualification fields are present, the legacy "lead" pages are
// untouched, and submission-created.mjs (unmodified, confirmed generic)
// still processes both identities correctly with isolated Telegram/email
// error handling. They cannot prove Netlify's backend will register and
// store the new identity's fields correctly -- that requires an actual
// deploy and one real submission, covered by a separate live-verification
// task.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const GRUNDREINIGUNG_PAGES = ["grundreinigung.html", "grundreinigung-baden-baden.html", "grundreinigung-rastatt.html"];
const LEGACY_LEAD_PAGES = ["entruempelung-rastatt.html"];
const NEW_FORM_NAME = "grundreinigung-lead";

const QUALIFICATION_FIELDS = ["plz", "ort", "service", "umfang", "wunschtermin"];
const LEGACY_FIELDS = ["name", "telefon", "nachricht", "agb_widerruf_accepted", "email"];
const ATTRIBUTION_FIELDS = [
  "lead_id", "gclid", "gbraid", "wbraid", "utm_source", "utm_medium",
  "utm_campaign", "utm_term", "utm_content", "landing_page_url", "first_seen_at",
];

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

// --- 1 & 2: form identity + outer/hidden agreement ---
for (const pageFile of GRUNDREINIGUNG_PAGES) {
  test(`${pageFile}: outer <form name> is "${NEW_FORM_NAME}"`, () => {
    const html = readFileSync(path.join(root, pageFile), "utf8");
    const formHtml = extractFormBlock(html);
    assert.match(formHtml, new RegExp(`<form[^>]*\\bname=["']${NEW_FORM_NAME}["']`), "outer form name matches the new identity");
  });

  test(`${pageFile}: hidden form-name value matches the outer form name exactly`, () => {
    const html = readFileSync(path.join(root, pageFile), "utf8");
    const formHtml = extractFormBlock(html);
    const outerMatch = formHtml.match(/<form[^>]*\bname=["']([^"']+)["']/);
    const hiddenMatch = formHtml.match(/name=["']form-name["']\s+value=["']([^"']+)["']/);
    assert.ok(outerMatch && hiddenMatch, "both the outer name and hidden form-name input were found");
    assert.equal(hiddenMatch[1], outerMatch[1], "hidden form-name value equals the outer <form name>");
    assert.equal(outerMatch[1], NEW_FORM_NAME);
  });

  // --- 3: five qualification fields present/named/enabled ---
  test(`${pageFile}: all five qualification fields present, named, enabled`, () => {
    const html = readFileSync(path.join(root, pageFile), "utf8");
    const formHtml = extractFormBlock(html);
    for (const field of QUALIFICATION_FIELDS) {
      const r = fieldPresentAndEnabled(formHtml, field);
      assert.ok(r.present, `"${field}" present in ${pageFile}`);
      assert.equal(r.disabled, false, `"${field}" not disabled in ${pageFile}`);
    }
  });

  // --- 4: everything a native submission would send is present ---
  test(`${pageFile}: native submission would include every legacy, attribution, consent, and qualification field`, () => {
    const html = readFileSync(path.join(root, pageFile), "utf8");
    const formHtml = extractFormBlock(html);
    for (const field of [...LEGACY_FIELDS, ...ATTRIBUTION_FIELDS, ...QUALIFICATION_FIELDS, "form-name"]) {
      const r = fieldPresentAndEnabled(formHtml, field);
      assert.ok(r.present, `"${field}" present in ${pageFile} (would be included in native POST)`);
      assert.equal(r.disabled, false, `"${field}" not disabled in ${pageFile}`);
    }
    // netlify data-netlify + honeypot config unchanged
    assert.match(formHtml, /data-netlify=["']true["']/);
    assert.match(formHtml, /data-netlify-honeypot=["']bot-field["']/);
    // Danke redirect unchanged
    assert.match(formHtml, /action=["']\/danke["']/);
    // submit handler still targets the form by class, unaffected by the name change
    assert.match(html, /document\.querySelector\(['"]form\.hero-form['"]\)/);
  });
}

// --- 5: legacy "lead" pages untouched ---
for (const pageFile of LEGACY_LEAD_PAGES) {
  test(`${pageFile}: legacy form identity remains "lead" (unchanged)`, () => {
    const html = readFileSync(path.join(root, pageFile), "utf8");
    const formHtml = extractFormBlock(html);
    assert.match(formHtml, /<form[^>]*\bname=["']lead["']/, "legacy form still named 'lead'");
    assert.doesNotMatch(formHtml, new RegExp(NEW_FORM_NAME), `${pageFile} was not touched by the Grundreinigung identity change`);
  });
}

// --- 6 & 7: submission-created.mjs handles both identities (it's generic; confirm that fact directly) ---
test("submission-created.mjs never branches on form identity -- it is already generic", () => {
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

test("legacy 'lead' submission: processed correctly, Telegram+email each once", async () => {
  const { calls } = await invoke({ _form_name: "lead", name: "Legacy Test", telefon: "0163 0000000", nachricht: "Alt" });
  assert.equal(calls.filter(c => c.url.includes("telegram.org")).length, 1);
  assert.equal(calls.filter(c => c.url.includes("resend.com")).length, 1);
});

test("'grundreinigung-lead' submission: processed correctly with all five qualification fields, Telegram+email each once", async () => {
  const { calls } = await invoke({
    _form_name: "grundreinigung-lead", name: "PSS Test", telefon: "0000000000",
    plz: "76593", ort: "Gernsbach", service: "Sonstige Grundreinigung",
    umfang: "TEST", wunschtermin: "TEST", nachricht: "Test",
  });
  const tg = calls.find(c => c.url.includes("telegram.org"));
  const rs = calls.find(c => c.url.includes("resend.com"));
  assert.equal(calls.filter(c => c.url.includes("telegram.org")).length, 1, "Telegram exactly once");
  assert.equal(calls.filter(c => c.url.includes("resend.com")).length, 1, "Resend exactly once");
  assert.match(tg.body.text, /PLZ: 76593/);
  assert.match(tg.body.text, /Umfang: TEST/);
  assert.match(rs.body.html, /PLZ:<\/strong> 76593/);
});

// --- 9: failure isolation still valid for both identities ---
test("failure isolation: Telegram throwing for a grundreinigung-lead submission still allows email to fire once", async () => {
  const { calls } = await invoke(
    { _form_name: "grundreinigung-lead", name: "PSS Test", telefon: "0000000000", nachricht: "Test" },
    { fetchImpl: async (url) => { if (String(url).includes("telegram.org")) throw new Error("simulated failure"); return { ok: true, text: async () => "" }; } }
  );
  assert.equal(calls.filter(c => c.url.includes("telegram.org")).length, 1, "Telegram was attempted once (and threw)");
  assert.equal(calls.filter(c => c.url.includes("resend.com")).length, 1, "email still fired exactly once");
});

// --- 10: Danke/GA4/Ads tracking script tail is unchanged on the Grundreinigung pages ---
for (const pageFile of GRUNDREINIGUNG_PAGES) {
  test(`${pageFile}: GA4/Ads tracking script and consent tail are unchanged`, () => {
    const html = readFileSync(path.join(root, pageFile), "utf8");
    assert.match(html, /gtag\('config', 'G-BMC32KSYKF'/);
    assert.match(html, /gtag\('config', 'AW-18036757035'\)/);
    assert.match(html, /window\.psLoadGA\(\);/);
  });
}
