'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createReview } = require('../src/review');
const { createAuditLog } = require('../src/audit');

const contact = { name: 'Sam Lee', email: 'sam@example.com', phone: '555 123 4567' };
const setup = opts => { const log = createAuditLog(); const r = createReview({ log, ...opts }); r.prepare({ id: 'b1', contact }); return { log, r }; };

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
  r.prepare({ id: 'b1', contact: { ...contact, name: 'Other' } });
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
