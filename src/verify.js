'use strict';

// Checks a customer's contact details. Pure function: no network, no side effects.
// Returns { ok, errors } where errors is a list of { field, message }.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

function verifyContact(contact) {
  const errors = [];
  const c = contact && typeof contact === 'object' ? contact : {};
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  const email = typeof c.email === 'string' ? c.email.trim() : '';
  const phone = typeof c.phone === 'string' ? c.phone.trim() : '';

  if (!name) errors.push({ field: 'name', message: 'Name is required.' });
  if (!EMAIL.test(email)) errors.push({ field: 'email', message: 'Email address is not valid.' });
  if (!PHONE.test(phone) || phone.replace(/\D/g, '').length < 7) {
    errors.push({ field: 'phone', message: 'Phone number is not valid.' });
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { verifyContact };
