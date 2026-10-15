// PSS Anti-Click-Fraud — capture edge function (V1, shadow mode).
// Runs before the page on every request, but only acts on visits that carry a
// Google Ads click id (gclid / gbraid / wbraid). The page is never delayed or
// blocked: all work happens in context.waitUntil() after the response starts.

import { getStore } from '@netlify/blobs';
import { processClick, sha256Hex } from '../antifraud/pipeline.mjs';
import { STORE_NAME } from '../antifraud/config.mjs';
import { lookupNet } from '../antifraud/netinfo.mjs';
import { teamCopy } from '../antifraud/team-filter.mjs';

// Added only to pages opened from an ad click: behaviour beacon + a link no person can see or use.
const INJECT = '<script src="/js/af-b.js" defer></script>'
  + '<a href="/af-trap" rel="nofollow" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden">.</a>';

async function injectSignals(context) {
  const res = await context.next();
  try {
    if (res.status !== 200 || !(res.headers.get('content-type') || '').includes('text/html')) return res;
    const html = await res.text();
    const i = html.lastIndexOf('</body>');
    if (i === -1) return new Response(html, { status: res.status, headers: res.headers });
    const headers = new Headers(res.headers);
    headers.delete('content-length'); headers.delete('content-encoding'); headers.delete('etag');
    headers.set('cache-control', 'private, no-store');
    return new Response(html.slice(0, i) + INJECT + html.slice(i), { status: 200, headers });
  } catch (e) {
    console.error('af-capture inject', e);
    return res;
  }
}

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
    const testIp = !isProd && url.searchParams.get('af_test_ip');
    const ip = testIp || context.ip;
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
      geo: testIp ? {} : {   // simulated IP: let the network lookup provide the location
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
      mode: env('AF_MODE') === 'shadow' ? 'shadow' : (isProd ? 'enforce' : 'shadow'),   // Laura 14.10: live = real exclusions
      allowlist: (env('AF_ALLOWLIST') || '').split(',').map(s => s.trim()).filter(Boolean),
      lookup: addr => lookupNet(addr, { ipinfoToken: token }),   // RIPEstat first, ipinfo fallback
      // start the exclusion executor right away (it only reads the queue, takes no input)
      trigger: () => fetch(`${url.origin}/.netlify/functions/af-exclude`, { method: 'POST' }),
      notify: async (text, decision) => {
        const bot = env('TELEGRAM_BOT_TOKEN'), chat = env('TELEGRAM_CHAT_ID');
        if (!bot || !chat) { await store.setJSON('health/telegram', { t: Date.now(), ok: false, status: 'missing TELEGRAM_* env' }); return; }
        const prefix = isProd ? '' : `[TEST ${deployContext}] `;
        const r = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, text: prefix + text, disable_web_page_preview: true }),
        });
        const body = await r.json().catch(() => ({}));
        await store.setJSON('health/telegram', { t: Date.now(), ok: !!body.ok, status: r.status, messageId: body.result?.message_id || null });
        if (!body.ok) throw new Error(`telegram ${r.status} ${body.description || ''}`);
        // exclusions also go to the approved team recipients (e.g. the Ads agency)
        const copy = teamCopy(text);   // never agency / Madalina remarks in copies for the team
        if (decision?.level === 'recommend_exclude' && copy) {
          for (const rb of (await store.list({ prefix: 'tg/recipients/' })).blobs) {
            await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ chat_id: rb.key.split('/').pop(), text: prefix + copy, disable_web_page_preview: true }) }).catch(() => {});
          }
        }
      },
    };
    context.waitUntil(processClick(deps, event).then(
      res => store.setJSON(`health/last`, { t: event.t, level: res.decision.level, ms: res.timings.done - res.timings.start }),
      err => store.setJSON(`health/error/${event.t}`, { t: event.t, error: String(err?.stack || err).slice(0, 800) }),
    ));
    return await injectSignals(context);
  } catch (err) {
    console.error('af-capture', err);   // never break the page
  }
};

export const config = {
  path: '/*',
  // static files never carry an ad click id; skipping them saves edge invocations
  excludedPath: ['/images/*', '/css/*', '/js/*', '/fonts/*', '/data/*', '/*.css', '/*.js', '/*.webp', '/*.jpg', '/*.jpeg', '/*.png',
    '/*.svg', '/*.ico', '/*.woff2', '/*.woff', '/*.json', '/*.xml', '/*.txt', '/*.pdf', '/.netlify/*'],
};
