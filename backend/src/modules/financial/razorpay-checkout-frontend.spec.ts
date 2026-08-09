// backend/src/modules/financial/razorpay-checkout-frontend.spec.ts
//
// Step 20 — frontend Razorpay Checkout integration.
//
// The frontend has no test runner (frontend/package.json has no
// vitest/jest/playwright script and no *.test.*/*.spec.* files exist there
// -- confirmed before this step). Rather than introduce a new frontend
// testing framework (a TECH-STACK-FREEZE-adjacent decision out of scope for
// a checkout-wiring step), these Step 20 invariants are verified by real
// static inspection of the actual component source from here, mirroring
// the same pattern financial.controller.spec.ts already uses for backend
// source. This is a stopgap, not a replacement for real frontend tests --
// see the Step 20 final report's "Remaining Work" section.

import { readFileSync } from 'fs';
import { join } from 'path';

const COMPONENT_SRC = readFileSync(
  join(__dirname, '../../../../frontend/src/components/hub/MembershipApplicationFlow.astro'),
  'utf8',
);

// Only the inline <script> block is executable frontend code; strip markup/
// CSS so assertions about "no membership activation call" etc. can't be
// fooled by prose in HTML comments or CSS class names.
const SCRIPT_SRC = COMPONENT_SRC.slice(
  COMPONENT_SRC.indexOf('<script>'),
  COMPONENT_SRC.lastIndexOf('</script>'),
);

describe('MembershipApplicationFlow.astro Razorpay integration (Step 20, real source inspection)', () => {
  it('never references RAZORPAY_KEY_SECRET or any secret-shaped identifier', () => {
    expect(COMPONENT_SRC).not.toContain('RAZORPAY_KEY_SECRET');
    expect(COMPONENT_SRC.toLowerCase()).not.toContain('key_secret');
  });

  it('consumes the existing generic Financial API routes, not a new membership-specific payment endpoint', () => {
    expect(SCRIPT_SRC).toContain('/financial/contributions/');
    expect(SCRIPT_SRC).toContain('/settlement/razorpay-order');
    expect(SCRIPT_SRC).not.toMatch(/membership\/(payment|razorpay|checkout)/);
  });

  it('does not invent a MembershipRazorpayService/MembershipPaymentService or new contribution-creation call', () => {
    expect(COMPONENT_SRC).not.toContain('MembershipRazorpayService');
    expect(COMPONENT_SRC).not.toContain('MembershipPaymentService');
    expect(SCRIPT_SRC).not.toMatch(/method:\s*['"]POST['"][^}]*\/hub\/membership\/(application|renewal)\/pay/);
  });

  it('Razorpay order id, amount, and currency come from the backend order response, never computed client-side', () => {
    expect(SCRIPT_SRC).toContain('order_id: order.orderReference');
    expect(SCRIPT_SRC).toContain('amount: order.amountPaise');
    expect(SCRIPT_SRC).toContain('currency: order.currency');
    // No arithmetic on a fee/price constant anywhere in the payment flow.
    expect(SCRIPT_SRC).not.toMatch(/amountPaise\s*\*/);
    expect(SCRIPT_SRC).not.toMatch(/amountPaise\s*\+/);
  });

  it('only the public key id is used to construct Checkout, sourced from the backend response', () => {
    expect(SCRIPT_SRC).toContain('key: order.providerPublicKeyId');
  });

  it('the Checkout success handler never activates membership, creates a Financial Transaction, or a Receipt', () => {
    const handlerBody = SCRIPT_SRC.slice(
      SCRIPT_SRC.indexOf('handler: function'),
      SCRIPT_SRC.indexOf('modal:'),
    );
    expect(handlerBody).not.toMatch(/\/activate\b/);
    expect(handlerBody.toLowerCase()).not.toContain('transaction');
    expect(handlerBody.toLowerCase()).not.toContain('receipt');
    expect(handlerBody).not.toContain('lifecycle_state');
    // The only thing it does is flip to a "verifying" presentation state and
    // poll the backend-authoritative status route.
    expect(handlerBody).toContain("setPaymentSubState('verifying')");
    expect(handlerBody).toContain('pollContributionStatus(');
  });

  it('polling only ever GETs contribution status -- never POSTs a state mutation from the browser callback path', () => {
    const pollFn = SCRIPT_SRC.slice(
      SCRIPT_SRC.indexOf('function pollContributionStatus'),
      SCRIPT_SRC.indexOf('// ── Pre-populate fields'),
    );
    expect(pollFn).toContain('fetch(`${API}/financial/contributions/${contributionId}`');
    expect(pollFn).not.toContain("method: 'POST'");
  });

  it('checkout dismissal (modal.ondismiss) and payment.failed only reset UI state -- no direct FAILED mutation', () => {
    const dismissBlock = SCRIPT_SRC.slice(SCRIPT_SRC.indexOf('ondismiss:'), SCRIPT_SRC.indexOf('});', SCRIPT_SRC.indexOf('ondismiss:')));
    expect(dismissBlock).not.toMatch(/fetch\(/);
    const failedHandlerBlock = SCRIPT_SRC.slice(
      SCRIPT_SRC.indexOf("rzp.on('payment.failed'"),
      SCRIPT_SRC.indexOf('rzp.open();'),
    );
    expect(failedHandlerBlock).not.toMatch(/fetch\(/);
  });

  it('retry re-uses the existing settlement/retry route, not a new endpoint', () => {
    expect(SCRIPT_SRC).toContain('/settlement/retry');
  });

  it('zero-value contributions never reach Razorpay Checkout construction', () => {
    const beginCheckoutFn = SCRIPT_SRC.slice(
      SCRIPT_SRC.indexOf('async function beginCheckout'),
      SCRIPT_SRC.indexOf('payBtn.onclick'),
    );
    const zeroGuardIdx = beginCheckoutFn.indexOf('amountPaise === 0');
    const razorpayCtorIdx = beginCheckoutFn.indexOf('new Razorpay(');
    expect(zeroGuardIdx).toBeGreaterThan(-1);
    expect(razorpayCtorIdx).toBeGreaterThan(-1);
    expect(zeroGuardIdx).toBeLessThan(razorpayCtorIdx);
  });

  it('no direct financial DB access or Kysely import from the frontend component', () => {
    expect(COMPONENT_SRC).not.toContain('kysely');
    expect(COMPONENT_SRC).not.toContain("from '../../database");
  });
});
