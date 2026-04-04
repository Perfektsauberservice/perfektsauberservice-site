function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text = "") {
  return normalizeText(text)
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);
}

function buildFrequencyMap(tokens = []) {
  const map = new Map();
  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
  return map;
}

function cosineSimilarityFromMaps(mapA, mapB) {
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const key of allKeys) {
    const a = mapA.get(key) || 0;
    const b = mapB.get(key) || 0;

    dotProduct += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function calculateTextSimilarity(textA = "", textB = "") {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (!tokensA.length || !tokensB.length) return 0;

  const mapA = buildFrequencyMap(tokensA);
  const mapB = buildFrequencyMap(tokensB);

  return cosineSimilarityFromMaps(mapA, mapB);
}

function getRiskFromSimilarity(similarity, rules = {}) {
  const nearDuplicateThreshold = Number(rules.nearDuplicateThreshold || 0.72);
  const highDuplicateThreshold = Number(rules.highDuplicateThreshold || 0.85);

  if (similarity >= highDuplicateThreshold) return "high";
  if (similarity >= nearDuplicateThreshold) return "medium";
  return "low";
}

function comparePages(pages = [], rules = {}) {
  const results = [];
  const pairwise = [];

  for (let i = 0; i < pages.length; i += 1) {
    const sourcePage = pages[i];
    const matches = [];

    for (let j = 0; j < pages.length; j += 1) {
      if (i === j) continue;

      const targetPage = pages[j];
      const similarity = calculateTextSimilarity(
        sourcePage.mainText || "",
        targetPage.mainText || ""
      );

      const roundedSimilarity = Number(similarity.toFixed(4));

      matches.push({
        url: targetPage.url,
        filePath: targetPage.filePath || "",
        similarity: roundedSimilarity,
        risk: getRiskFromSimilarity(roundedSimilarity, rules)
      });

      if (j > i) {
        pairwise.push({
          pageA: sourcePage.url,
          pageB: targetPage.url,
          similarity: roundedSimilarity,
          risk: getRiskFromSimilarity(roundedSimilarity, rules)
        });
      }
    }

    matches.sort((a, b) => b.similarity - a.similarity);

    const topSimilarity = matches.length ? matches[0].similarity : 0;
    const topRisk = getRiskFromSimilarity(topSimilarity, rules);

    results.push({
      url: sourcePage.url,
      filePath: sourcePage.filePath || "",
      similarityTop: topSimilarity,
      duplicateRisk: topRisk,
      closestMatches: matches.slice(0, 5)
    });
  }

  return {
    comparedAt: new Date().toISOString(),
    results,
    pairwise
  };
}

module.exports = {
  normalizeText,
  tokenize,
  calculateTextSimilarity,
  comparePages
};
