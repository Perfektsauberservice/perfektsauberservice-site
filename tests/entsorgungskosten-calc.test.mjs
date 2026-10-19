// Deterministic tests for the Entsorgungskosten-Rechner cost calculator.
// Covers: minimum input, typical input, large input, invalid input, plus
// every pricing mode in data/entsorgungsgebuehren-2026.json so the fee
// table and the calc engine are proven to agree line by line.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { calculateLineItem, calculateTotal, findCategory } from "../assets/js/entsorgungskosten-calc.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const feeTable = JSON.parse(readFileSync(path.join(root, "data/entsorgungsgebuehren-2026.json"), "utf8"));

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

// --- fee table sanity (fails loud if the JSON source-of-truth drifts) ---

check("fee table has all 12 approved categories (Sperrmüllsammlung's 3 volume tiers count as one category)", () => {
  assert.equal(feeTable.categories.length, 12);
});

// --- flat_by_volume_tier: Sperrmüllsammlung ---

check("Sperrmüllsammlung 0.5m³ x1 = 18€ (minimum input)", () => {
  const cat = findCategory(feeTable, "sperrmuellsammlung");
  const { cost } = calculateLineItem(cat, { tierId: "0.5m3", count: 1 });
  assert.equal(cost, 18);
});

check("Sperrmüllsammlung 2m³ x3 = 135€ (large input, multiple pickups)", () => {
  const cat = findCategory(feeTable, "sperrmuellsammlung");
  const { cost } = calculateLineItem(cat, { tierId: "2m3", count: 3 });
  assert.equal(cost, 135);
});

check("Sperrmüllsammlung unknown tier throws (invalid input)", () => {
  const cat = findCategory(feeTable, "sperrmuellsammlung");
  assert.throws(() => calculateLineItem(cat, { tierId: "5m3", count: 1 }));
});

// --- weight_threshold: Sperrmüll Einzelanlieferung ---

check("Sperrmüll Einzelanlieferung below threshold (150kg) = 45€ flat", () => {
  const cat = findCategory(feeTable, "sperrmuell_einzelanlieferung");
  const { cost } = calculateLineItem(cat, { weightKg: 150 });
  assert.equal(cost, 45);
});

check("Sperrmüll Einzelanlieferung at exact threshold (200kg) = 52€ (rate applies)", () => {
  const cat = findCategory(feeTable, "sperrmuell_einzelanlieferung");
  const { cost } = calculateLineItem(cat, { weightKg: 200 });
  assert.equal(cost, 52); // 0.2t * 260€/t
});

check("Sperrmüll Einzelanlieferung large load (1200kg) = 312€ (typical large job)", () => {
  const cat = findCategory(feeTable, "sperrmuell_einzelanlieferung");
  const { cost } = calculateLineItem(cat, { weightKg: 1200 });
  assert.equal(cost, 312); // 1.2t * 260€/t
});

check("Sperrmüll Einzelanlieferung negative weight throws (invalid input)", () => {
  const cat = findCategory(feeTable, "sperrmuell_einzelanlieferung");
  assert.throws(() => calculateLineItem(cat, { weightKg: -10 }));
});

// --- weight_threshold_with_small_flat: Altholz A I-II ---

check("Altholz A I-II small volume flat = 10€", () => {
  const cat = findCategory(feeTable, "altholz_a1_a2");
  const { cost } = calculateLineItem(cat, { smallVolume: true });
  assert.equal(cost, 10);
});

check("Altholz A I-II below weight threshold (100kg) = 16€", () => {
  const cat = findCategory(feeTable, "altholz_a1_a2");
  const { cost } = calculateLineItem(cat, { weightKg: 100 });
  assert.equal(cost, 16);
});

check("Altholz A I-II above weight threshold (500kg) = 42.5€", () => {
  const cat = findCategory(feeTable, "altholz_a1_a2");
  const { cost } = calculateLineItem(cat, { weightKg: 500 });
  assert.equal(cost, 42.5); // 0.5t * 85€/t
});

// --- weight_threshold_with_small_flat: Bauabfallgemische ---

check("Bauabfallgemische Kleinmenge PKW flat = 18€ (typical Besichtigung case)", () => {
  const cat = findCategory(feeTable, "bauabfallgemische");
  const { cost } = calculateLineItem(cat, { smallVolume: true });
  assert.equal(cost, 18);
});

// --- free categories ---

for (const id of ["metallschrott", "elektro_altgeraete", "altpapier"]) {
  check(`${id} is always gebührenfrei (0€) regardless of quantity`, () => {
    const cat = findCategory(feeTable, id);
    const { cost } = calculateLineItem(cat, {});
    assert.equal(cost, 0);
  });
}

// --- per_piece_capped: PKW-Reifen ---

check("PKW-Reifen x1 = 5€ (minimum input)", () => {
  const cat = findCategory(feeTable, "pkw_reifen");
  const { cost, warning } = calculateLineItem(cat, { quantity: 1 });
  assert.equal(cost, 5);
  assert.equal(warning, undefined);
});

check("PKW-Reifen x10 = 50€, no warning at exact cap", () => {
  const cat = findCategory(feeTable, "pkw_reifen");
  const { cost, warning } = calculateLineItem(cat, { quantity: 10 });
  assert.equal(cost, 50);
  assert.equal(warning, undefined);
});

check("PKW-Reifen x15 (large/over-cap input) bills only 10, returns warning", () => {
  const cat = findCategory(feeTable, "pkw_reifen");
  const { cost, warning } = calculateLineItem(cat, { quantity: 15 });
  assert.equal(cost, 50);
  assert.ok(warning && warning.length > 0);
});

check("PKW-Reifen quantity 0 throws (invalid input)", () => {
  const cat = findCategory(feeTable, "pkw_reifen");
  assert.throws(() => calculateLineItem(cat, { quantity: 0 }));
});

check("PKW-Reifen non-integer quantity throws (invalid input)", () => {
  const cat = findCategory(feeTable, "pkw_reifen");
  assert.throws(() => calculateLineItem(cat, { quantity: 2.5 }));
});

// --- per_piece: Matratzen (unofficial tariff, still must compute correctly) ---

check("Matratzen x2 = 50€", () => {
  const cat = findCategory(feeTable, "matratzen");
  const { cost } = calculateLineItem(cat, { quantity: 2 });
  assert.equal(cost, 50);
  assert.equal(cat.official, false, "Matratzen must stay flagged as unofficial in the data source");
});

// --- calculateTotal: a realistic mixed Besichtigung job ---

check("calculateTotal sums a mixed typical job correctly with labels preserved", () => {
  const sperrmuell = findCategory(feeTable, "sperrmuellsammlung");
  const reifen = findCategory(feeTable, "pkw_reifen");
  const metall = findCategory(feeTable, "metallschrott");
  const { total, lines } = calculateTotal([
    { category: sperrmuell, input: { tierId: "1m3", count: 1 } }, // 30
    { category: reifen, input: { quantity: 4 } }, // 20
    { category: metall, input: {} }, // 0
  ]);
  assert.equal(total, 50);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].label, "Sperrmüllsammlung");
});

check("calculateTotal on empty job = 0€ (no material found)", () => {
  const { total, lines } = calculateTotal([]);
  assert.equal(total, 0);
  assert.deepEqual(lines, []);
});

check("calculateTotal rejects non-array input (invalid input)", () => {
  assert.throws(() => calculateTotal({ not: "an array" }));
});

check("findCategory throws for unknown id (invalid input)", () => {
  assert.throws(() => findCategory(feeTable, "does-not-exist"));
});

console.log(`\n${passCount}/${passCount + failCount} passed`);
if (failCount > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
