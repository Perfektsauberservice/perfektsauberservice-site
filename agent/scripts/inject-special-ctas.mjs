/**
 * inject-special-ctas.mjs — hand-placed mid-page CTAs (same look as
 * inject-ads-ctas.mjs) for the pages that do not use the service template.
 * Each block is inserted directly before the <section> that holds the given
 * heading (or, for pages without headings, after the Nth <section>). Idempotent.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const MARK = 'data-ads-cta';
const CSS_LINK = '<link rel="stylesheet" href="/css/cta-band.css?v=3">';
const TEL = 'tel:+491639087197';
const WA = 'https://wa.me/491639087197';
const LEAD = {
  call: 'Ihr Festpreis – kostenlos &amp; unverbindlich.',
  wa: 'Fotos senden – Festpreis per WhatsApp erhalten.',
  call2: 'Überzeugt? Wir sind direkt für Sie erreichbar.',
};

export const PLAN = {
  'hausmeisterservice.html': [['before-h2', 'Auch verfügbar', 'call', 'call'], ['before-h2', 'Häufige Fragen', 'wa', 'wa']],
  'leistungen.html': [['before-h2', 'Was uns auszeichnet', 'call', 'call'], ['before-h2', 'Weitere Leistungen', 'wa', 'wa']],
  'portfolio.html': [['before-h2', 'Sieben Aufträge', 'call', 'call'], ['before-h2', 'Auswahl unserer Einsätze', 'wa', 'wa']],
  'preise.html': [['before-h2', 'Preise Reinigung', 'call', 'call']],
  'ueber-uns.html': [['after-section', 2, 'call', 'call2'], ['after-section', 4, 'wa', 'wa']],
  'nachhaltigkeit.html': [['before-h2', 'Sortierte Entsorgung', 'call', 'call'], ['before-h2', 'Spenden statt Wegwerfen', 'wa', 'wa']],
};

const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

function block(id, kind, lead, nl) {
  const btn = kind === 'call'
    ? `<a href="${TEL}" class="ads-cta-btn ads-cta-call">Rufen Sie uns an</a>`
    : `<a href="${WA}" class="ads-cta-btn ads-cta-wa" target="_blank" rel="noreferrer">Nachricht schicken</a>`;
  return [`<div class="ads-cta" ${MARK}="${id}">`, `  <p class="ads-cta-lead">${LEAD[lead]}</p>`, `  ${btn}`, `</div>`].join(nl);
}

function positionFor(html, [mode, arg]) {
  if (mode === 'before-h2') {
    const re = /<h2\b[^>]*>([\s\S]*?)<\/h2>/g;
    let m;
    while ((m = re.exec(html))) {
      if (strip(m[1]).startsWith(arg)) {
        // insert before the block that holds this heading (section or card),
        // never inside it
        const prevH2 = html.lastIndexOf('<h2', m.index - 1);
        const holder = Math.max(html.lastIndexOf('<section', m.index), html.lastIndexOf('<div class="card', m.index));
        return holder > prevH2 && holder !== -1 ? holder : m.index;
      }
    }
    return -1;
  }
  const re = /<section\b[^>]*>[\s\S]*?<\/section>/g;
  let m, n = 0;
  while ((m = re.exec(html))) if (++n === arg) return m.index + m[0].length;
  return -1;
}

export function injectSpecial(file, html) {
  const plan = PLAN[file];
  if (!plan || html.includes(MARK)) return { html, added: 0 };
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  const spots = plan.map((p, i) => ({ at: positionFor(html, p), kind: p[2], lead: p[3], id: 'S' + (i + 1) })).filter((s) => s.at > -1);
  let out = html;
  for (const s of spots.sort((a, b) => b.at - a.at)) out = out.slice(0, s.at) + nl + block(s.id, s.kind, s.lead, nl) + nl + nl + out.slice(s.at);
  if (spots.length && !out.includes('/css/cta-band.css')) out = out.replace('</head>', CSS_LINK + nl + '</head>');
  return { html: out, added: spots.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const f of Object.keys(PLAN)) {
    const { html, added } = injectSpecial(f, readFileSync(f, 'utf8'));
    if (added) writeFileSync(f, html, 'utf8');
    console.log(f, added, '/', PLAN[f].length);
  }
}
