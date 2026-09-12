/**
 * PS Lead Ping — shared click-to-lead beacon script (Stage 1 pilot
 * prerequisite). See docs/superpowers/specs/2026-09-08-lead-click-ping-design.md
 * and the Stage 1 sitewide-expansion plan.
 *
 * NOT WIRED TO ANY PAGE YET. This file exists only as the shared-script
 * foundation; a <script src="/js/ps-lead-ping.js"> tag is added to pages
 * only once Stage 1 page-wiring is explicitly approved.
 *
 * Runs as a second, fully independent click listener next to whatever
 * per-page inline gtag click tracking already exists on a page:
 *   - never calls preventDefault() or stopPropagation()
 *   - never removes or replaces any existing listener
 *   - fires netlify/functions/lead-click-ping.mjs via sendBeacon, same
 *     payload shape as the existing 8-pilot-page inline implementation
 *     ({ type, page, ts, attribution }), plus an additive ps_session_id
 *     field so repeated clicks in one browser session can be correlated.
 *
 * ps_session_id: a random, non-PII, sessionStorage-backed id — one per
 * browser tab/session, reused across every lead click in that session,
 * and never derived from or written into ps_attribution (kept separate
 * on purpose so attribution capture logic is untouched by this script).
 */
(function () {
  'use strict';

  var SESSION_KEY = 'ps_session_id';
  var ATTRIBUTION_KEY = 'ps_attribution';
  var ENDPOINT = '/.netlify/functions/lead-click-ping';

  function getSessionId() {
    try {
      var existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      var id = 'ps_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(SESSION_KEY, id);
      return id;
    } catch (e) {
      return '';
    }
  }

  function getAttribution() {
    try {
      var raw = sessionStorage.getItem(ATTRIBUTION_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  // One classification per link — mirrors the existing inline
  // tel:/wa.me|api.whatsapp/mailto: contract, first match wins.
  function classify(href) {
    if (href.indexOf('tel:') === 0) return 'phone';
    if (href.indexOf('wa.me') > -1 || href.indexOf('api.whatsapp') > -1) return 'whatsapp';
    if (href.indexOf('mailto:') === 0) return 'email';
    return null;
  }

  function sendPing(type, page) {
    try {
      var payload = JSON.stringify({
        type: type,
        page: page,
        ts: new Date().toISOString(),
        attribution: getAttribution(),
        ps_session_id: getSessionId(),
      });
      navigator.sendBeacon(ENDPOINT, payload);
    } catch (e) {}
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var type = classify(href);
    if (!type) return;
    sendPing(type, location.pathname);
  });
})();
