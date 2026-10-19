// PSS Abuse mail page: /af-mail/<token>
// Opens Laura's own mail app with the abuse report already filled in (mailto: to the ISP's official
// abuse address, German subject + text + the evidence rows). Nothing is sent automatically: Laura
// presses "Send" in her mail app, from her own address. Tokens are random, expire after 14 days,
// and the page is not indexed.
import { storeFor } from '../antifraud/server.mjs';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async (req, context) => {
  const token = new URL(req.url).pathname.split('/').pop();
  const headers = { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' };
  if (!/^[a-f0-9]{24}$/.test(token)) return new Response('Not found', { status: 404, headers });
  const m = await storeFor(context).get(`mail/${token}`, { type: 'json' }).catch(() => null);
  if (!m || Date.now() - m.t > 14 * 864e5) return new Response('Link expirat sau inexistent.', { status: 404, headers });
  const href = `mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
  return new Response(`<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mail de abuz — ${esc(m.ip)}</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:24px;max-width:720px;color:#1a2030}
a.b{display:block;text-align:center;background:#1f6feb;color:#fff;padding:16px;border-radius:12px;text-decoration:none;font-weight:600;margin:16px 0}
pre{white-space:pre-wrap;background:#f4f4f4;padding:12px;border-radius:8px;font-size:13px}</style></head><body>
<h2>📧 Mail de abuz pentru ${esc(m.ip)}</h2>
<p>Către: <b>${esc(m.to)}</b> (contactul oficial de abuz al operatorului)</p>
<a class="b" href="${href}">Deschide în aplicația de mail</a>
<p>Se deschide aplicația ta de mail cu totul completat. Verifică textul și apasă <b>Trimite</b>. Dacă nu se deschide, copiază textul de mai jos.</p>
<p><b>Subiect:</b> ${esc(m.subject)}</p><pre>${esc(m.body)}</pre>
<script>setTimeout(function(){location.href=${JSON.stringify(href)}},400)</script></body></html>`, { status: 200, headers });
};

export const config = { path: '/af-mail/*' };
