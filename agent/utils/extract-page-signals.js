const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

function normalizeWhitespace(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function normalizeForSearch(text = "") {
  return normalizeWhitespace(text).toLowerCase();
}

function getTextSafe($el) {
  if (!$el || !$el.length) return "";
  return normalizeWhitespace($el.text());
}

function firstNonEmpty(arr = []) {
  for (const item of arr) {
    if (item && String(item).trim()) return String(item).trim();
  }
  return "";
}

function stripIgnoredNodes($, rules) {
  const ignoreSelectors = Array.isArray(rules.ignoreSelectors) ? rules.ignoreSelectors : [];
  for (const selector of ignoreSelectors) {
    $(selector).remove();
  }
}

function findMainContentNode($, rules) {
  const selectors = Array.isArray(rules.mainContentSelectors) ? rules.mainContentSelectors : [];

  for (const selector of selectors) {
    const $node = $(selector).first();
    if ($node.length) return $node;
  }

  return $("body");
}

function extractHeadings($scope, tagName) {
  const values = [];
  $scope.find(tagName).each((_, el) => {
    const text = normalizeWhitespace($scope.constructor(el).text());
    if (text) values.push(text);
  });
  return values;
}

function countWords(text = "") {
  if (!text) return 0;
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean).length;
}

function hasAnyTerm(text, terms = []) {
  const haystack = normalizeForSearch(text);
  return terms.some((term) => haystack.includes(normalizeForSearch(term)));
}

function detectLocalTerms(text, localTerms = []) {
  const haystack = normalizeForSearch(text);
  return localTerms.filter((term) => haystack.includes(normalizeForSearch(term)));
}

function extractImages($scope) {
  const images = [];
  $scope.find("img").each((_, el) => {
    const $img = $scope.constructor(el);
    const src = $img.attr("src") || "";
    const alt = normalizeWhitespace($img.attr("alt") || "");
    if (src) {
      images.push({
        src,
        alt
      });
    }
  });
  return images;
}

function extractCtas($, rules) {
  const selectors = Array.isArray(rules.ctaSelectors) ? rules.ctaSelectors : ["a", "button"];
  const ctaTerms = Array.isArray(rules.ctaTerms) ? rules.ctaTerms : [];
  const found = [];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const text = normalizeWhitespace($el.text() || "");
      if (!text) return;

      const isMatch = ctaTerms.some((term) =>
        normalizeForSearch(text).includes(normalizeForSearch(term))
      );

      if (isMatch) {
        found.push({
          selector,
          text
        });
      }
    });
  }

  return found;
}

function getCanonical($) {
  return normalizeWhitespace($('link[rel="canonical"]').attr("href") || "");
}

function getMetaDescription($) {
  return firstNonEmpty([
    $('meta[name="description"]').attr("content"),
    $('meta[property="og:description"]').attr("content")
  ]);
}

function getTitle($) {
  return firstNonEmpty([
    $("title").first().text(),
    $('meta[property="og:title"]').attr("content")
  ]);
}

function readHtmlFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractPageSignalsFromHtml({
  html,
  url = "",
  filePath = "",
  rules = {}
}) {
  const $ = cheerio.load(html);

  stripIgnoredNodes($, rules);

  const title = getTitle($);
  const metaDescription = getMetaDescription($);
  const canonical = getCanonical($);

  const h1 = normalizeWhitespace($("h1").first().text() || "");
  const h2s = [];
  $("h2").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text) h2s.push(text);
  });

  const $main = findMainContentNode($, rules);

  const mainText = normalizeWhitespace($main.text() || "");
  const wordCount = countWords(mainText);

  const images = extractImages($main);
  const missingAltCount = images.filter((img) => !img.alt).length;

  const foundCtas = extractCtas($, rules);
  const hasCTA = foundCtas.length > 0;

  const brandTerms = Array.isArray(rules.brandTerms) ? rules.brandTerms : [];
  const localTerms = Array.isArray(rules.localTerms) ? rules.localTerms : [];

  const combinedTextForChecks = [
    title,
    metaDescription,
    h1,
    h2s.join(" "),
    mainText
  ].join(" ");

  const hasBrand = hasAnyTerm(combinedTextForChecks, brandTerms);
  const matchedLocalTerms = detectLocalTerms(combinedTextForChecks, localTerms);
  const hasLocalKeyword = matchedLocalTerms.length > 0;

  return {
    url,
    filePath,
    title,
    titleLength: title.length,
    meta: metaDescription,
    metaLength: metaDescription.length,
    canonical,
    hasCanonical: Boolean(canonical),
    h1,
    h1Length: h1.length,
    h2s,
    h2Count: h2s.length,
    wordCount,
    imagesCount: images.length,
    images,
    missingAltCount,
    hasCTA,
    ctas: foundCtas,
    hasBrand,
    hasLocalKeyword,
    matchedLocalTerms,
    mainText
  };
}

function extractPageSignalsFromFile({
  filePath,
  url = "",
  rules = {}
}) {
  const html = readHtmlFile(filePath);
  return extractPageSignalsFromHtml({
    html,
    url,
    filePath,
    rules
  });
}

module.exports = {
  extractPageSignalsFromHtml,
  extractPageSignalsFromFile
};
