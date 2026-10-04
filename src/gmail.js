'use strict';

// Sends mail through the Gmail API (REQ-005). Credentials come from environment variables only:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
// Nothing here is ever logged or stored. The message is sent from the authorised Gmail account.
//
// Every request has a timeout. Retries are capped, and only where repeating cannot send two emails:
//  - the token request is safe to repeat, so it is retried on network errors, 429 and 5xx;
//  - the send request is retried only when Gmail answered 429/5xx (it did not accept the message).
//    A timeout or dropped connection on the send is NOT retried: Gmail might have accepted it.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const REQUIRED = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];

const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const header = s => String(s).replace(/[\r\n]+/g, ' ').trim(); // blocks header injection
const retryable = status => status === 429 || status >= 500;

function buildRaw({ to, subject, text }) {
  const lines = [
    `To: ${header(to)}`,
    `Subject: =?UTF-8?B?${Buffer.from(header(subject)).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(text)).toString('base64'),
  ];
  return b64url(lines.join('\r\n'));
}

function createGmailMailer({ env = process.env, fetch = globalThis.fetch, timeoutMs = 10000, retries = 2, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const missing = REQUIRED.filter(k => !env[k]);
  if (missing.length) throw new Error('Gmail is not configured. Missing: ' + missing.join(', '));

  async function call(url, init, { retryOnNetworkError }) {
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt) await sleep(250 * attempt);
      try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return res;
        last = new Error('Gmail request failed with status ' + res.status);
        if (!retryable(res.status)) throw Object.assign(last, { final: true });
      } catch (err) {
        if (err.final) throw err;
        last = err.status ? err : new Error('Gmail request failed: ' + (err.name || 'network error'));
        if (!retryOnNetworkError) throw last; // ambiguous for a send: it may have gone through
      }
    }
    throw last;
  }

  async function accessToken() {
    const body = new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token',
    });
    const res = await call(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, { retryOnNetworkError: true });
    const { access_token } = await res.json();
    if (!access_token) throw new Error('Gmail did not return an access token');
    return access_token;
  }

  async function send({ to, subject, text }) {
    if (!to) throw new Error('A recipient is required');
    const token = await accessToken();
    await call(SEND_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: buildRaw({ to, subject, text }) }),
    }, { retryOnNetworkError: false });
  }

  return { send };
}

module.exports = { createGmailMailer, buildRaw };
