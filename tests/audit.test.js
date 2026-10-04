'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAuditLog } = require('../src/audit');

const fixed = () => new Date('2026-10-04T12:00:00Z');

test('logs a verified contact without storing contact details', () => {
  const log = createAuditLog({ now: fixed });
  const e = log.record({ requestId: 'r1', result: { ok: true, errors: [] } });
  assert.deepStrictEqual(e, { requestId: 'r1', at: '2026-10-04T12:00:00.000Z', outcome: 'verified', failedFields: [] });
});

test('logs a rejection with the failed field names', () => {
  const log = createAuditLog({ now: fixed });
  const e = log.record({ requestId: 'r2', result: { ok: false, errors: [{ field: 'email', message: 'x' }] } });
  assert.strictEqual(e.outcome, 'rejected');
  assert.deepStrictEqual(e.failedFields, ['email']);
});

test('recording the same request twice does not duplicate it', () => {
  const log = createAuditLog({ now: fixed });
  log.record({ requestId: 'r1', result: { ok: true, errors: [] } });
  log.record({ requestId: 'r1', result: { ok: true, errors: [] } });
  assert.strictEqual(log.entries().length, 1);
});

test('persists to a file and does not duplicate after a restart', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'audit-')), 'audit.jsonl');
  createAuditLog({ file, now: fixed }).record({ requestId: 'r1', result: { ok: true, errors: [] } });
  const again = createAuditLog({ file, now: fixed });
  again.record({ requestId: 'r1', result: { ok: true, errors: [] } });
  assert.strictEqual(again.entries().length, 1);
  assert.strictEqual(fs.readFileSync(file, 'utf8').trim().split('\n').length, 1);
});

test('requires a requestId', () => {
  assert.throws(() => createAuditLog().record({ result: { ok: true, errors: [] } }), /requestId/);
});
