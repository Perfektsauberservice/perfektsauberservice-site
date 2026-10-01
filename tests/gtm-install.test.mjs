import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { installGtm, GTM_ID } from "../agent/scripts/install-gtm.mjs";

const root = new URL("../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");
const SKIP = new Set(["node_modules", "agent", ".git", ".claude", ".netlify", "tests", "dashboard", "outreach"]);
const rootDir = fileURLToPath(root);
const walk = (d) => readdirSync(d).flatMap((e) => SKIP.has(e) ? [] :
  statSync(join(d, e)).isDirectory() ? walk(join(d, e)) : e.endsWith(".html") ? [relative(rootDir, join(d, e)).split("\\").join("/")] : []);
const pages = walk(rootDir).filter((f) => read(f).includes("window.psLoadGA = function"));

test("GTM: every consent-mode page loads GTM-P26S4QMN exactly once", () => {
  assert.ok(pages.length >= 344, `expected the full public page set, got ${pages.length}`);
  for (const p of pages) {
    const html = read(p);
    assert.equal(html.split(`'dataLayer','${GTM_ID}'`).length - 1, 1, `${p}: loader count`);
    assert.equal(html.split(`ns.html?id=${GTM_ID}`).length - 1, 1, `${p}: noscript count`);
  }
});

test("GTM: loader runs AFTER the denied Consent Mode defaults (so tags inherit consent)", () => {
  for (const p of pages) {
    const html = read(p);
    const consent = html.indexOf("gtag('consent', 'default'");
    const gtm = html.indexOf(`'dataLayer','${GTM_ID}'`);
    const grant = html.indexOf("window.psGrantConsent = function");
    assert.ok(consent > -1 && gtm > consent, `${p}: GTM must come after consent default`);
    assert.ok(grant > gtm, `${p}: consent update helper still defined after GTM`);
  }
});

test("GTM: existing gtag GA4 + Google Ads config untouched", () => {
  const html = read("index.html");
  assert.ok(html.includes("gtag('config', 'G-BMC32KSYKF'"));
  assert.ok(html.includes("gtag('config', 'AW-18036757035')"));
});

test("GTM: installer is idempotent and skips pages without a consent block", () => {
  const once = read("index.html");
  assert.equal(installGtm(once), once);
  const plain = "<html><body><p>x</p></body></html>";
  assert.equal(installGtm(plain), plain);
});

test("GTM: CSP allows the GTM script, beacons and noscript iframe", () => {
  const toml = read("netlify.toml");
  const directive = (name) => (toml.match(new RegExp(`${name} [^;]*`)) || [""])[0];
  assert.match(directive("script-src"), /https:\/\/\*\.googletagmanager\.com/);
  assert.match(directive("connect-src"), /https:\/\/\*\.googletagmanager\.com/);
  assert.match(directive("frame-src"), /https:\/\/www\.googletagmanager\.com/);
});
