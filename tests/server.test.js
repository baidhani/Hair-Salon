'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../src/server');
const { createBookings } = require('../src/bookings');
const { createAuditLog } = require('../src/audit');

const good = { name: 'Sam Lee', email: 'sam@example.com', phone: '555 123 4567' };

async function withServer(opts, fn) {
  const server = createServer(createBookings({ log: createAuditLog(), ...opts }));
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port;
  try { await fn(url); } finally { server.close(); }
}
// Bookings default to a complete time and service; a test overrides them (or sets undefined) to get a flagged booking.
const slotDefaults = { requestedAt: '2026-10-10T10:00:00Z', service: 'Haircut' };
const post = (url, body, raw) => fetch(url + '/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body && body.contact ? { ...slotDefaults, ...body } : body) });

test('201 for a valid booking', () => withServer({}, async url => {
  const res = await post(url, { requestId: 'a', contact: good });
  assert.strictEqual(res.status, 201);
  assert.strictEqual((await res.json()).status, 'confirmed');
}));

test('400 with field errors for incorrect contact info', () => withServer({}, async url => {
  const res = await post(url, { requestId: 'b', contact: { ...good, phone: 'x' } });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual((await res.json()).errors.map(e => e.field), ['phone']);
}));

test('502 when verification fails', () => withServer({ verify: async () => { throw new Error('down'); } }, async url => {
  assert.strictEqual((await post(url, { requestId: 'c', contact: good })).status, 502);
}));

test('400 for malformed JSON or a missing requestId', () => withServer({}, async url => {
  assert.strictEqual((await post(url, null, '{nope')).status, 400);
  assert.strictEqual((await post(url, { contact: good })).status, 400);
}));

test('serves the booking form', () => withServer({}, async url => {
  const res = await fetch(url + '/');
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /New booking/);
}));

// ---- STORY-003: review and approval ----
const { createReview } = require('../src/review');

async function withReview(opts, fn) {
  const log = opts.log || createAuditLog();
  const server = createServer(createBookings({ log }), createReview({ log, ...(opts.review || {}) }));
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port;
  try { await fn(url, log); } finally { server.close(); }
}
const send = (url, method, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });

test('a verified booking appears for review, can be corrected, approved and the approval is logged', () => withReview({}, async (url, log) => {
  const made = await (await post(url, { requestId: 'r1', contact: good })).json();
  let list = await (await fetch(url + '/api/review')).json();
  assert.strictEqual(list.bookings.length, 1);

  const bad = await send(url + '/api/review/' + made.booking.id, 'PATCH', { changes: { email: 'bad' } });
  assert.strictEqual(bad.status, 400);
  const fixed = await send(url + '/api/review/' + made.booking.id, 'PATCH', { changes: { phone: '555 000 1111' } });
  assert.strictEqual(fixed.status, 200);

  const ok = await send(url + '/api/review/' + made.booking.id + '/approve', 'POST');
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(log.entries().filter(e => e.type === 'approval').length, 1);
  list = await (await fetch(url + '/api/review')).json();
  assert.strictEqual(list.bookings.length, 0);
}));

test('a rejected booking never reaches review', () => withReview({}, async url => {
  await post(url, { requestId: 'r2', contact: { ...good, email: 'x' } });
  assert.strictEqual((await (await fetch(url + '/api/review')).json()).bookings.length, 0);
}));

test('approval returns 500 and stays prepared when logging fails', () => withReview({ review: { log: { recordApproval() { throw new Error('disk'); } } } }, async url => {
  const made = await (await post(url, { requestId: 'r3', contact: good })).json();
  assert.strictEqual((await send(url + '/api/review/' + made.booking.id + '/approve', 'POST')).status, 500);
  assert.strictEqual((await (await fetch(url + '/api/review')).json()).bookings.length, 1);
}));

test('unknown booking is 404; review page is served', () => withReview({}, async url => {
  assert.strictEqual((await send(url + '/api/review/nope/approve', 'POST')).status, 404);
  assert.match(await (await fetch(url + '/review')).text(), /Review and send/);
}));

// ---- STORY-004: sending confirmations ----
const { createConfirmer } = require('../src/confirm');

async function withSender(mailer, fn) {
  const log = createAuditLog();
  const review = createReview({ log });
  const confirmer = mailer ? createConfirmer({ review, mailer, log }) : null;
  const server = createServer(createBookings({ log }), review, confirmer);
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port;
  try { await fn(url, log); } finally { server.close(); }
}
async function approved(url, contact = good, requestId = 'q1') {
  const made = await (await post(url, { requestId, contact })).json();
  await send(url + '/api/review/' + made.booking.id + '/approve', 'POST');
  return made.booking.id;
}

test('sends a confirmation for an approved booking and logs it', () => {
  const sent = [];
  return withSender({ send: async m => { sent.push(m); } }, async (url, log) => {
    const id = await approved(url);
    assert.strictEqual((await send(url + '/api/review/' + id + '/send', 'POST')).status, 200);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(log.entries().filter(e => e.type === 'confirmation_sent').length, 1);
    assert.strictEqual((await (await fetch(url + '/api/review')).json()).approved.length, 0);
  });
});

test('409 when the booking is not approved yet', () => withSender({ send: async () => {} }, async url => {
  const made = await (await post(url, { requestId: 'q2', contact: good })).json();
  assert.strictEqual((await send(url + '/api/review/' + made.booking.id + '/send', 'POST')).status, 409);
}));

test('502 and still approved when Gmail is down', () => withSender({ send: async () => { throw new Error('down'); } }, async url => {
  const id = await approved(url, good, 'q3');
  assert.strictEqual((await send(url + '/api/review/' + id + '/send', 'POST')).status, 502);
  assert.strictEqual((await (await fetch(url + '/api/review')).json()).approved.length, 1);
}));

test('503 with a clear message when Gmail is not configured', () => withSender(null, async url => {
  const id = await approved(url, good, 'q4');
  const res = await send(url + '/api/review/' + id + '/send', 'POST');
  assert.strictEqual(res.status, 503);
  assert.match((await res.json()).message, /not configured/);
}));

// ---- STORY-005: UI interaction log ----
async function withUiLog(log, fn) {
  const server = createServer(createBookings({ log }), null, null, log);
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port;
  try { await fn(url); } finally { server.close(); }
}

test('logs a known UI interaction with a timestamp and no contact details', () => {
  const log = createAuditLog();
  return withUiLog(log, async url => {
    const res = await send(url + '/api/ui-events', 'POST', { event: 'booking_approved', bookingId: 'booking-r1' });
    assert.strictEqual(res.status, 201);
    const e = log.entries().find(x => x.type === 'ui_event');
    assert.deepStrictEqual([e.event, e.bookingId], ['booking_approved', 'booking-r1']);
    assert.ok(e.at);
  });
});

test('refuses unknown events and malformed booking ids', () => {
  const log = createAuditLog();
  return withUiLog(log, async url => {
    assert.strictEqual((await send(url + '/api/ui-events', 'POST', { event: 'drop table' })).status, 400);
    assert.strictEqual((await send(url + '/api/ui-events', 'POST', { event: 'booking_approved', bookingId: 'sam@example.com' })).status, 400);
    assert.strictEqual(log.entries().length, 0);
  });
});

test('500 with a message when the interaction cannot be logged', () => withUiLog({ recordUiEvent() { throw new Error('disk'); }, record() {} }, async url => {
  assert.strictEqual((await send(url + '/api/ui-events', 'POST', { event: 'review_page_opened' })).status, 500);
}));

test('the same interaction twice is logged twice (each really happened)', () => {
  const log = createAuditLog();
  return withUiLog(log, async url => {
    await send(url + '/api/ui-events', 'POST', { event: 'review_page_opened' });
    await send(url + '/api/ui-events', 'POST', { event: 'review_page_opened' });
    assert.strictEqual(log.entries().filter(e => e.type === 'ui_event').length, 2);
  });
});

test('serves the shared UI files, and nothing else from the public folder', () => withServer({}, async url => {
  assert.match((await fetch(url + '/ui.css')).headers.get('content-type'), /css/);
  assert.match((await fetch(url + '/ui.js')).headers.get('content-type'), /javascript/);
  assert.strictEqual((await fetch(url + '/server.js')).status, 404);
}));

// ---- STORY-002: flags over HTTP ----
test('a booking without a time is prepared but flagged, listed with its reason, and cannot be approved', () => withReview({}, async (url, log) => {
  const made = await (await post(url, { requestId: 'fl1', contact: good, requestedAt: undefined })).json();
  assert.deepStrictEqual(made.flag, { flagged: true, reasons: ['missing_requested_time'] });
  const list = await (await fetch(url + '/api/review')).json();
  assert.deepStrictEqual(list.bookings[0].flag.reasons, ['missing_requested_time']);
  assert.strictEqual((await send(url + '/api/review/' + made.booking.id + '/approve', 'POST')).status, 409);
  assert.strictEqual(log.entries().filter(e => e.type === 'booking_flagged').length, 1);
}));

test('a complete booking is not flagged', () => withReview({}, async url => {
  const made = await (await post(url, { requestId: 'fl2', contact: good })).json();
  assert.strictEqual(made.flag.flagged, false);
}));

test('editing in the missing time over HTTP clears the flag', () => withReview({}, async url => {
  const made = await (await post(url, { requestId: 'fl3', contact: good, requestedAt: undefined })).json();
  const res = await send(url + '/api/review/' + made.booking.id, 'PATCH', { changes: { requestedAt: '2026-10-11T09:00:00Z' } });
  assert.strictEqual((await res.json()).booking.flag.flagged, false);
  assert.strictEqual((await send(url + '/api/review/' + made.booking.id + '/approve', 'POST')).status, 200);
}));
