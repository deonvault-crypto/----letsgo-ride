// Internal SQL contract for an already verified capture. No provider calls or
// webhook route are exposed by this lab.
export async function recordCapture(db, { accountId, eventId, paymentId, currency, amountMinor }) {
  if (![accountId, eventId, paymentId].every(value => typeof value === 'string' && value.length > 0) ||
      typeof currency !== 'string' || !/^[a-z]{3}$/.test(currency) ||
      !Number.isSafeInteger(amountMinor) || amountMinor <= 0) return 'mismatch';
  const [insert, existing] = await db.batch([
    db.prepare(`
      INSERT INTO lab_payment_events (provider_account, provider_event_id, payment_id, currency, amount_minor)
      SELECT ?1, ?2, id, ?4, ?5 FROM lab_payments
      WHERE provider_account = ?1 AND provider_payment_id = ?3 AND currency = ?4 AND amount_minor = ?5
      ON CONFLICT (provider_account, provider_event_id) DO NOTHING
      RETURNING payment_id
    `).bind(accountId, eventId, paymentId, currency, amountMinor),
    db.prepare(`
      SELECT p.provider_payment_id, e.currency, e.amount_minor
      FROM lab_payment_events e JOIN lab_payments p ON e.payment_id = p.id
      WHERE e.provider_account = ? AND e.provider_event_id = ?
    `).bind(accountId, eventId),
  ]);
  if (insert.results.length === 1) return 'recorded';
  const event = existing.results[0];
  return event?.provider_payment_id === paymentId && event.currency === currency && event.amount_minor === amountMinor
    ? 'replayed' : 'mismatch';
}
