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
const post = (url, body, raw) => fetch(url + '/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body) });

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
  assert.match(await (await fetch(url + '/review')).text(), /Review prepared bookings/);
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
