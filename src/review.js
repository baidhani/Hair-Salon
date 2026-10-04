'use strict';
const { verifyContact } = require('./verify');
const { assessBooking } = require('./flag');

// Holds prepared bookings until the salon owner approves them. Nothing is sent from here (that is STORY-004).
// States: prepared -> approved -> sent (sent is set by the confirmation sender, STORY-004). Edits are only allowed while prepared, and must pass contact verification again.
function createReview({ verify = verifyContact, log }) {
  const bookings = new Map();
  const view = b => ({
    id: b.id, contact: { ...b.contact }, requestedAt: b.requestedAt, service: b.service, status: b.status,
    flag: { flagged: b.flag.flagged, reasons: [...b.flag.reasons] }, flagLogFailed: b.flagLogFailed,
  });

  // Every flagged booking must be on record with its reasons. If the log write fails the flag still stands
  // (the booking stays blocked) and the write is retried the next time the list is read or the booking is edited.
  function ensureFlagLogged(b) {
    b.flagLogFailed = false;
    if (!b.flag.flagged) return;
    try { log.recordFlag({ bookingId: b.id, reasons: b.flag.reasons }); } catch { b.flagLogFailed = true; }
  }

  // Re-checks a booking against all the others (approved and sent ones still occupy their slot).
  function assess(b) {
    const others = [...bookings.values()].filter(o => o !== b).map(view);
    b.flag = assessBooking(b, { existing: others });
    ensureFlagLogged(b);
  }

  // Idempotent on id: preparing the same booking twice keeps the first one.
  function prepare({ id, contact, requestedAt, service }) {
    if (!id) throw new Error('id is required');
    if (!bookings.has(id)) {
      const b = { id, contact: { ...contact }, requestedAt, service, status: 'prepared', flag: { flagged: false, reasons: [] }, flagLogFailed: false };
      bookings.set(id, b);
      assess(b);
    }
    return view(bookings.get(id));
  }

  const listByStatus = status => [...bookings.values()].filter(b => b.status === status).map(view);
  const listPrepared = () => {
    for (const b of bookings.values()) if (b.flagLogFailed) ensureFlagLogged(b);
    return listByStatus('prepared');
  };

  async function edit(id, changes) {
    const b = bookings.get(id);
    if (!b) return { status: 'not_found' };
    if (b.status !== 'prepared') return { status: 'locked', message: 'Approved bookings cannot be edited.' };
    const merged = { ...b.contact, ...changes };
    let result;
    try { result = await verify(merged); } catch { return { status: 'error', message: 'Could not verify the change. Nothing was saved.' }; }
    if (!result.ok) return { status: 'rejected', errors: result.errors };
    b.contact = merged;
    if ('requestedAt' in changes) b.requestedAt = changes.requestedAt;
    if ('service' in changes) b.service = changes.service;
    assess(b);
    return { status: 'prepared', booking: view(b) };
  }

  // The approval is logged first. If logging fails the booking stays prepared, so no approval goes unrecorded.
  function approve(id, { approvedBy }) {
    const b = bookings.get(id);
    if (!b) return { status: 'not_found' };
    if (b.status === 'approved') return { status: 'approved', booking: view(b), alreadyApproved: true };
    if (b.flag.flagged) return { status: 'flagged', reasons: [...b.flag.reasons], message: 'This booking is flagged for review. Fix the flagged details before approving it.' };
    try { log.recordApproval({ bookingId: id, approvedBy }); } catch { return { status: 'error', message: 'Could not record the approval. The booking was not approved.' }; }
    b.status = 'approved';
    return { status: 'approved', booking: view(b) };
  }

  const get = id => (bookings.has(id) ? view(bookings.get(id)) : null);

  // Only an approved booking can become sent; marking an already-sent booking again changes nothing.
  function markSent(id) {
    const b = bookings.get(id);
    if (!b) return { status: 'not_found' };
    if (b.status === 'prepared') return { status: 'not_approved' };
    b.status = 'sent';
    return { status: 'sent', booking: view(b) };
  }

  return { prepare, listPrepared, listByStatus, edit, approve, get, markSent };
}

module.exports = { createReview };
