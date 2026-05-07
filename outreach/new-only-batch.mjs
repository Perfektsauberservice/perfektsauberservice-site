#!/usr/bin/env node
// Creates a combined JSON with only the new (32) emails, ready for bot drafting.
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const bestatter = JSON.parse(readFileSync(resolve(__dirname, 'bestatter-emails-data.json'), 'utf8'));
const immobilien = JSON.parse(readFileSync(resolve(__dirname, 'immobilien-emails-data.json'), 'utf8'));
const bestatterNew = JSON.parse(readFileSync(resolve(__dirname, 'bestatter-new-batch.json'), 'utf8'));
const immobilienNew = JSON.parse(readFileSync(resolve(__dirname, 'immobilien-new-batch.json'), 'utf8'));

const newOnly = {
  from: bestatter.from,
  signature: bestatter.signature,
  emails: [...bestatterNew, ...immobilienNew]
};

writeFileSync(
  resolve(__dirname, 'new-only-batch-data.json'),
  JSON.stringify(newOnly, null, 2),
  'utf8'
);

console.log(`✅ new-only-batch-data.json: ${newOnly.emails.length} emails ready for drafting`);
console.log(`   ${bestatterNew.length} Bestatter (id 19-39)`);
console.log(`   ${immobilienNew.length} Immobilien (id 60-70)`);
