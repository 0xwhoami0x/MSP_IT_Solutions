/* ============================================================
   hermes.js — NEO AI Help Desk Widget (self-contained)
   Drop-in: a page only needs hermes/hermes.js + hermes/widget.css.
   This script injects its own button + chat panel and wires it up.

   MODES:
   1. Demo mode (default) — keyword-matched canned replies, no key needed
   2. Live mode — paste an Anthropic API key into NEO_API_KEY
   3. Server mode — set NEO_SERVER to your own backend URL for
      ticket logging + AI proxied server-side

   SECURITY NOTE: If you set NEO_API_KEY here, that key is
   visible to anyone who views page source. For production use,
   route requests through NEO_SERVER instead and keep the
   key server-side only.
============================================================ */

(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────
     Paste your Anthropic API key here to enable live AI mode.
     Leave empty to use demo mode (rotating canned responses).
  ------------------------------------------------------------ */
  var NEO_API_KEY = '';

  // Set to your backend URL to enable server-side ticket logging
  // Example: 'https://your-server.com'
  var NEO_SERVER = '';

  // Max messages kept in history sent to the API.
  var MAX_HISTORY = 20;

  // System prompt tells Claude who NEO is
  var NEO_SYSTEM = [
    'You are NEO, the AI security and help desk agent for MSP IT Solutions.',
    'You operate within the HERMES framework — a security-first AI platform',
    'built on a vector database, RAG, Honcho orchestration, and MCP.',
    'You support 276 users across 7 sites with 592 managed devices.',
    'Triage IT issues, answer questions, and open support tickets.',
    'Keep responses short, friendly, and professional — 2 to 4 sentences max.',
    'When a user describes a problem: acknowledge it, give one quick first step,',
    'and confirm a ticket has been created and a specialist will follow up.',
    'Classify issues as P1 (full outage or security breach), P2 (multiple users affected),',
    'P3 (single user issue), or P4 (general request or how-to).'
  ].join(' ');

  /* ── Demo reply engine ──────────────────────────────────────
     Used when no API key / server is configured.

       • Greeting / thanks      → friendly reply (no ticket)
       • An IT PROBLEM or request → triage into P1–P4 + OPEN TICKET
       • An info/navigation question → answer it (no ticket)
       • Nothing recognized      → "I'm here to help…" (no ticket)

     Intent is decided BEFORE topic so that "where's the login
     page?" is treated as a question (no ticket) while "I can't
     log in" is treated as a problem (ticket). Returns:
       { text, ticket: bool, priority? }
  ------------------------------------------------------------ */

  var FALLBACKS = [
    "I'm here to help. I can point you to the right page (pricing, services, the portal\u2026), " +
      "answer a quick question, or log an IT issue as a ticket. What do you need?",
    "Happy to help. Tell me what's up \u2014 for example \u201Cwhere's your pricing?\u201D, \u201Cwhat are your hours?\u201D, " +
      "or describe an IT problem like \u201CI can't log in\u201D and I'll open a ticket.",
    "Not sure I caught that, but I'm on it. I can guide you around the site, answer questions about MSP IT " +
      "Solutions, or triage an IT issue into a ticket. Which would you like?"
  ];
  var fallbackIdx = 0;

  function getDemoReply(raw) {
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
      return guide("Hey there. I'm NEO, the MSP IT Solutions security and help-desk agent. I can show you around " +
                   "the site, answer a quick question, or log an IT issue for you. What's going on?");
    }
    if (has('thank', 'thanks', 'cheers', 'appreciate', 'great help', 'awesome')) {
      return guide("Anytime. If anything else comes up \u2014 a question or an IT issue \u2014 I'm right here.");
    }

    /* ---- NEO / AI SELF-KNOWLEDGE (no ticket) ---- */
    if (has('what is neo', 'who is neo', 'tell me about neo', 'what do you do', 'what can you do',
            'your abilities', 'your capabilities', 'how do you work', 'what is hermes', 'hermes framework',
            'how does neo work', 'what are you', 'are you ai', 'are you a bot', 'are you real')) {
      return guide(
        "I'm NEO \u2014 the AI agent running inside the HERMES framework. I use a vector database and RAG to map " +
        "your environment against emerging threats in real time. I monitor Wazuh SIEM logs across all 7 sites, " +
        "flag anomalies, correlate alerts, and through Honcho orchestration I can trigger containment protocols " +
        "in milliseconds. I also handle help-desk triage right here \u2014 describe an issue and I'll classify it, " +
        "give you a first step, and open a ticket."
      );
    }
    if (has('neo security', 'ai security', 'how do you protect', 'how does ai help security',
            'what does neo monitor', 'threat detection', 'behavioral', 'anomaly', 'anomalies')) {
      return guide(
        "On the security side, I run 24/7 behavioral risk profiling across all user activity \u2014 flagging " +
        "\u201Clow and slow\u201D anomalies that slip past traditional tools. I cross-reference live events against " +
        "your runbooks via RAG, correlate Wazuh alerts into attack chains, and if something triggers, Honcho " +
        "orchestration locks down affected segments in milliseconds. Every threat I neutralize gets studied and " +
        "fed back in so future incidents are dead on arrival."
      );
    }
    if (has('honcho', 'orchestration', 'containment', 'lockdown', 'lock down', 'automated response')) {
      return guide(
        "Honcho is the orchestration layer. When I detect a confirmed threat, Honcho executes containment " +
        "protocols at machine speed \u2014 isolating compromised segments, revoking access, and alerting the " +
        "security team, all in milliseconds. No manual intervention needed for the initial lockdown."
      );
    }
    if (has('rag', 'vector database', 'knowledge base', 'runbook', 'runbooks', 'contextual')) {
      return guide(
        "I use RAG (Retrieval-Augmented Generation) backed by a vector database that indexes your entire " +
        "environment \u2014 runbooks, asset inventories, network baselines, and historical incidents. When a " +
        "security event fires, I cross-reference it against all of that context so my triage is specific to " +
        "your setup, not generic."
      );
    }
    if (has('mcp', 'model context', 'tool use')) {
      return guide(
        "MCP (Model Context Protocol) is how I connect to external tools and services \u2014 Wazuh, ticketing " +
        "systems, asset databases. It lets me pull live data and take action without needing a human to copy-paste " +
        "between systems."
      );
    }
    if (has('wazuh', 'siem', 'log', 'logs', 'monitoring', 'alerts')) {
      return guide(
        "I monitor Wazuh SIEM logs across all 7 sites in real time. Every alert gets correlated \u2014 I separate " +
        "signal from noise, tag attack chains before they fully develop, and escalate anything critical. The Wazuh " +
        "setup covers endpoint detection, file integrity monitoring, and vulnerability scanning."
      );
    }

    /* ---- 1. INTENT: is this an IT problem or a service request? ---- */
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

    if (has('how much', 'cost', 'costs', 'price', 'pricing', 'quote', 'rates', 'priced') &&
        !problemSignal && !securitySignal) {
      return guide("Pricing is on the Pricing page \u2014 top menu \u2192 Pricing. It breaks down our two plans, " +
                   "Blended and Full Support, per user per month. Want me to summarize the tiers here instead?");
    }

    if (securitySignal || problemSignal || requestSignal) {

      /* P1 — security incident */
      if (securitySignal) {
        return triage(
          "That reads as a possible security incident \u2014 I'm flagging it P1 and paging the Security " +
          "Specialist now. Don't click any links, don't restart anything \u2014 leave the machine exactly as it " +
          "is. A ticket is open and someone will contact you within minutes.",
          'P1'
        );
      }
      /* P1 — full outage */
      if (has('everything is down', 'everything down', 'whole office', 'entire office', 'all users',
              'nobody can', 'no one can', 'site is down', 'server is down', 'total outage',
              'complete outage', 'everyone is', 'whole site')) {
        return triage(
          "Full outage \u2014 that's a P1. I've logged it and escalated to the on-call Network Engineer. " +
          "Quick check: are the main switch and router lights showing normal activity? Either way the engineer " +
          "is being paged now and will follow up immediately.",
          'P1'
        );
      }
      /* P2 — multiple users affected */
      if (has('several of us', 'multiple users', 'a few of us', 'our team', 'whole team', 'department',
              'wifi', 'wi fi', 'internet', 'network', 'shared drive', 'a bunch of us', 'we all')) {
        return triage(
          "Sounds like it's hitting more than one person \u2014 classifying as P2. Try a different device on " +
          "the same connection to confirm it's network-wide. I've opened a ticket with a 1-hour response target. " +
          "Which site are you at?",
          'P2'
        );
      }
      /* P3 — password / login / account */
      if (has('password', 'forgot password', 'forgot my password', 'reset password', 'password reset',
              'log in', 'login', 'log on', 'sign in', 'signin', 'locked out', 'lock out',
              'mfa', '2fa', 'authenticator', 'account')) {
        return triage(
          "No problem \u2014 head to the Client Portal (button at the top-right of any page), and on the sign-in " +
          "screen click \u201CForgot password?\u201D at the bottom. Follow the steps to reset via email. If you're " +
          "not getting the reset email or you're fully locked out of your account, I've opened a P3 ticket and the " +
          "Help Desk will manually reset it and call you back.",
          'P3'
        );
      }
      /* P3 — single-user email */
      if (has('email', 'outlook', 'inbox', 'mailbox', 'send mail', 'receive mail', 'cant send', 'can t send')) {
        return triage(
          "Got it \u2014 P3 ticket opened for your email issue. First: check Outlook's status bar at the bottom " +
          "for \u201CWorking Offline\u201D \u2014 if you see it, click it to toggle back online, then hit " +
          "Send/Receive. If mail still won't move, the Help Desk will dig into the mailbox config and follow up.",
          'P3'
        );
      }
      /* P3 — VPN */
      if (has('vpn', 'remote access', 'connect remotely', 'work from home', 'wfh')) {
        return triage(
          "VPN trouble \u2014 P3 ticket created. First step: fully close the VPN client, wait 10 seconds, and " +
          "relaunch it. If it asks for credentials, use your normal network login. Still failing? The Help Desk " +
          "will check your VPN profile and get back to you.",
          'P3'
        );
      }
      /* P3 — printer */
      if (has('printer', 'print', 'printing', 'scanner', 'scan')) {
        return triage(
          "Printer issue noted \u2014 P3 ticket opened. Quick fix to try: open Settings \u2192 Printers & Scanners, " +
          "remove the printer, then re-add it. If it's a network printer, make sure you're connected to the office " +
          "network (not guest Wi-Fi). The Help Desk will follow up if that doesn't sort it.",
          'P3'
        );
      }
      /* P3 — Teams / Zoom / video */
      if (has('teams', 'zoom', 'video call', 'camera', 'microphone', 'mic', 'audio', 'screen share')) {
        return triage(
          "Logged as P3. First: close and reopen the app completely (don't just minimize). Check Settings \u2192 " +
          "Devices to make sure the right mic/camera is selected. If it's still not working, try the web version " +
          "as a backup. Ticket is open and the Help Desk will follow up.",
          'P3'
        );
      }
      /* P4 — general request / how-to / hardware */
      if (requestSignal || has('monitor', 'keyboard', 'mouse', 'headset', 'software',
              'license', 'update', 'how do i')) {
        return triage(
          "Noted \u2014 logged as a P4 general request and queued for the Help Desk. Our P4 target is a response " +
          "within 3 business days. If it's blocking your work and needs to move faster, just say so and I'll " +
          "bump the priority.",
          'P4'
        );
      }
      /* Catch-all problem → default P3 ticket */
      return triage(
        "Thanks for the details \u2014 I've opened a P3 ticket and assigned it to the Help Desk. Good first step: " +
        "do a full restart of the affected device (shut down, wait 15 seconds, power back on) \u2014 clears a " +
        "surprising number of issues. A specialist will follow up shortly.",
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
    if (has('security', 'cybersecurity', 'protection', 'defend', 'secure')) {
      return guide("Full breakdown is on the Security page (top menu). Short version: Wazuh SIEM across all sites, " +
                   "Defender for email, Veeam backups with 90-day offsite retention, MFA enforced everywhere, and " +
                   "me \u2014 NEO \u2014 running 24/7 threat detection and automated containment via HERMES.");
    }
    if (has('contact', 'phone', 'call you', 'reach you', 'get in touch', 'speak to', 'talk to someone')) {
      return guide("To get started, use the Client Portal button at the top-right of any page, or see the Pricing " +
                   "page for plans. If it's an active IT issue, describe it here and I'll triage it right now.");
    }
    if (has('team', 'who works', 'staff', 'engineers', 'specialists', 'employees')) {
      return guide("Meet the team in the Team section on the Home page \u2014 you'll see each engineer and " +
                   "specialist and what they cover.");
    }
    if (has('approach', 'process', 'methodology', 'how it works', 'assessment', 'design phase', 'implementation')) {
      return guide("Our work runs in four phases \u2014 Assessment, Design, Implementation, and Support \u2014 each " +
                   "detailed on a service page (Security, Network, Cloud, and Helpdesk respectively).");
    }
    if (has('portal', 'dashboard', 'client area', 'my account', 'log in page', 'login page', 'sign in page')) {
      return guide("The Client Portal is the button at the top-right of every page \u2014 sign in there to see your " +
                   "tickets and dashboard. If you're locked out, tell me and I'll open a reset ticket.");
    }
    if (has('about', 'company', 'history', 'who are you')) {
      return guide("I'm NEO, the AI agent for MSP IT Solutions, running on the HERMES framework. The company " +
                   "background is on the Home page. Short version: managed IT provider, 276 users, 7 sites, 592 devices.");
    }
    if (has('hours', 'open', 'available', 'when can i', 'staffed')) {
      return guide("Help Desk is staffed Monday\u2013Friday, 8am\u20136pm, with 24/7 on-call for P1 emergencies. " +
                   "I'm always here though \u2014 drop an issue anytime and it'll be queued and triaged.");
    }
    if (has('how many', 'how big', 'number of users', 'number of devices', 'how many sites')) {
      return guide("276 users across 7 sites with 592 managed devices. Anything you'd like to know about coverage " +
                   "for your location?");
    }
    if (has('menu', 'navigate', 'where do i find', 'where is', 'how do i get to', 'find the', 'page for', 'where can i')) {
      return guide("Top menu: Home, Network, Cloud, Helpdesk, Security, and Pricing \u2014 plus the Client Portal " +
                   "button top-right. Which one are you after?");
    }

    /* ---- 3. Fallback (no ticket) ---- */
    var msg = FALLBACKS[fallbackIdx % FALLBACKS.length];
    fallbackIdx++;
    return guide(msg);
  }

  /* ── Inject the widget markup ───────────────────────────── */
  if (document.body && !document.getElementById('neo-btn')) {
    var WIDGET_HTML = '' +
'<button id="neo-btn" title="Get Help from NEO" aria-label="Open NEO help chat">' +
  '<div id="neo-dot"></div>' +
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 11H7v-2h10v2zm0-3H7V8h10v2z"/></svg>' +
'</button>' +
'<div id="neo-panel" role="dialog" aria-label="NEO Help Desk">' +
  '<div class="hw-header">' +
    '<div class="hw-avatar" aria-hidden="true"><img src="../assets/img/neo.png" alt="NEO" /></div>' +
    '<div class="hw-title"><strong>NEO</strong><span>Help Desk & Security</span></div>' +
    '<div class="hw-status" aria-label="Online"></div>' +
    '<button class="hw-close" id="neo-close" aria-label="Close chat">\u2715</button>' +
  '</div>' +
  '<div class="hw-messages" id="neo-messages" aria-live="polite"></div>' +
  '<div class="hw-input-row">' +
    '<input type="text" id="neo-input" placeholder="Describe your issue or ask a question\u2026" autocomplete="off" maxlength="500" />' +
    '<button id="neo-send" aria-label="Send message">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
    '</button>' +
  '</div>' +
  '<div class="hw-footer-note">Powered by NEO \u00B7 HERMES Framework</div>' +
'</div>';
    document.body.insertAdjacentHTML('beforeend', WIDGET_HTML);
  }

  /* ── Guard ─────────────────────────────────────────────────── */
  var panel    = document.getElementById('neo-panel');
  var btn      = document.getElementById('neo-btn');
  var closeBtn = document.getElementById('neo-close');
  var messages = document.getElementById('neo-messages');
  var input    = document.getElementById('neo-input');
  var sendBtn  = document.getElementById('neo-send');
  var dot      = document.getElementById('neo-dot');

  if (!panel || !btn || !closeBtn || !messages || !input || !sendBtn || !dot) {
    return;
  }

  /* ── State ──────────────────────────────────────────────── */
  var ticketCounter  = Math.floor(Math.random() * 900) + 100;
  var messageHistory = [];
  var isOpen         = false;
  var isWaiting      = false;
  var dotTimer       = null;

  /* ── Toggle panel ───────────────────────────────────────── */
  function togglePanel() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    dot.style.display = 'none';

    if (isOpen && messages.children.length === 0) {
      addMessage('agent',
        "I'm NEO \u2014 your MSP IT Solutions security and help-desk agent. " +
        "Describe an issue and I'll triage it, or ask me anything about our services. What's going on?"
      );
    }

    if (isOpen) {
      setTimeout(function () { input.focus(); }, 250);
    }
  }

  /* ── Add a message bubble ───────────────────────────────── */
  function addMessage(role, text, ticketId) {
    var div = document.createElement('div');
    div.className = 'hw-msg ' + role;
    div.textContent = text;

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
    removeTyping();
    var div = document.createElement('div');
    div.className = 'hw-msg typing';
    div.id = 'neo-typing';
    div.textContent = 'NEO is typing\u2026';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTyping() {
    var t = document.getElementById('neo-typing');
    if (t) t.remove();
  }

  /* ── Log ticket to backend ──────────────────────────────── */
  function logTicket(ticket) {
    if (!NEO_SERVER) return;
    if (!/^https?:\/\//.test(NEO_SERVER)) {
      console.warn('[NEO] NEO_SERVER must start with http:// or https://');
      return;
    }
    fetch(NEO_SERVER + '/ticket', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(ticket)
    }).catch(function () {
      console.warn('[NEO] Ticket server not reachable. Running without logging.');
    });
  }

  /* ── Trim history ───────────────────────────────────────── */
  function trimHistory() {
    if (messageHistory.length > MAX_HISTORY) {
      messageHistory = messageHistory.slice(messageHistory.length - MAX_HISTORY);
    }
  }

  /* ── Main send handler ──────────────────────────────────── */
  function sendMessage() {
    var text = input.value.trim();
    if (!text || isWaiting) return;
    if (text.length > 500) text = text.slice(0, 500);

    isWaiting = true;
    sendBtn.disabled = true;
    input.value = '';

    addMessage('user', text);
    messageHistory.push({ role: 'user', content: text });
    trimHistory();

    showTyping();

    if (NEO_API_KEY) {
      fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         NEO_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 300,
          system:     NEO_SYSTEM,
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
          : "Something went wrong on my end. A ticket has been created and the team will follow up.";
        handleReply(reply, text, true);
      })
      .catch(function () {
        handleReply(
          "I'm having trouble connecting right now. A ticket has been created and the team will follow up shortly.",
          text, true
        );
      });

    } else {
      var result = getDemoReply(text);
      setTimeout(function () {
        handleReply(result.text, text, result.ticket, result.priority);
      }, 700 + Math.random() * 600);
    }
  }

  /* ── Handle reply ───────────────────────────────────────── */
  function handleReply(reply, originalText, makeTicket, priority) {
    removeTyping();
    messageHistory.push({ role: 'assistant', content: reply });
    trimHistory();

    var tid = null;
    if (makeTicket) {
      tid = ticketCounter++;
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

  dotTimer = setTimeout(function () {
    if (!isOpen) dot.style.display = 'block';
  }, 4000);

})();