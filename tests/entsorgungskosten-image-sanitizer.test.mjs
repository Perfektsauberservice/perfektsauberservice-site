// Tests for the browser-independent (pure) logic in
// assets/js/entsorgungskosten-image-sanitizer.mjs: format gating and the
// dimension-scaling math. The actual sanitizeImage() decode/canvas/
// re-encode pipeline needs real browser Canvas APIs (createImageBitmap,
// canvas.toBlob) that don't exist under plain Node and aren't polyfilled
// here (no new dependency added to this repo for it) -- that behavioral
// proof (EXIF/GPS stripped, sanitized image still decodable, HEIC
// rejected, sanitization failure never forwards the original) was
// verified live via Playwright this session and is documented in
// LAURA_REVIEW_REPORT.md rather than committed as a repo test, since this
// repo has no browser-test-runner dependency.

import assert from "node:assert/strict";
import {
  isHeicLike,
  isAcceptedType,
  computeScaledDimensions,
  MAX_DIMENSION,
  ACCEPTED_MEDIA_TYPES,
} from "../assets/js/entsorgungskosten-image-sanitizer.mjs";

let passCount = 0;
let failCount = 0;
const failures = [];

function check(label, fn) {
  try {
    fn();
    passCount++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failCount++;
    failures.push({ label, error: err.message });
    console.log(`FAIL  ${label}\n      ${err.message}`);
  }
}

// --- format gating ---

check("HEIC by MIME type is detected", () => {
  assert.ok(isHeicLike({ type: "image/heic", name: "photo.heic" }));
});

check("HEIF by MIME type is detected", () => {
  assert.ok(isHeicLike({ type: "image/heif", name: "photo.heif" }));
});

check("HEIC by file extension alone (missing/wrong MIME) is still detected", () => {
  assert.ok(isHeicLike({ type: "", name: "IMG_1234.HEIC" }));
});

check("JPEG is not flagged as HEIC-like", () => {
  assert.ok(!isHeicLike({ type: "image/jpeg", name: "photo.jpg" }));
});

check("JPEG/PNG/WEBP are accepted types", () => {
  assert.ok(isAcceptedType({ type: "image/jpeg" }));
  assert.ok(isAcceptedType({ type: "image/png" }));
  assert.ok(isAcceptedType({ type: "image/webp" }));
});

check("GIF (unsupported format) is rejected", () => {
  assert.ok(!isAcceptedType({ type: "image/gif" }));
});

check("HEIC (unsupported format) is rejected by isAcceptedType too, not silently allowed through", () => {
  assert.ok(!isAcceptedType({ type: "image/heic" }));
});

check("ACCEPTED_MEDIA_TYPES matches the Function's own allow-list (kept in sync)", () => {
  assert.deepEqual([...ACCEPTED_MEDIA_TYPES].sort(), ["image/jpeg", "image/png", "image/webp"]);
});

// --- dimension scaling ---

check("image already under MAX_DIMENSION is left unscaled", () => {
  const { width, height } = computeScaledDimensions(800, 600);
  assert.equal(width, 800);
  assert.equal(height, 600);
});

check("image over MAX_DIMENSION on the long side is scaled down, aspect ratio preserved", () => {
  const { width, height } = computeScaledDimensions(4000, 3000);
  assert.equal(width, MAX_DIMENSION);
  assert.equal(height, 1200); // 3000 * (1600/4000)
});

check("portrait image over MAX_DIMENSION scales by height instead", () => {
  const { width, height } = computeScaledDimensions(3000, 4000);
  assert.equal(height, MAX_DIMENSION);
  assert.equal(width, 1200);
});

check("degenerate 0-height input never produces a 0-dimension canvas (min 1px)", () => {
  const { width, height } = computeScaledDimensions(4000, 0);
  assert.ok(width >= 1 && height >= 1);
});

console.log(`\n${passCount}/${passCount + failCount} passed`);
if (failCount > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
