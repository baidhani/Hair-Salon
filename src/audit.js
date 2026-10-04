'use strict';
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

// Append-only audit log of contact verifications.
// Each entry is keyed by requestId, so recording the same request twice does not duplicate it.
// Only the outcome and the names of failed fields are stored, never the email or phone themselves.
function createAuditLog({ file, now = () => new Date() } = {}) {
  const entries = [];
  const seen = new Set();

  if (file && fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      entries.push(e);
      seen.add(e.requestId);
    }
  }

  function record({ requestId, result }) {
    if (!requestId) throw new Error('requestId is required');
    if (seen.has(requestId)) return entries.find(e => e.requestId === requestId);
    const entry = {
      requestId,
      at: now().toISOString(),
      outcome: result.error ? 'error' : result.ok ? 'verified' : 'rejected',
      failedFields: (result.errors || []).map(e => e.field),
    };
    if (file) fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    entries.push(entry);
    seen.add(requestId);
    return entry;
  }

  // Owner approvals share the same log, keyed 'approval:<bookingId>' so approving twice logs once.
  function recordApproval({ bookingId, approvedBy }) {
    if (!bookingId || !approvedBy) throw new Error('bookingId and approvedBy are required');
    const key = 'approval:' + bookingId;
    if (seen.has(key)) return entries.find(e => e.requestId === key);
    const entry = { requestId: key, type: 'approval', bookingId, approvedBy, at: now().toISOString() };
    if (file) fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    entries.push(entry);
    seen.add(key);
    return entry;
  }

  // One entry per sent confirmation: booking id and timestamp only, never the customer's email address.
  function recordSend({ bookingId }) {
    if (!bookingId) throw new Error('bookingId is required');
    const key = 'send:' + bookingId;
    if (seen.has(key)) return entries.find(e => e.requestId === key);
    const entry = { requestId: key, type: 'confirmation_sent', bookingId, at: now().toISOString() };
    if (file) fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    entries.push(entry);
    seen.add(key);
    return entry;
  }

  // One entry per flagged booking and set of reasons. Reasons come from a fixed list, so no personal data is stored.
  function recordFlag({ bookingId, reasons }) {
    if (!bookingId || !Array.isArray(reasons) || !reasons.length) throw new Error('bookingId and reasons are required');
    const key = 'flag:' + bookingId + ':' + reasons.join(',');
    if (seen.has(key)) return entries.find(e => e.requestId === key);
    const entry = { requestId: key, type: 'booking_flagged', bookingId, reasons, at: now().toISOString() };
    if (file) fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    entries.push(entry);
    seen.add(key);
    return entry;
  }

  // One entry per UI interaction. Only the event name and an optional booking id are kept, never contact details.
  // Unlike the entries above these are not deduplicated: each interaction really happened.
  function recordUiEvent({ event, bookingId }) {
    if (!event) throw new Error('event is required');
    const entry = { requestId: 'ui:' + randomUUID(), type: 'ui_event', event, at: now().toISOString() };
    if (bookingId) entry.bookingId = bookingId;
    if (file) fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    entries.push(entry);
    seen.add(entry.requestId);
    return entry;
  }

  return { record, recordApproval, recordSend, recordFlag, recordUiEvent, entries: () => entries.slice() };
}

module.exports = { createAuditLog };
