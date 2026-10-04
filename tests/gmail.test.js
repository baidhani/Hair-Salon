'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createGmailMailer, buildRaw } = require('../src/gmail');

const env = { GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 'secret', GMAIL_REFRESH_TOKEN: 'refresh' };
const msg = { to: 'sam@example.com', subject: 'Your booking is confirmed', text: 'Hello Sam' };
const ok = body => ({ ok: true, status: 200, json: async () => body });
const fail = status => ({ ok: false, status, json: async () => ({}) });
const make = (handler, opts = {}) => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return handler(url, init, calls); };
  return { calls, mailer: createGmailMailer({ env, fetch, sleep: async () => {}, ...opts }) };
};
const isToken = url => url.includes('oauth2');

test('refuses to start without credentials and names what is missing', () => {
  assert.throws(() => createGmailMailer({ env: { GMAIL_CLIENT_ID: 'x' } }), /GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN/);
});

test('gets a token, then sends the message once', async () => {
  const { calls, mailer } = make(url => (isToken(url) ? ok({ access_token: 'tok' }) : ok({})));
  await mailer.send(msg);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].init.headers.Authorization, 'Bearer tok');
  const raw = Buffer.from(JSON.parse(calls[1].init.body).raw, 'base64url').toString();
  assert.match(raw, /^To: sam@example.com/);
});

test('retries the send only when Gmail answers 5xx, up to the cap', async () => {
  let sends = 0;
  const { mailer } = make(url => (isToken(url) ? ok({ access_token: 't' }) : (++sends < 3 ? fail(503) : ok({}))));
  await mailer.send(msg);
  assert.strictEqual(sends, 3);
});

test('gives up after the capped retries when Gmail stays down', async () => {
  let sends = 0;
  const { mailer } = make(url => (isToken(url) ? ok({ access_token: 't' }) : (sends++, fail(503))));
  await assert.rejects(mailer.send(msg), /503/);
  assert.strictEqual(sends, 3);
});

test('does not retry a 400 from Gmail', async () => {
  let sends = 0;
  const { mailer } = make(url => (isToken(url) ? ok({ access_token: 't' }) : (sends++, fail(400))));
  await assert.rejects(mailer.send(msg));
  assert.strictEqual(sends, 1);
});

test('does not retry a send that dropped or timed out (it may have gone through)', async () => {
  let sends = 0;
  const { mailer } = make(url => { if (isToken(url)) return ok({ access_token: 't' }); sends++; throw new Error('socket hang up'); });
  await assert.rejects(mailer.send(msg));
  assert.strictEqual(sends, 1);
});

test('retries a failed token request', async () => {
  let tokens = 0;
  const { mailer } = make(url => { if (isToken(url)) { if (++tokens < 2) throw new Error('net'); return ok({ access_token: 't' }); } return ok({}); });
  await mailer.send(msg);
  assert.strictEqual(tokens, 2);
});

test('error messages never contain the credentials', async () => {
  const { mailer } = make(() => fail(401));
  await assert.rejects(mailer.send(msg), err => !/secret|refresh/.test(err.message));
});

test('header injection in the recipient or subject is neutralised', () => {
  const raw = Buffer.from(buildRaw({ to: 'a@b.com\r\nBcc: evil@x.com', subject: 'Hi\r\nBcc: evil@x.com', text: 't' }), 'base64url').toString();
  assert.ok(!/^Bcc:/m.test(raw));
});
