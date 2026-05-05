// In-place patch: eliminate CLS from font swap by adding @font-face declarations
// for "Fraunces Fallback" + "Inter Fallback" with size-adjust + ascent-override
// metric overrides that match the real fonts' dimensions. Idempotent.
//
// CLS source: when Google Fonts (Fraunces) finishes loading, h1/h2 reflow because
// fallback serif has different x-height/ascent. With metric overrides applied to
// a local Times New Roman fallback, dimensions match Fraunces almost exactly.
// Result: brand identity preserved, layout shift eliminated.
//
// Metric values from fontaine/Capsize (verified for Fraunces on Times,
// Inter on Arial fallback). See https://github.com/seek-oss/capsize
//
// Run from repo root: node agent/scripts/redesign/patch-cls-font-fallback.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MARKER = "'Fraunces Fallback'";

const FONT_FACE_BLOCK = `@font-face{font-family:'Fraunces Fallback';src:local('Times New Roman'),local('Times'),local('Liberation Serif');size-adjust:102.41%;ascent-override:95.06%;descent-override:26.82%;line-gap-override:0%;}
@font-face{font-family:'Inter Fallback';src:local('Arial'),local('Helvetica');size-adjust:107.06%;ascent-override:90.49%;descent-override:22.51%;line-gap-override:0%;}
`;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'agent') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archived' || entry.name === '_backup_2026-05-03') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
let patched = 0, skipped = 0, irrelevant = 0;

for (const f of files) {
  let html = fs.readFileSync(f, 'utf8');

  if (html.includes(MARKER)) {
    skipped++;
    continue;
  }

  let touched = false;

  html = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (match, attrs, css) => {
    // Only patch the critical block — the one defining body{} and palette
    if (!css.includes('*{box-sizing:border-box') || !css.includes('Fraunces')) return match;

    let newCss = FONT_FACE_BLOCK + css;
    newCss = newCss.replace(/"Fraunces",serif/g, '"Fraunces","Fraunces Fallback",serif');
    newCss = newCss.replace(/'Fraunces',serif/g, "'Fraunces','Fraunces Fallback',serif");
    newCss = newCss.replace(/"Inter",system-ui,sans-serif/g, '"Inter","Inter Fallback",system-ui,sans-serif');

    touched = true;
    return `<style${attrs}>${newCss}</style>`;
  });

  if (touched) {
    fs.writeFileSync(f, html);
    patched++;
  } else {
    irrelevant++;
  }
}

console.log(`patched: ${patched}, already-patched: ${skipped}, no-critical-block: ${irrelevant}`);
