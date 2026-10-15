// Telegram without a webhook: af-cron reads new updates every 5 minutes (getUpdates).
//  * rotation buttons  afrot:<id>:y|n   -> decision stored (only from the owner's chat)
//  * someone else sends /start          -> owner is asked "add as alert recipient?"  afrec:<chatId>:y|n
//  * approved recipients (e.g. the Ads agency) receive the team alerts (see notifier.notifyTeam)
import { handleAntifraudCallback } from './telegram-callback.mjs';

export async function recipients(store) {
  const out = [];
  for (const b of (await store.list({ prefix: 'tg/recipients/' })).blobs) out.push(b.key.split('/').pop());
  return out;
}

export async function pollTelegram({ store, botToken, ownerChatId, fetchImpl = fetch }) {
  if (!botToken || !ownerChatId) return { updates: 0 };
  const api = (method, body) => fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const offset = (await store.get('tg/offset', { type: 'json' }).catch(() => null))?.offset || 0;
  const res = await api('getUpdates', { offset, timeout: 0, allowed_updates: ['message', 'callback_query'] });
  if (!res.ok) throw new Error(`getUpdates: ${res.description || 'failed'}`);
  let last = offset - 1; const done = [];
  for (const u of res.result || []) {
    last = Math.max(last, u.update_id);
    const cq = u.callback_query;
    if (cq) {
      if (await handleAntifraudCallback(cq, { botToken, allowedChatId: ownerChatId, store, fetchImpl })) { done.push('rotation'); continue; }
      const m = String(cq.data || '').match(/^afrec:(-?\d+):(y|n)$/);
      if (m && String(cq.message?.chat?.id) === String(ownerChatId)) {
        const [, chatId, choice] = m;
        const cand = await store.get(`tg/candidate/${chatId}`, { type: 'json' }).catch(() => null);
        if (choice === 'y') {
          await store.setJSON(`tg/recipients/${chatId}`, { t: Date.now(), name: cand?.name || '', username: cand?.username || '', role: 'team' });
          await api('sendMessage', { chat_id: chatId, text: '✅ Ai fost adăugat(ă) la alertele PSS Anti-Fraud (excluderi, clicuri fantomă, rezumat zilnic, raport săptămânal).' });
        }
        await store.delete(`tg/candidate/${chatId}`).catch(() => {});
        await api('answerCallbackQuery', { callback_query_id: cq.id, text: choice === 'y' ? 'Adăugat la alerte' : 'Respins' });
        await api('sendMessage', { chat_id: ownerChatId, text: choice === 'y' ? `✅ ${cand?.name || chatId} primește de acum alertele PSS Anti-Fraud.` : `❌ ${cand?.name || chatId} NU a fost adăugat(ă).` });
        done.push(`recipient:${choice}`);
      }
      continue;
    }
    const msg = u.message;
    if (msg && String(msg.chat?.id) !== String(ownerChatId) && /^\/start/.test(msg.text || '')) {
      const chatId = String(msg.chat.id);
      if (await store.get(`tg/recipients/${chatId}`).catch(() => null)) continue;
      const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.chat?.title || chatId;
      const w = await store.setJSON(`tg/candidate/${chatId}`, { t: Date.now(), name, username: msg.from?.username || '' }, { onlyIfNew: true });
      if (w?.modified === false) continue;
      await api('sendMessage', { chat_id: ownerChatId, text: `👤 ${name}${msg.from?.username ? ' (@' + msg.from.username + ')' : ''} a pornit botul PSS. Îl/o adaug la alertele Anti-Fraud?`,
        reply_markup: { inline_keyboard: [[{ text: '✅ Da', callback_data: `afrec:${chatId}:y` }, { text: '❌ Nu', callback_data: `afrec:${chatId}:n` }]] } });
      await api('sendMessage', { chat_id: chatId, text: 'Cererea ta a fost trimisă proprietarei. Vei primi alertele după aprobare.' });
      done.push('candidate');
    }
  }
  if (last >= offset) await store.setJSON('tg/offset', { offset: last + 1, t: Date.now() });
  return { updates: (res.result || []).length, done };
}
