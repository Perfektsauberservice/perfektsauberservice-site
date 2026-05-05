// In-place patch: add <main id="main"> landmark + skip-to-content link to all
// pages. Lighthouse A11y checks "landmark-one-main" and "bypass" both require
// these. Idempotent.
//
// Run: node agent/scripts/redesign/patch-a11y-landmarks.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_MARKER = 'class="skip-link"';

const SKIP_LINK = '<a href="#main" class="skip-link">Zum Inhalt springen</a>';
const SKIP_CSS = `.skip-link{position:absolute;top:-40px;left:0;background:#1a2030;color:#fff;padding:8px 16px;z-index:100;text-decoration:none;font-family:"Geist Mono",monospace;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;}
.skip-link:focus{top:0;}
`;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'agent') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archived' || entry.name === '_backup_2026-05-03' || entry.name === 'dashboard' || entry.name === 'outreach') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
let patched = 0, skipped = 0, missing = 0;

for (const f of files) {
  let html = fs.readFileSync(f, 'utf8');

  if (html.includes(SKIP_MARKER)) {
    skipped++;
    continue;
  }

  const orig = html;
  let touched = false;

  // 1. Inject skip link CSS into critical <style> block
  html = html.replace(/<style([^>]*)>(@font-face[^<]*\*\{box-sizing:border-box[^<]*?})/, (m, attrs, css) => {
    return `<style${attrs}>${SKIP_CSS}${css}`;
  });
  // Fallback if first regex didn't match (no font-face yet, or different CSS structure):
  if (html === orig) {
    html = html.replace(/<style([^>]*)>(\*\{box-sizing:border-box)/, (m, attrs, body) => {
      return `<style${attrs}>${SKIP_CSS}${body}`;
    });
  }

  // 2. Insert skip link as first element after <body>
  const bodyMatch = html.match(/<body[^>]*>/);
  if (bodyMatch) {
    const bodyTag = bodyMatch[0];
    html = html.replace(bodyTag, `${bodyTag}\n${SKIP_LINK}`);
  }

  // 3. Wrap content in <main id="main"> ... </main>
  // After </nav> open, before <footer class="foot"> close
  if (html.includes('</nav>') && html.includes('<footer class="foot">')) {
    html = html.replace('</nav>', '</nav>\n<main id="main">');
    html = html.replace('<footer class="foot">', '</main>\n<footer class="foot">');
    touched = true;
  }

  if (touched && html !== orig) {
    fs.writeFileSync(f, html);
    patched++;
  } else {
    missing++;
  }
}

console.log(`patched: ${patched}, already-patched: ${skipped}, no-nav-footer-structure: ${missing}`);
