'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { assessBooking } = require('../src/flag');

const complete = {
  id: 'b1',
  contact: { name: 'Sam Lee', email: 'sam@example.com', phone: '555 123 4567' },
  requestedAt: '2026-10-10T10:00:00Z',
  service: 'Haircut',
};

test('a booking with all required information is not flagged', () => {
  assert.deepStrictEqual(assessBooking(complete), { flagged: false, reasons: [] });
});

test('a missing requested time flags the booking', () => {
  const r = assessBooking({ ...complete, requestedAt: undefined });
  assert.deepStrictEqual(r, { flagged: true, reasons: ['missing_requested_time'] });
});

test('a missing service flags the booking', () => {
  assert.deepStrictEqual(assessBooking({ ...complete, service: '  ' }).reasons, ['missing_service']);
});

test('missing contact information flags the booking', () => {
  assert.deepStrictEqual(assessBooking({ ...complete, contact: { ...complete.contact, phone: '' } }).reasons, ['missing_contact']);
  assert.deepStrictEqual(assessBooking({ ...complete, contact: undefined }).reasons, ['missing_contact']);
});

test('every missing piece is reported, in a fixed order', () => {
  const r = assessBooking({ id: 'x' });
  assert.deepStrictEqual(r.reasons, ['missing_contact', 'missing_requested_time', 'missing_service']);
});

test('overlapping another booking flags it, but not a different booking far away', () => {
  const near = { id: 'b2', requestedAt: '2026-10-10T10:30:00Z' };
  const far = { id: 'b3', requestedAt: '2026-10-10T12:00:00Z' };
  assert.deepStrictEqual(assessBooking(complete, { existing: [near] }).reasons, ['overlaps_existing']);
  assert.strictEqual(assessBooking(complete, { existing: [far] }).flagged, false);
});

test('a booking never overlaps itself', () => {
  assert.strictEqual(assessBooking(complete, { existing: [complete] }).flagged, false);
});

test('corrupted data is flagged, never thrown', () => {
  for (const bad of [null, undefined, 'text', 42, [], () => {}]) {
    assert.deepStrictEqual(assessBooking(bad), { flagged: true, reasons: ['corrupted_data'] });
  }
  assert.ok(assessBooking({ ...complete, requestedAt: 'not a date' }).reasons.includes('corrupted_data'));
  assert.ok(assessBooking({ ...complete, requestedAt: 12345 }).reasons.includes('corrupted_data'));
  assert.ok(assessBooking({ ...complete, contact: 'Sam' }).reasons.includes('corrupted_data'));
});

test('unreadable or malformed entries in the existing list are ignored, not fatal', () => {
  const existing = [null, 'junk', { id: 'z', requestedAt: 'nope' }, { id: 'y' }];
  assert.deepStrictEqual(assessBooking(complete, { existing }), { flagged: false, reasons: [] });
  assert.strictEqual(assessBooking(complete, { existing: 'not a list' }).flagged, false);
});
