'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createConfirmer } = require('../src/confirm');
const { createReview } = require('../src/review');
const { createAuditLog } = require('../src/audit');

const contact = { name: 'Sam Lee', email: 'sam@example.com', phone: '555 123 4567' };
function setup({ mailer, log = createAuditLog(), approve = true, c = contact } = {}) {
  const sent = [];
  const fake = mailer || { send: async m => { sent.push(m); } };
  const review = createReview({ log });
  review.prepare({ id: 'b1', contact: c, requestedAt: '2026-10-10T10:00:00Z', service: 'Haircut' });
  if (approve) review.approve('b1', { approvedBy: 'owner' });
  return { sent, log, review, confirmer: createConfirmer({ review, mailer: fake, log }) };
}

test('sends one email for an approved booking, marks it sent and logs it', async () => {
  const { sent, log, review, confirmer } = setup();
  const r = await confirmer.sendConfirmation('b1');
  assert.deepStrictEqual([r.status, r.logged], ['sent', true]);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].to, 'sam@example.com');
  assert.strictEqual(review.get('b1').status, 'sent');
  const e = log.entries().find(x => x.type === 'confirmation_sent');
  assert.strictEqual(e.bookingId, 'b1');
  assert.ok(e.at);
  assert.ok(!JSON.stringify(e).includes('sam@example.com'));
});

test('refuses to send before the owner approves', async () => {
  const { sent, confirmer } = setup({ approve: false });
  assert.strictEqual((await confirmer.sendConfirmation('b1')).status, 'not_approved');
  assert.strictEqual(sent.length, 0);
});

test('a booking without a valid email gets an error and nothing is sent', async () => {
  // The review store now blocks such a booking earlier (it is flagged), so test the sender's own check directly.
  const sent = [];
  const stub = { get: () => ({ id: 'b1', status: 'approved', contact: { ...contact, email: '' } }), markSent() { throw new Error('must not be called'); } };
  const confirmer = createConfirmer({ review: stub, mailer: { send: async m => { sent.push(m); } }, log: createAuditLog() });
  const r = await confirmer.sendConfirmation('b1');
  assert.strictEqual(r.status, 'invalid_email');
  assert.match(r.message, /email/);
  assert.strictEqual(sent.length, 0);
});

test('a booking with a blank email is flagged, so it can never be approved or sent', async () => {
  const { sent, confirmer } = setup({ c: { ...contact, email: '' } });
  const r = await confirmer.sendConfirmation('b1');
  assert.strictEqual(r.status, 'not_approved');
  assert.strictEqual(sent.length, 0);
});

test('Gmail down: booking stays approved and can be retried', async () => {
  let up = false; const sent = [];
  const mailer = { send: async m => { if (!up) throw new Error('503'); sent.push(m); } };
  const { review, confirmer } = setup({ mailer });
  assert.strictEqual((await confirmer.sendConfirmation('b1')).status, 'mail_error');
  assert.strictEqual(review.get('b1').status, 'approved');
  up = true;
  assert.strictEqual((await confirmer.sendConfirmation('b1')).status, 'sent');
  assert.strictEqual(sent.length, 1);
});

test('sending twice emails once and logs once', async () => {
  const { sent, log, confirmer } = setup();
  await confirmer.sendConfirmation('b1');
  const again = await confirmer.sendConfirmation('b1');
  assert.strictEqual(again.alreadySent, true);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(log.entries().filter(x => x.type === 'confirmation_sent').length, 1);
});

test('log failure after sending: no second email, and the log is retried later', async () => {
  const real = createAuditLog(); let failing = true;
  const log = { recordApproval: x => real.recordApproval(x), recordSend: x => { if (failing) throw new Error('disk'); return real.recordSend(x); } };
  const { sent, confirmer } = setup({ log });
  assert.strictEqual((await confirmer.sendConfirmation('b1')).logged, false);
  failing = false;
  const retry = await confirmer.sendConfirmation('b1');
  assert.deepStrictEqual([retry.alreadySent, retry.logged], [true, true]);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(real.entries().filter(x => x.type === 'confirmation_sent').length, 1);
});

test('unknown booking', async () => {
  assert.strictEqual((await setup().confirmer.sendConfirmation('nope')).status, 'not_found');
});
