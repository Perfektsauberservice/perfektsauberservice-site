// Inject HowTo schema into 13 blog articles flagged by the audit as
// having step-by-step content. The schema augments existing FAQPage
// so AI engines can extract structured steps for queries like
// "wie läuft eine Entrümpelung ab".
//
// Strategy:
//   - Extract step pairs from patterns:
//        <strong>N. Title</strong> ... <p>description</p>
//     or <ol><li>...</li></ol>.
//   - Build HowTo JSON-LD with name/description from article H1 +
//     section heading, and steps from extracted pairs.
//   - Append as additional JSON-LD <script> block (alongside FAQPage).
//
// Idempotent: skips articles that already have @type:"HowTo".
//
// Run from repo root: node agent/scripts/inject-howto-schema.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const TARGETS = [
  'blog/entruempelung-buehl-dachboden-entruempeln--so-laeuft-es.html',
  'blog/entruempelung-durmersheim-sperrmuell-vs-entruempelung--was-ist.html',
  'blog/entruempelung-ettlingen-garage-entruempeln--tipps-fuer-eine.html',
  'blog/entruempelung-gaggenau-raeumungsklage-was-ist-zu-tun.html',
  'blog/entruempelung-karlsruhe-messie-wohnung-raeumen-lassen--ablauf-und.html',
  'blog/entruempelung-karlsruhe-nach-todesfall--ablauf-und-kosten.html',
  'blog/entruempelung-muggensturm-entruempelung-vor-dem-hausverkauf--was.html',
  'blog/entruempelung-rastatt-reihenhaus-typischer-ablauf.html',
  'blog/entruempelung-rheinstetten-entruempelung-nach-wasserschaden--so-gehen.html',
  'blog/haushaltsaufloesung-karlsruhe-haushaltsaufloesung-kosten--was-beeinflusst-den.html',
  'blog/haushaltsaufloesung-rastatt-haushaltsaufloesung-planen--schritt-fuer-schritt.html',
  'blog/wohnungsaufloesung-rastatt-wohnungsaufloesung--checkliste-fuer-einen-reibungslosen.html',
];

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// Extract steps from `<strong>N. Title</strong>` followed by `<p>...</p>` text.
function extractStrongSteps(html) {
  const re = /<strong>(\d+)\.\s+([^<]+)<\/strong>[\s\S]*?<p>([\s\S]*?)<\/p>/g;
  const steps = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = stripTags(m[2]).trim();
    const text = stripTags(m[3]).trim();
    if (name && text && text.length > 20) {
      steps.push({ name, text });
    }
  }
  return steps;
}

// Extract steps from an <ol> block (first one inside main).
function extractOlSteps(html) {
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
  const source = mainMatch ? mainMatch[0] : html;
  const olMatch = source.match(/<ol[^>]*>([\s\S]*?)<\/ol>/);
  if (!olMatch) return [];
  const items = [...olMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)];
  return items.map((m, i) => ({
    name: `Schritt ${i + 1}`,
    text: stripTags(m[1]).trim(),
  })).filter(s => s.text.length > 20);
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return m ? stripTags(m[1]).trim() : '';
}

// Extract steps from <h2>Schritt N-M: Title</h2> sections followed
// by a paragraph block. Each H2 becomes one step.
function extractH2Steps(html) {
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
  const source = mainMatch ? mainMatch[0] : html;
  const re = /<h2[^>]*>([^<]*Schritt[^<]*)<\/h2>\s*<div[^>]*>\s*<p>([\s\S]*?)<\/p>/g;
  const steps = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    const name = stripTags(m[1]).trim();
    const text = stripTags(m[2]).trim();
    if (name && text && text.length > 40) {
      // Truncate very long step text to ~300 chars for snippet sanity
      const trimmed = text.length > 320 ? text.slice(0, 320).replace(/\s+\S*$/, '') + '...' : text;
      steps.push({ name, text: trimmed });
    }
  }
  return steps;
}

function extractCanonical(html) {
  const m = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  return m ? m[1] : '';
}

function buildHowToBlock(name, description, url, steps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    url,
    step: steps.map(s => ({
      '@type': 'HowToStep',
      name: s.name,
      text: s.text,
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

let totals = { ok: 0, skipped: 0, noSteps: 0, alreadyHad: 0 };

for (const rel of TARGETS) {
  const path = `${ROOT}/${rel}`;
  let html;
  try { html = await readFile(path, 'utf8'); }
  catch { console.log(`MISSING: ${rel}`); totals.skipped++; continue; }

  if (/"@type":\s*"HowTo"/.test(html)) {
    console.log(`SKIP (already has HowTo): ${rel}`);
    totals.alreadyHad++;
    continue;
  }

  let steps = extractStrongSteps(html);
  if (steps.length < 3) steps = extractOlSteps(html);
  if (steps.length < 3) steps = extractH2Steps(html);
  if (steps.length < 3) {
    console.log(`SKIP (no extractable steps): ${rel}`);
    totals.noSteps++;
    continue;
  }

  // Cap at 10 steps for snippet sanity
  steps = steps.slice(0, 10);

  const h1 = extractH1(html) || 'Ablauf';
  const url = extractCanonical(html);
  const description = `Schritt-für-Schritt Ablauf: ${h1}. Praktischer Leitfaden von Perfekt Sauber Service.`;
  const block = buildHowToBlock(h1, description, url, steps);

  // Inject right before </head>
  const headEnd = html.lastIndexOf('</head>');
  if (headEnd === -1) {
    console.log(`SKIP (no </head>): ${rel}`);
    totals.skipped++;
    continue;
  }

  html = html.slice(0, headEnd) + block + '\n' + html.slice(headEnd);
  await writeFile(path, html, 'utf8');
  console.log(`HowTo (${steps.length} steps): ${rel}`);
  totals.ok++;
}

console.log();
console.log(`HowTo schema injected: ${totals.ok}`);
console.log(`Already had HowTo (skipped): ${totals.alreadyHad}`);
console.log(`No extractable steps (skipped): ${totals.noSteps}`);
console.log(`Missing or no </head> (skipped): ${totals.skipped}`);
