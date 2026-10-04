'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createBookings } = require('./bookings');
const { createAuditLog } = require('./audit');
const { createReview } = require('./review');
const { createConfirmer } = require('./confirm');
const { createGmailMailer } = require('./gmail');

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

// Shared front-end files. A fixed list, so no other file in the folder can be requested.
const ASSETS = { '/ui.js': ['ui.js', 'text/javascript'], '/ui.css': ['ui.css', 'text/css'] };

const page = (res, name) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(path.join(__dirname, 'public', name)));
};
// No login yet: the brief names a single salon owner, so approvals are recorded as this label.
const OWNER = 'owner';

async function reviewApi(req, res, review, confirmer) {
  if (!review) return send(res, 404, { status: 'not_found' });
  const parts = req.url.split('?')[0].split('/').filter(Boolean); // ['api','review',id?,'approve'?]
  try {
    if (req.method === 'GET' && parts.length === 2) return send(res, 200, { bookings: review.listPrepared(), approved: review.listByStatus('approved') });
    const id = decodeURIComponent(parts[2] || '');
    if (req.method === 'POST' && parts[3] === 'approve' && parts.length === 4) {
      const r = review.approve(id, { approvedBy: OWNER });
      return send(res, { approved: 200, not_found: 404, flagged: 409, error: 500 }[r.status], r);
    }
    if (req.method === 'POST' && parts[3] === 'send' && parts.length === 4) {
      if (!confirmer) return send(res, 503, { status: 'not_configured', message: 'Gmail is not configured, so nothing was sent.' });
      const r = await confirmer.sendConfirmation(id);
      return send(res, { sent: 200, not_found: 404, not_approved: 409, invalid_email: 400, mail_error: 502 }[r.status], r);
    }
    if (req.method === 'PATCH' && parts.length === 3) {
      let body;
      try { body = await readJSON(req); } catch { return send(res, 400, { status: 'bad_request', message: 'Invalid request.' }); }
      const r = await review.edit(id, (body && body.changes) || {});
      return send(res, { prepared: 200, rejected: 400, not_found: 404, locked: 409, error: 502 }[r.status], r);
    }
  } catch { return send(res, 500, { status: 'error', message: 'Review failed. Nothing was changed.' }); }
  send(res, 404, { status: 'not_found' });
}

// The only interactions the pages may report. Anything else is refused, so the log cannot be filled with arbitrary text.
const UI_EVENTS = new Set([
  'booking_form_submitted', 'booking_edited', 'booking_approved',
  'confirmation_send_clicked', 'review_page_opened', 'ui_error_shown',
]);
const BOOKING_ID = /^[\w-]{1,64}$/;

async function uiEventApi(req, res, log) {
  if (!log) return send(res, 404, { status: 'not_found' });
  let body;
  try { body = await readJSON(req); } catch { return send(res, 400, { status: 'bad_request', message: 'Invalid request.' }); }
  if (!body || !UI_EVENTS.has(body.event) || (body.bookingId != null && !BOOKING_ID.test(body.bookingId))) {
    return send(res, 400, { status: 'bad_request', message: 'Unknown event.' });
  }
  try {
    log.recordUiEvent({ event: body.event, bookingId: body.bookingId });
    return send(res, 201, { status: 'logged' });
  } catch {
    return send(res, 500, { status: 'error', message: 'The interaction could not be logged.' });
  }
}

function createServer(bookings, review, confirmer, log) {
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && ASSETS[req.url]) {
      res.writeHead(200, { 'Content-Type': ASSETS[req.url][1] });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', ASSETS[req.url][0])));
    }
    if (req.method === 'POST' && req.url === '/api/ui-events') return uiEventApi(req, res, log);
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) return page(res, 'index.html');
    if (req.method === 'GET' && (req.url === '/review' || req.url === '/review.html')) return page(res, 'review.html');
    if (req.url.startsWith('/api/review')) return reviewApi(req, res, review, confirmer);
    if (req.method === 'POST' && req.url === '/bookings') {
      let body;
      try { body = await readJSON(req); } catch { return send(res, 400, { status: 'bad_request', message: 'Invalid request.' }); }
      if (!body || typeof body.requestId !== 'string' || !body.requestId) {
        return send(res, 400, { status: 'bad_request', message: 'requestId is required.' });
      }
      const r = await bookings.createBooking(body.contact, { requestId: body.requestId });
      if (r.status === 'confirmed' && review) {
        const prepared = review.prepare({ id: r.booking.id, contact: body.contact, requestedAt: body.requestedAt, service: body.service });
        r.flag = prepared.flag;
      }
      return send(res, { confirmed: 201, rejected: 400, error: 502 }[r.status], r);
    }
    send(res, 404, { status: 'not_found' });
  });
}

if (require.main === module) {
  const file = process.env.AUDIT_FILE || path.join(__dirname, '..', 'data', 'audit.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const log = createAuditLog({ file });
  const bookings = createBookings({ log });
  const review = createReview({ log });
  let confirmer = null;
  try {
    confirmer = createConfirmer({ review, mailer: createGmailMailer(), log });
  } catch (err) {
    console.warn(err.message + ' — confirmations cannot be sent until it is set.');
  }
  const port = process.env.PORT || 3000;
  createServer(bookings, review, confirmer, log).listen(port, () => console.log(`Booking manager on http://localhost:${port}`));
}

module.exports = { createServer };
