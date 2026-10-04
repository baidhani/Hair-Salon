'use strict';
const { verifyContact } = require('./verify');

// Creates bookings. A booking is only confirmed when contact verification passes.
// Idempotent on requestId: repeating a request returns the first outcome and does not verify, log or book again.
// `verify` may be sync or async (e.g. a future external check); it gets a timeout and a failure blocks the booking.
function createBookings({ verify = verifyContact, log, timeoutMs = 2000 }) {
  const outcomes = new Map();

  function withTimeout(work) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('verification timed out')), timeoutMs); });
    return Promise.race([Promise.resolve().then(work), timeout]).finally(() => clearTimeout(timer));
  }

  async function createBooking(contact, { requestId }) {
    if (!requestId) throw new Error('requestId is required');
    if (outcomes.has(requestId)) return outcomes.get(requestId);

    let outcome;
    try {
      const result = await withTimeout(() => verify(contact));
      log.record({ requestId, result });
      outcome = result.ok
        ? { status: 'confirmed', booking: { id: 'booking-' + requestId, name: contact.name.trim() } }
        : { status: 'rejected', errors: result.errors };
    } catch (err) {
      log.record({ requestId, result: { ok: false, error: true, errors: [] } });
      outcome = { status: 'error', message: 'Could not verify contact details. Please try again.' };
    }
    outcomes.set(requestId, outcome);
    return outcome;
  }

  return { createBooking };
}

module.exports = { createBookings };
