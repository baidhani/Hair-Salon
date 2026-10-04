'use strict';

// Decides whether a booking must be flagged for manual review (REQ-003: availability is uncertain).
// Pure function: it never throws and has no side effects. Bad input is reported as a reason, not an error.
//
// A booking is { id?, contact: { name, email, phone }, requestedAt (ISO date-time), service }.
// Reasons come from a fixed list so the review page can explain each one in plain words:
//   corrupted_data         the booking, its contact, or its date cannot be read
//   missing_contact        name, email or phone is blank
//   missing_requested_time no appointment time was given
//   missing_service        no service was given
//   overlaps_existing      another booking is within SLOT_MINUTES of the requested time
const SLOT_MINUTES = 60; // assumption: every appointment occupies one hour until the plan says otherwise
const REASONS = ['corrupted_data', 'missing_contact', 'missing_requested_time', 'missing_service', 'overlaps_existing'];

const blank = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function parseTime(v) {
  if (typeof v !== 'string') return NaN;
  return Date.parse(v);
}

function assessBooking(booking, { existing = [] } = {}) {
  if (!isObject(booking)) return { flagged: true, reasons: ['corrupted_data'] };
  const reasons = new Set();

  if (booking.contact !== undefined && !isObject(booking.contact)) reasons.add('corrupted_data');
  const c = isObject(booking.contact) ? booking.contact : {};
  if (['name', 'email', 'phone'].some(k => blank(c[k]))) reasons.add('missing_contact');

  if (blank(booking.service)) reasons.add('missing_service');

  let when = NaN;
  if (blank(booking.requestedAt)) reasons.add('missing_requested_time');
  else {
    when = parseTime(booking.requestedAt);
    if (Number.isNaN(when)) reasons.add('corrupted_data');
  }

  if (!Number.isNaN(when) && Array.isArray(existing)) {
    const gap = SLOT_MINUTES * 60 * 1000;
    const clash = existing.some(o => isObject(o) && o.id !== booking.id && Math.abs(parseTime(o.requestedAt) - when) < gap);
    if (clash) reasons.add('overlaps_existing');
  }

  const ordered = REASONS.filter(r => reasons.has(r));
  return { flagged: ordered.length > 0, reasons: ordered };
}

module.exports = { assessBooking, REASONS, SLOT_MINUTES };
