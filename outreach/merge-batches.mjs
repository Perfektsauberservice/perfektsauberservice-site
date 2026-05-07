#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function merge(existingPath, newBatchPath) {
  const existing = JSON.parse(readFileSync(resolve(__dirname, existingPath), 'utf8'));
  const newEmails = JSON.parse(readFileSync(resolve(__dirname, newBatchPath), 'utf8'));
  const existingIds = new Set(existing.emails.map(e => e.id));
  const dedup = newEmails.filter(e => !existingIds.has(e.id));
  existing.emails.push(...dedup);
  writeFileSync(resolve(__dirname, existingPath), JSON.stringify(existing, null, 2), 'utf8');
  console.log(`✅ ${existingPath}: appended ${dedup.length} new emails (total now ${existing.emails.length})`);
}

merge('bestatter-emails-data.json', 'bestatter-new-batch.json');
merge('immobilien-emails-data.json', 'immobilien-new-batch.json');
