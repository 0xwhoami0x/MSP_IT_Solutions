/* ============================================================
   nav.js — Site navigation (the fixed top header).
   Loaded with `defer` in <head> on every page, so it downloads
   in parallel and runs once the DOM is parsed.

   This is the ONE shared structural script: it renders the same
   header on every page from the data below, so page authors
   never copy/paste the nav into individual HTML files.

   Reliability:
     • Mounts only after the DOM is ready (never touches a null body).
     • Idempotent — never injects a second header.
     • Re-asserts the nav on bfcache restore (back/forward nav).

   ┌────────────────────────────────────────────────────────┐
   │  EDIT THE MENU HERE → change the NAV array below.        │
   │  • { label, href }            = a normal top-level link  │
   │  • { label, href, children:[] } = a dropdown group       │
   └────────────────────────────────────────────────────────┘
============================================================ */
(function () {
  'use strict';

  /* ── 1. PATH PREFIX ──────────────────────────────────────────
     Shared by index.html (root) and pages/*.html (one level deep).
     Build correct relative links for whichever context we're in. */
  var inPages = window.location.pathname.indexOf('/pages/') !== -1;
  var p = inPages ? '' : 'pages/';

  /* ── 2. SITE STRUCTURE (single source of truth) ───────────── */
  var NAV = [
    { label: 'Home',     href: p + 'home.html'     },
    { label: 'Network',  href: p + 'network.html'  },
    { label: 'Cloud',    href: p + 'cloud.html'    },
    { label: 'Helpdesk', href: p + 'helpdesk.html' },
    { label: 'Security', href: p + 'security.html' },
    { label: 'Pricing',  href: p + 'pricing.html'  }
  ];
  var LOGO   = { href: p + 'home.html', main: 'MSP', sub: 'IT Solutions' };
  var PORTAL = { href: p + 'portal.html', label: 'Client Portal' };

  /* ── 3. RENDER HELPERS ────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function linkItem(item) {
    return '<li><a class="nav-link" href="' + esc(item.href) + '">' + esc(item.label) + '</a></li>';
  }

  function groupItem(item) {
    var subs = item.children.map(function (c) {
      return '<li><a href="' + esc(c.href) + '">' + esc(c.label) + '</a></li>';
    }).join('');
    return '<li class="nav-group">' +
             '<span class="nav-group-head">' +
               '<a class="nav-link nav-group-link" href="' + esc(item.href) + '">' + esc(item.label) + '</a>' +
               '<button class="nav-caret-btn" aria-expanded="false" aria-haspopup="true" aria-label="' + esc(item.label) + ' menu">' +
                 '<i class="nav-caret" aria-hidden="true"></i>' +
               '</button>' +
             '</span>' +
             '<ul class="nav-submenu">' + subs + '</ul>' +
           '</li>';
  }

  function buildHeader() {
    var items = NAV.map(function (item) {
      return item.children ? groupItem(item) : linkItem(item);
    }).join('');
    var portalMobile =
      '<li class="nav-portal-mobile-item">' +
        '<a class="nav-link nav-portal-mobile" href="' + esc(PORTAL.href) + '">' + esc(PORTAL.label) + '</a>' +
      '</li>';
    return '<nav class="site-nav">' +
      '<a href="' + esc(LOGO.href) + '" class="nav-logo">' + esc(LOGO.main) + ' <span>' + esc(LOGO.sub) + '</span></a>' +
      '<ul class="nav-menu">' + items + portalMobile + '</ul>' +
      '<a href="' + esc(PORTAL.href) + '" class="nav-portal">' + esc(PORTAL.label) + '</a>' +
      '<button class="nav-hamburger" id="nav-hamburger" aria-label="Open menu" aria-expanded="false">' +
        '<span></span><span></span><span></span>' +
      '</button>' +
    '</nav>';
  }

  /* ── 4. NAV INTERACTIONS ──────────────────────────────────── */
  function wireNav() {
    var nav  = document.querySelector('nav.site-nav');
    var btn  = document.getElementById('nav-hamburger');
    var menu = nav && nav.querySelector('.nav-menu');
    if (!nav || !btn || !menu || nav.dataset.wired === '1') return;
    nav.dataset.wired = '1';

    var groups = Array.prototype.slice.call(nav.querySelectorAll('.nav-group'));

    function closeMenu() {
      btn.classList.remove('open');
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
    function closeAllGroups(except) {
      groups.forEach(function (g) {
        if (g !== except) {
          g.classList.remove('open');
          var t = g.querySelector('.nav-caret-btn');
          if (t) t.setAttribute('aria-expanded', 'false');
        }
      });
    }

    btn.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (!open) closeAllGroups();
    });

    groups.forEach(function (group) {
      var toggle = group.querySelector('.nav-caret-btn');
      if (!toggle) return;
      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var willOpen = !group.classList.contains('open');
        closeAllGroups(group);
        group.classList.toggle('open', willOpen);
        toggle.setAttribute('aria-expanded', String(willOpen));
      });
    });

    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) closeAllGroups();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeAllGroups(); closeMenu(); }
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { closeMenu(); closeAllGroups(); });
    });
  }

  /* ── 5. MOUNT (idempotent) ────────────────────────────────── */
  function mount() {
    if (!document.body) return;
    if (!document.querySelector('nav.site-nav')) {
      document.body.insertAdjacentHTML('afterbegin', buildHeader());
    }
    wireNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
  window.addEventListener('pageshow', function () {
    if (!document.querySelector('nav.site-nav')) mount();
  });

})();
