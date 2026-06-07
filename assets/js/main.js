/* ============================================================
   main.js — Shared page behavior  v4
     1. Scroll fade-in animations  (class="fade-in")
     2. Active nav-link highlight
     3. Lightbox for images marked  lightbox="true"
   Self-contained: no dependencies on nav.js or any page CSS.
   ============================================================ */
(function () {
  'use strict';

  /* ── 1. Scroll fade-in animations ───────────────────────────
     FIXED: threshold lowered to 0.05 so tall elements on mobile
     (assessment block, service cards) reliably trigger even when
     they fill most of the viewport. Elements above the fold on
     load get "visible" immediately without waiting for scroll. */
  var fadeEls = document.querySelectorAll('.fade-in');

  if (fadeEls.length && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, {
      threshold:  0.05,   /* was 0.1 — lower fires sooner on tall blocks */
      rootMargin: '0px 0px -20px 0px'
    });

    fadeEls.forEach(function (el) {
      /* If element is already above the fold on load, mark visible now */
      var rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add('visible');
      } else {
        observer.observe(el);
      }
    });
  } else {
    /* Fallback: no IntersectionObserver — just show everything */
    fadeEls.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ── 2. Active nav-link highlight ───────────────────────────
     Adds class="active" to the header link matching current URL. */
  var currentPath = window.location.pathname.replace(/\/$/, '');
  document.querySelectorAll('nav ul a').forEach(function (link) {
    try {
      var linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/$/, '');
      if (linkPath === currentPath) link.classList.add('active');
    } catch (e) { /* malformed href — skip */ }
  });

  /* ── 3. Lightbox ────────────────────────────────────────────
     Any <img lightbox="true"> opens in a fullscreen overlay. */
  (function lightbox() {
    if (document.getElementById('lightbox')) return;

    var style = document.createElement('style');
    style.textContent =
      '.lightbox{display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.9);' +
      'align-items:center;justify-content:center;flex-direction:column;gap:1rem;padding:2rem;}' +
      '.lightbox.open{display:flex;}' +
      '.lightbox-img{max-width:90vw;max-height:82vh;border-radius:.5rem;object-fit:contain;' +
      'box-shadow:0 0 60px rgba(0,0,0,.8);}' +
      '.lightbox-caption{color:rgba(255,255,255,.7);font-size:.875rem;text-align:center;font-style:italic;}' +
      '.lightbox-close{position:fixed;top:1rem;right:1rem;width:2.4rem;height:2.4rem;border-radius:50%;' +
      'background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:1.3rem;' +
      'line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}' +
      'img[lightbox="true"]{cursor:zoom-in;}';
    document.head.appendChild(style);

    var box = document.createElement('div');
    box.id = 'lightbox';
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Image viewer');
    box.innerHTML =
      '<button class="lightbox-close" id="lightbox-close" aria-label="Close image">\u2715</button>' +
      '<img id="lightbox-img" src="" alt="" class="lightbox-img" />' +
      '<p id="lightbox-caption" class="lightbox-caption"></p>';
    document.body.appendChild(box);

    var img = box.querySelector('#lightbox-img');
    var cap = box.querySelector('#lightbox-caption');

    function open(src, alt) {
      img.src = src; img.alt = alt || ''; cap.textContent = alt || '';
      box.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      box.classList.remove('open');
      document.body.style.overflow = '';
      img.src = '';
    }

    document.addEventListener('click', function (e) {
      if (e.target.matches && e.target.matches('img[lightbox="true"]')) open(e.target.src, e.target.alt);
    });
    box.querySelector('#lightbox-close').addEventListener('click', close);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  })();

})();
