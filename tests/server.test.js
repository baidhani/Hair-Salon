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
