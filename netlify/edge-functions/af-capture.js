// PSS Anti-Click-Fraud — capture edge function (V1, shadow mode).
// Runs before the page on every request, but only acts on visits that carry a
// Google Ads click id (gclid / gbraid / wbraid). The page is never delayed or
// blocked: all work happens in context.waitUntil() after the response starts.

import { getStore } from '@netlify/blobs';
import { processClick, sha256Hex } from '../antifraud/pipeline.mjs';
import { STORE_NAME } from '../antifraud/config.mjs';

const CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid'];

export default async (request, context) => {
  try {
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    const cidType = CLICK_PARAMS.find(p => url.searchParams.get(p));
    if (!cidType) return;
    if (url.pathname.endsWith('.html')) return;            // strip-html redirects first; capture the final URL once
    if (/\.[a-z0-9]{2,5}$/i.test(url.pathname)) return;    // assets

    const deployContext = context.deploy?.context || 'unknown';
    const isProd = deployContext === 'production';
    // Test hook (never honoured in production): simulate another visitor IP.
    const ip = (!isProd && url.searchParams.get('af_test_ip')) || context.ip;
    const h = request.headers;
    const ua = h.get('user-agent') || '';
    const lang = h.get('accept-language') || '';
    const fp = (await sha256Hex(['pss-af-v1', ua, lang, h.get('sec-ch-ua') || '', h.get('sec-ch-ua-platform') || '', h.get('sec-ch-ua-mobile') || ''].join('|'))).slice(0, 24);

    const event = {
      t: Date.now(),
      ip,
      cid: url.searchParams.get(cidType),
      cidType,
      path: url.pathname,
      query: url.search.slice(0, 500),
      ua: ua.slice(0, 300),
      lang: lang.slice(0, 100),
      referer: (h.get('referer') || '').slice(0, 200),
      geo: {
        country: context.geo?.country?.code || null,
        subdivision: context.geo?.subdivision?.code || null,
        city: context.geo?.city || null,
        timezone: context.geo?.timezone || null,
      },
      fp,
      requestId: h.get('x-nf-request-id') || null,
      context: deployContext,
    };

    const env = name => (globalThis.Netlify?.env?.get(name) ?? undefined);
    const store = getStore({ name: isProd ? STORE_NAME : `${STORE_NAME}-test`, consistency: 'strong' });
    const token = env('IPINFO_TOKEN');
    const deps = {
      store,
      now: () => Date.now(),
      mode: env('AF_MODE') === 'enforce' ? 'enforce' : 'shadow',
      allowlist: (env('AF_ALLOWLIST') || '').split(',').map(s => s.trim()).filter(Boolean),
      lookup: async addr => {
        const r = await fetch(`https://ipinfo.io/${encodeURIComponent(addr)}/json${token ? `?token=${token}` : ''}`, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error(`ipinfo ${r.status}`);
        return r.json();
      },
      notify: async text => {
        const bot = env('TELEGRAM_BOT_TOKEN'), chat = env('TELEGRAM_CHAT_ID');
        if (!bot || !chat) return;
        const prefix = isProd ? '' : `[TEST ${deployContext}] `;
        await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, text: prefix + text, disable_web_page_preview: true }),
        });
      },
    };
    context.waitUntil(processClick(deps, event).then(
      res => store.setJSON(`health/last`, { t: event.t, level: res.decision.level, ms: res.timings.done - res.timings.start }),
      err => store.setJSON(`health/error/${event.t}`, { t: event.t, error: String(err?.stack || err).slice(0, 800) }),
    ));
  } catch (err) {
    console.error('af-capture', err);   // never break the page
  }
};

export const config = { path: '/*' };
