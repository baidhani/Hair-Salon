'use strict';
const fs = require('node:fs');

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

  return { record, entries: () => entries.slice() };
}

module.exports = { createAuditLog };
