import test from 'node:test';
import assert from 'node:assert/strict';
import { pollTelegram, recipients } from '../netlify/antifraud/telegram-poll.mjs';
import { memoryStore } from './helpers/memory-store.mjs';

const OWNER = '648944715', MADA = '7777';

function fakeTelegram(updatesQueue) {
  const sent = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body); const method = url.split('/').pop();
    sent.push({ method, body });
    if (method === 'getUpdates') return new Response(JSON.stringify({ ok: true, result: (updatesQueue.shift() || []).filter(u => u.update_id >= (body.offset || 0)) }));
    return new Response('{"ok":true,"result":{"message_id":1}}');
  };
  return { f, sent };
}

test('agency /start -> owner gets Da/Nu buttons -> approval adds the recipient (once)', async () => {
  const store = memoryStore();
  const start = { update_id: 10, message: { chat: { id: Number(MADA) }, from: { first_name: 'Madalina', last_name: 'Gherman', username: 'amgads' }, text: '/start' } };
  const approve = { update_id: 11, callback_query: { id: 'q', data: `afrec:${MADA}:y`, from: { id: 1 }, message: { chat: { id: Number(OWNER) } } } };
  const tg = fakeTelegram([[start], [approve], []]);
  await pollTelegram({ store, botToken: 't', ownerChatId: OWNER, fetchImpl: tg.f });
  const ask = tg.sent.find(x => x.method === 'sendMessage' && x.body.chat_id === OWNER);
  assert.match(ask.body.text, /Madalina Gherman \(@amgads\) a pornit botul/);
  assert.equal(ask.body.reply_markup.inline_keyboard[0][0].callback_data, `afrec:${MADA}:y`);
  assert.deepEqual(await recipients(store), []);                       // nothing before Laura approves
  await pollTelegram({ store, botToken: 't', ownerChatId: OWNER, fetchImpl: tg.f });
  assert.deepEqual(await recipients(store), [MADA]);
  assert.equal((await store.get('tg/offset', { type: 'json' })).offset, 12);
});

test('a stranger cannot approve recipients; only the owner chat can', async () => {
  const store = memoryStore();
  await store.setJSON(`tg/candidate/${MADA}`, { name: 'X' });
  const fake = { update_id: 20, callback_query: { id: 'q', data: `afrec:${MADA}:y`, from: { id: 2 }, message: { chat: { id: 999 } } } };
  const tg = fakeTelegram([[fake]]);
  await pollTelegram({ store, botToken: 't', ownerChatId: OWNER, fetchImpl: tg.f });
  assert.deepEqual(await recipients(store), []);
});

test('rotation buttons are handled through polling (no webhook needed)', async () => {
  const store = memoryStore();
  const cb = { update_id: 30, callback_query: { id: 'q', data: 'afrot:abc123:y', from: { id: 1 }, message: { chat: { id: Number(OWNER) } } } };
  const tg = fakeTelegram([[cb]]);
  const r = await pollTelegram({ store, botToken: 't', ownerChatId: OWNER, fetchImpl: tg.f });
  assert.deepEqual(r.done, ['rotation']);
  assert.equal((await store.get('rot/decision/abc123', { type: 'json' })).approved, true);
});
