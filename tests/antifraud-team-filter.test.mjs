import test from 'node:test';
import assert from 'node:assert/strict';
import { teamCopy } from '../netlify/antifraud/team-filter.mjs';

test('agency proposals are removed from the team copy; the rest of the summary stays', () => {
  const summary = ['📊 PSS Anti-Fraud — rezumat 2026-10-15', 'Google Ads: 9 clicuri plătite, 16.20 €', 'Excluderi: 1 aplicate — 94.134.182.67/32',
    '🗺️ Propunere pentru agenție (NU s-a aplicat nimic): verificați excluderea sau reducerea licitării pentru Daxlanden (37% din clicuri, 100% mobil)'].join('\n');
  const c = teamCopy(summary);
  assert.ok(!/agen/i.test(c)); assert.match(c, /Excluderi: 1 aplicate/);
});

test('ghost-click alert loses only its agency line', () => {
  const ghost = '👻 PSS Anti-Fraud — clicuri fantomă\nOra 12:00–13:00: 6 clicuri plătite, doar 1 au ajuns pe site\nDe unde:\n   Daxlanden · MOBILE · haushaltsauflösung rastatt ×5\nPropunere pentru agenție: verificați zona / programul.';
  const c = teamCopy(ghost);
  assert.ok(!/agen/i.test(c)); assert.match(c, /Daxlanden · MOBILE/);
});

test('campaign names "amgads | ..." are not agency remarks and are kept', () => {
  const applied = '🛡️ PSS Anti-Fraud — modul excludere\n✅ APLICAT: 94.134.182.67/32\namgads | search_rastatt: s-ar adăuga\namgads | search_baden baden: s-ar adăuga';
  assert.equal(teamCopy(applied), applied);
});

test('messages about Madalina / the agency are not sent to the team at all', () => {
  assert.equal(teamCopy('🧾 Madalina a făcut 512 modificări'), null);
  assert.equal(teamCopy('Agenția a modificat bugetul\nMădălina a schimbat licitarea'), null);
});
