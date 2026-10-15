// Helpers for the PSS Anti-Fraud Netlify Functions (no PC needed).
// Google Ads credentials and Telegram come from Netlify environment variables.
import { getStore } from '@netlify/blobs';
import { STORE_NAME } from './config.mjs';
import { recipients } from './telegram-poll.mjs';
import { teamCopy } from './team-filter.mjs';

const ADS_KEYS = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', 'GOOGLE_ADS_CUSTOMER_ID'];

const envGet = k => globalThis.Netlify?.env?.get?.(k) ?? process.env[k];

export function adsEnvFromNetlify() {
  const env = Object.fromEntries(ADS_KEYS.map(k => [k, envGet(k)]));
  const missing = ADS_KEYS.filter(k => !env[k]);
  return { env, missing };
}

export function isProduction(context) {
  return context?.deploy?.context === 'production';
}

export function storeFor(context) {
  return getStore({ name: isProduction(context) ? STORE_NAME : `${STORE_NAME}-test`, consistency: 'strong' });
}

// Real writes only on the production deploy AND with AF_ENFORCE=1 in the environment.
export function enforceFor(context) {
  return isProduction(context) && envGet('AF_ENFORCE') === '1';
}

export function notifier(context, store = null) {
  const bot = envGet('TELEGRAM_BOT_TOKEN'), chat = envGet('TELEGRAM_CHAT_ID');
  const prefix = isProduction(context) ? '' : `[TEST ${context?.deploy?.context || '?'}] `;
  const post = async body => {
    if (!bot || !chat) return null;
    const r = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, disable_web_page_preview: true, ...body, text: prefix + body.text }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`telegram ${r.status} ${j.description || ''}`);
    return j.result?.message_id;
  };
  // send a text file (dossier part) as a Telegram document
  const sendDocument = async (filename, content, caption = '') => {
    if (!bot || !chat) return null;
    const form = new FormData();
    form.append('chat_id', String(chat));
    if (caption) form.append('caption', prefix + caption);
    form.append('document', new Blob([content], { type: 'text/plain' }), filename);
    const r = await fetch(`https://api.telegram.org/bot${bot}/sendDocument`, { method: 'POST', body: form });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`telegram sendDocument ${r.status} ${j.description || ''}`);
    return j.result?.message_id;
  };
  // team alerts: owner + approved recipients (e.g. the Ads agency); a failing recipient never blocks the owner
  const notifyTeam = async text => {
    const id = await post({ text });                          // Laura: full text
    const copy = teamCopy(text);                               // others: without agency / Madalina lines
    if (store && copy) for (const chatId of await recipients(store).catch(() => [])) {
      try {
        await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: prefix + copy, disable_web_page_preview: true }) });
      } catch { /* ignore */ }
    }
    return id;
  };
  return {
    notifyTeam,
    notify: text => post({ text }),
    send: (text, buttons) => post({ text, reply_markup: { inline_keyboard: [buttons] } }),
    sendDocument,
  };
}
