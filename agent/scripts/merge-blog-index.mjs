/**
 * Rezolva automat conflictele din content/auto/blog-index.json.
 * Citeste fisierul cu markers de conflict, parseaza ambele versiuni,
 * combina items-urile fara duplicate (dupa slug), scrie rezultatul.
 */
import { readFileSync, writeFileSync } from 'fs';

const path = process.argv[2] || 'content/auto/blog-index.json';
const raw = readFileSync(path, 'utf8');

if (!raw.includes('<<<<<<<')) {
  console.log('Niciun conflict detectat in', path);
  process.exit(0);
}

// Separa cele doua versiuni din conflict markers
const lines = raw.split('\n');
let section = 'base'; // base | ours | theirs
const oursLines = [], theirsLines = [], baseLines = [];

for (const line of lines) {
  if (line.startsWith('<<<<<<<')) { section = 'ours'; continue; }
  if (line.startsWith('=======')) { section = 'theirs'; continue; }
  if (line.startsWith('>>>>>>>')) { section = 'base'; continue; }
  if (section === 'ours') oursLines.push(line);
  else if (section === 'theirs') theirsLines.push(line);
  else { oursLines.push(line); theirsLines.push(line); }
}

let ours, theirs;
try {
  ours = JSON.parse(oursLines.join('\n'));
  theirs = JSON.parse(theirsLines.join('\n'));
} catch (e) {
  console.error('Eroare parsare JSON:', e.message);
  process.exit(1);
}

// Combina items din ambele versiuni, fara duplicate (slug unic)
const allItems = [...(theirs.items || []), ...(ours.items || [])];
const seen = new Set();
const merged = allItems.filter(item => {
  if (seen.has(item.slug)) return false;
  seen.add(item.slug);
  return true;
});

const result = {
  ...theirs,
  items: merged,
  updatedAt: new Date().toISOString(),
};

writeFileSync(path, JSON.stringify(result, null, 2), 'utf8');
console.log(`✅ blog-index.json rezolvat: ${merged.length} articole (ours: ${(ours.items||[]).length}, theirs: ${(theirs.items||[]).length})`);
