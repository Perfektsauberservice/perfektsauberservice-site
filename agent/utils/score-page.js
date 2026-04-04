function addIssue(issues, condition, message) {
  if (condition) issues.push(message);
}

function addRecommendation(recommendations, condition, message) {
  if (condition) recommendations.push(message);
}

function scorePage(page = {}, comparison = {}, rules = {}) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const title = page.title || "";
  const meta = page.meta || "";
  const h1 = page.h1 || "";
  const wordCount = Number(page.wordCount || 0);
  const imagesCount = Number(page.imagesCount || 0);
  const missingAltCount = Number(page.missingAltCount || 0);
  const hasCanonical = Boolean(page.hasCanonical);
  const hasCTA = Boolean(page.hasCTA);
  const hasBrand = Boolean(page.hasBrand);
  const hasLocalKeyword = Boolean(page.hasLocalKeyword);
  const similarityTop = Number(comparison.similarityTop || 0);
  const duplicateRisk = comparison.duplicateRisk || "low";

  const titleMin = Number(rules.titleMin || 35);
  const titleMax = Number(rules.titleMax || 65);
  const metaMin = Number(rules.metaMin || 70);
  const metaMax = Number(rules.metaMax || 160);
  const minWordCount = Number(rules.minWordCount || 350);

  if (!title) {
    score -= 15;
    issues.push("Missing title");
    recommendations.push("Add a clear SEO title");
  } else {
    if (title.length < titleMin) {
      score -= 6;
      issues.push(`Title too short (${title.length})`);
      recommendations.push("Expand the title with service + city + brand");
    }
    if (title.length > titleMax) {
      score -= 6;
      issues.push(`Title too long (${title.length})`);
      recommendations.push("Shorten the title to improve SERP display");
    }
  }

  if (!meta) {
    score -= 10;
    issues.push("Missing meta description");
    recommendations.push("Add a meta description with local intent and CTA");
  } else {
    if (meta.length < metaMin) {
      score -= 5;
      issues.push(`Meta description too short (${meta.length})`);
      recommendations.push("Expand the meta description with useful local detail");
    }
    if (meta.length > metaMax) {
      score -= 5;
      issues.push(`Meta description too long (${meta.length})`);
      recommendations.push("Shorten the meta description for better display");
    }
  }

  if (!h1) {
    score -= 15;
    issues.push("Missing H1");
    recommendations.push("Add one clear H1 focused on the service and location");
  }

  if (!hasCanonical) {
    score -= 10;
    issues.push("Missing canonical");
    recommendations.push("Add a canonical URL");
  }

  if (wordCount < minWordCount) {
    score -= 15;
    issues.push(`Thin content (${wordCount} words)`);
    recommendations.push("Expand the page with unique local content");
  }

  if (!hasCTA) {
    score -= 10;
    issues.push("Missing CTA");
    recommendations.push("Add a visible call to action");
  }

  if (!hasBrand) {
    score -= 5;
    issues.push("Brand missing or too weak");
    recommendations.push("Mention Perfekt Sauber Service more clearly");
  }

  if (!hasLocalKeyword) {
    score -= 10;
    issues.push("Local keyword missing");
    recommendations.push("Add stronger city or area relevance");
  }

  if (imagesCount > 0 && missingAltCount > 0) {
    score -= Math.min(10, missingAltCount * 2);
    issues.push(`${missingAltCount} image(s) missing alt text`);
    recommendations.push("Add descriptive alt text to all important images");
  }

  if (imagesCount === 0) {
    score -= 4;
    issues.push("No images found in main content");
    recommendations.push("Consider adding relevant local/service imagery");
  }

  if (duplicateRisk === "medium") {
    score -= 12;
    issues.push(`Near-duplicate risk (${similarityTop})`);
    recommendations.push("Differentiate this page from similar local pages");
  }

  if (duplicateRisk === "high") {
    score -= 20;
    issues.push(`High duplicate risk (${similarityTop})`);
    recommendations.push("Rewrite major sections to make this page meaningfully unique");
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  let risk = "low";
  if (score <= Number(rules.riskLevels?.highScoreMax ?? 49)) {
    risk = "high";
  } else if (score <= Number(rules.riskLevels?.mediumScoreMax ?? 74)) {
    risk = "medium";
  }

  addIssue(issues, !page.h2Count, "No H2 headings found");
  addRecommendation(
    recommendations,
    !page.h2Count,
    "Add structured H2 sections for readability and topical coverage"
  );

  return {
    score,
    risk,
    issues: [...new Set(issues)],
    recommendations: [...new Set(recommendations)],
    similarityTop,
    duplicateRisk,
    closestMatches: comparison.closestMatches || []
  };
}

module.exports = {
  scorePage
};
