/* ============================================================
   hermes.js — Hermes AI Help Desk Widget (self-contained)
   Drop-in: a page only needs hermes/hermes.js + hermes/widget.css.
   This script injects its own button + chat panel and wires it up.

   MODES:
   1. Demo mode (default) — keyword-matched canned replies, no key needed
   2. Live mode — paste an Anthropic API key into HERMES_API_KEY
   3. Server mode — set HERMES_SERVER to your own backend URL for
      ticket logging + AI proxied server-side

   SECURITY NOTE: If you set HERMES_API_KEY here, that key is
   visible to anyone who views page source. For production use,
   route requests through HERMES_SERVER instead and keep the
   key server-side only.
============================================================ */

(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────
     Paste your Anthropic API key here to enable live AI mode.
     Leave empty to use demo mode (rotating canned responses).
  ------------------------------------------------------------ */
  var HERMES_API_KEY = '';

  // Set to your backend URL to enable server-side ticket logging
  // Example: 'https://your-oracle-server.com'
  var HERMES_SERVER = '';

  // Max messages kept in history sent to the API.
  // Prevents unbounded memory growth and oversized API payloads
  // on long conversations. Keeps last N exchanges (pairs).
  var MAX_HISTORY = 20;

  // System prompt tells Claude who Hermes is
  var HERMES_SYSTEM = [
    'You are Hermes, the AI help desk agent for MSP IT Solutions.',
    'You support 276 users across 7 sites with 592 managed devices.',
    'Triage IT issues, answer questions, and open support tickets.',
    'Keep responses short, friendly, and professional — 2 to 4 sentences max.',
    'When a user describes a problem: acknowledge it, give one quick first step,',
    'and confirm a ticket has been created and a specialist will follow up.',
    'Classify issues as P1 (full outage or security breach), P2 (multiple users affected),',
    'P3 (single user issue), or P4 (general request or how-to).'
  ].join(' ');

  /* ── Demo reply engine ──────────────────────────────────────
     Used when no API key / server is configured. This is NOT
     random — every reply is chosen from the user's message:

       • Greeting / thanks      → friendly reply (no ticket)
       • An IT PROBLEM or request → triage into P1–P4 + OPEN TICKET
       • An info/navigation question → answer it (no ticket)
       • Nothing recognized      → "I'm here to help…" (no ticket)

     Intent is decided BEFORE topic so that "where's the login
     page?" is treated as a question (no ticket) while "I can't
     log in" is treated as a problem (ticket). Returns:
       { text, ticket: bool, priority? }
  ------------------------------------------------------------ */

  // Rotated so repeated unrecognized messages don't echo verbatim.
  var FALLBACKS = [
    "I'm here to help! I can point you to the right page (pricing, services, the portal\u2026), " +
      "answer a quick question, or log an IT issue as a ticket. What do you need?",
    "Happy to help. Tell me what's up \u2014 for example \u201Cwhere's your pricing?\u201D, \u201Cwhat are your hours?\u201D, " +
      "or describe an IT problem like \u201CI can't log in\u201D and I'll open a ticket.",
    "Not sure I caught that, but I'm here to help. I can guide you around the site, answer questions about MSP IT " +
      "Solutions, or triage an IT issue into a ticket. Which would you like?"
  ];
  var fallbackIdx = 0;

  function getDemoReply(raw) {
    // normalize: lowercase, punctuation → spaces, collapse, pad with spaces
    var t = ' ' + String(raw).toLowerCase().replace(/[^a-z0-9#\s]/g, ' ')
                              .replace(/\s+/g, ' ') + ' ';
    function has() {
      for (var i = 0; i < arguments.length; i++) {
        if (t.indexOf(' ' + arguments[i] + ' ') !== -1 ||
            t.indexOf(arguments[i]) !== -1) return true;
      }
      return false;
    }
    function guide(text)            { return { text: text, ticket: false }; }
    function triage(text, priority) { return { text: text, ticket: true, priority: priority }; }

    /* ---- 0. SOCIAL (no ticket) ---- */
    if (/^\s*(hi|hey|hello|yo|howdy|sup|good morning|good afternoon|good evening)\b/
          .test(String(raw).toLowerCase())) {
      return guide("Hi! I'm Hermes, the MSP IT Solutions help-desk agent. I can show you around the site, answer " +
                   "a quick question, or log an IT issue for you. What's going on?");
    }
    if (has('thank', 'thanks', 'cheers', 'appreciate', 'great help', 'awesome')) {
      return guide("Anytime! If anything else comes up \u2014 a question or an IT issue \u2014 I'm right here.");
    }

    /* ---- 1. INTENT: is this an IT problem or a service request? ----
       Only these open a ticket. Bare topic words (e.g. "email",
       "network") on their own do NOT — they need a problem/request
       signal, so info questions don't get ticketed by accident. */
    var problemSignal = has('cant', 'can t', 'cannot', 'cnt', 'wont', 'won t', 'not working', 'not work',
      'doesnt work', 'doesn t work', 'no longer', 'stopped working', 'stopped', 'keeps', 'broke', 'broken',
      'is down', 'are down', 'went down', 'offline', 'error', 'errors', 'crash', 'crashed', 'froze', 'frozen',
      'stuck', 'slow', 'lagging', 'locked out', 'lock out', 'unable', 'fails', 'failing', 'failed',
      'not able', 'issue', 'problem', 'trouble', 'help me', 'wrong with', 'broke down', 'blue screen',
      'no internet', 'no connection', 'disconnect');

    var requestSignal = has('request', 'install', 'set up', 'setup', 'new laptop', 'new computer',
      'new monitor', 'new phone', 'provision', 'access to', 'permission', 'onboard', 'add a user',
      'need a', 'need access', 'how do i');

    var securitySignal = has('hack', 'hacked', 'breach', 'phish', 'phishing', 'ransom', 'malware',
      'virus', 'compromis', 'suspicious email', 'suspicious link', 'stolen', 'scam', 'spoof');

    // A cost/pricing question is informational even if it mentions "setup"/"install"
    // (e.g. "what does email setup cost") — answer it, don't open a ticket.
    if (has('how much', 'cost', 'costs', 'price', 'pricing', 'quote', 'rates', 'priced') &&
        !problemSignal && !securitySignal) {
      return guide("Pricing is on the Pricing page \u2014 top menu \u2192 Pricing. It breaks down our two plans, " +
                   "Blended and Full Support, per user per month. Want me to summarize the tiers here instead?");
    }

    if (securitySignal || problemSignal || requestSignal) {

      /* P1 — security incident */
      if (securitySignal) {
        return triage(
          "That reads as a possible security incident, so I'm treating it as P1 and paging our Security " +
          "Specialist now. Please don't click any further links or restart affected systems \u2014 leave things " +
          "as they are until they reach you. A ticket is open and someone will contact you within minutes.",
          'P1'
        );
      }
      /* P1 — full outage */
      if (has('everything is down', 'everything down', 'whole office', 'entire office', 'all users',
              'nobody can', 'no one can', 'site is down', 'server is down', 'total outage',
              'complete outage', 'everyone is', 'whole site')) {
        return triage(
          "A full outage is a P1 \u2014 I've logged it and escalated straight to our on-call Network Engineer. " +
          "Quick first check: are the main switch/router lights showing normal? Either way the engineer is being " +
          "notified right now and will follow up immediately.",
          'P1'
        );
      }
      /* P2 — multiple users affected */
      if (has('several of us', 'multiple users', 'a few of us', 'our team', 'whole team', 'department',
              'wifi', 'wi fi', 'internet', 'network', 'shared drive', 'a bunch of us', 'we all')) {
        return triage(
          "Sounds like it's affecting more than one person, so I'm classifying this as P2. As a first step, try a " +
          "different device on the same connection to confirm it's network-wide. I've opened a ticket \u2014 our P2 " +
          "target is a 1-hour response. Which site are you at?",
          'P2'
        );
      }
      /* P3 — login / password / account */
      if (has('log in', 'login', 'log on', 'sign in', 'signin', 'password', 'locked out', 'lock out',
              'reset', 'mfa', '2fa', 'authenticator', 'account')) {
        return triage(
          "Got it \u2014 a sign-in/account issue, logged as a P3 ticket. First thing to try: the \u201CForgot " +
          "password\u201D link on the portal login, then fully close and reopen the browser. If that doesn't clear " +
          "it, the Help Desk will reset it manually and call you back.",
          'P3'
        );
      }
      /* P3 — single-user email */
      if (has('email', 'outlook', 'inbox', 'mailbox', 'send mail', 'receive mail', 'cant send', 'can t send')) {
        return triage(
          "Thanks \u2014 I've opened a P3 ticket for your email problem. Quick first step: check Outlook's status " +
          "bar for \u201CWorking Offline\u201D and toggle it off, then run send/receive again. If mail still won't " +
          "move, the Help Desk will dig into the mailbox and follow up.",
          'P3'
        );
      }
      /* P4 — general request / how-to / hardware */
      if (requestSignal || has('printer', 'print', 'monitor', 'keyboard', 'mouse', 'headset', 'software',
              'license', 'update', 'how do i')) {
        return triage(
          "Noted \u2014 logged as a P4 general request and routed to the Help Desk queue. Our P4 target is a " +
          "response within 3 business days. If it's blocking your work and needs to move faster, just say so and " +
          "I'll bump the priority.",
          'P4'
        );
      }
      /* Catch-all problem → default P3 ticket */
      return triage(
        "Thanks for the details \u2014 I've opened a P3 ticket and assigned it to the Help Desk. A good first step " +
        "is a full restart of the affected device, which clears a surprising number of issues. A specialist will " +
        "follow up shortly; reply here anytime and I'll escalate if it gets worse.",
        'P3'
      );
    }

    /* ---- 2. INFORMATION / TALKING NAV (no ticket) ---- */
    if (has('pricing', 'price', 'cost', 'how much', 'quote', 'rates')) {
      return guide("Pricing is on the Pricing page \u2014 top menu \u2192 Pricing. It breaks down our two plans, " +
                   "Blended and Full Support, per user per month. Want me to summarize the tiers here instead?");
    }
    if (has('sla', 'service level', 'response time', 'uptime', 'guarantee')) {
      return guide("Our response targets are in the SLA Tiers section of the Pricing page. In short: P1 is paged " +
                   "immediately, P2 within 1 hour, P3 same business day, P4 within 3 business days.");
    }
    if (has('transition', 'onboarding', 'migrate', 'switch provider', 'switching', 'move to you', 'leaving our')) {
      return guide("Switching to us? The Service Transition Plan section on the Pricing page walks through " +
                   "onboarding \u2014 a structured six-week program with sign-off at each phase.");
    }
    if (has('service', 'services', 'catalog', 'what do you offer', 'what do you do', 'offerings', 'managed')) {
      return guide("We have four service pages \u2014 Network, Cloud, Helpdesk, and Security \u2014 each in the top " +
                   "menu. Anything specific you're after?");
    }
    if (has('contact', 'phone', 'call you', 'reach you', 'get in touch', 'speak to', 'talk to someone')) {
      return guide("To get started, use the Client Portal button at the top-right of any page, or see the Pricing " +
                   "page for plans. If it's an active IT issue, just describe it here and I'll triage it right now.");
    }
    if (has('team', 'who works', 'staff', 'engineers', 'specialists', 'employees')) {
      return guide("Meet the folks behind the desk in the Team section on the Home page \u2014 you'll see each " +
                   "engineer and specialist and what they cover.");
    }
    if (has('approach', 'process', 'methodology', 'how it works', 'assessment', 'design phase', 'implementation')) {
      return guide("Our work runs in four phases \u2014 Assessment, Design, Implementation, and Support \u2014 each " +
                   "detailed on a service page (Security, Network, Cloud, and Helpdesk respectively).");
    }
    if (has('portal', 'dashboard', 'client area', 'my account', 'log in page', 'login page', 'sign in page')) {
      return guide("The Client Portal is the button at the top-right of every page \u2014 sign in there to see your " +
                   "tickets and dashboard. If you're locked out, tell me and I'll open a reset ticket.");
    }
    if (has('about', 'company', 'history', 'who are you', 'what is hermes', 'your name', 'are you a bot',
            'are you human', 'what are you')) {
      return guide("I'm Hermes, the MSP IT Solutions help-desk agent. There's background on the company on the Home " +
                   "page. Short version: we're a managed IT provider supporting 276 users across 7 sites with 592 devices.");
    }
    if (has('hours', 'open', 'available', 'when can i', 'staffed')) {
      return guide("Our Help Desk is staffed Monday\u2013Friday, 8am\u20136pm, with 24/7 on-call for P1 emergencies. " +
                   "Drop an issue here anytime and it'll be queued and triaged.");
    }
    if (has('how many', 'how big', 'number of users', 'number of devices', 'how many sites')) {
      return guide("Right now we support 276 users across 7 sites with 592 managed devices. Anything you'd like to " +
                   "know about coverage for your location?");
    }
    if (has('menu', 'navigate', 'where do i find', 'where is', 'how do i get to', 'find the', 'page for', 'where can i')) {
      return guide("Happy to point you around. Top menu: Home, Network, Cloud, Helpdesk, Security, and Pricing \u2014 " +
                   "plus the Client Portal button top-right. Which one are you after?");
    }

    /* ---- 3. Fallback (no ticket) — rotated so it never repeats verbatim ---- */
    var msg = FALLBACKS[fallbackIdx % FALLBACKS.length];
    fallbackIdx++;
    return guide(msg);
  }

  /* ── Inject the widget markup ───────────────────────────────
     Self-contained: hermes.js renders its own button + panel, so a
     page only needs to load hermes/hermes.js + hermes/widget.css to
     get the agent. Injected once (idempotent); runs after the DOM is
     ready since this script is loaded with `defer`.
  ------------------------------------------------------------ */
  if (document.body && !document.getElementById('hermes-btn')) {
    var WIDGET_HTML = '' +
'<button id="hermes-btn" title="Get Help from Hermes" aria-label="Open Hermes help chat">' +
  '<div id="hermes-dot"></div>' +
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 11H7v-2h10v2zm0-3H7V8h10v2z"/></svg>' +
'</button>' +
'<div id="hermes-panel" role="dialog" aria-label="Hermes Help Desk">' +
  '<div class="hw-header">' +
    '<div class="hw-avatar" aria-hidden="true">\u{1F916}</div>' +
    '<div class="hw-title"><strong>HERMES</strong><span>MSP IT Solutions \u00B7 Help Desk Agent</span></div>' +
    '<div class="hw-status" aria-label="Online"></div>' +
    '<button class="hw-close" id="hermes-close" aria-label="Close chat">\u2715</button>' +
  '</div>' +
  '<div class="hw-messages" id="hermes-messages" aria-live="polite"></div>' +
  '<div class="hw-input-row">' +
    '<input type="text" id="hermes-input" placeholder="Describe your issue or ask a question\u2026" autocomplete="off" maxlength="500" />' +
    '<button id="hermes-send" aria-label="Send message">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
    '</button>' +
  '</div>' +
  '<div class="hw-footer-note">Powered by Hermes \u00B7 MSP IT Solutions</div>' +
'</div>';
    document.body.insertAdjacentHTML('beforeend', WIDGET_HTML);
  }

  /* ── Guard: only run if all required elements exist ─────────
     Prevents JS errors if the widget HTML is ever missing from
     a page. All other scripts on the page continue normally.
  ------------------------------------------------------------ */
  var panel    = document.getElementById('hermes-panel');
  var btn      = document.getElementById('hermes-btn');
  var closeBtn = document.getElementById('hermes-close');
  var messages = document.getElementById('hermes-messages');
  var input    = document.getElementById('hermes-input');
  var sendBtn  = document.getElementById('hermes-send');
  var dot      = document.getElementById('hermes-dot');

  if (!panel || !btn || !closeBtn || !messages || !input || !sendBtn || !dot) {
    return; // widget HTML not present on this page — exit cleanly
  }

  /* ── State ──────────────────────────────────────────────────
     All mutable state is scoped inside this IIFE.
     No globals are written — no risk of name collisions.
  ------------------------------------------------------------ */
  var ticketCounter  = Math.floor(Math.random() * 900) + 100;
  var messageHistory = []; // conversation history sent to API
  var isOpen         = false;
  var isWaiting      = false; // blocks double-sends
  var dotTimer       = null;

  /* ── Toggle panel open/closed ───────────────────────────── */
  function togglePanel() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    dot.style.display = 'none';

    // Show greeting on first open
    if (isOpen && messages.children.length === 0) {
      addMessage('agent',
        "Hey there! I'm Hermes, your MSP IT Solutions help agent. " +
        "Describe your issue and I'll triage it and get the right person on it. What's going on?"
      );
    }

    if (isOpen) {
      // Small delay so the panel animation completes before focusing
      setTimeout(function () { input.focus(); }, 250);
    }
  }

  /* ── Add a message bubble ───────────────────────────────────
     role: 'agent' | 'user' | 'typing'
     text is set via textContent — never innerHTML — so no XSS risk.
  ------------------------------------------------------------ */
  function addMessage(role, text, ticketId) {
    var div = document.createElement('div');
    div.className = 'hw-msg ' + role;
    div.textContent = text; // safe — no HTML injection possible

    if (ticketId) {
      var badge = document.createElement('div');
      badge.className = 'hw-ticket-badge';
      badge.textContent = 'Ticket #' + ticketId + ' created';
      div.appendChild(badge);
    }

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  /* ── Typing indicator ───────────────────────────────────── */
  function showTyping() {
    // Remove any existing typing indicator first (no duplicates)
    removeTyping();
    var div = document.createElement('div');
    div.className = 'hw-msg typing';
    div.id = 'hermes-typing';
    div.textContent = 'Hermes is typing\u2026';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTyping() {
    var t = document.getElementById('hermes-typing');
    if (t) t.remove();
  }

  /* ── Log ticket to backend ──────────────────────────────────
     Fails silently if server is not configured or unreachable.
     Widget keeps working regardless.
  ------------------------------------------------------------ */
  function logTicket(ticket) {
    if (!HERMES_SERVER) return;

    // Validate server URL is http/https before sending
    if (!/^https?:\/\//.test(HERMES_SERVER)) {
      console.warn('[Hermes] HERMES_SERVER must start with http:// or https://');
      return;
    }

    fetch(HERMES_SERVER + '/ticket', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(ticket)
    }).catch(function () {
      console.warn('[Hermes] Ticket server not reachable. Running without logging.');
    });
  }

  /* ── Trim history to prevent unbounded growth ───────────────
     Keeps the greeting (index 0) and last MAX_HISTORY messages.
     Prevents large API payloads after long conversations.
  ------------------------------------------------------------ */
  function trimHistory() {
    if (messageHistory.length > MAX_HISTORY) {
      messageHistory = messageHistory.slice(messageHistory.length - MAX_HISTORY);
    }
  }

  /* ── Main send handler ──────────────────────────────────────
     isWaiting flag prevents race condition where user clicks send
     multiple times before the first response arrives.
  ------------------------------------------------------------ */
  function sendMessage() {
    var text = input.value.trim();

    // Guard: empty input or already waiting for a response
    if (!text || isWaiting) return;

    // Guard: cap input length (matches the HTML maxlength="500")
    if (text.length > 500) {
      text = text.slice(0, 500);
    }

    isWaiting = true;
    sendBtn.disabled = true;
    input.value = '';

    addMessage('user', text);
    messageHistory.push({ role: 'user', content: text });
    trimHistory();

    showTyping();

    if (HERMES_API_KEY) {
      // Live Claude API mode
      fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         HERMES_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 300,
          system:     HERMES_SYSTEM,
          messages:   messageHistory
        })
      })
      .then(function (res) {
        if (!res.ok) throw new Error('API error ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var reply = (data.content && data.content[0] && data.content[0].text)
          ? data.content[0].text
          : "Sorry, I couldn't process that. A ticket has still been created and the team will follow up.";
        handleReply(reply, text, true);
      })
      .catch(function () {
        handleReply(
          "I'm having trouble connecting right now. A ticket has been created and the team will follow up shortly.",
          text, true
        );
      });

    } else {
      // Demo mode — keyword-matched engine (talking nav, Q&A, tiered triage).
      // Only help-desk issues open a ticket; nav/Q&A replies don't.
      var result = getDemoReply(text);
      setTimeout(function () {
        handleReply(result.text, text, result.ticket, result.priority);
      }, 700 + Math.random() * 600);
    }
  }

  /* ── Handle reply (shared by live and demo mode) ─────────────
     makeTicket decides whether this reply opens a ticket. A ticket
     number is only consumed (ticketCounter++) when one is created,
     so navigation/Q&A replies don't burn ticket IDs or show a badge.
  ------------------------------------------------------------ */
  function handleReply(reply, originalText, makeTicket, priority) {
    removeTyping();
    messageHistory.push({ role: 'assistant', content: reply });
    trimHistory();

    var tid = null;
    if (makeTicket) {
      tid = ticketCounter++;
      // fall back to parsing the label out of the reply if not supplied
      if (!priority) {
        var m = reply.match(/\bP[1-4]\b/);
        priority = m ? m[0] : 'P3';
      }
    }

    addMessage('agent', reply, tid);

    if (makeTicket) {
      logTicket({
        id:        tid,
        priority:  priority,
        message:   originalText,
        response:  reply,
        timestamp: new Date().toISOString()
      });
    }

    isWaiting = false;
    sendBtn.disabled = false;
    input.focus();
  }

  /* ── Event listeners ────────────────────────────────────── */
  btn.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', togglePanel);
  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Show notification dot after 4s if user hasn't opened the panel yet
  dotTimer = setTimeout(function () {
    if (!isOpen) dot.style.display = 'block';
  }, 4000);

})();
