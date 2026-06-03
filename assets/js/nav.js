/* ============================================================
   nav.js — Site navigation (data-driven) + widget + lightbox
   Loaded on every page.

   ┌────────────────────────────────────────────────────────┐
   │  EDIT THE MENU HERE → just change the NAV array below.   │
   │  • { label, href }            = a normal top-level link  │
   │  • { label, children: [...] } = a dropdown group         │
   │  The same data renders the desktop dropdowns AND the     │
   │  mobile hamburger accordion — no duplication.            │
   └────────────────────────────────────────────────────────┘
============================================================ */
(function () {
  'use strict';

  /* ── 1. PATH PREFIX ──────────────────────────────────────────
     nav.js is shared by index.html (root) and pages/*.html (one level deep).
     Detect which context we're in and build the correct relative paths.    */
  var inPages = window.location.pathname.indexOf('/pages/') !== -1;
  var p  = inPages ? ''    : 'pages/';   // prefix for pages/ files
  var ph = inPages ? '../' : '';         // prefix back to root

  /* ── 2. MENU CONFIG ───────────────────────────────────────── */
  var NAV = [
    { label: 'Home',     href: p  + 'home.html'       },
    { label: 'Network',  href: p  + 'network.html'    },
    { label: 'Cloud',    href: p  + 'cloud.html'      },
    { label: 'Helpdesk', href: p  + 'helpdesk.html'   },
    { label: 'Security', href: p  + 'security.html'   },
    { label: 'Pricing',  href: p  + 'pricing.html'    }
  ];

  var LOGO   = { href: p + 'home.html', main: 'MSP', sub: 'IT Solutions' };
  var PORTAL = { href: p + 'portal.html', label: 'Client Portal' };

  /* ── 2. RENDER HELPERS ────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function linkItem(item) {
    return '<li><a class="nav-link" href="' + esc(item.href) + '">' +
           esc(item.label) + '</a></li>';
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

  var itemsHTML = NAV.map(function (item) {
    return item.children ? groupItem(item) : linkItem(item);
  }).join('');

  // Portal also appears as the last item inside the mobile menu
  var portalMobile =
    '<li class="nav-portal-mobile-item">' +
      '<a class="nav-link nav-portal-mobile" href="' + esc(PORTAL.href) + '">' +
        esc(PORTAL.label) + '</a>' +
    '</li>';

  var navHTML =
    '<nav>' +
      '<a href="' + esc(LOGO.href) + '" class="nav-logo">' +
        esc(LOGO.main) + ' <span>' + esc(LOGO.sub) + '</span></a>' +
      '<ul class="nav-menu">' + itemsHTML + portalMobile + '</ul>' +
      '<a href="' + esc(PORTAL.href) + '" class="nav-portal">' + esc(PORTAL.label) + '</a>' +
      '<button class="nav-hamburger" id="nav-hamburger" aria-label="Open menu" aria-expanded="false">' +
        '<span></span><span></span><span></span>' +
      '</button>' +
    '</nav>';

  document.body.insertAdjacentHTML('afterbegin', navHTML);

  /* ── 3. INTERACTIONS ──────────────────────────────────────── */
  var nav     = document.querySelector('nav');
  var btn     = document.getElementById('nav-hamburger');
  var menu    = nav.querySelector('.nav-menu');
  var groups  = Array.prototype.slice.call(nav.querySelectorAll('.nav-group'));

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

  // Hamburger toggles the whole panel
  if (btn && menu) {
    btn.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (!open) closeAllGroups();
    });
  }

  // Caret button toggles the dropdown (the label link navigates on its own)
  groups.forEach(function (group) {
    var toggle = group.querySelector('.nav-caret-btn');
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var willOpen = !group.classList.contains('open');
      closeAllGroups(group);
      group.classList.toggle('open', willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
    });
  });

  // Click outside closes any open desktop dropdown
  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target)) closeAllGroups();
  });

  // Escape closes everything
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeAllGroups(); closeMenu(); }
  });

  // Clicking any actual link closes the mobile menu
  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { closeMenu(); closeAllGroups(); });
  });


  /* ============================================================
     HERMES HELP-DESK WIDGET  (unchanged)
  ============================================================ */
  // Only inject the Hermes widget on the dashboard page
  if (window.location.pathname.indexOf('portal-dashboard') !== -1) {
    var widgetHTML = `
<button id="hermes-btn" title="Get Help from Hermes" aria-label="Open Hermes help chat">
  <div id="hermes-dot"></div>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 11H7v-2h10v2zm0-3H7V8h10v2z"/></svg>
</button>
<div id="hermes-panel" role="dialog" aria-label="Hermes Help Desk">
  <div class="hw-header">
    <div class="hw-avatar" aria-hidden="true">\u{1F916}</div>
    <div class="hw-title"><strong>HERMES</strong><span>MSP IT Solutions · Help Desk Agent</span></div>
    <div class="hw-status" aria-label="Online"></div>
    <button class="hw-close" id="hermes-close" aria-label="Close chat">✕</button>
  </div>
  <div class="hw-messages" id="hermes-messages" aria-live="polite"></div>
  <div class="hw-input-row">
    <input type="text" id="hermes-input" placeholder="Describe your issue or ask a question…" autocomplete="off" maxlength="500" />
    <button id="hermes-send" aria-label="Send message">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
    </button>
  </div>
  <div class="hw-footer-note">Powered by Hermes · MSP IT Solutions</div>
</div>`;
    document.body.insertAdjacentHTML('beforeend', widgetHTML);
  }


  /* ============================================================
     LIGHTBOX  (unchanged)
  ============================================================ */
  var lightboxHTML = `
<div id="lightbox" class="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer">
  <button class="lightbox-close" id="lightbox-close" aria-label="Close image">✕</button>
  <img id="lightbox-img" src="" alt="" class="lightbox-img" />
  <p id="lightbox-caption" class="lightbox-caption"></p>
</div>`;
  document.body.insertAdjacentHTML('beforeend', lightboxHTML);

  var lightboxStyles = document.createElement('style');
  lightboxStyles.textContent = `
  .lightbox { display:none; position:fixed; inset:0; z-index:999; background:rgba(0,0,0,0.85); align-items:center; justify-content:center; flex-direction:column; gap:1rem; padding:2rem; }
  .lightbox.open { display:flex; }
  .lightbox-close { position:absolute; top:1rem; right:1rem; background:none; border:none; color:#fff; font-size:1.5rem; cursor:pointer; line-height:1; }
  .lightbox-img { max-width:90vw; max-height:80vh; border-radius:0.5rem; object-fit:contain; }
  .lightbox-caption { color:rgba(255,255,255,0.7); font-size:0.875rem; text-align:center; }`;
  document.head.appendChild(lightboxStyles);

  (function () {
    var box = document.getElementById('lightbox');
    var boxImg = document.getElementById('lightbox-img');
    var boxCap = document.getElementById('lightbox-caption');
    var closeBtn = document.getElementById('lightbox-close');

    document.addEventListener('click', function (e) {
      if (e.target.matches('img[lightbox="true"]')) {
        e.target.style.cursor = 'zoom-in';
        boxImg.src = e.target.src;
        boxImg.alt = e.target.alt;
        boxCap.textContent = e.target.alt;
        box.classList.add('open');
        document.body.style.overflow = 'hidden';
      }
    });
    closeBtn.addEventListener('click', closeLightbox);
    box.addEventListener('click', function (e) { if (e.target === box) closeLightbox(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });

    function closeLightbox() {
      box.classList.remove('open');
      document.body.style.overflow = '';
      boxImg.src = '';
    }
  })();

})();
