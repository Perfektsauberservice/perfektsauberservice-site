// Fix the "fake vorher/nachher pairing" bug across pages using /images/lucrari/lucrare-N.webp
// Each lucrare-N.jpg is ALREADY a side-by-side composite (vorher | nachher in one image),
// but the HTML treats lucrare-1 + lucrare-2 as a vorher/nachher pair (etc.) — misleading.
//
// Fix:
//  1. Rewrite alt text on every <img src="/images/lucrari/lucrare-N.webp"> so it stops claiming
//     a single composite is "Beispiel N vorher" or "Beispiel N nachher".
//  2. Inject a small badge "↔ Vorher | Nachher" inside each affected gal-card so visitors
//     understand each photo is a side-by-side comparison.
//  3. Inject the .vn-tag CSS rule once per page (idempotent).

import fs from 'node:fs';
import path from 'node:path';

const REPO = 'C:/Users/laral/Documents/proiect 1 claude code/perfektsauberservice-site-main';

const VN_CSS = `.vn-tag{position:absolute; top:10px; left:10px; padding:4px 10px; border-radius:999px; font-family:"Geist Mono",monospace; font-size:.6rem; letter-spacing:.14em; background:rgba(0,0,0,.6); color:#fff; pointer-events:none;}`;

function listHtml(dir) {
  return fs.readdirSync(dir)
    .filter(n => n.endsWith('.html') && !n.startsWith('_'))
    .map(n => path.join(dir, n));
}

function fixPage(file) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('/images/lucrari/lucrare-')) return { changed: false };

  const before = html;
  let altRewrites = 0;
  let badgeInjects = 0;

  // 1. Rewrite alt text on each lucrare img so any "vorher" / "nachher" word inside the
  //    alt stops implying "this single photo is the before/after of another photo".
  //    We replace alt entirely with an honest description that includes the example number.
  html = html.replace(
    /<img\s+src="\/images\/lucrari\/lucrare-(\d+)\.webp"\s+alt="([^"]*)"([^>]*)>/g,
    (_m, n, _oldAlt, rest) => {
      altRewrites++;
      const newAlt = `Räumung Beispiel ${n} — Vorher und Nachher Vergleich`;
      return `<img src="/images/lucrari/lucrare-${n}.webp" alt="${newAlt}"${rest}>`;
    }
  );

  // 2. Inject a "↔ Vorher | Nachher" badge inside each gal-card that contains a lucrare image.
  //    Match the gal-card block and insert <span class="vn-tag"> right after the <img>.
  //    Skip if already injected (idempotent).
  html = html.replace(
    /(<div class="gal-card">\s*<img src="\/images\/lucrari\/lucrare-\d+\.webp"[^>]*\/?>)(\s*)(?!<span class="vn-tag")/g,
    (_m, imgTag, ws) => {
      badgeInjects++;
      return `${imgTag}${ws}<span class="vn-tag">↔ Vorher | Nachher</span>${ws}`;
    }
  );

  // 3. Inject .vn-tag CSS once. Append to the first <style> block. Idempotent — skip if already there.
  if (!html.includes('.vn-tag{')) {
    html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/, (m, open, css, close) => {
      return `${open}${css}${VN_CSS}${close}`;
    });
  }

  if (html === before) return { changed: false };
  fs.writeFileSync(file, html);
  return { changed: true, altRewrites, badgeInjects };
}

const files = listHtml(REPO);
let changed = 0, totalAlts = 0, totalBadges = 0;
for (const f of files) {
  const r = fixPage(f);
  if (r.changed) {
    changed++;
    totalAlts += r.altRewrites;
    totalBadges += r.badgeInjects;
  }
}
console.log(`Updated ${changed} HTML files`);
console.log(`  alt text rewrites: ${totalAlts}`);
console.log(`  badge injections: ${totalBadges}`);
