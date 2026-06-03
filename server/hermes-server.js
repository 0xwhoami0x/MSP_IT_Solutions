// ============================================================
// hermes-server.js — Hermes Ticket Logging Backend
// Run with: node hermes-server.js
//
// What it does:
//   - Serves the site at http://localhost:3000
//   - Accepts POST /ticket from the widget and logs to tickets.json
//   - GET /tickets returns all tickets as JSON
//   - GET /log returns a plain text ticket summary
//
// To deploy on Oracle Cloud:
//   1. Copy this file to your instance
//   2. Set your Anthropic API key as an env variable:
//      export ANTHROPIC_API_KEY=sk-ant-...
//   3. Open port 3000 in your OCI security list
//   4. Run: node hermes-server.js
//   5. Update HERMES_SERVER in assets/js/hermes.js to your public IP
// ============================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT        = process.env.PORT || 3000;
const TICKET_FILE = path.join(__dirname, '..', 'data', 'tickets.json');

// Create tickets file if it doesn't exist
if (!fs.existsSync(TICKET_FILE)) {
  fs.writeFileSync(TICKET_FILE, JSON.stringify([], null, 2));
  console.log(`Created ${TICKET_FILE}`);
}

/* --- Ticket helpers --- */
function loadTickets() {
  try { return JSON.parse(fs.readFileSync(TICKET_FILE, 'utf8')); }
  catch { return []; }
}

function saveTicket(ticket) {
  const tickets = loadTickets();
  tickets.unshift(ticket); // newest first
  fs.writeFileSync(TICKET_FILE, JSON.stringify(tickets, null, 2));
}

/* --- Request handler --- */
const server = http.createServer((req, res) => {

  // Allow cross-origin requests from GitHub Pages or any browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /ticket — receive and log a ticket from the widget
  if (req.method === 'POST' && req.url === '/ticket') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const ticket = JSON.parse(body);
        ticket.timestamp = new Date().toISOString();
        saveTicket(ticket);
        console.log(`[TICKET] #${ticket.id} ${ticket.priority} — "${ticket.message.slice(0, 60)}"`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: ticket.id }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /tickets — return all tickets as JSON
  if (req.method === 'GET' && req.url === '/tickets') {
    const tickets = loadTickets();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tickets, null, 2));
    return;
  }

  // GET /log — plain text summary for terminal viewing
  if (req.method === 'GET' && req.url === '/log') {
    const tickets = loadTickets();
    if (tickets.length === 0) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('No tickets logged yet.\n');
      return;
    }
    const lines = tickets.map(t =>
      `[${t.timestamp}] #${t.id} ${t.priority} — ${t.message}`
    ).join('\n');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(lines + '\n');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Hermes Ticket Server`);
  console.log(`  Tickets: http://localhost:${PORT}/tickets`);
  console.log(`  Log:     http://localhost:${PORT}/log`);
  console.log(`  Data:    ${TICKET_FILE}`);
  console.log(`\n  Waiting for tickets...\n`);
});
