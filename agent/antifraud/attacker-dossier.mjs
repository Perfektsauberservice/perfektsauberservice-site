// PSS Anti-Fraud — "attacker dossier": all click waves that match a known attacker signature, across
// days and changing IP addresses, as verifiable evidence for a lawyer / the police.
//   node agent/antifraud/attacker-dossier.mjs [--from 2026-08-15] [--send]
// Output: C:/tmp/pss-antifraud-data/attacker-dossier-<date>/ (report RO, Sachverhaltsdarstellung DE,
// waves.csv, signature-clicks.csv, ip-evidence.csv, manifest.sha256). --send: Telegram to Laura only.
// It does NOT name anyone: only the ISP (on request of the police / a court) can identify a subscriber.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { adsClient, loadEnv } from './ads-exclusions.mjs';
import { openStore, DATA_DIR } from './runner.mjs';
import { registryLookup } from './abuse-reporter.mjs';
import { ATTACKER_SIGNATURES } from '../../netlify/antifraud/config.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const eur = n => n.toFixed(2).replace('.', ',') + ' €';

async function geoNames(client, ids) {
  const out = {}; const list = [...ids].filter(Boolean);
  for (let i = 0; i < list.length; i += 50) for (const r of await client.search(`SELECT geo_target_constant.resource_name, geo_target_constant.name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${list.slice(i, i + 50).map(x => `'${x}'`).join(',')})`)) out[r.geoTargetConstant.resourceName] = r.geoTargetConstant.name;
  return out;
}

export async function buildAttackerDossier({ client, store, from, to, sig = ATTACKER_SIGNATURES[0], extraIps = [] }) {
  // 1) every ad click (click_view) in the period
  const days = []; for (let t = Date.parse(from); t <= Date.parse(to); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
  const clicks = [];
  for (const d of days) {
    try {
      for (const r of await client.search(`SELECT click_view.gclid, click_view.location_of_presence.city, click_view.keyword_info.text, segments.device, campaign.name, ad_group.name FROM click_view WHERE segments.date = '${d}'`)) {
        clicks.push({ d, gclid: r.clickView?.gclid, city: r.clickView?.locationOfPresence?.city, kw: r.clickView?.keywordInfo?.text || '', dev: r.segments?.device, camp: r.campaign?.name, ag: r.adGroup?.name });
      }
    } catch { /* day not available */ }
  }
  const names = await geoNames(client, new Set(clicks.map(c => c.city)));
  for (const c of clicks) c.place = names[c.city] || '?';
  const isSig = c => sig.adsPlaces.includes(c.place) && c.dev === 'MOBILE' && sig.adsKeywordRe.test(c.kw);
  const sigClicks = clicks.filter(isSig);

  // 2) hourly totals -> waves (>= 6 paid clicks in one hour on a day with signature clicks)
  const hourly = await client.search(`SELECT segments.date, segments.hour, metrics.clicks, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.clicks > 0`);
  const sigDays = new Set(sigClicks.map(c => c.d));
  const waves = hourly.filter(r => Number(r.metrics.clicks) >= 6 && sigDays.has(r.segments.date)).map(r => {
    const dayClicks = clicks.filter(c => c.d === r.segments.date), daySig = dayClicks.filter(isSig);
    return { date: r.segments.date, hour: Number(r.segments.hour), clicks: Number(r.metrics.clicks), cost: Number(r.metrics.costMicros) / 1e6,
      sigShare: dayClicks.length ? daySig.length / dayClicks.length : 0, places: [...new Set(daySig.map(c => c.place))].join('/'), keywords: [...new Set(daySig.map(c => c.kw))].slice(0, 3).join(', ') };
  }).filter(w => w.sigShare >= 0.4).sort((a, b) => (a.date + String(a.hour).padStart(2, '0')).localeCompare(b.date + String(b.hour).padStart(2, '0')));
  const daily = await client.search(`SELECT segments.date, metrics.clicks, metrics.invalid_clicks, metrics.average_cpc FROM customer WHERE segments.date BETWEEN '${from}' AND '${to}'`);
  const totClicks = daily.reduce((s, r) => s + Number(r.metrics.clicks || 0), 0);
  const totInvalid = daily.reduce((s, r) => s + Number(r.metrics.invalidClicks || 0), 0);
  const avgCpc = daily.reduce((s, r) => s + Number(r.metrics.averageCpc || 0) * Number(r.metrics.clicks || 0), 0) / 1e6 / (totClicks || 1);

  // 3) IP evidence: addresses blocked by protection tools (time from Google Ads change history) + our own captured events
  const ipRows = [];
  const hist = existsSync(`${DATA_DIR}/backup-2026-10-14/change-history-30d.json`) ? JSON.parse(readFileSync(`${DATA_DIR}/backup-2026-10-14/change-history-30d.json`, 'utf8')) : [];
  const seen = new Set();
  for (const r of hist) {
    const ip = (r.changeEvent?.newResource?.campaignCriterion?.ipBlock || {}).ipAddress;
    if (!ip || seen.has(ip) || !/^(176\.7\.|94\.134\.182\.|79\.238\.)/.test(ip)) continue;
    seen.add(ip); ipRows.push({ ip: ip.split('/')[0], firstSeen: r.changeEvent.changeDateTime.slice(0, 16), source: 'excluded by a click-protection tool (Google Ads change history)' });
  }
  for (const x of extraIps) if (!seen.has(x.ip)) { seen.add(x.ip); ipRows.push(x); }
  for (const b of (await store.list({ prefix: 'dec/' })).blobs) {
    const d = await store.get(b.key, { type: 'json' }).catch(() => null);
    if (d?.signature === sig.id && !seen.has(d.ip)) { seen.add(d.ip); ipRows.push({ ip: d.ip, firstSeen: new Date(d.t).toISOString().slice(0, 16), source: `PSS Anti-Fraud capture (${d.level}, SHA-256 evidence ${d.evidence})` }); }
  }
  for (const row of ipRows) {
    const reg = await registryLookup(row.ip).catch(() => ({}));
    row.network = reg.network?.name || ''; row.range = reg.network?.cidr || ''; row.abuse = (reg.abuseContacts || []).join(', ');
  }
  return { sig, from, to, clicks, sigClicks, waves, totClicks, totInvalid, avgCpc, ipRows,
    waveCost: waves.reduce((s, w) => s + w.cost, 0), sigCostEst: sigClicks.length * avgCpc };
}

export function renderDossier(D) {
  const f = d => d.split('-').reverse().join('.');
  const files = {};
  files['waves.csv'] = '\ufeffdatum;stunde;bezahlte_klicks;kosten_eur;anteil_signatur;orte;keywords\n' + D.waves.map(w => [f(w.date), `${w.hour}:00`, w.clicks, w.cost.toFixed(2), Math.round(w.sigShare * 100) + '%', w.places, `"${w.keywords}"`].join(';')).join('\n') + '\n';
  files['signature-clicks.csv'] = '\ufeffdatum;gclid;kampagne;anzeigengruppe;keyword;ort_laut_google;geraet\n' + D.sigClicks.map(c => [f(c.d), c.gclid, c.camp, c.ag, c.kw, c.place, c.dev].join(';')).join('\n') + '\n';
  files['ip-evidence.csv'] = '\ufeffip;erstmals;quelle;netz;bereich;abuse_kontakt\n' + D.ipRows.map(r => [r.ip, r.firstSeen, `"${r.source}"`, r.network, r.range, r.abuse].join(';')).join('\n') + '\n';
  files['report-ro.md'] = [`# Dosarul atacatorului — ${D.sig.label}`, `Perioada analizată: ${f(D.from)} – ${f(D.to)}`, '',
    '## Rezumat',
    `- ${D.sigClicks.length} clicuri plătite cu semnătura (loc Google: ${D.sig.adsPlaces.join(' / ')}, mobil, Haushalts-/Wohnungsauflösung) din ${D.totClicks} clicuri plătite în total.`,
    `- ${D.waves.length} valuri (≥ 6 clicuri plătite într-o oră, dominate de semnătură); cost al orelor de val: ${eur(D.waveCost)}.`,
    `- Cost estimat al clicurilor cu semnătura: ${eur(D.sigCostEst)} (CPC mediu ${eur(D.avgCpc)}). Google a recunoscut separat ${D.totInvalid} clicuri ca invalide (nefacturate).`,
    `- ${D.ipRows.length} adrese IP blocate ca suspecte în perioadă (operatori: ${[...new Set(D.ipRows.map(r => r.network).filter(Boolean))].join(', ') || '—'}). Legătura fiecărui IP cu un anumit val NU este dovedită; sunt puncte de plecare pentru cererea poliției către furnizori.`, '',
    '## Valuri', '| Data | Ora | Clicuri | Cost | Semnătură | Locuri | Cuvinte cheie |', '|---|---|---|---|---|---|---|',
    ...D.waves.map(w => `| ${f(w.date)} | ${w.hour}:00 | ${w.clicks} | ${eur(w.cost)} | ${Math.round(w.sigShare * 100)}% | ${w.places} | ${w.keywords} |`), '',
    '## Adrese IP (blocate ca suspecte — legătura cu valurile nedovedită)', '| IP | Prima dată | Sursa | Rețea | Interval | Abuse |', '|---|---|---|---|---|---|',
    ...D.ipRows.map(r => `| ${r.ip} | ${r.firstSeen} | ${r.source} | ${r.network} | ${r.range} | ${r.abuse} |`), '',
    '## Concluzie (ipoteză, nu identificare)',
    '- Tiparul constant (aceleași două localități alternând, mereu mobil, aceleași cuvinte cheie, după-amiaza) indică o singură sursă recurentă, nu clienți întâmplători.',
    '- Persoana nu poate fi identificată din aceste date. Doar furnizorul de internet poate asocia un IP + oră cu un abonat, iar asta numai la cererea poliției sau a unei instanțe.',
    '- Pasul legal: plângere penală (Strafanzeige) la poliție sau prin avocat, cu acest dosar (vezi sachverhalt-de.md).'].join('\n') + '\n';
  files['sachverhalt-de.md'] = [`# Sachverhaltsdarstellung — wiederholte, mutmaßlich missbräuchliche Klicks auf Google-Ads-Anzeigen`, '',
    'Anzeigende: Laura Craciun, Perfekt Sauber Service, Reutstraße 9, 76597 Loffenau, kontakt@perfektsauberservice.com', `Zeitraum: ${f(D.from)} bis ${f(D.to)} · Google-Ads-Konto 984-766-7839`, '',
    '## Sachverhalt',
    `Seit dem ${D.waves.length ? f(D.waves[0].date) : f(D.from)} treten wiederholt „Klickwellen“ auf unsere Google-Ads-Anzeigen auf: innerhalb einer Stunde ${Math.min(...D.waves.map(w => w.clicks), 99)} bis ${Math.max(...D.waves.map(w => w.clicks), 0)} bezahlte Klicks, fast ausschließlich von Mobilgeräten, laut Google-Standortdaten aus ${D.sig.adsPlaces.join(' bzw. ')}, stets auf Suchbegriffe zu Haushalts-/Wohnungsauflösung, ohne anschließende Kontaktaufnahme. Insgesamt ${D.sigClicks.length} Klicks mit diesem Muster in ${D.waves.length} Wellen; Kosten der Wellenstunden ca. ${eur(D.waveCost)}.`,
    '', '## Beweismittel (beigefügt, mit SHA-256-Prüfsummen)',
    '- waves.csv: Datum, Stunde, Anzahl bezahlter Klicks und Kosten je Welle (Quelle: Google Ads API, Konto 984-766-7839)',
    '- signature-clicks.csv: jeder Einzelklick mit Google-Klick-ID (GCLID), Kampagne, Keyword, Ort laut Google, Gerät — bei Google Ads überprüfbar',
    `- ip-evidence.csv: ${D.ipRows.length} IP-Adressen, die im Zeitraum von Klickschutz-Systemen als auffällig erfasst bzw. gesperrt wurden, mit Zeitpunkt, Netzbetreiber, registriertem Adressbereich und Abuse-Kontakt (RIPE/RDAP). Die Zuordnung einzelner Adressen zu einzelnen Wellen ist nicht belegt; sie dienen als Ansatzpunkt für Auskunftsersuchen.`, '',
    '## Bitte',
    'Wir bitten um Prüfung des Sachverhalts (ggf. Computerbetrug, § 263a StGB, bzw. gezielte Behinderung eines Mitbewerbers, § 4 Nr. 4 UWG) und um Auskunftsersuchen an die Netzbetreiber zu den aufgeführten IP-Adressen und Zeitpunkten. Die rechtliche Würdigung bleibt Ihnen vorbehalten. Wir behaupten nicht, dass ein bestimmter Anschlussinhaber gehandelt hat.',
    '', 'Loffenau, den ' + new Date().toLocaleDateString('de-DE'), 'Laura Craciun'].join('\n') + '\n';
  files['manifest.sha256'] = Object.keys(files).map(n => `${createHash('sha256').update(Buffer.from(files[n], 'utf8')).digest('hex')}  ${n}`).join('\n') + '\n';
  return files;
}

async function main() {
  const from = arg('from', '2026-08-15'), to = arg('to', new Date(Date.now() - 864e5).toISOString().slice(0, 10));
  const D = await buildAttackerDossier({ client: adsClient(loadEnv()), store: openStore('prod'), from, to,
    extraIps: [{ ip: '176.7.201.161', firstSeen: '2026-10-06', source: 'reported by the ClickCease dashboard (screenshot, 06.10.2026)' },
      { ip: '176.7.196.66', firstSeen: '2026-10-15 02:16', source: 'excluded by a click-protection tool (Google Ads change history)' }] });
  const files = renderDossier(D);
  const dir = `${DATA_DIR}/attacker-dossier-${new Date().toISOString().slice(0, 10)}`; mkdirSync(dir, { recursive: true });
  for (const [n, body] of Object.entries(files)) writeFileSync(`${dir}/${n}`, body);
  console.log(JSON.stringify({ dir, sigClicks: D.sigClicks.length, waves: D.waves.length, waveCost: D.waveCost.toFixed(2), sigCostEst: D.sigCostEst.toFixed(2), ips: D.ipRows.length }, null, 1));
  if (process.argv.includes('--send')) {
    const tg = loadEnv('C:/tmp/pss-ads-agents/.env');
    process.env.TELEGRAM_BOT_TOKEN = tg.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_CHAT_ID = tg.TELEGRAM_CHAT_ID;
    const { notifier } = await import('../../netlify/antifraud/server.mjs');
    const { notify, sendDocument } = notifier({ deploy: { context: 'production' } });   // owner only
    await notify(`🗂️ PSS Anti-Fraud — dosarul atacatorului (${D.sig.label})\n${D.sigClicks.length} clicuri cu semnătura, ${D.waves.length} valuri, ~${eur(D.waveCost)} în orele de val, ${D.ipRows.length} IP-uri.\nPentru avocat / poliție: sachverhalt-de.md + cele 3 tabele. Nu s-a trimis nimic nimănui.`);
    for (const n of ['report-ro.md', 'sachverhalt-de.md', 'waves.csv', 'signature-clicks.csv', 'ip-evidence.csv', 'manifest.sha256']) await sendDocument(`dosar-atacator_${n}`, files[n]);
  }
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('attacker-dossier.mjs')) main();
