/**
 * Lead Click Ping — Netlify Function
 * Receives a sendBeacon ping when a visitor clicks a WhatsApp/phone/email
 * contact link, and sends an instant Telegram notification. First-party,
 * consent-independent signal — separate from GA4/Ads (see
 * docs/superpowers/specs/2026-09-08-lead-click-ping-design.md).
 *
 * Reuses the same env vars as netlify/functions/submission-created.mjs:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 *
 * Response statuses are truthful (Netlify's function-error-rate monitoring
 * reads them; sendBeacon itself never inspects the response):
 *   200 — ping accepted AND Telegram confirmed delivery
 *   400 — payload rejected by validation (unknown type / malformed page)
 *   500 — internal/config failure (missing env vars, unexpected exception)
 *   502 — Telegram unreachable (network) or Telegram rejected the request
 */

const ALLOWED_TYPES = ['whatsapp', 'phone', 'email'];
const TYPE_LABELS = { whatsapp: 'WhatsApp', phone: 'Telefon', email: 'Email' };
const TYPE_EMOJI = { whatsapp: '📲', phone: '📞', email: '✉️' };

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const type = body.type;
    const page = body.page;

    if (!ALLOWED_TYPES.includes(type) || typeof page !== 'string' || !page.startsWith('/')) {
      return { statusCode: 400, body: 'ignored' };
    }

    const attribution = (body.attribution && typeof body.attribution === 'object') ? body.attribution : {};
    const gclid = attribution.gclid || '';
    const utm_source = attribution.utm_source || '';
    const utm_campaign = attribution.utm_campaign || '';
    const hasAttribution = Boolean(gclid || utm_source || utm_campaign);

    // Optional — only sent by the future shared script (js/ps-lead-ping.js),
    // never by the existing 8 pilot pages, so this is purely additive: a
    // payload without it produces byte-identical Telegram text to before.
    const rawSessionId = typeof body.ps_session_id === 'string' ? body.ps_session_id : '';
    const sessionId = /^[A-Za-z0-9_-]{1,64}$/.test(rawSessionId) ? rawSessionId : '';

    const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
    const text = [
      `${TYPE_EMOJI[type]} Click ${TYPE_LABELS[type]} — Perfekt Sauber Service`,
      `📅 ${now}`,
      `📄 Pagina: ${page}`,
      ...(hasAttribution ? [`🎯 Attribution: gclid=${gclid || '—'} utm_source=${utm_source || '—'} utm_campaign=${utm_campaign || '—'}`] : []),
      ...(sessionId ? [`🆔 Sesiune: ${sessionId}`] : []),
      `ℹ️ Doar semnal de click — nu confirmă că a scris efectiv mesajul.`,
    ].join('\n');

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn('⚠️  TELEGRAM_BOT_TOKEN sau TELEGRAM_CHAT_ID lipsesc din env vars.');
      return { statusCode: 500, body: 'no-telegram-config' };
    }

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    let res;
    try {
      res = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    } catch (networkErr) {
      console.error('❌ Telegram inaccesibil (network):', networkErr.message);
      return { statusCode: 502, body: 'telegram-unreachable' };
    }

    if (!res.ok) {
      const resJson = await res.json().catch(() => ({}));
      console.error('❌ Telegram a respins cererea:', res.status, JSON.stringify(resJson));
      return { statusCode: 502, body: 'telegram-rejected' };
    }

    console.log(`✅ Telegram trimis pentru click ${type} pe ${page}`);
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('❌ Eroare lead-click-ping:', err.message);
    return { statusCode: 500, body: 'error' };
  }
};
