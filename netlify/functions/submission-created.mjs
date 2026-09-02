/**
 * Agent 8 — Lead Notifier
 * Netlify apeleaza aceasta functie automat cand cineva trimite un formular.
 * Trimite notificare instantanee pe Telegram si pe email (Resend).
 *
 * Variabile necesare in Netlify Dashboard → Site Settings → Environment Variables:
 *   TELEGRAM_BOT_TOKEN  = tokenul botului de la BotFather
 *   TELEGRAM_CHAT_ID    = chat_id-ul tau personal
 *   RESEND_API_KEY      = cheia API de la Resend
 *   ALERT_EMAIL_TO      = adresa unde ajunge notificarea de lead nou
 *   ALERT_EMAIL_FROM    = adresa expeditor (verificata in Resend)
 */

import crypto from 'node:crypto';

const LEAD_ID_PATTERN = /^PSS-\d{8}-[a-z0-9]{8}$/i;

export const handler = async (event) => {
  try {
    const payload = JSON.parse(event.body);
    console.log('DEBUG payload keys:', JSON.stringify(Object.keys(payload)));
    console.log('DEBUG payload.payload:', JSON.stringify(payload.payload));
    const data = payload.payload || {};

    // Extrage datele clientului
    const name    = data.data?.name      || data.data?.Name      || '—';
    const email   = data.data?.email     || data.data?.Email     || '—';
    const phone   = data.data?.phone     || data.data?.Phone     || data.data?.telefon || '—';
    const message = data.data?.message   || data.data?.Message   || data.data?.nachricht || data.data?.Nachricht || '—';
    const city    = data.data?.city      || data.data?.ort       || '—';
    const service = data.data?.service   || data.data?.leistung  || '—';

    // lead_id: generat client-side de formular; validat aici, cu fallback server-side
    // daca lipseste sau nu respecta formatul. Orice eroare in acest bloc e izolata —
    // NU trebuie sa opreasca trimiterea notificarilor Telegram/Email de mai jos.
    let lead_id = '—';
    try {
      const rawLeadId = data.data?.lead_id;
      lead_id = (typeof rawLeadId === 'string' && LEAD_ID_PATTERN.test(rawLeadId))
        ? rawLeadId
        : `PSS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8)}`;
    } catch (leadIdErr) {
      console.error('⚠️  lead_id fallback generation failed:', leadIdErr.message);
      lead_id = `PSS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${(Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 8)}`;
    }

    // Construieste mesajul Telegram
    const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
    const text = [
      `🔔 NOU LEAD — Perfekt Sauber Service`,
      `📅 ${now}`,
      ``,
      `👤 Nume: ${name}`,
      `📧 Email: ${email}`,
      `📱 Telefon: ${phone}`,
      `📍 Oras: ${city}`,
      `🔧 Serviciu: ${service}`,
      `💬 Mesaj: ${message}`,
      `📌 Lead ID: ${lead_id}`,
      ``,
      `🌐 perfektsauberservice.com`,
    ].join('\n');

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId   = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn('⚠️  TELEGRAM_BOT_TOKEN sau TELEGRAM_CHAT_ID lipsesc din env vars.');
    } else {
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      });

      const resJson = await res.json();

      if (res.ok) {
        console.log(`✅ Telegram trimis pentru lead: ${name} (${email})`);
      } else {
        console.error(`❌ Telegram eroare:`, JSON.stringify(resJson));
      }
    }

    // Al doilea canal, independent de Telegram: email prin Resend
    const resendKey = process.env.RESEND_API_KEY;
    const emailTo    = process.env.ALERT_EMAIL_TO;
    const emailFrom  = process.env.ALERT_EMAIL_FROM;

    if (!resendKey || !emailTo || !emailFrom) {
      console.warn('⚠️  RESEND_API_KEY, ALERT_EMAIL_TO sau ALERT_EMAIL_FROM lipsesc din env vars — email nesendut.');
    } else {
      const html = [
        `<h2>🔔 Nou lead — Perfekt Sauber Service</h2>`,
        `<p><strong>Data:</strong> ${now}</p>`,
        `<p><strong>Nume:</strong> ${name}</p>`,
        `<p><strong>Email:</strong> ${email}</p>`,
        `<p><strong>Telefon:</strong> ${phone}</p>`,
        `<p><strong>Oras:</strong> ${city}</p>`,
        `<p><strong>Serviciu:</strong> ${service}</p>`,
        `<p><strong>Mesaj:</strong> ${message}</p>`,
        `<p><strong>Lead ID:</strong> ${lead_id}</p>`,
      ].join('\n');

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom,
          to: emailTo,
          subject: `Nou lead: ${name} (${service})`,
          html,
        }),
      });

      if (emailRes.ok) {
        console.log(`✅ Email trimis pentru lead: ${name} (${email})`);
      } else {
        const emailErr = await emailRes.text();
        console.error(`❌ Email eroare:`, emailErr);
      }
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('❌ Eroare submission-created:', err.message);
    return { statusCode: 200, body: 'Eroare interna, lead logat.' };
  }
};
