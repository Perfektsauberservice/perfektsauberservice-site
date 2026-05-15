#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const REPLACEMENTS = [
  // Strip pill — main public liability claim
  {
    pattern: /<span><b>Vollständig versichert<\/b><\/span>/g,
    replacement: '<span><b>MwSt-Rechnung</b></span>',
    label: 'strip:vollstaendig-versichert'
  },
  // Trust pill in hero
  {
    pattern: /<span>Versichert<\/span>/g,
    replacement: '<span>MwSt-Rechnung</span>',
    label: 'trustpill:versichert'
  },
  // USP heading
  {
    pattern: /<h3>Versichert &amp; diskret<\/h3>/g,
    replacement: '<h3>Diskret &amp; sorgfältig</h3>',
    label: 'usp:h3-versichert'
  },
  {
    pattern: /<h3>Versichert & diskret<\/h3>/g,
    replacement: '<h3>Diskret & sorgfältig</h3>',
    label: 'usp:h3-versichert-raw'
  },
  // USP paragraph claiming Berufshaftpflicht
  {
    pattern: /Berufshaftpflicht, DSGVO-konforme Aktenvernichtung, vollständige Verschwiegenheit\./g,
    replacement: 'DSGVO-konforme Aktenvernichtung, vollständige Verschwiegenheit, sorgfältiger Umgang mit Ihrem Eigentum.',
    label: 'usp:berufshaftpflicht-paragraph'
  },
  // FAQ answer body (HTML and JSON-LD same wording)
  {
    pattern: /Wir sind vollständig haftpflichtversichert\. Schäden werden in der Regel direkt mit der Versicherung abgewickelt\. Außerdem führen wir bei Vertragsabschluss ein gemeinsames Übergabeprotokoll, das den Zustand vor Beginn dokumentiert\./g,
    replacement: 'Wir arbeiten mit größter Sorgfalt und führen bei Vertragsabschluss ein gemeinsames Übergabeprotokoll durch, das den Zustand vor Beginn dokumentiert. Sollte trotz aller Sorgfalt ein Schaden entstehen, beheben oder ersetzen wir diesen direkt — als inhabergeführter Betrieb übernehmen wir persönlich Verantwortung.',
    label: 'faq:haftpflichtversichert-answer'
  },
  // AGB §6 (4) — most legally dangerous
  {
    pattern: /Der Auftragnehmer ist über eine <strong>Betriebshaftpflichtversicherung<\/strong> versichert\. Auf Wunsch wird der Versicherungsnachweis vor Auftragsbeginn vorgelegt\./g,
    replacement: 'Der Auftragnehmer haftet im Rahmen der gesetzlichen Bestimmungen für nachweislich verursachte Schäden. Vor Auftragsbeginn wird auf Wunsch ein gemeinsames Übergabeprotokoll erstellt, das den Zustand der Räumlichkeiten dokumentiert.',
    label: 'agb:§6-4-betriebshaftpflicht'
  },
  // AGB §6 (4) without strong tags (just in case)
  {
    pattern: /Der Auftragnehmer ist über eine Betriebshaftpflichtversicherung versichert\. Auf Wunsch wird der Versicherungsnachweis vor Auftragsbeginn vorgelegt\./g,
    replacement: 'Der Auftragnehmer haftet im Rahmen der gesetzlichen Bestimmungen für nachweislich verursachte Schäden. Vor Auftragsbeginn wird auf Wunsch ein gemeinsames Übergabeprotokoll erstellt, das den Zustand der Räumlichkeiten dokumentiert.',
    label: 'agb:§6-4-plain'
  },
  // Inline text: "Versichert, MwSt-Rechnung." → "MwSt-Rechnung."
  {
    pattern: /Versichert, MwSt-Rechnung\./g,
    replacement: 'MwSt-Rechnung garantiert.',
    label: 'inline:versichert-mwst'
  },
  // Inline text: "eigenes Personal, versichert"
  {
    pattern: /eigenes Personal, versichert/g,
    replacement: 'eigenes Personal, transparent',
    label: 'inline:eigenes-personal-versichert'
  },
  // Meta description ending: " Versichert."  (with leading space, period end)
  {
    pattern: / Versichert\./g,
    replacement: ' MwSt-Rechnung.',
    label: 'meta:versichert-end'
  },
  // JSON-LD/text description ending ", versichert."
  {
    pattern: /, versichert\./g,
    replacement: ', mit MwSt-Rechnung.',
    label: 'jsonld:versichert-comma'
  },
  // JSON-LD/text middle: ", versichert,"
  {
    pattern: /, versichert,/g,
    replacement: ', transparent,',
    label: 'jsonld:versichert-middle'
  },
  // USP h3 reverse order: "Diskret & versichert"
  {
    pattern: /<h3>Diskret &amp; versichert<\/h3>/g,
    replacement: '<h3>Diskret &amp; sorgfältig</h3>',
    label: 'usp:h3-diskret-versichert-entity'
  },
  {
    pattern: /<h3>Diskret & versichert<\/h3>/g,
    replacement: '<h3>Diskret & sorgfältig</h3>',
    label: 'usp:h3-diskret-versichert-raw'
  },
  // USP paragraph after h3 "Diskret & versichert" — claims Vollständige Haftpflicht
  {
    pattern: /DSGVO-konforme Aktenvernichtung nach DIN 66399\. Auf Wunsch neutrale Fahrzeuge\. Vollständige Haftpflicht — Schäden direkt mit Versicherung geregelt\./g,
    replacement: 'DSGVO-konforme Aktenvernichtung nach DIN 66399. Auf Wunsch neutrale Fahrzeuge. Sorgfältiger Umgang mit Ihrem Eigentum — Schäden werden im Einzelfall transparent reguliert.',
    label: 'usp:vollstaendige-haftpflicht-paragraph'
  },
  // Meta description / inline: "Diskret &amp; versichert"
  {
    pattern: /Diskret &amp; versichert/g,
    replacement: 'Diskret &amp; sorgfältig',
    label: 'meta:diskret-versichert-entity'
  },
  // Meta description plain: "Diskret & versichert"
  {
    pattern: /Diskret & versichert/g,
    replacement: 'Diskret & sorgfältig',
    label: 'meta:diskret-versichert-raw'
  },
  // Trust pill combined: "Versichert & MwSt-Rechnung" — keep only MwSt
  {
    pattern: /<span>Versichert &amp; MwSt-Rechnung<\/span>/g,
    replacement: '<span>MwSt-Rechnung</span>',
    label: 'trustpill:versichert-mwst-combined'
  },
  {
    pattern: /<span>Versichert & MwSt-Rechnung<\/span>/g,
    replacement: '<span>MwSt-Rechnung</span>',
    label: 'trustpill:versichert-mwst-combined-raw'
  },
  // USP block on grundreinigung: <h3>Versichert</h3><p>Vollständige Haftpflichtversicherung. Schäden werden direkt mit der Versicherung abgewickelt.</p>
  {
    pattern: /<h3>Versichert<\/h3>\s*<p>Vollständige Haftpflichtversicherung\. Schäden werden direkt mit der Versicherung abgewickelt\.<\/p>/g,
    replacement: '<h3>Sorgfältig</h3>\n      <p>Wir arbeiten mit größter Sorgfalt und führen ein gemeinsames Übergabeprotokoll durch — bei Schäden tragen wir die direkte Verantwortung.</p>',
    label: 'usp:versichert-haftpflicht-block'
  },
  // Meta blog format: "Diskret ✓ Versichert" with checkmark separator
  {
    pattern: /Diskret ✓ Versichert/g,
    replacement: 'Diskret ✓ MwSt-Rechnung',
    label: 'meta:diskret-checkmark-versichert'
  },
  // FAQ variant on unterhaltsreinigung pages
  {
    pattern: /Wir sind vollständig haftpflichtversichert\. Schäden werden direkt mit der Versicherung abgewickelt\. Bei Vertragsabschluss führen wir ein gemeinsames Übergabeprotokoll\./g,
    replacement: 'Wir arbeiten mit größter Sorgfalt und führen bei Vertragsabschluss ein gemeinsames Übergabeprotokoll durch. Sollte trotz aller Sorgfalt ein Schaden entstehen, beheben oder ersetzen wir diesen direkt — als inhabergeführter Betrieb übernehmen wir persönlich Verantwortung.',
    label: 'faq:haftpflichtversichert-unterhalt'
  },
  // Eyebrow: "Festpreise · Schriftlich · Versichert"
  {
    pattern: /Festpreise · Schriftlich · Versichert/g,
    replacement: 'Festpreise · Schriftlich · Transparent',
    label: 'eyebrow:festpreise-versichert'
  },
  // h3 "Vollständig versichert" (reinigung.html)
  {
    pattern: /<h3>Vollständig versichert<\/h3>/g,
    replacement: '<h3>Sorgfältig</h3>',
    label: 'h3:vollstaendig-versichert'
  },
  // Trust pill "Vollständig versichert" without <b>
  {
    pattern: /<span>Vollständig versichert<\/span>/g,
    replacement: '<span>MwSt-Rechnung</span>',
    label: 'trustpill:vollstaendig-versichert-no-b'
  },
  // Paragraph ending "eigenes Personal, vollständig versichert."
  {
    pattern: /eigenes Personal, vollständig versichert\./g,
    replacement: 'eigenes Personal, transparente Festpreise.',
    label: 'paragraph:eigenes-personal-vollstaendig'
  },
];

async function listHtmlFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_archived' || e.name === 'redesign' || e.name === 'outreach') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await listHtmlFiles(full));
    } else if (e.isFile() && e.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

async function processFile(file) {
  const src = await fs.readFile(file, 'utf8');
  let out = src;
  const counts = {};
  let totalReplacements = 0;
  for (const r of REPLACEMENTS) {
    const before = out;
    out = out.replace(r.pattern, r.replacement);
    if (out !== before) {
      const n = (before.match(r.pattern) || []).length;
      counts[r.label] = n;
      totalReplacements += n;
    }
  }
  if (totalReplacements === 0) return { file, status: 'no-change', counts: {} };
  await fs.writeFile(file, out, 'utf8');
  return { file, status: 'modified', counts, totalReplacements };
}

const files = await listHtmlFiles(ROOT);
const results = await Promise.all(files.map(processFile));
const modified = results.filter(r => r.status === 'modified');
const totals = {};
let totalReplacements = 0;
for (const r of modified) {
  totalReplacements += r.totalReplacements;
  for (const [label, n] of Object.entries(r.counts)) {
    totals[label] = (totals[label] || 0) + n;
  }
}

console.log(`Total HTML files scanned: ${files.length}`);
console.log(`Files modified: ${modified.length}`);
console.log(`Total replacements: ${totalReplacements}`);
console.log('\nBreakdown:');
for (const [label, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${label.padEnd(40)} ${n}`);
}
