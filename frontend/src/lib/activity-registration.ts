// frontend/src/lib/activity-registration.ts
//
// Pure presentation decisions for the Activity page's registration card
// (pages/activities/[id].astro). Kept free of DOM and fetch so the rules can
// be exercised by the existing backend Jest run (the frontend has no test
// runner -- see backend/src/modules/events/events.activity-page.spec.ts).
//
// These are display rules only. Capacity, eligibility and payment are
// enforced by the backend and PAY-001; nothing here grants or confirms a seat.

export const PAYMENT_SUCCESS_MESSAGE = 'Payment received — you are registered for this Activity.';

export interface ActivityCapacityView {
  capacity: number | null;
  registration_count: number;
  waitlist_enabled: boolean;
}

export type RegistrationAction = 'RESUME_PAYMENT' | 'FULL' | 'JOIN_WAITLIST' | 'REGISTER';

export interface RegistrationButtonState {
  action: RegistrationAction;
  label: string;
  enabled: boolean;
}

// ownStatus: the signed-in member's own active registration status for this
// Activity (GET /api/v1/events/:id/registrations/me), or null.
// A member's own PENDING_PAYMENT takes precedence over the generic "Full"
// presentation: the seat that makes the Activity look full is their own held
// seat, and the backend resumes that same registration. Anyone else still
// sees the capacity-based state.
export function registrationButtonState(
  ev: ActivityCapacityView,
  ownStatus: string | null,
): RegistrationButtonState {
  if (ownStatus === 'PENDING_PAYMENT') {
    return { action: 'RESUME_PAYMENT', label: 'Complete payment', enabled: true };
  }
  const full = ev.capacity != null && ev.registration_count >= ev.capacity;
  if (full && !ev.waitlist_enabled) return { action: 'FULL', label: 'Full', enabled: false };
  if (full) return { action: 'JOIN_WAITLIST', label: 'Join waitlist', enabled: true };
  return { action: 'REGISTER', label: 'Register', enabled: true };
}

export interface AfterPaymentView {
  // true -> the registration is not confirmed yet: re-submit to resume it
  // (the backend self-heals a PENDING_PAYMENT whose Contribution is COMPLETED).
  resume: boolean;
  label: string;
  sub: string;
  enabled: boolean;
}

// Decides what to show once PAY-001 reports the Contribution COMPLETED, from
// the member's own registration status -- never from a response message.
export function afterPaymentView(ownStatus: string | null): AfterPaymentView {
  if (ownStatus === 'REGISTERED' || ownStatus === 'ATTENDED') {
    return { resume: false, label: 'Registered', sub: PAYMENT_SUCCESS_MESSAGE, enabled: false };
  }
  if (ownStatus === 'PENDING_PAYMENT') {
    return { resume: true, label: '', sub: '', enabled: false };
  }
  return {
    resume: false,
    label: 'Check payment status',
    sub: 'We could not confirm your payment yet. Please check again shortly.',
    enabled: true,
  };
}
