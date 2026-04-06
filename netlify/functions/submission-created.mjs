/**
 * Agent 8 — Lead Notifier
 * Netlify apeleaza aceasta functie automat cand cineva trimite un formular.
 * Trimite notificare instantanee pe WhatsApp via CallMeBot (gratuit).
 *
 * Variabile necesare in Netlify Dashboard → Site Settings → Environment Variables:
 *   WHATSAPP_PHONE     = numarul tau de telefon international fara + (ex: 49163908xxxx)
 *   CALLMEBOT_API_KEY  = cheia primita de la CallMeBot (vezi instructiuni mai jos)
 *
 * Cum activezi CallMeBot (o singura data, 2 minute):
 *   1. Salveaza +34 644 59 08 19 in WhatsApp (numele: CallMeBot)
 *   2. Trimite mesajul: "I allow callmebot to send me messages"
 *   3. Primesti API key in cateva secunde
 *   4. Adauga key-ul in Netlify Environment Variables ca CALLMEBOT_API_KEY
 */

export const handler = async (event) => {
  try {
    const payload = JSON.parse(event.body);
    const data = payload.payload || {};
    const formName = data.form_name || 'formular';

    // Extrage datele clientului
    const name    = data.data?.name    || data.data?.Name    || '—';
    const email   = data.data?.email   || data.data?.Email   || '—';
    const phone   = data.data?.phone   || data.data?.Phone   || data.data?.telefon || '—';
    const message = data.data?.message || data.data?.Message || data.data?.nachricht || data.data?.Nachricht || '—';
    const city    = data.data?.city    || data.data?.ort     || '—';
    const service = data.data?.service || data.data?.leistung || '—';

    // Construieste mesajul WhatsApp
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
      ``,
      `📋 Formular: ${formName}`,
      `🌐 Site: perfektsauberservice.com`,
    ].join('\n');

    // Trimite WhatsApp via CallMeBot
    const whatsappPhone = process.env.WHATSAPP_PHONE;
    const callmebotKey  = process.env.CALLMEBOT_API_KEY;

    if (!whatsappPhone || !callmebotKey) {
      console.warn('⚠️  WHATSAPP_PHONE sau CALLMEBOT_API_KEY lipsesc din env vars.');
      return { statusCode: 200, body: 'Lead primit, WhatsApp nesenduit (env vars lipsa).' };
    }

    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://api.callmebot.com/whatsapp.php?phone=${whatsappPhone}&text=${encodedText}&apikey=${callmebotKey}`;

    const res = await fetch(whatsappUrl);
    const resText = await res.text();

    if (res.ok) {
      console.log(`✅ WhatsApp trimis pentru lead: ${name} (${email})`);
    } else {
      console.error(`❌ CallMeBot eroare: ${res.status} — ${resText}`);
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('❌ Eroare submission-created:', err.message);
    // Returnam 200 oricum ca Netlify sa nu retrimita
    return { statusCode: 200, body: 'Eroare interna, lead logat.' };
  }
};
