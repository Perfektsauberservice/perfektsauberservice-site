/**
 * gbp-reviews-widget.js
 *
 * Single reusable component. Mounts into every element matching
 * `.gbp-reviews[data-gbp-reviews]` on the page. Fetches this site's own
 * static /data/google-reviews.json (never calls any Google endpoint from
 * the browser) and renders: star rating, review count, the latest 6
 * reviews (reviewer name, date, text, optional expandable owner reply),
 * and a direct button to the real Google profile. Falls back to the
 * mount point's own data-fallback-rating / data-fallback-count attributes
 * (the last verified 5.0/11) if the fetch fails, so something correct is
 * always shown.
 *
 * All dynamic text is inserted via textContent (never innerHTML), so no
 * manual escaping is needed and no XSS is possible via review content.
 *
 * No tracking, no cookies, no third-party requests. Runs once per page
 * load per mount point found.
 */
(function () {
  'use strict';

  var DATA_URL = '/data/google-reviews.json';
  var MAX_REVIEWS_SHOWN = 6;
  var FALLBACK_PROFILE_URL = 'https://maps.google.com/maps?cid=10440757061765338764';

  function formatRatingDe(n) {
    var num = Number(n);
    if (!isFinite(num)) return '';
    return num.toFixed(1).replace('.', ',');
  }

  function starsMarkup(container, rating) {
    var full = Math.round(Number(rating) || 0);
    var wrap = document.createElement('span');
    wrap.className = 'gbp-stars';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.textContent = '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
    container.appendChild(wrap);
  }

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function renderFallback(mount) {
    var rating = mount.getAttribute('data-fallback-rating') || '5.0';
    var count = mount.getAttribute('data-fallback-count') || '11';
    mount.innerHTML = '';
    mount.setAttribute('data-gbp-state', 'fallback');

    var summary = el('div', 'gbp-summary');
    starsMarkup(summary, Math.round(parseFloat(rating)));
    summary.appendChild(el('span', 'gbp-rating-num', formatRatingDe(rating)));
    summary.appendChild(el('span', 'gbp-count', count + ' Google-Bewertungen'));
    mount.appendChild(summary);

    var link = document.createElement('a');
    link.href = FALLBACK_PROFILE_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'gbp-cta btn btn-sec';
    link.textContent = 'Alle Google-Bewertungen ansehen';
    mount.appendChild(link);
  }

  function renderReview(review) {
    var li = el('li', 'gbp-review');

    var head = el('div', 'gbp-review-head');
    head.appendChild(el('span', 'gbp-review-author', review.displayName || 'Google-Nutzer'));
    if (review.starRating) {
      var s = el('span', 'gbp-review-stars');
      starsMarkup(s, review.starRating);
      head.appendChild(s);
    }
    if (review.date) {
      var time = document.createElement('time');
      time.className = 'gbp-review-date';
      time.setAttribute('datetime', review.date);
      time.textContent = new Date(review.date + 'T00:00:00').toLocaleDateString('de-DE', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      head.appendChild(time);
    }
    li.appendChild(head);

    li.appendChild(el('p', 'gbp-review-text', review.text || ''));

    if (review.ownerReply) {
      var details = document.createElement('details');
      details.className = 'gbp-owner-reply';
      var summary = document.createElement('summary');
      summary.textContent = 'Antwort des Inhabers anzeigen';
      details.appendChild(summary);
      var replyP = el('p', 'gbp-owner-reply-text', review.ownerReply);
      details.appendChild(replyP);
      if (review.replyDate) {
        var replyTime = document.createElement('time');
        replyTime.className = 'gbp-owner-reply-date';
        replyTime.setAttribute('datetime', review.replyDate);
        replyTime.textContent = new Date(review.replyDate + 'T00:00:00').toLocaleDateString('de-DE', {
          year: 'numeric', month: 'long', day: 'numeric',
        });
        details.appendChild(replyTime);
      }
      li.appendChild(details);
    }

    return li;
  }

  function renderData(mount, data) {
    mount.innerHTML = '';
    mount.setAttribute('data-gbp-state', 'loaded');

    var section = el('section', 'gbp-reviews-inner');
    section.setAttribute('aria-labelledby', mount.id + '-heading');

    var heading = el('h2', 'gbp-reviews-heading', 'Was unsere Kunden sagen');
    heading.id = mount.id + '-heading';
    section.appendChild(heading);

    var summary = el('div', 'gbp-summary');
    starsMarkup(summary, data.averageRating);
    summary.appendChild(el('span', 'gbp-rating-num', formatRatingDe(data.averageRating)));
    summary.appendChild(el('span', 'gbp-count', data.totalReviewCount + ' Google-Bewertungen'));
    section.appendChild(summary);

    var list = document.createElement('ul');
    list.className = 'gbp-review-list';
    var reviews = Array.isArray(data.reviews) ? data.reviews.slice(0, MAX_REVIEWS_SHOWN) : [];
    reviews.forEach(function (r) { list.appendChild(renderReview(r)); });
    section.appendChild(list);

    var link = document.createElement('a');
    link.href = data.directGoogleProfileUrl || FALLBACK_PROFILE_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'gbp-cta btn btn-sec';
    link.textContent = 'Alle Google-Bewertungen ansehen';
    section.appendChild(link);

    var attribution = el('p', 'gbp-attribution', 'Bewertungen über Google');
    section.appendChild(attribution);

    mount.appendChild(section);
  }

  function mountOne(mount) {
    if (mount.getAttribute('data-gbp-mounted') === 'true') return;
    mount.setAttribute('data-gbp-mounted', 'true');
    // Show correct fallback immediately -- avoids a layout shift from
    // empty to content, and guarantees something correct is visible even
    // if the fetch is slow or fails.
    renderFallback(mount);

    fetch(DATA_URL, { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || typeof data.averageRating !== 'number' || typeof data.totalReviewCount !== 'number') {
          throw new Error('Malformed review data');
        }
        renderData(mount, data);
      })
      .catch(function () {
        // Already showing the fallback -- nothing else to do.
      });
  }

  function init() {
    var mounts = document.querySelectorAll('.gbp-reviews[data-gbp-reviews]');
    mounts.forEach(mountOne);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
