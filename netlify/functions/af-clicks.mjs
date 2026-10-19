// PSS Anti-Fraud — today's ad clicks as a table (same layout as in the reports to Laura).
//   /af-clicks/<token>            today
//   /af-clicks/<token>?d=2026-10-19  a given day
// The token is a random secret stored in Netlify Blobs (cfg/clicks-token); the page contains IPs,
// so it is unlisted, not indexed and never cached.
import { adsClient } from '../../agent/antifraud/ads-exclusions.mjs';
import { clickRows } from '../../agent/antifraud/click-rows.mjs';
import { adsEnvFromNetlify, storeFor } from '../antifraud/server.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async (req, context) => {
  const url = new URL(req.url);
  const token = url.pathname.split('/').pop();
  const headers = { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' };
  const store = storeFor(context);
  const cfg = await store.get('cfg/clicks-token', { type: 'json' }).catch(() => null);
  if (!cfg?.token || token !== cfg.token) return new Response('Not found', { status: 404, headers });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('d') || '') ? url.searchParams.get('d') : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const { env, missing } = adsEnvFromNetlify();
  const client = missing.length ? null : adsClient(env);
  const rows = await clickRows({ store, client, day });
  let totals = null;
  if (client) { try { totals = (await client.search(`SELECT metrics.clicks, metrics.invalid_clicks, metrics.cost_micros FROM customer WHERE segments.date = '${day}'`))[0]?.metrics; } catch { /* ignore */ } }
  const visitors = new Set(rows.map(r => r.ip)).size;
  const prev = new Date(Date.parse(day) - 864e5).toISOString().slice(0, 10), next = new Date(Date.parse(day) + 864e5).toISOString().slice(0, 10);
  const body = rows.map(r => `<tr><td>${esc(r.time)}</td><td class="ip">${esc(r.ip)}</td><td>${esc(r.network)}</td><td>${esc(r.device)}</td>
    <td>${esc(r.behaviour)}${r.reloads ? `, apoi reîncărcare` : ''}${r.page && r.page !== '/' ? ` <span class="pg">(${esc(r.page.replace(/^\//, ''))})</span>` : ''}</td>
    <td>${esc(r.keyword || '—')}</td><td>${r.icon} ${esc(r.verdict)}</td></tr>`).join('\n');
  return new Response(`<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Clicuri din reclame — ${esc(day)}</title>
<style>
:root{--bg:#ffffff;--fg:#1f2328;--muted:#656d76;--line:#d0d7de;--head:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#1e1e1e;--fg:#e6e6e6;--muted:#9aa0a6;--line:#3c3c3c;--head:#262626}}
body{margin:0;padding:16px;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:18px;margin:0 0 6px} .sum{color:var(--muted);margin:0 0 12px} .sum b{color:var(--fg)}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;min-width:760px} th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:var(--head);font-weight:600;white-space:nowrap} td.ip{font-weight:600;white-space:nowrap} .pg{color:var(--muted)}
nav{margin:12px 0;display:flex;gap:16px} nav a{color:#1f6feb;text-decoration:none}
</style></head><body>
<h1>Clicuri din reclame — ${esc(day.split('-').reverse().join('.'))}</h1>
<p class="sum"><b>${rows.length}</b> clicuri de la <b>${visitors}</b> vizitatori${totals ? ` · Google: <b>${totals.clicks || 0}</b> plătite, <b>${totals.invalidClicks || 0}</b> invalide, <b>${(Number(totals.costMicros || 0) / 1e6).toFixed(2).replace('.', ',')} €</b>` : ''} · actualizat ${esc(new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour12: false }).slice(0, 5))}</p>
<div class="wrap"><table><thead><tr><th>Ora</th><th>IP</th><th>Rețea, loc</th><th>Dispozitiv</th><th>Pe pagină</th><th>Cuvânt cheie</th><th>Concluzie</th></tr></thead>
<tbody>${body || '<tr><td colspan="7">Niciun clic din reclame în această zi.</td></tr>'}</tbody></table></div>
<nav><a href="?d=${prev}">← ziua anterioară</a>${day < new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) ? `<a href="?d=${next}">ziua următoare →</a>` : ''}</nav>
</body></html>`, { status: 200, headers });
};

export const config = { path: '/af-clicks/*' };
