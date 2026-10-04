'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createBookings } = require('../src/bookings');
const { createAuditLog } = require('../src/audit');

const good = { name: 'Sam Lee', email: 'sam@example.com', phone: '555 123 4567' };
const setup = opts => { const log = createAuditLog(); return { log, svc: createBookings({ log, ...opts }) }; };

test('confirms a booking when contact details verify, and logs it', async () => {
  const { log, svc } = setup();
  const r = await svc.createBooking(good, { requestId: 'a' });
  assert.strictEqual(r.status, 'confirmed');
  assert.strictEqual(log.entries()[0].outcome, 'verified');
});

test('rejects incorrect contact info, flags the fields and does not confirm', async () => {
  const { log, svc } = setup();
  const r = await svc.createBooking({ ...good, email: 'nope' }, { requestId: 'b' });
  assert.strictEqual(r.status, 'rejected');
  assert.strictEqual(r.booking, undefined);
  assert.deepStrictEqual(r.errors.map(e => e.field), ['email']);
  assert.strictEqual(log.entries()[0].outcome, 'rejected');
});

test('blocks the booking when verification throws (network error)', async () => {
  const { log, svc } = setup({ verify: async () => { throw new Error('ECONNRESET'); } });
  const r = await svc.createBooking(good, { requestId: 'c' });
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(log.entries()[0].outcome, 'error');
});

test('blocks the booking when verification times out', async () => {
  const { svc } = setup({ verify: () => new Promise(() => {}), timeoutMs: 20 });
  const r = await svc.createBooking(good, { requestId: 'd' });
  assert.strictEqual(r.status, 'error');
});

test('repeating a request does not verify, log or book twice', async () => {
  let calls = 0;
  const { log, svc } = setup({ verify: c => { calls++; return { ok: true, errors: [] }; } });
  const first = await svc.createBooking(good, { requestId: 'e' });
  const second = await svc.createBooking(good, { requestId: 'e' });
  assert.deepStrictEqual(second, first);
  assert.strictEqual(calls, 1);
  assert.strictEqual(log.entries().length, 1);
});
