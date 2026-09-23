'use strict';

// تحويل Timestamp من Firestore (أو تاريخ عادي) لنص ISO — أو null.
function toIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

module.exports = { toIso };
