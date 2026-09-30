// backend/src/modules/events/events.activity-page.spec.ts
//
// Post-smoke fixes 1 + 2 (Activity page). The frontend has no test runner, so
// -- as razorpay-checkout-frontend.spec.ts already does -- the page is covered
// from here: the pure decision rules (frontend/src/lib/activity-registration.ts)
// are imported and exercised directly, and the page's use of them is checked
// by inspecting the real page source.

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

// Jest here only transforms backend sources, and the frontend package is ESM,
// so the (dependency-free) frontend module is transpiled with the backend's
// own TypeScript and evaluated as CommonJS -- the real source, not a copy.
type ActivityRegistrationLib =
  typeof import('../../../../frontend/src/lib/activity-registration');
function loadFrontendModule<T>(relPath: string): T {
  const src = readFileSync(join(__dirname, relPath), 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const mod = { exports: {} as T };
  new Function('module', 'exports', outputText)(mod, mod.exports);
  return mod.exports;
}
const { PAYMENT_SUCCESS_MESSAGE, afterPaymentView, registrationButtonState } =
  loadFrontendModule<ActivityRegistrationLib>(
    '../../../../frontend/src/lib/activity-registration.ts',
  );

const PAGE_SRC = readFileSync(
  join(__dirname, '../../../../frontend/src/pages/activities/[id].astro'),
  'utf8',
).replace(/\r\n/g, '\n');
const SCRIPT_SRC = PAGE_SRC.slice(
  PAGE_SRC.indexOf('<script>'),
  PAGE_SRC.lastIndexOf('</script>'),
);

const fullNoWaitlist = {
  capacity: 1,
  registration_count: 1,
  waitlist_enabled: false,
};

describe('Fix 1 -- own PENDING_PAYMENT takes precedence over "Full"', () => {
  it('full Activity + own PENDING_PAYMENT -> enabled resume/payment action, not Full', () => {
    expect(registrationButtonState(fullNoWaitlist, 'PENDING_PAYMENT')).toEqual({
      action: 'RESUME_PAYMENT',
      label: 'Complete payment',
      enabled: true,
    });
  });

  it('another user with no registration still sees a disabled Full', () => {
    expect(registrationButtonState(fullNoWaitlist, null)).toEqual({
      action: 'FULL',
      label: 'Full',
      enabled: false,
    });
  });

  it('a user with some other registration status is not given the resume action', () => {
    for (const s of ['REGISTERED', 'WAITLISTED', 'ATTENDED']) {
      expect(registrationButtonState(fullNoWaitlist, s).action).toBe('FULL');
    }
  });

  it('capacity presentation is otherwise unchanged', () => {
    expect(
      registrationButtonState(
        { capacity: 1, registration_count: 1, waitlist_enabled: true },
        null,
      ).action,
    ).toBe('JOIN_WAITLIST');
    expect(
      registrationButtonState(
        { capacity: 2, registration_count: 1, waitlist_enabled: false },
        null,
      ).action,
    ).toBe('REGISTER');
    expect(
      registrationButtonState(
        { capacity: null, registration_count: 99, waitlist_enabled: false },
        null,
      ).action,
    ).toBe('REGISTER');
  });

  it("the page reads the member's own registration before rendering and decides Full via the rule", () => {
    expect(SCRIPT_SRC).toContain('/registrations/me');
    expect(SCRIPT_SRC).toMatch(
      /render\(ev, open \? await fetchOwnStatus\(ev\.id\) : null\)/,
    );
    expect(SCRIPT_SRC).toContain('registrationButtonState(ev, ownStatus)');
    // The old count-only Full decision is gone from the page.
    expect(SCRIPT_SRC).not.toMatch(/if \(full && !ev\.waitlist_enabled\)/);
  });

  it('the resume action re-submits the existing registration (backend resume), not a new flow', () => {
    // RESUME_PAYMENT is enabled and falls through to the same click -> submit()
    // -> POST /registrations path; the backend returns the SAME PENDING_PAYMENT
    // registration + Contribution (covered in events.pay001.spec.ts).
    expect(SCRIPT_SRC).toMatch(
      /if \(checkingPayment\) await showAfterPayment\(true\);\s*else await submit\(\);/,
    );
  });
});

describe('Fix 2 -- payment-success message after a completed payment', () => {
  it('Contribution completed and registration REGISTERED -> payment-success confirmation', () => {
    expect(afterPaymentView('REGISTERED')).toEqual({
      resume: false,
      label: 'Registered',
      sub: PAYMENT_SUCCESS_MESSAGE,
      enabled: false,
    });
    expect(PAYMENT_SUCCESS_MESSAGE).toBe(
      'Payment received — you are registered for this Activity.',
    );
  });

  it('registration still PENDING_PAYMENT after payment -> resume once (backend self-heal), no message yet', () => {
    expect(afterPaymentView('PENDING_PAYMENT').resume).toBe(true);
  });

  it('unknown/absent status after payment -> a re-check action, never a false success', () => {
    const v = afterPaymentView(null);
    expect(v.resume).toBe(false);
    expect(v.sub).not.toBe(PAYMENT_SUCCESS_MESSAGE);
    expect(v.enabled).toBe(true);
  });

  it('the page decides the post-payment outcome from its own status, not from response text', () => {
    expect(SCRIPT_SRC).toMatch(
      /if \(state === 'COMPLETED'\) \{\s*await showAfterPayment\(true\);/,
    );
    expect(SCRIPT_SRC).toContain(
      'afterPaymentView(await fetchOwnStatus(ev.id))',
    );
    // A 409 during the post-payment resume re-reads status instead of showing "Already registered".
    expect(SCRIPT_SRC).toMatch(
      /res\.status === 409 && afterPayment\) \{[^}]*showAfterPayment\(false\)/,
    );
    expect(SCRIPT_SRC).not.toMatch(/body\.message[^\n]*(already|Already)/);
  });

  it('a normal visit by an already-registered member keeps the "Already registered" behaviour', () => {
    // Outside the payment flow (afterPayment false) a 409 still renders the existing state.
    expect(SCRIPT_SRC).toContain(
      "if (res.status === 409) b.textContent = 'Already registered';",
    );
    // Only the payment flow uses the payment-success message.
    const uses = SCRIPT_SRC.split('PAYMENT_SUCCESS_MESSAGE').length - 1;
    expect(uses).toBe(2); // import + the paid-confirmation REGISTERED branch
    // Keyed on the payment flow / the backend's structured `resumed` flag.
    expect(SCRIPT_SRC).toMatch(
      /afterPayment \|\| \(paid && body\.resumed\)\s*\?\s*PAYMENT_SUCCESS_MESSAGE/,
    );
  });
});
