'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { verifyContact } = require('../src/verify');

test('accepts correct contact details', () => {
  const r = verifyContact({ name: 'Sam Lee', email: 'sam@example.com', phone: '+1 (555) 123-4567' });
  assert.deepStrictEqual(r, { ok: true, errors: [] });
});

test('flags an invalid email', () => {
  const r = verifyContact({ name: 'Sam Lee', email: 'sam@', phone: '555 123 4567' });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.errors.map(e => e.field), ['email']);
});

test('flags an invalid phone and a missing name', () => {
  const r = verifyContact({ name: '  ', email: 'sam@example.com', phone: 'abc' });
  assert.deepStrictEqual(r.errors.map(e => e.field), ['name', 'phone']);
});

test('treats missing or non-object input as invalid, not a crash', () => {
  assert.strictEqual(verifyContact(undefined).ok, false);
  assert.strictEqual(verifyContact(null).errors.length, 3);
});
