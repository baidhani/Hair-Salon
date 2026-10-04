'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createBookings } = require('./bookings');
const { createAuditLog } = require('./audit');

const MAX_BODY = 10 * 1024;
const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > MAX_BODY) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function createServer(bookings) {
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
    }
    if (req.method === 'POST' && req.url === '/bookings') {
      let body;
      try { body = await readJSON(req); } catch { return send(res, 400, { status: 'bad_request', message: 'Invalid request.' }); }
      if (!body || typeof body.requestId !== 'string' || !body.requestId) {
        return send(res, 400, { status: 'bad_request', message: 'requestId is required.' });
      }
      const r = await bookings.createBooking(body.contact, { requestId: body.requestId });
      return send(res, { confirmed: 201, rejected: 400, error: 502 }[r.status], r);
    }
    send(res, 404, { status: 'not_found' });
  });
}

if (require.main === module) {
  const file = process.env.AUDIT_FILE || path.join(__dirname, '..', 'data', 'audit.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bookings = createBookings({ log: createAuditLog({ file }) });
  const port = process.env.PORT || 3000;
  createServer(bookings).listen(port, () => console.log(`Booking manager on http://localhost:${port}`));
}

module.exports = { createServer };
