// Entsorgungskosten-Rechner — deterministic cost calculation.
//
// This module is the ONLY place that turns a confirmed material category +
// quantity into a EUR cost. Per the approved design spec
// (docs/superpowers/specs/2026-08-14-entsorgungskosten-rechner-design.md):
// the AI never calculates price — it only proposes a category/quantity
// guess that Laura must review and confirm first. Everything here is pure,
// synchronous, and has no dependency on the AI call, so it can run
// identically in the browser and under `node --test`/plain assertions.

/**
 * @param {object} category  one entry from data/entsorgungsgebuehren-2026.json
 * @param {object} input     shape depends on category.mode, see below
 * @returns {{ cost: number, warning?: string }}
 */
export function calculateLineItem(category, input) {
  if (!category || typeof category !== "object") {
    throw new Error("calculateLineItem: category is required");
  }
  switch (category.mode) {
    case "free": {
      return { cost: 0 };
    }

    case "flat_by_volume_tier": {
      const { tierId, count = 1 } = input || {};
      assertPositiveInteger(count, "count");
      const tier = (category.tiers || []).find((t) => t.id === tierId);
      if (!tier) {
        throw new Error(
          `calculateLineItem: unknown tier "${tierId}" for category "${category.id}"`
        );
      }
      return { cost: round2(tier.flatPrice * count) };
    }

    case "per_piece": {
      const { quantity } = input || {};
      assertPositiveInteger(quantity, "quantity");
      return { cost: round2(category.pricePerPiece * quantity) };
    }

    case "per_piece_capped": {
      const { quantity } = input || {};
      assertPositiveInteger(quantity, "quantity");
      const billedQty = Math.min(quantity, category.maxPieces);
      const result = { cost: round2(category.pricePerPiece * billedQty) };
      if (quantity > category.maxPieces) {
        result.warning = `Peste limita de ${category.maxPieces} bucăți/livrare — verifică la Wertstoffhof dacă e nevoie de mai multe drumuri.`;
      }
      return result;
    }

    case "weight_threshold": {
      const { weightKg } = input || {};
      assertNonNegativeNumber(weightKg, "weightKg");
      return { cost: weightThresholdCost(category, weightKg) };
    }

    case "weight_threshold_with_small_flat": {
      const { smallVolume, weightKg } = input || {};
      if (smallVolume) {
        return { cost: round2(category.smallVolumeFlat) };
      }
      assertNonNegativeNumber(weightKg, "weightKg");
      return { cost: weightThresholdCost(category, weightKg) };
    }

    default:
      throw new Error(
        `calculateLineItem: unknown pricing mode "${category.mode}" for category "${category.id}"`
      );
  }
}

function weightThresholdCost(category, weightKg) {
  if (weightKg >= category.thresholdKg) {
    return round2((weightKg / 1000) * category.atOrAboveThresholdRatePerTon);
  }
  return round2(category.belowThresholdFlat);
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`calculateLineItem: ${name} must be a positive integer, got ${JSON.stringify(value)}`);
  }
}

function assertNonNegativeNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`calculateLineItem: ${name} must be a non-negative number, got ${JSON.stringify(value)}`);
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {Array<{ category: object, input: object, label?: string }>} lines
 * @returns {{ total: number, lines: Array<{ label: string, cost: number, warning?: string }> }}
 */
export function calculateTotal(lines) {
  if (!Array.isArray(lines)) {
    throw new Error("calculateTotal: lines must be an array");
  }
  const computed = lines.map((line) => {
    const { cost, warning } = calculateLineItem(line.category, line.input);
    return {
      label: line.label || line.category.label,
      categoryId: line.category.id,
      cost,
      ...(warning ? { warning } : {}),
    };
  });
  const total = round2(computed.reduce((sum, l) => sum + l.cost, 0));
  return { total, lines: computed };
}

export function findCategory(feeTable, categoryId) {
  const category = (feeTable.categories || []).find((c) => c.id === categoryId);
  if (!category) {
    throw new Error(`findCategory: unknown category "${categoryId}"`);
  }
  return category;
}
