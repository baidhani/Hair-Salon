'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createUI } = require('../src/public/ui');

const el = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
function make({ feedback = el(), fetch = async () => ({ ok: true, status: 200, json: async () => ({}) }), alerts = [] } = {}) {
  const listeners = {};
  const window = { alert: m => alerts.push(m), addEventListener: (n, f) => { listeners[n] = f; } };
  const document = { getElementById: id => (id === 'feedback' ? feedback : null) };
  return { ui: createUI({ document, window, fetch, timeoutMs: 50 }), feedback, alerts, listeners };
}

test('notify shows the message in the page with an alert role for errors', () => {
  const { ui, feedback } = make();
  assert.strictEqual(ui.notify('error', 'Bad'), 'page');
  assert.deepStrictEqual([feedback.className, feedback.textContent, feedback.attrs.role], ['feedback error', 'Bad', 'alert']);
});

test('feedback mechanism failure: falls back to a browser alert, never silent', () => {
  const { ui, alerts } = make({ feedback: null });
  assert.strictEqual(ui.notify('error', 'Bad'), 'alert');
  assert.deepStrictEqual(alerts, ['Bad']);
});

test('request returns status and data without throwing on a 400', async () => {
  const { ui } = make({ fetch: async () => ({ ok: false, status: 400, json: async () => ({ status: 'rejected' }) }) });
  assert.deepStrictEqual(await ui.request('POST', '/x', {}), { ok: false, status: 400, data: { status: 'rejected' } });
});

test('network failure becomes a friendly message, not a raw error', async () => {
  const { ui } = make({ fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(ui.request('GET', '/x'), /Could not reach the server\. Nothing was changed/);
});

test('timeouts get their own friendly message', async () => {
  const { ui } = make({ fetch: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason))) });
  await assert.rejects(ui.request('GET', '/x'), /took too long/);
});

test('logEvent never throws or rejects, even when logging fails', async () => {
  const { ui } = make({ fetch: async () => { throw new Error('down'); } });
  ui.logEvent('review_page_opened');
  const { ui: ui2 } = make({ fetch: () => { throw new Error('sync boom'); } });
  ui2.logEvent('review_page_opened');
  await new Promise(r => setTimeout(r, 10));
});

test('error handler shows feedback and logs ui_error_shown', async () => {
  const sent = [];
  const { ui, feedback, listeners } = make({ fetch: async (u, init) => { sent.push(JSON.parse(init.body)); return { ok: true, json: async () => ({}) }; } });
  ui.installErrorHandler();
  listeners.error();
  assert.match(feedback.textContent, /Something went wrong/);
  assert.deepStrictEqual(sent, [{ event: 'ui_error_shown' }]);
  assert.ok(listeners.unhandledrejection);
});
