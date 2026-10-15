/* PSS Anti-Fraud — human/robot signal. Loaded ONLY on pages opened from a Google Ads click
   (injected by the af-capture edge function). No cookies, no storage, no personal data:
   it reports time on page, scroll depth and number of interactions once, when the page is left. */
(function () {
  try {
    var q = new URLSearchParams(location.search);
    var cid = q.get('gclid') || q.get('gbraid') || q.get('wbraid');
    if (!cid || !navigator.sendBeacon) return;
    var t0 = Date.now(), maxScroll = 0, inter = 0, sent = false;
    function onScroll() {
      var h = document.documentElement, max = (h.scrollHeight - h.clientHeight) || 1;
      maxScroll = Math.max(maxScroll, Math.min(100, Math.round((h.scrollTop || document.body.scrollTop) / max * 100)));
    }
    function onInter() { inter++; }
    function beacon() {
      navigator.sendBeacon('/af-b', JSON.stringify({ cid: cid, dwell: Date.now() - t0, scroll: maxScroll, inter: inter }));
    }
    function send() { if (sent) return; sent = true; beacon(); }
    setTimeout(function () { if (!sent) beacon(); }, 8000);   // interim: "still here after 8 s" (final report overwrites it)
    addEventListener('scroll', onScroll, { passive: true });
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (e) { addEventListener(e, onInter, { passive: true }); });
    addEventListener('pagehide', send);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') send(); });
    setTimeout(send, 60000);   // long visits: report after 1 minute
  } catch (e) { /* never break the page */ }
})();
