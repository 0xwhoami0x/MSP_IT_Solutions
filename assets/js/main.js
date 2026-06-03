/* ============================================================
   main.js — Shared page behavior
   Loaded on every page.
   ============================================================ */

(function () {
  'use strict';

  /* ── Scroll fade-in animations ──────────────────────────────
     Elements with class="fade-in" animate into view when they
     enter the viewport. CSS handles the transition — this adds
     "visible" at the right time and then stops observing to
     avoid any memory leak from keeping references alive.
  ------------------------------------------------------------ */
  const fadeEls = document.querySelectorAll('.fade-in');

  if (fadeEls.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target); // stop watching once visible — no leak
        }
      });
    }, { threshold: 0.1 });

    fadeEls.forEach(function (el) { observer.observe(el); });
  } else {
    // Fallback: just show everything if IntersectionObserver not supported
    fadeEls.forEach(function (el) { el.classList.add('visible'); });
  }


  /* ── Active nav link highlight ──────────────────────────────
     Compares current URL to each nav link href and adds
     class="active" so the current page tab is highlighted.
  ------------------------------------------------------------ */
  var currentPath = window.location.pathname.replace(/\/$/, '');

  document.querySelectorAll('nav ul a').forEach(function (link) {
    try {
      var linkPath = new URL(link.href, window.location.origin)
                      .pathname.replace(/\/$/, '');
      if (linkPath === currentPath) {
        link.classList.add('active');
      }
    } catch (e) {
      // Malformed href — skip silently
    }
  });

})();
