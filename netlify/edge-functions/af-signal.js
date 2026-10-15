// PSS Anti-Fraud — behaviour beacon (/af-b) and bot trap (/af-trap).
//  /af-b    POST from js/af-b.js: time on page, scroll, interactions for one ad click (no cookies)
//  /af-trap a link invisible to people, present only on pages opened from an ad click.
//           Anything that requests it is an automated client -> strong signal for its IP.
import { getStore } from '@netlify/blobs';
import { sha256Hex, enc } from '../antifraud/pipeline.mjs';
import { STORE_NAME } from '../antifraud/config.mjs';

export default async (request, context) => {
  const isProd = (context.deploy?.context || '') === 'production';
  const store = getStore({ name: isProd ? STORE_NAME : `${STORE_NAME}-test`, consistency: 'strong' });
  const url = new URL(request.url);
  const ip = (!isProd && url.searchParams.get('af_test_ip')) || context.ip;
  try {
    if (url.pathname === '/af-b' && request.method === 'POST') {
      const body = JSON.parse((await request.text()).slice(0, 2000) || '{}');
      if (!body.cid) return new Response(null, { status: 204 });
      const cidHash = (await sha256Hex(String(body.cid))).slice(0, 16);
      await store.setJSON(`beh/${enc(ip)}/${cidHash}`, {
        t: Date.now(), dwell: Math.max(0, Math.min(Number(body.dwell) || 0, 36e5)),
        scroll: Math.max(0, Math.min(Number(body.scroll) || 0, 100)), inter: Math.max(0, Math.min(Number(body.inter) || 0, 10000)),
      });
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/af-trap') {
      await store.setJSON(`trap/${enc(ip)}/${String(Date.now()).padStart(13, '0')}`, { t: Date.now(), ua: (request.headers.get('user-agent') || '').slice(0, 200) });
      return new Response('', { status: 404, headers: { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' } });
    }
  } catch (e) {
    console.error('af-signal', e);
  }
  return new Response(null, { status: 204 });
};

export const config = { path: ['/af-b', '/af-trap'] };
