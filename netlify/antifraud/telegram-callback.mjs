// Telegram inline-button handler for PSS Anti-Fraud rotation approvals.
// Only records Laura's decision (approve / reject) in Netlify Blobs; the
// runner on her PC performs the removal afterwards. Chat id is verified.
import { connectLambda, getStore } from '@netlify/blobs';
import { STORE_NAME } from './config.mjs';

export const CALLBACK_RE = /^afrot:([a-z0-9]{4,20}):(y|n)$/;

export async function handleAntifraudCallback(cq, { event, botToken, allowedChatId, store = null, fetchImpl = fetch }) {
  const data = String(cq?.data || '');
  const m = data.match(CALLBACK_RE);
  if (!m) return false;                                    // not ours
  const answer = text => fetchImpl(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callback_query_id: cq.id, text }) });
  if (String(cq.message?.chat?.id) !== String(allowedChatId)) { await answer('Neautorizat'); return true; }
  if (!store) { connectLambda(event); store = getStore(STORE_NAME); }
  const [, id, choice] = m;
  const w = await store.setJSON(`rot/decision/${id}`, { approved: choice === 'y', t: Date.now(), by: cq.from?.id || null }, { onlyIfNew: true });
  await answer(w?.modified === false ? 'Decizia era deja înregistrată' : choice === 'y' ? 'Aprobat — scot IP-urile' : 'Respins — nu se scoate nimic');
  await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: allowedChatId, text: w?.modified === false ? `ℹ️ Rotația ${id}: decizia era deja înregistrată.` :
      choice === 'y' ? `✅ Rotația ${id} APROBATĂ. Modulul PSS Anti-Fraud scoate IP-urile și confirmă separat.` : `❌ Rotația ${id} respinsă. Nu se scoate nimic.` }) });
  return true;
}
