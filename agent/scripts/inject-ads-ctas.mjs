/**
 * inject-ads-ctas.mjs — idempotent mid-page CTAs for the Google Ads landing
 * pages (homepage-hero look: serif lead line + one large button).
 *
 * Placement is content-based; each CTA goes directly AFTER the section
 * whose first heading matches, and is skipped if that section or the next
 * one already offers a direct contact action (tel / WhatsApp / form):
 *   A  after "Was kostet …"                 -> call      (blue)
 *   C  after "Beispiele …" (real job photos) -> WhatsApp  (green)
 *   B  after "Warum Perfekt Sauber Service"  -> call      (blue)
 * The WhatsApp button reuses the page's own pre-filled hero WhatsApp link.
 *
 * Usage: node agent/scripts/inject-ads-ctas.mjs page1.html page2.html ...
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const MARK = 'data-ads-cta';
const CSS_LINK = '<link rel="stylesheet" href="/css/cta-band.css?v=3">';
const TEL = 'tel:+491639087197';

const SPOTS = [
  { id: 'A', re: /^Was kostet/i, kind: 'call', lead: 'Ihr Festpreis – kostenlos &amp; unverbindlich.' },
  { id: 'C', re: /^Beispiele/i, kind: 'wa', lead: 'Fotos senden – Festpreis per WhatsApp erhalten.' },
  { id: 'B', re: /^Warum Perfekt Sauber Service/i, kind: 'call', lead: 'Überzeugt? Wir sind direkt für Sie erreichbar.' },
];

const hasCta = (h) => /href="(tel:|https:\/\/wa\.me)/.test(h) || h.includes('<form');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

export function sections(html) {
  const out = [];
  const re = /<section\b[^>]*>[\s\S]*?<\/section>/g;
  let m;
  while ((m = re.exec(html))) {
    const h = m[0].match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/);
    out.push({ end: m.index + m[0].length, heading: h ? strip(h[1]) : '', cta: hasCta(m[0]) });
  }
  return out;
}

function waLink(html) {
  const m = html.match(/<a href="(https:\/\/wa\.me\/[^"]+)" class="btn btn-w"/);
  return m ? m[1] : 'https://wa.me/491639087197';
}

function block(spot, wa, nl) {
  const btn = spot.kind === 'call'
    ? `<a href="${TEL}" class="ads-cta-btn ads-cta-call">Rufen Sie uns an</a>`
    : `<a href="${wa}" class="ads-cta-btn ads-cta-wa" target="_blank" rel="noreferrer">Nachricht schicken</a>`;
  return [`<div class="ads-cta" ${MARK}="${spot.id}">`, `  <p class="ads-cta-lead">${spot.lead}</p>`, `  ${btn}`, `</div>`].join(nl);
}

export function inject(html) {
  if (html.includes(MARK)) return { html, added: [] };
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  const secs = sections(html);
  const wa = waLink(html);
  const plan = [];
  for (const spot of SPOTS) {
    const i = secs.findIndex((s) => spot.re.test(s.heading));
    if (i === -1) continue;
    if (secs[i].cta || (secs[i + 1] && secs[i + 1].cta)) continue;
    plan.push({ spot, at: secs[i].end });
  }
  let out = html;
  for (const p of plan.sort((a, b) => b.at - a.at)) out = out.slice(0, p.at) + nl + nl + block(p.spot, wa, nl) + out.slice(p.at);
  if (plan.length && !out.includes('/css/cta-band.css')) out = out.replace('</head>', CSS_LINK + nl + '</head>');
  return { html: out, added: plan.map((p) => p.spot.id) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const f of process.argv.slice(2)) {
    const src = readFileSync(f, 'utf8');
    const { html, added } = inject(src);
    if (added.length) writeFileSync(f, html, 'utf8');
    console.log(f, added.join(',') || '(nothing)');
  }
}
