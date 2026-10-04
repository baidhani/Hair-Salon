'use strict';
const { verifyContact } = require('./verify');

// Sends the confirmation email for an APPROVED booking (REQ-004: nothing goes out before the owner approves).
// `mailer.send({to, subject, text})` is injected: the real Gmail adapter in production, a fake in tests.
// Idempotent: a booking already sent is never emailed again.
function createConfirmer({ review, mailer, log }) {
  const unlogged = new Set(); // sent, but writing the audit entry failed; retried on the next call

  function logSend(id) {
    try { log.recordSend({ bookingId: id }); unlogged.delete(id); return true; } catch { unlogged.add(id); return false; }
  }

  async function sendConfirmation(id) {
    const b = review.get(id);
    if (!b) return { status: 'not_found' };
    if (b.status === 'sent') return { status: 'sent', alreadySent: true, logged: unlogged.has(id) ? logSend(id) : true };
    if (b.status !== 'approved') return { status: 'not_approved', message: 'The owner has not approved this booking yet. Nothing was sent.' };

    const emailError = verifyContact(b.contact).errors.find(e => e.field === 'email');
    if (emailError) return { status: 'invalid_email', message: 'This booking has no valid email address. Nothing was sent.' };

    try {
      await mailer.send({
        to: b.contact.email.trim(),
        subject: 'Your booking is confirmed',
        text: `Hello ${b.contact.name.trim()}, your booking is confirmed.`,
      });
    } catch {
      return { status: 'mail_error', message: 'The email could not be sent. The booking is still approved; please try again.' };
    }
    review.markSent(id); // before logging, so a logging failure can never cause a second email
    const logged = logSend(id);
    return { status: 'sent', logged };
  }

  return { sendConfirmation };
}

module.exports = { createConfirmer };
