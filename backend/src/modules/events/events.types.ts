// backend/src/modules/events/events.types.ts
//
// Module 04 x PAY-001 shared identifiers (EVENT-ARCH-001 §7). Used by both
// EventsService and EventsFinancialListener so the business module name
// and the idempotency-key convention are never duplicated as literals.
//
// The canonical PAY-001 relationship is (business_module,
// business_reference_id) -- here ('EVENT_REGISTRATION',
// event_registrations.id). No financial column exists on
// event_registrations; the Contribution is found again through the
// deterministic idempotency key (the Group-membership precedent,
// FinancialContributionService.findByIdempotencyKey()).

export const EVENT_REGISTRATION_BUSINESS_MODULE = 'EVENT_REGISTRATION';

// One key per registration row. A re-registration after a CANCELLED row is
// a new row, so each attempt gets its own obligation (EVENT-ARCH-001 §7
// "Re-registration: a new obligation/contribution per attempt"). Well under
// financial_contributions.idempotency_key VARCHAR(100).
export function eventRegistrationContributionKey(
  eventId: number,
  userId: number,
  registrationId: number,
): string {
  return `EVENT-${eventId}-USER-${userId}-REG-${registrationId}`;
}

// Registration statuses that occupy a seat against events.capacity.
// PENDING_PAYMENT holds its seat until settlement completes or the
// registration is cancelled (governance decision D1: no expiry).
export const SEAT_HOLDING_STATUSES = [
  'REGISTERED',
  'ATTENDED',
  'PENDING_PAYMENT',
] as const;
