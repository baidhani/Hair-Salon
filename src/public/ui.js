// Shared helpers for the booking pages: requests with a timeout, user feedback, and interaction logging.
// createUI takes the browser pieces as arguments so the same code can be tested in Node.
function createUI({ document, window, fetch, timeoutMs = 10000 }) {
  // Turns any failure into a sentence the owner can act on. Never exposes technical detail.
  function friendlyMessage(err) {
    if (err && err.name === 'TimeoutError') return 'The server took too long to answer. Nothing was changed — please try again.';
    return 'Could not reach the server. Nothing was changed — please check your connection and try again.';
  }

  // Shows feedback in the page. If the page element is missing or breaks, fall back to the browser's own alert
  // so a failure is never silent.
  function notify(kind, text) {
    try {
      const el = document.getElementById('feedback');
      if (!el) throw new Error('no feedback element');
      el.className = 'feedback ' + kind;
      el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      el.textContent = text;
      return 'page';
    } catch (e) {
      try { window.alert(text); } catch (e2) { /* nothing left to try */ }
      return 'alert';
    }
  }

  // JSON request with a timeout. Resolves { ok, status, data }; rejects with a friendly Error on network failure/timeout.
  async function request(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new Error(friendlyMessage(err));
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON answer: leave data empty */ }
    return { ok: res.ok, status: res.status, data };
  }

  // Records that an interaction happened. Fire-and-forget: a logging failure must never get in the owner's way.
  function logEvent(event, bookingId) {
    try {
      const p = fetch('/api/ui-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingId ? { event, bookingId } : { event }),
        keepalive: true, signal: AbortSignal.timeout(timeoutMs),
      });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignored on purpose */ }
  }

  // Catches errors that would otherwise leave a blank or half-working page.
  function installErrorHandler() {
    const report = () => {
      notify('error', 'Something went wrong on this page. Please refresh it. If the problem continues, your last action may not have been saved.');
      logEvent('ui_error_shown');
    };
    window.addEventListener('error', report);
    window.addEventListener('unhandledrejection', report);
  }

  return { friendlyMessage, notify, request, logEvent, installErrorHandler };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createUI };
else window.UI = createUI({ document, window, fetch: window.fetch.bind(window) });
