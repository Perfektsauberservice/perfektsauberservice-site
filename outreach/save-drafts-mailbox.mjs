#!/usr/bin/env node
// Saves outreach emails as drafts to mailbox.org via IMAP.
// Reads emails-data.json + IMAP creds from env (MAILBOX_USER, MAILBOX_APP_PASSWORD).
// Run: node save-drafts-mailbox.mjs           (saves all drafts)
// Run: node save-drafts-mailbox.mjs --dry-run (compose + print, no IMAP write)

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ImapFlow } from 'imapflow';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

// ---- Load .env from project root ------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');
function loadEnv(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if (process.env[k] === undefined) process.env[k] = v.replace(/^["']|["']$/g, '');
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
loadEnv(ENV_PATH);

const MAILBOX_USER = process.env.MAILBOX_USER || 'kontakt@perfektsauberservice.com';
const MAILBOX_APP_PASSWORD = process.env.MAILBOX_APP_PASSWORD;
const IMAP_HOST = process.env.MAILBOX_IMAP_HOST || 'imap.mailbox.org';
const IMAP_PORT = Number(process.env.MAILBOX_IMAP_PORT || 993);

const DRY_RUN = process.argv.includes('--dry-run');
const DATA_ARG_IDX = process.argv.indexOf('--data');
const DATA_FILE = DATA_ARG_IDX !== -1 ? process.argv[DATA_ARG_IDX + 1] : 'emails-data.json';

if (!MAILBOX_APP_PASSWORD && !DRY_RUN) {
  console.error('❌ MAILBOX_APP_PASSWORD lipsește din .env');
  console.error('   Adaugă în .env (în root proiect):');
  console.error('   MAILBOX_APP_PASSWORD=parola-app-de-la-mailbox.org');
  process.exit(1);
}

// ---- Load emails data ----------------------------------------------
const dataPath = resolve(__dirname, DATA_FILE);
console.log(`📄 Date: ${DATA_FILE}`);
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const { from, signature, emails } = data;

console.log(`📧 ${emails.length} emailuri de pregătit ca ciorne în Drafts.`);
console.log(`📤 Expeditor: ${from.name} <${from.address}>`);
console.log(`🔐 Mod: ${DRY_RUN ? 'DRY RUN (no IMAP write)' : 'LIVE → mailbox.org'}\n`);

// ---- Build RFC 822 messages -----------------------------------------
async function buildMessage(em) {
  const fullBody = `${em.body}\n\n${signature}\n`;
  const composer = new MailComposer({
    from: { name: from.name, address: from.address },
    to: em.to,
    subject: em.subject,
    text: fullBody,
    textEncoding: 'quoted-printable',
  });
  return await composer.compile().build();
}

// ---- IMAP: find Drafts folder + APPEND each message -----------------
async function saveDrafts() {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: MAILBOX_USER, pass: MAILBOX_APP_PASSWORD },
    logger: false,
  });

  await client.connect();
  console.log('✅ Conectat la IMAP', IMAP_HOST);

  // Find drafts folder via SPECIAL-USE flag (RFC 6154), with name fallbacks.
  const list = await client.list();
  const drafts =
    list.find((b) => b.specialUse === '\\Drafts') ||
    list.find((b) => b.path === 'Drafts') ||
    list.find((b) => b.path === 'Entwürfe') ||
    list.find((b) => /drafts|entwürfe/i.test(b.path));

  if (!drafts) {
    console.error('❌ Nu am găsit folder de Drafts. Foldere disponibile:');
    list.forEach((b) => console.error('   -', b.path, b.specialUse || ''));
    await client.logout();
    process.exit(1);
  }

  console.log(`📁 Drafts folder: "${drafts.path}"\n`);

  let success = 0;
  for (const em of emails) {
    process.stdout.write(`  #${em.id} → ${em.to.padEnd(45)} ... `);
    try {
      const message = await buildMessage(em);
      await client.append(drafts.path, message, ['\\Draft']);
      console.log('✅ salvat');
      success++;
    } catch (err) {
      console.log('❌', err.message);
    }
  }

  await client.logout();
  console.log(`\n🎉 ${success}/${emails.length} ciorne salvate în "${drafts.path}".`);
  console.log(`📬 Verifică: https://login.mailbox.org → Posteingang → Entwürfe`);
}

// ---- Dry run: print to console without IMAP -------------------------
async function dryRun() {
  for (const em of emails) {
    console.log(`────────  #${em.id}  ${em.label}  ────────`);
    console.log(`To:      ${em.to}`);
    console.log(`Subject: ${em.subject}`);
    const buf = await buildMessage(em);
    console.log(`Bytes:   ${buf.length}`);
    console.log();
  }
  console.log(`✅ Dry run OK — ${emails.length} mesaje compilate fără erori.`);
}

(DRY_RUN ? dryRun() : saveDrafts()).catch((err) => {
  console.error('\n❌ Eroare:', err.message);
  if (err.code === 'EAUTH' || /AUTHENTICATIONFAILED/i.test(err.message)) {
    console.error('   → Verifică MAILBOX_USER + MAILBOX_APP_PASSWORD în .env');
    console.error('   → App password se generează în mailbox.org Einstellungen → Konto → App-Passwörter');
  }
  process.exit(1);
});
