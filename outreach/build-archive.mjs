#!/usr/bin/env node
// Builds a master archive of all outreach emails, excluding refusals.
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Refusal blacklist (emails that explicitly refused — exclude from archive)
const REFUSED = new Set([
  'info@planb-ka.de',          // Plan B Immobilien KA — refuz Jochen Bertsche 2026-05-04
  'info@immokoch.de',          // Koch Immobilien Rheinstetten — refuz Pascal Koch 2026-05-04
  'info@immowessi.de',         // ImmoWessi Ettlingen — refuz Sascha Wessnitzer 2026-05-06
  'info@hv-fidelitas.de',      // Fidelitas Rheinstetten — soft no Martina Paul 2026-05-04
].map(e => e.toLowerCase()));

const sources = [
  { file: 'bestatter-emails-data.json',     category: 'Bestatter' },
  { file: 'immobilien-emails-data.json',    category: 'Immobilien/HV' },
  { file: 'erbrecht-emails-data.json',      category: 'Anwalt Erbrecht' },
  { file: 'pflegedienste-emails-data.json', category: 'Pflegedienst/Seniorenheim' },
];

const allEntries = [];
let totalRaw = 0;
let totalExcluded = 0;

for (const { file, category } of sources) {
  const data = JSON.parse(readFileSync(resolve(__dirname, file), 'utf8'));
  for (const e of data.emails) {
    totalRaw++;
    const emailKey = e.to.toLowerCase();
    if (REFUSED.has(emailKey)) {
      totalExcluded++;
      continue;
    }
    allEntries.push({
      category,
      label: e.label,
      email: e.to,
      sourceFile: file,
      id: e.id,
    });
  }
}

// Sort by category then label
allEntries.sort((a, b) =>
  a.category.localeCompare(b.category) || a.label.localeCompare(b.label)
);

// Write CSV
const csvLines = ['Category,Firm,Email,SourceFile,ID'];
for (const e of allEntries) {
  csvLines.push(`"${e.category}","${e.label.replace(/"/g, '""')}","${e.email}","${e.sourceFile}",${e.id}`);
}
writeFileSync(resolve(__dirname, 'outreach-archive.csv'), csvLines.join('\n') + '\n', 'utf8');

// Write Markdown grouped by category
const mdLines = [
  '# Outreach Archive — toate adresele active',
  '',
  `Generat: ${new Date().toISOString().split('T')[0]}`,
  '',
  `**Total active:** ${allEntries.length} adrese (după excludere refuzuri)`,
  `**Excluse din arhivă (refuzuri):** ${totalExcluded}`,
  '',
];

const byCat = {};
for (const e of allEntries) {
  (byCat[e.category] ||= []).push(e);
}

for (const [cat, list] of Object.entries(byCat)) {
  mdLines.push(`## ${cat} (${list.length})`);
  mdLines.push('');
  mdLines.push('| Firmă | Email |');
  mdLines.push('|---|---|');
  for (const e of list) {
    mdLines.push(`| ${e.label} | ${e.email} |`);
  }
  mdLines.push('');
}

mdLines.push('## Excluse (refuzuri — NU recontacta)');
mdLines.push('');
mdLines.push('| Email | Firmă | Notă |');
mdLines.push('|---|---|---|');
mdLines.push('| info@planb-ka.de | Plan B Immobilien (KA) | ❌ Jochen Bertsche refuzat 2026-05-04 (au deja 50+ partneri) |');
mdLines.push('| info@immokoch.de | Koch Immobilien (Rheinstetten) | ❌ Pascal Koch refuzat 2026-05-04 (au deja parteneri) |');
mdLines.push('| info@immowessi.de | ImmoWessi (Ettlingen) | ❌ Sascha Wessnitzer refuzat 2026-05-06 |');
mdLines.push('| info@hv-fidelitas.de | Hausverwaltung Fidelitas (Rheinstetten) | 📂 Soft no Martina Paul 2026-05-04 (Vormerkung) |');

writeFileSync(resolve(__dirname, 'outreach-archive.md'), mdLines.join('\n') + '\n', 'utf8');

// Also a plain text email list for quick copy
const emailsOnly = allEntries.map(e => e.email).join('\n');
writeFileSync(resolve(__dirname, 'outreach-archive-emails.txt'), emailsOnly + '\n', 'utf8');

console.log(`✅ Arhivă generată:`);
console.log(`   📊 ${allEntries.length} adrese active (din ${totalRaw} total, ${totalExcluded} excluse)`);
console.log(`   📄 outreach-archive.csv`);
console.log(`   📄 outreach-archive.md`);
console.log(`   📄 outreach-archive-emails.txt (plain list)`);
console.log('');
console.log('Distribuție pe categorii:');
for (const [cat, list] of Object.entries(byCat)) {
  console.log(`   ${cat}: ${list.length}`);
}
