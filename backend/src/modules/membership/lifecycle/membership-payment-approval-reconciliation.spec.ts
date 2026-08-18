// backend/src/modules/membership/lifecycle/membership-payment-approval-reconciliation.spec.ts
//
// STEP 23 — Membership payment/approval workflow-ordering reconciliation.
//
// The bug being fixed: Application -> Admin approves -> Financial
// Contribution created -> Razorpay -> Payment -> ACTIVE. That let financial
// completion (a webhook) activate Membership before an administrator ever
// made the final admission decision.
//
// The corrected flow: Application submitted -> PENDING -> Financial
// Contribution created/AWAITING_SETTLEMENT -> member explicitly pays ->
// Contribution COMPLETED -> Membership STILL PENDING -> admin final
// decision -> APPROVE (-> APPROVED -> ACTIVE, membership number assigned)
// or REJECT (-> REJECTED, refund requested if already paid).
//
// Same project-established pattern as every other *.spec.ts touching a
// service that imports db.ts (Kysely ESM, incompatible with CommonJS Jest):
// real static source inspection + pure functions mirroring the actual
// decision logic. No live DB, no NestJS test module.

import { readFileSync } from 'fs';
import { join } from 'path';

// Normalize CRLF -> LF so the marker-based slice()/indexOf() inspection below
// is independent of the checkout's line-ending config (Windows core.autocrlf
// checks these files out with CRLF; the marker strings are written with LF).
function readSourceNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const LIFECYCLE_SRC = readSourceNormalized(join(__dirname, 'membership-lifecycle.service.ts'));
const LISTENER_SRC = readSourceNormalized(join(__dirname, '../financial/membership-financial.listener.ts'));
const HUB_SERVICE_SRC = readSourceNormalized(join(__dirname, '../hub/hub-membership.service.ts'));
const FINANCIAL_CONTRIBUTION_SERVICE_SRC = readSourceNormalized(
  join(__dirname, '../../financial/financial-contribution.service.ts'),
);
const SETTLEMENT_PROVIDER_INTERFACE_SRC = readSourceNormalized(
  join(__dirname, '../../financial/settlement-provider.interface.ts'),
);
const FRONTEND_FLOW_SRC = readSourceNormalized(
  join(__dirname, '../../../../../frontend/src/components/hub/MembershipApplicationFlow.astro'),
);

function slice(src: string, startMarker: string, endMarker: string, fromIndex = 0): string {
  const start = src.indexOf(startMarker, fromIndex);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  if (end === -1) throw new Error(`end marker not found: ${endMarker} (after ${startMarker})`);
  return src.slice(start, end);
}

// ═══════════════════════════════════════════════════════════════════════
// A. Paid application submission
// ═══════════════════════════════════════════════════════════════════════

describe('A. Paid application submission creates the Financial Contribution at PENDING time', () => {
  const CREATE_CONTRIB_FN = slice(
    LIFECYCLE_SRC,
    'async createApplicationContribution(',
    'private async getMembershipContribution(',
  );

  it('createApplicationContribution() only proceeds for PAYMENT_REQUIRED classes', () => {
    expect(CREATE_CONTRIB_FN).toContain("if (cls?.activation_mode !== 'PAYMENT_REQUIRED') return;");
  });

  it('creates exactly one Financial Contribution with a deterministic per-membership idempotency key', () => {
    expect(CREATE_CONTRIB_FN).toContain('this.financialService.createContribution(');
    expect(CREATE_CONTRIB_FN).toContain('const idempotencyKey = `MEMBERSHIP-${membershipId}-CONTRIBUTION`;');
    expect(CREATE_CONTRIB_FN).toContain('idempotencyKey,');
  });

  it('amount comes from class_entitlements.fee_inr, never a hard-coded price', () => {
    expect(CREATE_CONTRIB_FN).toContain("this.entitlementService.getClassConfigValue(membershipClassId, 'fee_inr')");
    ['500', '1200', '2500', '3000', '25000', '50000'].forEach((price) => {
      expect(CREATE_CONTRIB_FN).not.toContain(`'${price}'`);
      expect(CREATE_CONTRIB_FN).not.toContain(price + ' * 100');
    });
  });

  it('businessReferenceId is the membership id; businessModule is the generic MEMBERSHIP label', () => {
    expect(CREATE_CONTRIB_FN).toContain('businessModule: ');
    expect(CREATE_CONTRIB_FN).toContain("'MEMBERSHIP'");
    expect(CREATE_CONTRIB_FN).toContain('businessReferenceId: membershipId,');
  });

  it('is called from apply() right after the PENDING row is inserted, for INDIVIDUAL applications with a class', () => {
    const applyFn = slice(LIFECYCLE_SRC, 'async apply(', 'async createApplicationContribution(');
    expect(applyFn).toContain('this.createApplicationContribution(id, params.membershipClassId, params.userId!)');
  });

  it('the idempotency key is deterministic per membership id (createContribution() itself dedupes retries/duplicates)', () => {
    function idempotencyKey(membershipId: number): string {
      return `MEMBERSHIP-${membershipId}-CONTRIBUTION`;
    }
    expect(idempotencyKey(84)).toBe(idempotencyKey(84));
    expect(idempotencyKey(84)).not.toBe(idempotencyKey(85));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// B. No automatic Razorpay order merely from loading the payment screen
// ═══════════════════════════════════════════════════════════════════════

describe('B. Razorpay order is only ever created from an explicit member Pay action', () => {
  const SHOW_PAYMENT_SCREEN_FN = slice(
    FRONTEND_FLOW_SRC,
    'function showPaymentScreen(data',
    'function loadRazorpayScript',
  );

  it('showPaymentScreen() does not call the razorpay-order endpoint directly on render', () => {
    // The function body up to where beginCheckout() is DEFINED (not called)
    // must not itself POST to the order endpoint.
    const beforeBeginCheckoutDef = SHOW_PAYMENT_SCREEN_FN.slice(0, SHOW_PAYMENT_SCREEN_FN.indexOf('async function beginCheckout'));
    expect(beforeBeginCheckoutDef).not.toContain('settlement/razorpay-order');
  });

  it('the razorpay-order POST lives inside beginCheckout(), wired only to the Pay button\'s onclick', () => {
    const beginCheckoutFn = slice(SHOW_PAYMENT_SCREEN_FN, 'async function beginCheckout', 'payBtn.onclick = beginCheckout');
    expect(beginCheckoutFn).toContain('settlement/razorpay-order');
    expect(SHOW_PAYMENT_SCREEN_FN).toContain('payBtn.onclick = beginCheckout');
  });

  it('Razorpay Checkout (rzp.open()) is only invoked inside beginCheckout(), never at screen-render time', () => {
    const beforeBeginCheckoutDef = SHOW_PAYMENT_SCREEN_FN.slice(0, SHOW_PAYMENT_SCREEN_FN.indexOf('async function beginCheckout'));
    expect(beforeBeginCheckoutDef).not.toContain('rzp.open()');
    const beginCheckoutFn = slice(SHOW_PAYMENT_SCREEN_FN, 'async function beginCheckout', 'payBtn.onclick = beginCheckout');
    expect(beginCheckoutFn).toContain('rzp.open()');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// C. Payment completion does not activate Membership
// ═══════════════════════════════════════════════════════════════════════

describe('C. Contribution COMPLETED leaves Membership PENDING, unnumbered', () => {
  const RECORD_PAYMENT_RECEIVED_FN = slice(
    LIFECYCLE_SRC,
    'async recordPaymentReceived(',
    'async suspend(',
  );

  it('recordPaymentReceived() requires PENDING or REJECTED (F-002: late settlement of an already-rejected application) -- no state transition performed either way', () => {
    expect(RECORD_PAYMENT_RECEIVED_FN).toContain("this.requireState(membershipId, ['PENDING', 'REJECTED'])");
    expect(RECORD_PAYMENT_RECEIVED_FN).not.toContain('updateTable(\'memberships\')');
  });

  it('recordPaymentReceived() never calls activate() or assigns a membership number', () => {
    expect(RECORD_PAYMENT_RECEIVED_FN).not.toContain('this.activate(');
    expect(RECORD_PAYMENT_RECEIVED_FN).not.toContain('assignPermanentNumber');
  });

  it('recordPaymentReceived() only logs an audit event and notifies -- no lifecycle mutation', () => {
    expect(RECORD_PAYMENT_RECEIVED_FN).toContain("eventType: 'PAYMENT_RECEIVED'");
    expect(RECORD_PAYMENT_RECEIVED_FN).toContain('this.notifyMember(membership,');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// D. Admin approval is the final financial + membership gate
// ═══════════════════════════════════════════════════════════════════════

describe('D. approve() enforces COMPLETED as a precondition for PAYMENT_REQUIRED classes', () => {
  const APPROVE_FN = slice(LIFECYCLE_SRC, 'async approve(', "await this.notifyMember(membership, 'MEMBERSHIP_APPLICATION_APPROVED');");

  it('the financial precondition check happens BEFORE any state write (no stranded APPROVED on rejection)', () => {
    const preconditionIdx = APPROVE_FN.indexOf("cls?.activation_mode === 'PAYMENT_REQUIRED'");
    const stateWriteIdx = APPROVE_FN.indexOf("lifecycle_state: 'APPROVED'");
    expect(preconditionIdx).toBeGreaterThan(-1);
    expect(stateWriteIdx).toBeGreaterThan(-1);
    expect(preconditionIdx).toBeLessThan(stateWriteIdx);
  });

  it('throws ConflictException when the Contribution is missing or not COMPLETED', () => {
    expect(APPROVE_FN).toContain("if (!contribution || contribution.state !== 'COMPLETED')");
    expect(APPROVE_FN).toContain('throw new ConflictException(');
  });

  it('does NOT create a Contribution, start settlement, or create a Razorpay order inside approve()', () => {
    expect(APPROVE_FN).not.toContain('createContribution');
    expect(APPROVE_FN).not.toContain('startSettlement');
    expect(APPROVE_FN).not.toContain('initiateProviderSettlement');
  });

  it('once COMPLETED is confirmed, activation happens in the same approve() operation and the number is assigned there', () => {
    const activationBranch = APPROVE_FN.slice(APPROVE_FN.indexOf("cls?.activation_mode === 'AUTO_AFTER_APPROVAL' || cls?.activation_mode === 'PAYMENT_REQUIRED'"));
    expect(activationBranch).toContain('await this.activate(membershipId,');
  });

  it('is settlement-method agnostic -- checks only contribution.state, never a provider/method field', () => {
    expect(APPROVE_FN).not.toContain('RAZORPAY');
    expect(APPROVE_FN).not.toContain('provider ===');
    expect(APPROVE_FN).not.toContain(".provider ");
  });

  // Mirrors approve()'s precondition decision for every reachable Contribution state.
  type ContributionState =
    | 'CREATED' | 'AWAITING_SETTLEMENT' | 'SETTLEMENT_IN_PROGRESS' | 'SETTLED'
    | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'ABANDONED' | 'REFUNDED';

  function approvalAllowed(contributionState: ContributionState | null): boolean {
    return contributionState === 'COMPLETED';
  }

  it.each([
    ['COMPLETED', true],
    ['AWAITING_SETTLEMENT', false],
    ['SETTLEMENT_IN_PROGRESS', false],
    ['FAILED', false],
    ['ABANDONED', false],
    ['CREATED', false],
    [null, false],
  ] as [ContributionState | null, boolean][])('contribution state %s -> approval allowed = %s', (state, expected) => {
    expect(approvalAllowed(state)).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// E. Financial listener stays generic; never activates Membership
// ═══════════════════════════════════════════════════════════════════════

describe('E. MembershipFinancialListener no longer activates on CONTRIBUTION_COMPLETED', () => {
  it('handleContributionCompleted() calls recordPaymentReceived(), not activate()', () => {
    const handlerFn = slice(LISTENER_SRC, 'private handleContributionCompleted(', 'private handleSettlementFailed(');
    expect(handlerFn).toContain('this.lifecycle\n      .recordPaymentReceived(');
    expect(handlerFn).not.toContain('.activate(');
  });

  it('the listener has no per-membership-class branching (class-agnostic wiring preserved)', () => {
    ['STUDENT_MEMBER', 'INDIVIDUAL_MEMBER', 'INDIVIDUAL_BIENNIAL', 'FULL_MEMBER'].forEach((code) => {
      expect(LISTENER_SRC).not.toContain(code);
    });
  });

  it('SETTLEMENT_FAILED still routes to recordPaymentFailure(), now expecting a PENDING membership', () => {
    expect(LISTENER_SRC).toContain('.recordPaymentFailure(');
  });

  it('the Financial Engine module has zero imports from Membership (dependency direction preserved)', () => {
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).not.toMatch(/from ['"].*membership/i);
    expect(SETTLEMENT_PROVIDER_INTERFACE_SRC).not.toMatch(/from ['"].*membership/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F. Admin rejection BEFORE payment -- no refund needed
// ═══════════════════════════════════════════════════════════════════════

describe('F/G. reject() resolves the Contribution before flipping the membership to REJECTED', () => {
  const REJECT_FN = slice(LIFECYCLE_SRC, 'async reject(', "await this.notifyMember(membership, 'MEMBERSHIP_APPLICATION_REJECTED'");

  it('resolves the Contribution BEFORE writing lifecycle_state = REJECTED', () => {
    const contribLookupIdx = REJECT_FN.indexOf('this.getMembershipContribution(membershipId)');
    const stateWriteIdx = REJECT_FN.indexOf("lifecycle_state: 'REJECTED'");
    expect(contribLookupIdx).toBeGreaterThan(-1);
    expect(stateWriteIdx).toBeGreaterThan(-1);
    expect(contribLookupIdx).toBeLessThan(stateWriteIdx);
  });

  it('COMPLETED contribution -> requestRefund(); CREATED/AWAITING_SETTLEMENT -> cancelContribution()', () => {
    expect(REJECT_FN).toContain("contribution.state === 'COMPLETED'");
    expect(REJECT_FN).toContain(".requestRefund(Number(contribution.id), reason, { actorType: 'HUMAN', actorUserId })");
    expect(REJECT_FN).toContain("contribution.state === 'CREATED' || contribution.state === 'AWAITING_SETTLEMENT'");
    expect(REJECT_FN).toContain('.cancelContribution(Number(contribution.id),');
  });

  it('no contribution found (free/no-payment application) -- neither refund nor cancel is attempted', () => {
    // Both financial calls are nested inside `if (contribution) { ... }` --
    // verified structurally: the branch guard appears once, before either call.
    const guardIdx = REJECT_FN.indexOf('if (contribution) {');
    const refundIdx = REJECT_FN.indexOf('requestRefund(');
    const cancelIdx = REJECT_FN.indexOf('cancelContribution(');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(refundIdx);
    expect(guardIdx).toBeLessThan(cancelIdx);
  });

  it('a refund provider failure is caught so rejection always completes (never blocked by a transient outage)', () => {
    expect(REJECT_FN).toContain('.catch(() => {');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// G/H. Refund: idempotent, immutable history, generic provider boundary
// ═══════════════════════════════════════════════════════════════════════

describe('G/H. FinancialContributionService.requestRefund(): idempotent, immutable, generic', () => {
  const REFUND_FN = slice(
    FINANCIAL_CONTRIBUTION_SERVICE_SRC,
    'async requestRefund(',
    '\n  // ── Zero-value path',
  );

  it('only a COMPLETED contribution may be refunded', () => {
    expect(REFUND_FN).toContain("if (contribution.state !== 'COMPLETED')");
    expect(REFUND_FN).toContain('throw new ConflictException(');
  });

  it('at most one refund row per contribution -- duplicate calls return the existing row (alreadyRequested: true)', () => {
    expect(REFUND_FN).toContain("where('contribution_id', '=', contributionId)");
    expect(REFUND_FN).toContain('alreadyRequested: true');
  });

  it('never UPDATEs financial_transactions -- only INSERTs a new financial_refunds row', () => {
    expect(REFUND_FN).not.toContain("updateTable('financial_transactions')");
    expect(REFUND_FN).toContain("insertInto('financial_refunds')");
  });

  // Regression test for a defect found during the STEP 23 reconciliation
  // pass: an earlier version of this method transitioned the Contribution
  // to REFUNDED unconditionally the moment the provider ACCEPTED a refund
  // request, even when the provider's own response was only 'PROCESSING'
  // (accepted but not yet bank-confirmed) -- contradicting the "never claim
  // an outcome the platform has not actually observed" discipline this same
  // method follows everywhere else (e.g. for financial_refunds.status
  // itself). Fixed: the Contribution is only promoted to REFUNDED once the
  // refund is truly COMPLETED; while PROCESSING, it deliberately stays
  // COMPLETED and financial_refunds.status is the authoritative
  // "reversal in flight" signal.
  it('only transitions the Contribution to REFUNDED once the refund is COMPLETED -- never merely PROCESSING', () => {
    const providerCallBlock = REFUND_FN.slice(REFUND_FN.indexOf('try {\n      const result = await this.provider.refund('));
    const transitionIdx = providerCallBlock.indexOf("this.transitionContribution(contributionId, 'REFUNDED')");
    expect(transitionIdx).toBeGreaterThan(-1);
    const guardSlice = providerCallBlock.slice(0, transitionIdx);
    expect(guardSlice).toContain("if (newStatus === 'COMPLETED')");
  });

  it('mirrored: PROCESSING outcome does not promote the Contribution to REFUNDED', () => {
    function decideContributionTransition(refundProviderStatus: 'PROCESSING' | 'COMPLETED'): 'REFUNDED' | null {
      return refundProviderStatus === 'COMPLETED' ? 'REFUNDED' : null;
    }
    expect(decideContributionTransition('PROCESSING')).toBeNull();
    expect(decideContributionTransition('COMPLETED')).toBe('REFUNDED');
  });

  it('never claims COMPLETED merely because the provider accepted the request -- only on a definitive provider outcome', () => {
    expect(REFUND_FN).toContain("result.status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING'");
  });

  it('a provider call failure is recorded as FAILED, not thrown -- the refund path is never silently lost', () => {
    const catchBlock = REFUND_FN.slice(REFUND_FN.lastIndexOf('} catch (err) {'));
    expect(catchBlock).toContain("status: 'FAILED'");
    expect(catchBlock).not.toContain('throw');
  });

  it('provider is contacted only for a contribution actually settled via this service\'s injected Settlement Provider', () => {
    expect(REFUND_FN).toContain('succeededTxn.provider !== this.provider.providerName');
  });

  it('the migration creating financial_refunds does not touch financial_contributions/financial_transactions schema', () => {
    const migrationSql = readFileSync(
      join(__dirname, '../../../../../database/migrations/0094_create_financial_refunds.sql'),
      'utf8',
    );
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS financial_refunds');
    expect(migrationSql).not.toContain('ALTER TABLE financial_contributions');
    expect(migrationSql).not.toContain('ALTER TABLE financial_transactions');
    expect(migrationSql).toContain('uq_refund_contribution');
  });

  it('SettlementProvider.refund() is confined to the provider layer -- generic RefundInput/RefundResult only', () => {
    expect(SETTLEMENT_PROVIDER_INTERFACE_SRC).toContain('interface RefundInput');
    expect(SETTLEMENT_PROVIDER_INTERFACE_SRC).toContain('interface RefundResult');
    expect(SETTLEMENT_PROVIDER_INTERFACE_SRC).not.toContain('membership');
  });

  it('the Razorpay refund adapter is the only file translating RefundInput into a provider-specific request', () => {
    const razorpaySrc = readFileSync(join(__dirname, '../../financial/razorpay-settlement.provider.ts'), 'utf8');
    expect(razorpaySrc).toContain('async refund(input: RefundInput): Promise<RefundResult>');
    expect(razorpaySrc).toContain('client.payments.refund(');
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).not.toContain('payments.refund');
  });

  // Mirrors requestRefund()'s idempotency guarantee at the data-model level.
  it('idempotency guard: identical (contributionId) refund requests resolve to the same row', () => {
    const refundsByContribution = new Map<number, { refundId: number }>();
    function requestRefundMirror(contributionId: number): { refundId: number; alreadyRequested: boolean } {
      const existing = refundsByContribution.get(contributionId);
      if (existing) return { refundId: existing.refundId, alreadyRequested: true };
      const created = { refundId: contributionId * 1000 + 1 };
      refundsByContribution.set(contributionId, created);
      return { refundId: created.refundId, alreadyRequested: false };
    }
    const first = requestRefundMirror(1);
    const second = requestRefundMirror(1);
    expect(first.alreadyRequested).toBe(false);
    expect(second.alreadyRequested).toBe(true);
    expect(second.refundId).toBe(first.refundId);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// I. Retry safety
// ═══════════════════════════════════════════════════════════════════════

describe('I. Retry does not duplicate a Contribution or a payment obligation', () => {
  it('createContribution() idempotency (Financial Engine, unmodified) is what makes createApplicationContribution() retry-safe', () => {
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain("where('idempotency_key', '=', obligation.idempotencyKey)");
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain('Already created (and its CONTRIBUTION_CREATED event already');
  });

  it('FAILED/ABANDONED contributions remain retryable via the existing, unmodified retrySettlement() transitions', () => {
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain('async retrySettlement(');
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain("currentState !== 'FAILED' && currentState !== 'ABANDONED'");
  });

  it('a COMPLETED contribution can never be retried into a second payment obligation (ALLOWED_TRANSITIONS has no outbound edge except REFUNDED)', () => {
    const typesSrc = readFileSync(join(__dirname, '../../financial/financial.types.ts'), 'utf8');
    expect(typesSrc).toContain("COMPLETED:              ['REFUNDED'],");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// J. Zero-value path remains gateway-free, receipt-free, and hidden from the payment UI
// ═══════════════════════════════════════════════════════════════════════

describe('J. Zero-value Contributions stay outside Settlement/Transaction/Receipt/payment-UI', () => {
  it('processZeroValueContribution() never creates a Financial Transaction or Receipt (unmodified Financial Engine)', () => {
    const zeroValueFn = slice(
      FINANCIAL_CONTRIBUTION_SERVICE_SRC,
      'async processZeroValueContribution(',
      '\n  // ── Start settlement',
    );
    expect(zeroValueFn).not.toContain("insertInto('financial_transactions')");
    expect(zeroValueFn).not.toContain("insertInto('receipts')");
    expect(zeroValueFn).not.toContain('this.provider.');
  });

  it('createApplicationContribution() routes amountPaise === 0 through processZeroValueContribution(), never the payment screen', () => {
    const fn = slice(LIFECYCLE_SRC, 'async createApplicationContribution(', 'private async getMembershipContribution');
    expect(fn).toContain('if (amountPaise === 0)');
    expect(fn).toContain('this.financialService.processZeroValueContribution(contributionId)');
  });

  it('the frontend payment screen defensively reloads rather than opening Checkout for a zero-value contribution', () => {
    const beginCheckoutFn = slice(FRONTEND_FLOW_SRC, 'async function beginCheckout', 'payBtn.onclick = beginCheckout');
    expect(beginCheckoutFn).toContain('if (amountPaise === 0)');
    expect(beginCheckoutFn).not.toMatch(/amountPaise === 0[\s\S]{0,80}rzp\.open/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// K. Membership Number remains a final-activation-only output
// ═══════════════════════════════════════════════════════════════════════

describe('K. Membership Number is assigned only inside activate(), never from a payment event', () => {
  it('assignPermanentNumber() is called only from activate()', () => {
    const occurrences = LIFECYCLE_SRC.match(/assignPermanentNumber/g) ?? [];
    // Exactly one call site (inside activate()) + its own doc-comment mentions elsewhere are excluded
    // by checking the call form specifically.
    const callSites = LIFECYCLE_SRC.match(/this\.numberingService\.assignPermanentNumber\(/g) ?? [];
    expect(callSites.length).toBe(1);
    expect(occurrences.length).toBeGreaterThanOrEqual(1);

    const activateFn = slice(LIFECYCLE_SRC, 'async activate(', '// ==', LIFECYCLE_SRC.indexOf('async activate('));
    expect(activateFn).toContain('this.numberingService.assignPermanentNumber(');
  });

  it('recordPaymentReceived() and createApplicationContribution() never reference the numbering service', () => {
    const paymentReceivedFn = slice(LIFECYCLE_SRC, 'async recordPaymentReceived(', "this.notifyMember(membership, 'MEMBERSHIP_PAYMENT_RECEIVED');") + '}';
    const createContribFn = slice(LIFECYCLE_SRC, 'async createApplicationContribution(', 'private async getMembershipContribution');
    expect(paymentReceivedFn).not.toContain('numberingService');
    expect(createContribFn).not.toContain('numberingService');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// L. Frontend source inspection
// ═══════════════════════════════════════════════════════════════════════

describe('L. Frontend never activates Membership, mutates lifecycle, or exposes a secret', () => {
  it('no lifecycle mutation call anywhere in the component (no updateTable, no direct DB access)', () => {
    expect(FRONTEND_FLOW_SRC).not.toContain('updateTable');
    expect(FRONTEND_FLOW_SRC).not.toMatch(/lifecycle_state\s*[:=]\s*['"]ACTIVE['"]/);
  });

  it('never claims the membership is "active" from a payment event -- pollContributionStatus() shows the awaiting-approval screen, no redirect-to-active', () => {
    const pollFn = slice(FRONTEND_FLOW_SRC, 'function pollContributionStatus(', '.catch(() => {');
    expect(pollFn).toContain('showAwaitingApprovalScreen()');
    expect(pollFn).not.toMatch(/COMPLETED[\s\S]{0,60}window\.location\.href/);
  });

  it('the awaiting-approval screen text does not claim activation happened', () => {
    const screenMarkup = slice(FRONTEND_FLOW_SRC, 'id="maf-awaiting-approval-screen"', 'Variant B: pre-fill banner');
    expect(screenMarkup.toLowerCase()).not.toContain('membership active');
    expect(screenMarkup.toLowerCase()).not.toContain('you are now a member');
  });

  it('no client-side price calculation -- amount is always taken verbatim from the backend response', () => {
    expect(FRONTEND_FLOW_SRC).not.toMatch(/amountPaise\s*=\s*\d+\s*\*\s*100/);
    expect(FRONTEND_FLOW_SRC).toContain('const amountPaise: number = data.pendingAmountPaise ?? 0;');
  });

  it('no secret exposure -- only the public Razorpay key id is ever referenced, never a key/webhook secret', () => {
    expect(FRONTEND_FLOW_SRC).not.toContain('KEY_SECRET');
    expect(FRONTEND_FLOW_SRC).not.toContain('WEBHOOK_SECRET');
    expect(FRONTEND_FLOW_SRC).toContain('providerPublicKeyId');
  });

  it('Razorpay checkout success handler never claims a settlement outcome client-side -- only polls the backend', () => {
    const handlerFn = slice(FRONTEND_FLOW_SRC, 'handler: function () {', 'modal: {');
    expect(handlerFn).toContain('pollContributionStatus(contributionId)');
    expect(handlerFn).not.toContain("state = 'COMPLETED'");
  });
});
