'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createReview } = require('../src/review');
const { createAuditLog } = require('../src/audit');

const contact = { name: 'Sam Lee', email: 'sam@example.com', phone: '555 123 4567' };
const slot = { requestedAt: '2026-10-10T10:00:00Z', service: 'Haircut' };
const setup = opts => { const log = createAuditLog(); const r = createReview({ log, ...opts }); r.prepare({ id: 'b1', contact, ...slot }); return { log, r }; };

test('lists prepared bookings and approves one, logging the approval', () => {
  const { log, r } = setup();
  assert.strictEqual(r.listPrepared().length, 1);
  const out = r.approve('b1', { approvedBy: 'owner' });
  assert.strictEqual(out.status, 'approved');
  assert.strictEqual(r.listPrepared().length, 0);
  const e = log.entries().find(x => x.type === 'approval');
  assert.deepStrictEqual([e.bookingId, e.approvedBy], ['b1', 'owner']);
});

test('approving twice logs once', () => {
  const { log, r } = setup();
  r.approve('b1', { approvedBy: 'owner' });
  assert.strictEqual(r.approve('b1', { approvedBy: 'owner' }).alreadyApproved, true);
  assert.strictEqual(log.entries().filter(x => x.type === 'approval').length, 1);
});

test('preparing the same booking twice keeps the first', () => {
  const { r } = setup();
  r.prepare({ id: 'b1', contact: { ...contact, name: 'Other' }, ...slot });
  assert.strictEqual(r.listPrepared()[0].contact.name, 'Sam Lee');
});

test('a valid edit is saved before approval', async () => {
  const { r } = setup();
  const out = await r.edit('b1', { phone: '555 999 0000' });
  assert.strictEqual(out.status, 'prepared');
  assert.strictEqual(r.listPrepared()[0].contact.phone, '555 999 0000');
});

test('an edit that fails verification is rejected and nothing changes', async () => {
  const { r } = setup();
  const out = await r.edit('b1', { email: 'bad' });
  assert.strictEqual(out.status, 'rejected');
  assert.strictEqual(r.listPrepared()[0].contact.email, 'sam@example.com');
});

test('an approved booking cannot be edited', async () => {
  const { r } = setup();
  r.approve('b1', { approvedBy: 'owner' });
  assert.strictEqual((await r.edit('b1', { name: 'X' })).status, 'locked');
});

test('logging failure: approval is refused and the booking stays prepared', () => {
  const { r } = setup({ log: { recordApproval() { throw new Error('disk full'); } } });
  const out = r.approve('b1', { approvedBy: 'owner' });
  assert.strictEqual(out.status, 'error');
  assert.strictEqual(r.listPrepared().length, 1);
});

test('verifier failure during edit saves nothing', async () => {
  const { r } = setup({ verify: async () => { throw new Error('down'); } });
  assert.strictEqual((await r.edit('b1', { name: 'Y' })).status, 'error');
  assert.strictEqual(r.listPrepared()[0].contact.name, 'Sam Lee');
});

test('unknown booking ids are reported, not thrown', async () => {
  const { r } = setup();
  assert.strictEqual(r.approve('nope', { approvedBy: 'owner' }).status, 'not_found');
  assert.strictEqual((await r.edit('nope', {})).status, 'not_found');
});

// ---- STORY-002: flagging ----
const flaggedSetup = (extra = {}, opts) => {
  const log = createAuditLog();
  const r = createReview({ log, ...opts });
  r.prepare({ id: 'f1', contact, ...slot, ...extra });
  return { log, r };
};

test('a booking with all required information is not flagged', () => {
  const { log, r } = flaggedSetup();
  assert.deepStrictEqual(r.get('f1').flag, { flagged: false, reasons: [] });
  assert.strictEqual(log.entries().filter(e => e.type === 'booking_flagged').length, 0);
});

test('a booking with missing information is flagged and the flag is recorded with its reason', () => {
  const { log, r } = flaggedSetup({ requestedAt: undefined, service: '' });
  assert.deepStrictEqual(r.get('f1').flag, { flagged: true, reasons: ['missing_requested_time', 'missing_service'] });
  const e = log.entries().find(x => x.type === 'booking_flagged');
  assert.deepStrictEqual([e.bookingId, e.reasons], ['f1', ['missing_requested_time', 'missing_service']]);
  assert.ok(e.at);
});

test('a flagged booking cannot be approved, and nothing is logged as approved', () => {
  const { log, r } = flaggedSetup({ service: undefined });
  const out = r.approve('f1', { approvedBy: 'owner' });
  assert.strictEqual(out.status, 'flagged');
  assert.deepStrictEqual(out.reasons, ['missing_service']);
  assert.strictEqual(log.entries().filter(e => e.type === 'approval').length, 0);
});

test('fixing the missing detail clears the flag and approval then works', async () => {
  const { r } = flaggedSetup({ service: undefined });
  const out = await r.edit('f1', { service: 'Colour' });
  assert.strictEqual(out.booking.flag.flagged, false);
  assert.strictEqual(r.approve('f1', { approvedBy: 'owner' }).status, 'approved');
});

test('a booking close to an existing one is flagged as overlapping', () => {
  const { r } = flaggedSetup();
  r.prepare({ id: 'f2', contact, requestedAt: '2026-10-10T10:30:00Z', service: 'Haircut' });
  assert.deepStrictEqual(r.get('f2').flag.reasons, ['overlaps_existing']);
  assert.strictEqual(r.get('f1').flag.flagged, false);
});

test('corrupted booking data is flagged, not a crash', () => {
  const { r } = flaggedSetup({ requestedAt: 'garbage' });
  assert.deepStrictEqual(r.get('f1').flag.reasons, ['corrupted_data']);
});

test('flagging system failure: the booking is still flagged and blocked, and the log write is retried', () => {
  const real = createAuditLog(); let failing = true;
  const log = { recordApproval: x => real.recordApproval(x), recordFlag: x => { if (failing) throw new Error('disk'); return real.recordFlag(x); } };
  const r = createReview({ log });
  r.prepare({ id: 'f1', contact, requestedAt: undefined, service: 'Haircut' });
  assert.deepStrictEqual([r.get('f1').flag.flagged, r.get('f1').flagLogFailed], [true, true]);
  assert.strictEqual(r.approve('f1', { approvedBy: 'owner' }).status, 'flagged');
  failing = false;
  r.listPrepared();
  assert.strictEqual(r.get('f1').flagLogFailed, false);
  assert.strictEqual(real.entries().filter(e => e.type === 'booking_flagged').length, 1);
});

test('flag log entries hold reasons only, never contact details', () => {
  const { log } = flaggedSetup({ service: undefined });
  assert.ok(!JSON.stringify(log.entries().filter(e => e.type === 'booking_flagged')).includes('sam@example.com'));
});
