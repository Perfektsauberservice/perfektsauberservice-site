// Regression tests for the qualification-fields loss found after the
// 2026-09-17 production deploy: a genuine, non-headless browser submission
// on /grundreinigung was stored by Netlify Forms (submission_count
// incremented, exactly once, verified/non-spam) but the five new fields
// (plz, ort, service, umfang, wunschtermin) were NOT present in the stored
// record, despite being correctly filled in the real form.
//
// Static inspection of the live production HTML (fetched and saved during
// diagnosis) proved the client-side markup was already correct: all five
// fields sit inside the <form>, with correct name attributes, none
// disabled, and the submit handler never intercepts/rebuilds the payload
// (no preventDefault, no custom FormData) -- so the browser's native
// serialization was never in question. The fix adds netlify-forms.html: a
// hidden, statically-scannable, canonical field definition for the shared
// "lead" form, so Netlify's build-time form bot has one unambiguous,
// always-present source of the complete field list, independent of
// whether any individual page happens to be re-scanned on a given
// (possibly incremental) deploy.
//
// These tests can only prove: (a) every real page's form markup is
// structurally correct (a regression guard against this exact defect
// recurring), and (b) the new static detection file's field list is
// complete and matches what submission-created.mjs actually reads. They
// cannot prove Netlify's backend will actually pick it up -- that requires
// an actual deploy + a real, non-automated submission, which this task
// explicitly does not authorize.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const REQUIRED_QUALIFICATION_FIELDS = ["plz", "ort", "service", "umfang", "wunschtermin"];
const CORE_FIELDS = ["name", "telefon", "nachricht", "agb_widerruf_accepted"];
const ATTRIBUTION_FIELDS = [
  "lead_id", "gclid", "gbraid", "wbraid", "utm_source", "utm_medium",
  "utm_campaign", "utm_term", "utm_content", "landing_page_url", "first_seen_at",
];

function extractFormBlock(html) {
  const start = html.indexOf("<form");
  const end = html.indexOf("</form>", start) + "</form>".length;
  return html.slice(start, end);
}

function fieldIsPresentEnabledAndNamed(formHtml, fieldName) {
  // Matches name="x" or name='x' on any input/select/textarea, and confirms
  // that exact tag isn't marked disabled.
  const re = new RegExp(`<(input|select|textarea)[^>]*\\bname=["']${fieldName}["'][^>]*>`, "i");
  const m = formHtml.match(re);
  if (!m) return { present: false };
  return { present: true, disabled: /\bdisabled\b/i.test(m[0]) };
}

const QUALIFIED_PAGES = ["grundreinigung.html", "grundreinigung-baden-baden.html", "grundreinigung-rastatt.html"];

for (const pageFile of QUALIFIED_PAGES) {
  test(`${pageFile}: all five qualification fields are present, named, enabled, inside the form`, () => {
    const html = readFileSync(path.join(root, pageFile), "utf8");
    const formHtml = extractFormBlock(html);
    assert.ok(formHtml.startsWith("<form"), "a form block was found");
    for (const field of REQUIRED_QUALIFICATION_FIELDS) {
      const result = fieldIsPresentEnabledAndNamed(formHtml, field);
      assert.ok(result.present, `field "${field}" is present inside the <form> on ${pageFile}`);
      assert.equal(result.disabled, false, `field "${field}" is not disabled on ${pageFile}`);
    }
  });

  test(`${pageFile}: submit handler does not intercept native submission (no preventDefault/custom FormData)`, () => {
    const html = readFileSync(path.join(root, pageFile), "utf8");
    const handlerStart = html.indexOf("heroLeadIdHidden");
    assert.ok(handlerStart > -1, "the submit handler script is present");
    const scriptStart = html.lastIndexOf("<script>", handlerStart);
    const scriptEnd = html.indexOf("</script>", handlerStart);
    const handlerScript = html.slice(scriptStart, scriptEnd);
    assert.doesNotMatch(handlerScript, /preventDefault/, "the lead-form submit handler itself never calls preventDefault");
    assert.doesNotMatch(handlerScript, /new FormData/, "the lead-form submit handler never constructs a custom FormData that could drop fields");
  });
}

test("netlify-forms.html: static detection form declares every field the real forms use, exactly once each", () => {
  const html = readFileSync(path.join(root, "netlify-forms.html"), "utf8");
  assert.match(html, /data-netlify=["']true["']/, "detection form is marked data-netlify");
  assert.match(html, /name=["']lead["']/, "detection form uses the shared 'lead' form name");

  const allFields = [...CORE_FIELDS, ...ATTRIBUTION_FIELDS, ...REQUIRED_QUALIFICATION_FIELDS, "email", "form-name", "bot-field"];
  for (const field of allFields) {
    const re = new RegExp(`name=["']${field}["']`, "g");
    const occurrences = (html.match(re) || []).length;
    assert.equal(occurrences, 1, `field "${field}" declared exactly once in netlify-forms.html`);
  }
});

test("netlify-forms.html declares every 'lead'-form field submission-created.mjs reads (no drift)", () => {
  // The function also serves the separate "kontakt" form (Name/Email/Phone/
  // Message/city/leistung -- capitalized/legacy aliases and the "kontakt"
  // form's own field names), which is registered under its own form name
  // and is out of scope for this "lead"-form detection file. Only the
  // fields actually used by "lead"-form pages belong here.
  const NOT_LEAD_FORM_ALIASES = new Set(["Name", "Email", "Phone", "phone", "Message", "message", "Nachricht", "city", "leistung"]);

  const fnSrc = readFileSync(path.join(root, "netlify/functions/submission-created.mjs"), "utf8");
  const detectHtml = readFileSync(path.join(root, "netlify-forms.html"), "utf8");

  const readFieldNames = [...fnSrc.matchAll(/data\.data\?\.(\w+)/g)].map(m => m[1]);
  const leadFormFields = [...new Set(readFieldNames)].filter(f => !NOT_LEAD_FORM_ALIASES.has(f));
  assert.ok(leadFormFields.length > 0, "sanity: found lead-form field reads in the function source");

  for (const field of leadFormFields) {
    assert.match(
      detectHtml,
      new RegExp(`name=["']${field}["']`),
      `submission-created.mjs reads "${field}" for the lead form -- it must also be declared in netlify-forms.html`
    );
  }
});
