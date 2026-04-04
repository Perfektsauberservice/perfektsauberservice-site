const fs = require("fs");
const path = require("path");

const rules = require("../config/visual-seo-rules.json");
const { extractPageSignalsFromFile } = require("../utils/extract-page-signals");
const { comparePages } = require("../utils/compare-pages");
const { scorePage } = require("../utils/score-page");

const PROJECT_ROOT = process.cwd();
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const STATE_DIR = path.join(PROJECT_ROOT, "agent", "state");

const REPORT_PATH = path.join(STATE_DIR, "visual-seo-report.json");
const SUMMARY_PATH = path.join(STATE_DIR, "visual-seo-summary.json");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isHtmlFile(fileName = "") {
  return fileName.toLowerCase().endsWith(".html");
}

function walkHtmlFiles(dirPath, baseDir = dirPath) {
  const results = [];

  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...walkHtmlFiles(fullPath, baseDir));
      continue;
    }

    if (entry.isFile() && isHtmlFile(entry.name)) {
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      results.push({
        filePath: fullPath,
        relativePath
      });
    }
  }

  return results;
}

function toPublicUrl(relativePath = "") {
  return `/${relativePath.replace(/\\/g, "/")}`;
}

function shouldSkipFile(relativePath = "") {
  const normalized = relativePath.toLowerCase();

  const skipPatterns = [
    "404.html",
    "thank-you.html",
    "danke.html"
  ];

  return skipPatterns.some((pattern) => normalized.includes(pattern));
}

function buildTotals(finalPages = []) {
  const totals = {
    pages: finalPages.length,
    highRisk: 0,
    mediumRisk: 0,
    lowRisk: 0
  };

  for (const page of finalPages) {
    if (page.risk === "high") totals.highRisk += 1;
    else if (page.risk === "medium") totals.mediumRisk += 1;
    else totals.lowRisk += 1;
  }

  return totals;
}

function buildTopIssues(finalPages = []) {
  const issueMap = new Map();

  for (const page of finalPages) {
    for (const issue of page.issues || []) {
      issueMap.set(issue, (issueMap.get(issue) || 0) + 1);
    }
  }

  return [...issueMap.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function buildTopDuplicatePairs(pairwise = []) {
  return [...pairwise]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 20);
}

function buildSummary(report) {
  const sortedByScoreAsc = [...report.pages].sort((a, b) => a.score - b.score);
  const worstPages = sortedByScoreAsc.slice(0, 15);

  const sortedBySimilarityDesc = [...report.pages].sort(
    (a, b) => b.similarityTop - a.similarityTop
  );
  const mostSimilarPages = sortedBySimilarityDesc.slice(0, 15);

  return {
    generatedAt: report.generatedAt,
    site: report.site,
    totals: report.totals,
    worstPages: worstPages.map((page) => ({
      url: page.url,
      score: page.score,
      risk: page.risk,
      issues: page.issues.slice(0, 5)
    })),
    mostSimilarPages: mostSimilarPages.map((page) => ({
      url: page.url,
      similarityTop: page.similarityTop,
      duplicateRisk: page.duplicateRisk,
      closestMatch: page.closestMatches?.[0] || null
    })),
    topIssues: buildTopIssues(report.pages),
    topDuplicatePairs: buildTopDuplicatePairs(report.pairwise)
  };
}

function runVisualSeoAudit() {
  ensureDir(STATE_DIR);

  if (!fs.existsSync(PUBLIC_DIR)) {
    throw new Error(`Public directory not found: ${PUBLIC_DIR}`);
  }

  const htmlFiles = walkHtmlFiles(PUBLIC_DIR).filter(
    (item) => !shouldSkipFile(item.relativePath)
  );

  if (!htmlFiles.length) {
    throw new Error(`No HTML files found in: ${PUBLIC_DIR}`);
  }

  const pages = htmlFiles.map((item) => {
    const url = toPublicUrl(item.relativePath);

    return extractPageSignalsFromFile({
      filePath: item.filePath,
      url,
      rules
    });
  });

  const comparisonData = comparePages(pages, rules);

  const finalPages = pages
    .map((page) => {
      const comparison =
        comparisonData.results.find((item) => item.url === page.url) || {};

      const scored = scorePage(page, comparison, rules);

      return {
        ...page,
        ...scored
      };
    })
    .sort((a, b) => a.url.localeCompare(b.url));

  const report = {
    generatedAt: new Date().toISOString(),
    site: "https://perfektsauberservice.com",
    totals: buildTotals(finalPages),
    pages: finalPages,
    pairwise: comparisonData.pairwise
  };

  const summary = buildSummary(report);

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");

  console.log(`Visual SEO report written to: ${REPORT_PATH}`);
  console.log(`Visual SEO summary written to: ${SUMMARY_PATH}`);
  console.log(
    `Processed ${report.totals.pages} pages | High: ${report.totals.highRisk} | Medium: ${report.totals.mediumRisk} | Low: ${report.totals.lowRisk}`
  );

  return {
    reportPath: REPORT_PATH,
    summaryPath: SUMMARY_PATH,
    totals: report.totals
  };
}

if (require.main === module) {
  try {
    runVisualSeoAudit();
  } catch (error) {
    console.error("Visual SEO workflow failed.");
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  }
}

module.exports = {
  runVisualSeoAudit
};
