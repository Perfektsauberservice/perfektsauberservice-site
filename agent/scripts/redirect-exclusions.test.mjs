/**
 * Local, no-network, no-write tests for agent/scripts/redirect-exclusions.mjs
 * (the pure exclusion-derivation logic that agent/scripts/update-sitemap.mjs
 * wires in). Deliberately never imports update-sitemap.mjs itself -- that
 * file still writes sitemap.xml and pings Google at module load, which a
 * test run must never trigger. Run with:
 *   node agent/scripts/redirect-exclusions.test.mjs
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deriveRedirectExclusions, parseRedirectFromStatusPairs } from './redirect-exclusions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

// ─── Synthetic fixtures (small, isolated, no real repo data) ──────────────

const SYNTHETIC_TOML = `
[[redirects]]
  from = "/foo-retired"
  to = "/foo"
  status = 301
  force = true

[[redirects]]
  from = "/foo-retired.html"
  to = "/foo"
  status = 301
  force = true

[[redirects]]
  from = "/bar-gone"
  to = "/410.html"
  status = 410
  force = true

[[redirects]]
  from = "/agent/*"
  to = "/404.html"
  status = 404
  force = true

[[edge_functions]]
  function = "strip-html"
  path = "/*"
`;

test('301 route is excluded (both the bare and .html form collapse to one)', () => {
  const exclusions = deriveRedirectExclusions(SYNTHETIC_TOML);
  assert(exclusions.has('foo-retired'), 'expected foo-retired to be excluded');
});

test('410 route is excluded', () => {
  const exclusions = deriveRedirectExclusions(SYNTHETIC_TOML);
  assert(exclusions.has('bar-gone'), 'expected bar-gone to be excluded');
});

test('an ordinary live page (no matching redirect) is never excluded', () => {
  const exclusions = deriveRedirectExclusions(SYNTHETIC_TOML);
  assert(!exclusions.has('foo'), 'destination "foo" must never itself be excluded');
  assert(!exclusions.has('entruempelung-baden-baden'), 'a page absent from the toml entirely must never be excluded');
});

test('a splat/wildcard "from" (e.g. /agent/*) is never treated as a literal page route', () => {
  const exclusions = deriveRedirectExclusions(SYNTHETIC_TOML);
  assert(!exclusions.has('agent/*'), 'wildcard entries must not leak into the exclusion set as literal routes');
  assert.strictEqual(exclusions.size, 2, 'only the two literal 301/410 routes should be excluded (404 and wildcard skipped)');
});

test('a non-301/410 status (e.g. 404 rewrite) is never excluded', () => {
  const pairs = parseRedirectFromStatusPairs(SYNTHETIC_TOML);
  const has404 = pairs.some((p) => p.status === 404);
  assert(has404, 'sanity: fixture does contain a 404 entry');
  const exclusions = deriveRedirectExclusions(SYNTHETIC_TOML);
  // the only from-value carrying status 404 in the fixture is the wildcard,
  // already covered above; assert no unrelated literal 404 leaks through.
  assert(!exclusions.has('agent'), 'a 404 status must never produce a sitemap exclusion');
});

test('deterministic: same input text always derives the same exclusion set', () => {
  const a = [...deriveRedirectExclusions(SYNTHETIC_TOML)].sort();
  const b = [...deriveRedirectExclusions(SYNTHETIC_TOML)].sort();
  assert.deepStrictEqual(a, b, 'two derivations from the same text must be byte-identical');
});

// ─── Integration-shaped tests against the REAL netlify.toml (read-only) ───

const realToml = readFileSync(join(REPO_ROOT, 'netlify.toml'), 'utf8');

test('REAL netlify.toml: all 487 [[redirects]] blocks parse (no block silently dropped)', () => {
  const pairs = parseRedirectFromStatusPairs(realToml);
  assert.strictEqual(pairs.length, 487, `expected 487 parsed redirect blocks, got ${pairs.length}`);
});

test('REAL netlify.toml: a known Tier B redirected orphan file is excluded', () => {
  const exclusions = deriveRedirectExclusions(realToml);
  assert(exclusions.has('haushaltsaufloesung-muggensturm'), 'orphan file haushaltsaufloesung-muggensturm.html must be excluded (301 at the edge, physically present on disk)');
  assert(exclusions.has('kellerentruempelung-baden-baden'), 'known Tier B retired slug must be excluded');
});

test('REAL netlify.toml: a known 410 route is excluded', () => {
  const exclusions = deriveRedirectExclusions(realToml);
  assert(exclusions.has('dachbodenentruempelung-elchesheim-illingen'), '410 route must be excluded from the sitemap');
});

test('REAL netlify.toml: known live, non-redirected pages are never excluded', () => {
  const exclusions = deriveRedirectExclusions(realToml);
  for (const livePage of ['entruempelung-baden-baden', 'index', 'leistungen', 'reinigung']) {
    assert(!exclusions.has(livePage), `${livePage} is a live canonical page and must never be excluded`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
