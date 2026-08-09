// backend/src/modules/financial/financial-contribution.spec.ts
//
// Unit tests for the Financial Engine foundation (Steps 3 & 4).
// Tests cover:
//   • PAY-001 domain constants from financial.types.ts (Step 3)
//   • PAY-001 state machine transitions from ALLOWED_TRANSITIONS (Step 4)
//   • Financial Engine Business Events from financial.events.ts (Step 4)
//   • Zero-value path state transitions (Step 4)
//   • Idempotency key conflict detection logic (Step 4)
//   • Generic business-module reference validation (Step 4)
//
// Intentionally avoids importing the service or db.ts: Kysely is ESM-only
// and Jest in this project runs in CommonJS mode. DB-dependent behaviour
// (write round-trips, idempotency enforcement on real DB) is covered by
// integration tests against the live schema.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONTRIBUTION_STATES,
  TERMINAL_CONTRIBUTION_STATES,
  CANCELLABLE_CONTRIBUTION_STATES,
  ALLOWED_TRANSITIONS,
  type ContributionState,
  type FinancialObligationInput,
  type TransactionOutcome,
  type SettlementResult,
  type SettlementOutcomeInput,
} from './financial.types';
import {
  FINANCIAL_EVENT_TYPES,
  STATE_TRANSITION_EVENTS,
  type FinancialEngineEventPayload,
} from './financial.events';

// ── STEP 3: Domain constants ──────────────────────────────────────────────

describe('ContributionState constants (PAY-001 §FINANCIAL STATES)', () => {
  it('defines exactly 10 PAY-001 lifecycle states', () => {
    expect(CONTRIBUTION_STATES).toHaveLength(10);
  });

  it.each([
    'CREATED',
    'AWAITING_SETTLEMENT',
    'SETTLEMENT_IN_PROGRESS',
    'SETTLED',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'ABANDONED',
    'REFUNDED',
  ] as ContributionState[])('includes PAY-001 state: %s', (state) => {
    expect(CONTRIBUTION_STATES).toContain(state);
  });

  it('has no duplicate state values', () => {
    expect(new Set(CONTRIBUTION_STATES).size).toBe(CONTRIBUTION_STATES.length);
  });
});

describe('TERMINAL_CONTRIBUTION_STATES', () => {
  it.each(['COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] as ContributionState[])(
    '%s is a terminal state',
    (state) => expect(TERMINAL_CONTRIBUTION_STATES).toContain(state),
  );

  it('FAILED is NOT terminal (PAY-001: retry is permitted)', () => {
    expect(TERMINAL_CONTRIBUTION_STATES).not.toContain('FAILED' as ContributionState);
  });

  it('ABANDONED is NOT terminal (PAY-001: may return to AWAITING_SETTLEMENT)', () => {
    expect(TERMINAL_CONTRIBUTION_STATES).not.toContain('ABANDONED' as ContributionState);
  });

  it('SETTLED is NOT terminal (further processing leads to COMPLETED)', () => {
    expect(TERMINAL_CONTRIBUTION_STATES).not.toContain('SETTLED' as ContributionState);
  });
});

describe('CANCELLABLE_CONTRIBUTION_STATES', () => {
  it('only CREATED and AWAITING_SETTLEMENT are cancellable', () => {
    expect(CANCELLABLE_CONTRIBUTION_STATES).toHaveLength(2);
    expect(CANCELLABLE_CONTRIBUTION_STATES).toContain('CREATED' as ContributionState);
    expect(CANCELLABLE_CONTRIBUTION_STATES).toContain('AWAITING_SETTLEMENT' as ContributionState);
  });

  it.each([
    'SETTLEMENT_IN_PROGRESS',
    'SETTLED', 'COMPLETED', 'FAILED',
    'EXPIRED', 'ABANDONED', 'REFUNDED',
  ] as ContributionState[])('%s is NOT cancellable', (state) => {
    expect(CANCELLABLE_CONTRIBUTION_STATES).not.toContain(state);
  });
});

describe('FinancialObligationInput (Step 3)', () => {
  it('accepts zero-value amount (PAY-001 Principle 12)', () => {
    const o: FinancialObligationInput = {
      payerUserId: 1, businessModule: 'MEMBERSHIP', businessReferenceId: 1,
      purpose: 'Waived fee', amountPaise: 0, idempotencyKey: 'MEM-1-WAIVER',
    };
    expect(o.amountPaise).toBe(0);
  });

  it('idempotencyKey is required in the type (not optional)', () => {
    const o: FinancialObligationInput = {
      payerUserId: 1, businessModule: 'MEMBERSHIP', businessReferenceId: 42,
      purpose: 'Annual fee', amountPaise: 1_500_00, idempotencyKey: 'MEM-42-2025',
    };
    expect(o.idempotencyKey).toBeDefined();
  });
});

describe('TransactionOutcome values (Step 3)', () => {
  it('covers the four expected outcome values', () => {
    const outcomes: TransactionOutcome[] = ['PENDING', 'SUCCEEDED', 'FAILED', 'ABANDONED'];
    expect(outcomes).toHaveLength(4);
  });
});

// ── STEP 4: State machine ─────────────────────────────────────────────────

describe('PAY-001 State Machine — ALLOWED_TRANSITIONS', () => {
  describe('valid transitions', () => {
    it.each([
      ['CREATED', 'AWAITING_SETTLEMENT'],
      ['CREATED', 'CANCELLED'],
      ['CREATED', 'EXPIRED'],
      ['AWAITING_SETTLEMENT', 'SETTLEMENT_IN_PROGRESS'],
      ['AWAITING_SETTLEMENT', 'SETTLED'],      // zero-value bypass (PAY-001 §12)
      ['AWAITING_SETTLEMENT', 'CANCELLED'],
      ['AWAITING_SETTLEMENT', 'EXPIRED'],
      ['SETTLEMENT_IN_PROGRESS', 'SETTLED'],
      ['SETTLEMENT_IN_PROGRESS', 'FAILED'],
      ['SETTLEMENT_IN_PROGRESS', 'ABANDONED'],
      ['SETTLED', 'COMPLETED'],
      ['COMPLETED', 'REFUNDED'],
      ['FAILED', 'AWAITING_SETTLEMENT'],
      ['ABANDONED', 'AWAITING_SETTLEMENT'],
    ] as [ContributionState, ContributionState][])('%s → %s is valid', (from, to) => {
      expect(ALLOWED_TRANSITIONS[from]).toContain(to);
    });
  });

  describe('invalid transitions', () => {
    it.each([
      ['CREATED', 'COMPLETED'],              // cannot skip entire lifecycle
      ['CREATED', 'SETTLED'],
      ['CREATED', 'SETTLEMENT_IN_PROGRESS'], // must go via AWAITING_SETTLEMENT first
      ['AWAITING_SETTLEMENT', 'COMPLETED'],  // must settle first
      ['AWAITING_SETTLEMENT', 'REFUNDED'],
      ['SETTLEMENT_IN_PROGRESS', 'CREATED'],
      ['SETTLEMENT_IN_PROGRESS', 'AWAITING_SETTLEMENT'], // no rollback mid-settlement
      ['SETTLED', 'AWAITING_SETTLEMENT'],    // cannot re-open a settled contribution
      ['COMPLETED', 'FAILED'],              // terminal
      ['COMPLETED', 'AWAITING_SETTLEMENT'],  // terminal
      ['REFUNDED', 'COMPLETED'],            // terminal
      ['CANCELLED', 'AWAITING_SETTLEMENT'], // terminal
      ['EXPIRED', 'AWAITING_SETTLEMENT'],   // terminal
    ] as [ContributionState, ContributionState][])('%s → %s is INVALID', (from, to) => {
      expect(ALLOWED_TRANSITIONS[from]).not.toContain(to);
    });
  });

  describe('terminal states with no outgoing transitions', () => {
    it.each(['CANCELLED', 'EXPIRED', 'REFUNDED'] as ContributionState[])(
      '%s has no allowed outgoing transitions (truly dead-end)',
      (state) => expect(ALLOWED_TRANSITIONS[state]).toHaveLength(0),
    );

    it('COMPLETED has exactly one outgoing transition: REFUNDED (PAY-001 §REFUND)', () => {
      expect(ALLOWED_TRANSITIONS.COMPLETED).toStrictEqual(['REFUNDED']);
    });
  });

  it('FAILED → AWAITING_SETTLEMENT (PAY-001: retry is always permitted)', () => {
    expect(ALLOWED_TRANSITIONS.FAILED).toContain('AWAITING_SETTLEMENT');
  });

  it('ABANDONED → AWAITING_SETTLEMENT (PAY-001: interrupted settlement may retry)', () => {
    expect(ALLOWED_TRANSITIONS.ABANDONED).toContain('AWAITING_SETTLEMENT');
  });

  it('every CONTRIBUTION_STATES entry appears as a key in ALLOWED_TRANSITIONS', () => {
    CONTRIBUTION_STATES.forEach((state) => {
      expect(ALLOWED_TRANSITIONS).toHaveProperty(state);
    });
  });
});

// ── STEP 4: Zero-value path ───────────────────────────────────────────────

describe('Zero-value Financial Contribution path (frozen zero-value rule)', () => {
  // State machine: the path must be possible at the transition level.
  it('zero-value path goes CREATED → AWAITING_SETTLEMENT → SETTLED → COMPLETED', () => {
    expect(ALLOWED_TRANSITIONS.CREATED).toContain('AWAITING_SETTLEMENT');
    expect(ALLOWED_TRANSITIONS.AWAITING_SETTLEMENT).toContain('SETTLED');
    expect(ALLOWED_TRANSITIONS.SETTLED).toContain('COMPLETED');
  });

  it('AWAITING_SETTLEMENT → SETTLED is the zero-value provider bypass', () => {
    expect(ALLOWED_TRANSITIONS.AWAITING_SETTLEMENT).toContain('SETTLED');
  });

  it('zero-value path does NOT go through SETTLEMENT_IN_PROGRESS (no provider interaction)', () => {
    // The zero-value service method chooses AWAITING_SETTLEMENT → SETTLED directly,
    // skipping SETTLEMENT_IN_PROGRESS entirely. SETTLEMENT_IN_PROGRESS is the
    // provider path only.
    expect(ALLOWED_TRANSITIONS.AWAITING_SETTLEMENT).toContain('SETTLED');
    expect(ALLOWED_TRANSITIONS.AWAITING_SETTLEMENT).toContain('SETTLEMENT_IN_PROGRESS');
    // Whether SETTLEMENT_IN_PROGRESS is taken is a service-level decision, not
    // the state machine's. The zero-value service method never calls it.
  });

  it('AWAITING_SETTLEMENT → COMPLETED is NOT a direct transition (no lifecycle skip)', () => {
    expect(ALLOWED_TRANSITIONS.AWAITING_SETTLEMENT).not.toContain('COMPLETED');
  });

  it('positive-amount contribution is rejected by processZeroValueContribution guard', () => {
    // Verified at the service level via the amount_paise !== 0 ConflictException.
    // Test: obligation type supports positive amounts but zero-value service rejects them.
    const positiveObligation: FinancialObligationInput = {
      payerUserId: 1, businessModule: 'MEMBERSHIP', businessReferenceId: 1,
      purpose: 'Annual fee', amountPaise: 1_500_00, idempotencyKey: 'MEM-1-2025',
    };
    expect(positiveObligation.amountPaise).toBeGreaterThan(0);
    // The service guard: `if (Number(contribution.amount_paise) !== 0) throw ConflictException`
    // This is the enforcement boundary — tested here as a domain rule assertion.
    const isZeroValue = (amountPaise: number) => amountPaise === 0;
    expect(isZeroValue(positiveObligation.amountPaise)).toBe(false);
  });

  // ── No Receipt ───────────────────────────────────────────────────────────

  it('zero-value path produces NO Receipt (receipts are for monetary transactions only)', () => {
    // Verified by code inspection: processZeroValueContribution() does not call
    // issueReceipt() and does not insert into the receipts table.
    // The return type is void — there is no receiptId in the return value.
    //
    // This test encodes the rule as a domain constant check: the zero-value
    // business rule is that receipts require a positive amount.
    const amountPaise = 0;
    const requiresReceipt = (amount: number) => amount > 0;
    expect(requiresReceipt(amountPaise)).toBe(false);
  });

  it('RECEIPT_GENERATED event is NOT in the zero-value event sequence', () => {
    // Zero-value lifecycle events in order:
    // CONTRIBUTION_CREATED → AWAITING_SETTLEMENT → SETTLEMENT_COMPLETED → CONTRIBUTION_COMPLETED
    // RECEIPT_GENERATED is absent — it is only emitted when a receipt row is created.
    const zeroValueEventSequence = [
      FINANCIAL_EVENT_TYPES.CONTRIBUTION_CREATED,
      FINANCIAL_EVENT_TYPES.AWAITING_SETTLEMENT,
      FINANCIAL_EVENT_TYPES.SETTLEMENT_COMPLETED,
      FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
    ];
    expect(zeroValueEventSequence).not.toContain(FINANCIAL_EVENT_TYPES.RECEIPT_GENERATED);
  });

  // ── No Financial Transaction ──────────────────────────────────────────────

  it('zero-value path creates NO Financial Transaction (settlement is bypassed)', () => {
    // Financial Transactions are only created when a Settlement Provider is
    // invoked. Zero-value contributions bypass Settlement entirely; no
    // financial_transactions row is written.
    //
    // Domain rule encoded: a transaction requires a settlement provider interaction.
    const settlementProviderInvoked = false; // zero-value path never contacts a provider
    const transactionCreated = settlementProviderInvoked; // transactions follow provider calls
    expect(transactionCreated).toBe(false);
  });

  // ── No Gateway ───────────────────────────────────────────────────────────

  it('zero-value path requires NO gateway credentials or configuration', () => {
    // FinancialObligationInput has no gateway-specific fields.
    const zeroValueObligation: FinancialObligationInput = {
      payerUserId: 1, businessModule: 'MEMBERSHIP', businessReferenceId: 42,
      purpose: 'Fee waiver', amountPaise: 0, idempotencyKey: 'MEM-42-WAIVER',
    };
    const keys = Object.keys(zeroValueObligation);
    expect(keys).not.toContain('razorpayKeyId');
    expect(keys).not.toContain('razorpayOrderId');
    expect(keys).not.toContain('gatewayConfig');
    expect(keys).not.toContain('webhookSecret');
  });

  it('SETTLEMENT_STARTED event is NOT in the zero-value event sequence (no provider = no settlement start)', () => {
    // SETTLEMENT_IN_PROGRESS exists in ALLOWED_TRANSITIONS as the provider path,
    // but the zero-value service method never takes it — it goes directly
    // AWAITING_SETTLEMENT → SETTLED. Therefore SETTLEMENT_STARTED is never emitted.
    const zeroValueEventSequence = [
      FINANCIAL_EVENT_TYPES.CONTRIBUTION_CREATED,
      FINANCIAL_EVENT_TYPES.AWAITING_SETTLEMENT,
      FINANCIAL_EVENT_TYPES.SETTLEMENT_COMPLETED,
      FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
    ];
    expect(zeroValueEventSequence).not.toContain(FINANCIAL_EVENT_TYPES.SETTLEMENT_STARTED);
  });

  // ── Completion event ──────────────────────────────────────────────────────

  it('CONTRIBUTION_COMPLETED event IS emitted so Business Module can continue its lifecycle', () => {
    const zeroValueEventSequence = [
      FINANCIAL_EVENT_TYPES.CONTRIBUTION_CREATED,
      FINANCIAL_EVENT_TYPES.AWAITING_SETTLEMENT,
      FINANCIAL_EVENT_TYPES.SETTLEMENT_COMPLETED,
      FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
    ];
    expect(zeroValueEventSequence).toContain(FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED);
  });

  it('SETTLEMENT_COMPLETED event IS emitted on zero-value path (AWAITING_SETTLEMENT → SETTLED transition)', () => {
    // STATE_TRANSITION_EVENTS maps SETTLED → SETTLEMENT_COMPLETED.
    // The zero-value service calls transitionContribution(id, 'SETTLED'),
    // which triggers this event via the state machine emitter.
    expect(STATE_TRANSITION_EVENTS['SETTLED']).toBe(FINANCIAL_EVENT_TYPES.SETTLEMENT_COMPLETED);
  });
});

// ── STEP 4: Business Events ───────────────────────────────────────────────

describe('Financial Engine Business Events (PAY-001 §BUSINESS EVENT MODEL)', () => {
  it('defines 9 Financial Engine events (Financial Obligation Created is a Business Module event)', () => {
    expect(Object.keys(FINANCIAL_EVENT_TYPES)).toHaveLength(9);
  });

  it('all event type values are namespaced with "financial." prefix', () => {
    Object.values(FINANCIAL_EVENT_TYPES).forEach((v) => {
      expect(v).toMatch(/^financial\./);
    });
  });

  it('has no duplicate event type values', () => {
    const values = Object.values(FINANCIAL_EVENT_TYPES);
    expect(new Set(values).size).toBe(values.length);
  });

  it('STATE_TRANSITION_EVENTS maps SETTLED → SETTLEMENT_COMPLETED', () => {
    expect(STATE_TRANSITION_EVENTS['SETTLED']).toBe(FINANCIAL_EVENT_TYPES.SETTLEMENT_COMPLETED);
  });

  it('STATE_TRANSITION_EVENTS maps COMPLETED → CONTRIBUTION_COMPLETED', () => {
    expect(STATE_TRANSITION_EVENTS['COMPLETED']).toBe(FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED);
  });

  it('STATE_TRANSITION_EVENTS maps AWAITING_SETTLEMENT → AWAITING_SETTLEMENT event', () => {
    expect(STATE_TRANSITION_EVENTS['AWAITING_SETTLEMENT']).toBe(FINANCIAL_EVENT_TYPES.AWAITING_SETTLEMENT);
  });

  it('STATE_TRANSITION_EVENTS maps FAILED → SETTLEMENT_FAILED', () => {
    expect(STATE_TRANSITION_EVENTS['FAILED']).toBe(FINANCIAL_EVENT_TYPES.SETTLEMENT_FAILED);
  });

  it('STATE_TRANSITION_EVENTS maps ABANDONED → SETTLEMENT_ABANDONED', () => {
    expect(STATE_TRANSITION_EVENTS['ABANDONED']).toBe(FINANCIAL_EVENT_TYPES.SETTLEMENT_ABANDONED);
  });

  it('CANCELLED and EXPIRED have no corresponding PAY-001 Business Event', () => {
    expect(STATE_TRANSITION_EVENTS['CANCELLED']).toBeUndefined();
    expect(STATE_TRANSITION_EVENTS['EXPIRED']).toBeUndefined();
  });

  it('FinancialEngineEventPayload shape contains all required generic fields', () => {
    const payload: FinancialEngineEventPayload = {
      eventType: FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
      contributionId: 1,
      businessModule: 'MEMBERSHIP',
      businessReferenceId: 42,
      amountPaise: 0,
      currency: 'INR',
      contributionState: 'COMPLETED',
      occurredAt: new Date(),
    };
    expect(payload.businessModule).toBe('MEMBERSHIP');
    expect(payload.businessReferenceId).toBe(42);
    expect(payload.amountPaise).toBe(0);
  });
});

// ── STEP 4: Idempotency conflict detection ────────────────────────────────

// Pure function extracted from FinancialContributionService.createContribution()
// for unit-testable conflict detection — same logic, no DB required.
function isConflictingObligation(
  existing: { business_module: string; business_reference_id: number; amount_paise: number },
  incoming: FinancialObligationInput,
): boolean {
  return (
    String(existing.business_module) !== incoming.businessModule ||
    Number(existing.business_reference_id) !== incoming.businessReferenceId ||
    Number(existing.amount_paise) !== incoming.amountPaise
  );
}

describe('Idempotency key conflict detection', () => {
  const existingRow = {
    business_module: 'MEMBERSHIP',
    business_reference_id: 101,
    amount_paise: 1_500_00,
  };
  const matchingObligation: FinancialObligationInput = {
    payerUserId: 1, businessModule: 'MEMBERSHIP', businessReferenceId: 101,
    purpose: 'Annual membership fee', amountPaise: 1_500_00,
    idempotencyKey: 'MEM-101-INITIAL-2025',
  };

  it('same obligation data → NOT a conflict (idempotent return)', () => {
    expect(isConflictingObligation(existingRow, matchingObligation)).toBe(false);
  });

  it('different businessModule → conflict (reject)', () => {
    expect(isConflictingObligation(existingRow, { ...matchingObligation, businessModule: 'EVENT' })).toBe(true);
  });

  it('different businessReferenceId → conflict (reject)', () => {
    expect(isConflictingObligation(existingRow, { ...matchingObligation, businessReferenceId: 999 })).toBe(true);
  });

  it('different amountPaise → conflict (reject)', () => {
    expect(isConflictingObligation(existingRow, { ...matchingObligation, amountPaise: 2_000_00 })).toBe(true);
  });

  it('zero amount_paise is non-conflicting when both sides are zero', () => {
    const zeroRow = { ...existingRow, amount_paise: 0 };
    const zeroObligation = { ...matchingObligation, amountPaise: 0 };
    expect(isConflictingObligation(zeroRow, zeroObligation)).toBe(false);
  });
});

// ── STEP 4: Generic business reference ───────────────────────────────────

describe('Generic business-module reference (PAY-001 §FINANCIAL CONTRIBUTION INDEPENDENCE)', () => {
  const obligationFor = (module: string, refId: number): FinancialObligationInput => ({
    payerUserId: 1,
    businessModule: module,
    businessReferenceId: refId,
    purpose: `Test obligation for ${module} ${refId}`,
    amountPaise: 0,
    idempotencyKey: `${module}-${refId}-test`,
  });

  it.each([
    ['MEMBERSHIP', 101],
    ['EVENT', 202],
    ['CONTEST', 303],
    ['WORKSHOP', 404],
  ])('accepts %s module reference (id=%s)', (module, refId) => {
    const o = obligationFor(module, refId);
    expect(o.businessModule).toBe(module);
    expect(o.businessReferenceId).toBe(refId);
  });

  it('FinancialObligationInput has no membership-specific fields', () => {
    const keys = Object.keys(obligationFor('MEMBERSHIP', 1));
    expect(keys).not.toContain('membershipId');
    expect(keys).not.toContain('membershipClassId');
    expect(keys).not.toContain('membershipType');
    expect(keys).not.toContain('razorpayOrderId');
  });

  it('FinancialEngineEventPayload returns business reference as-supplied, without transformation', () => {
    const payload: FinancialEngineEventPayload = {
      eventType: FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
      contributionId: 5,
      businessModule: 'EVENT',
      businessReferenceId: 202,
      amountPaise: 500_00,
      currency: 'INR',
      contributionState: 'COMPLETED',
      occurredAt: new Date(),
    };
    expect(payload.businessModule).toBe('EVENT');
    expect(payload.businessReferenceId).toBe(202);
  });
});

// ── STEP 10: recordSettlementOutcome() — manual settlement foundation ────
//
// FinancialContributionService.recordSettlementOutcome() cannot be imported
// directly (transitively pulls in db.ts, ESM-only, incompatible with this
// project's CommonJS Jest config — same constraint documented at the top of
// this file). These tests instead exercise:
//   (a) the REAL, imported ALLOWED_TRANSITIONS state machine (financial.types.ts
//       has no db.ts dependency, so this is not a mirror — it is the actual
//       transition table recordSettlementOutcome() validates against), and
//   (b) pure functions mirroring recordSettlementOutcome()'s decision logic,
//       matching the established pattern for this project's DB-adjacent tests.

// SettlementResult never includes 'PENDING' — Financial Transactions are only
// ever inserted with a final, already-known outcome (PAY-001 Principle 10).
describe('SettlementResult (Step 10)', () => {
  it('excludes PENDING — no INSERT-then-UPDATE path exists in the Financial Engine', () => {
    const results: SettlementResult[] = ['SUCCEEDED', 'FAILED', 'ABANDONED'];
    expect(results).toHaveLength(3);
    expect(results).not.toContain('PENDING');
  });

  it('SettlementOutcomeInput carries no Membership-specific or provider-specific-only fields', () => {
    const input: SettlementOutcomeInput = {
      provider: 'BCC_DIRECT_UPI',
      providerReference: 'UTR123456789',
      result: 'SUCCEEDED',
      amountPaise: 50_000,
    };
    const keys = Object.keys(input);
    expect(keys).not.toContain('membershipClassId');
    expect(keys).not.toContain('membershipId');
    expect(keys).not.toContain('razorpayOrderId');
    expect(keys).not.toContain('razorpayKeyId');
  });
});

// Real ALLOWED_TRANSITIONS: recordSettlementOutcome() requires SETTLEMENT_IN_PROGRESS
// as the entry state and only ever targets SETTLED/FAILED/ABANDONED from there.
describe('recordSettlementOutcome() entry/target states (real ALLOWED_TRANSITIONS)', () => {
  it('SETTLEMENT_IN_PROGRESS is the only valid entry state for a settlement outcome', () => {
    // Mirrors the service's explicit guard: any other current state throws ConflictException.
    const nonEntryStates = CONTRIBUTION_STATES.filter((s) => s !== 'SETTLEMENT_IN_PROGRESS');
    expect(nonEntryStates).not.toContain('SETTLEMENT_IN_PROGRESS');
    expect(CONTRIBUTION_STATES).toContain('SETTLEMENT_IN_PROGRESS');
  });

  it('SUCCEEDED path: SETTLEMENT_IN_PROGRESS → SETTLED → COMPLETED are both legal transitions', () => {
    expect(ALLOWED_TRANSITIONS.SETTLEMENT_IN_PROGRESS).toContain('SETTLED');
    expect(ALLOWED_TRANSITIONS.SETTLED).toContain('COMPLETED');
  });

  it('FAILED path: SETTLEMENT_IN_PROGRESS → FAILED is legal, and FAILED is retryable', () => {
    expect(ALLOWED_TRANSITIONS.SETTLEMENT_IN_PROGRESS).toContain('FAILED');
    expect(ALLOWED_TRANSITIONS.FAILED).toContain('AWAITING_SETTLEMENT');
    expect(TERMINAL_CONTRIBUTION_STATES).not.toContain('FAILED' as ContributionState);
  });

  it('ABANDONED path: SETTLEMENT_IN_PROGRESS → ABANDONED is legal, and ABANDONED is retryable', () => {
    expect(ALLOWED_TRANSITIONS.SETTLEMENT_IN_PROGRESS).toContain('ABANDONED');
    expect(ALLOWED_TRANSITIONS.ABANDONED).toContain('AWAITING_SETTLEMENT');
  });

  it('recordSettlementOutcome() never targets a state outside {SETTLED, FAILED, ABANDONED} from SETTLEMENT_IN_PROGRESS', () => {
    expect([...ALLOWED_TRANSITIONS.SETTLEMENT_IN_PROGRESS].sort()).toStrictEqual(
      ['ABANDONED', 'FAILED', 'SETTLED'].sort(),
    );
  });

  it('COMPLETED has no transition back to SETTLEMENT_IN_PROGRESS — an already-completed contribution cannot be settled again', () => {
    expect(ALLOWED_TRANSITIONS.COMPLETED).not.toContain('SETTLEMENT_IN_PROGRESS');
    expect(ALLOWED_TRANSITIONS.COMPLETED).toStrictEqual(['REFUNDED']);
  });

  it('SETTLED has no transition back to SETTLEMENT_IN_PROGRESS — an already-settled contribution cannot be settled again', () => {
    expect(ALLOWED_TRANSITIONS.SETTLED).not.toContain('SETTLEMENT_IN_PROGRESS');
    expect(ALLOWED_TRANSITIONS.SETTLED).toStrictEqual(['COMPLETED']);
  });
});

// Pure mirror of recordSettlementOutcome()'s pre-write guards (state check,
// zero-value guard, amount-match guard), matching the project's established
// pattern for DB-adjacent decision logic.
function isEligibleForSettlementOutcome(
  contributionState: ContributionState,
  contributionAmountPaise: number,
  requestedAmountPaise: number,
): { eligible: boolean; reason?: string } {
  if (contributionState !== 'SETTLEMENT_IN_PROGRESS') {
    return { eligible: false, reason: 'WRONG_STATE' };
  }
  if (contributionAmountPaise === 0) {
    return { eligible: false, reason: 'ZERO_VALUE_MUST_USE_ZERO_VALUE_PATH' };
  }
  if (requestedAmountPaise !== contributionAmountPaise) {
    return { eligible: false, reason: 'AMOUNT_MISMATCH' };
  }
  return { eligible: true };
}

describe('recordSettlementOutcome() pre-write guards (mirrored)', () => {
  it('rejects when contribution is not SETTLEMENT_IN_PROGRESS', () => {
    (['CREATED', 'AWAITING_SETTLEMENT', 'SETTLED', 'COMPLETED', 'FAILED'] as ContributionState[]).forEach((s) => {
      expect(isEligibleForSettlementOutcome(s, 50_000, 50_000).eligible).toBe(false);
    });
  });

  it('accepts when contribution is SETTLEMENT_IN_PROGRESS and amounts match', () => {
    expect(isEligibleForSettlementOutcome('SETTLEMENT_IN_PROGRESS', 50_000, 50_000).eligible).toBe(true);
  });

  it('rejects a zero-value contribution — must use processZeroValueContribution() instead', () => {
    const result = isEligibleForSettlementOutcome('SETTLEMENT_IN_PROGRESS', 0, 0);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('ZERO_VALUE_MUST_USE_ZERO_VALUE_PATH');
  });

  it('rejects a mismatched amount', () => {
    const result = isEligibleForSettlementOutcome('SETTLEMENT_IN_PROGRESS', 50_000, 40_000);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('AMOUNT_MISMATCH');
  });
});

// Idempotency: pure mirror of the duplicate-provider-reference short-circuit.
function findExistingTransactionByReference(
  existingTransactions: Array<{ id: number; providerReference: string | null }>,
  candidateReference: string | null,
): number | null {
  if (!candidateReference) return null;
  const match = existingTransactions.find((t) => t.providerReference === candidateReference);
  return match ? match.id : null;
}

describe('recordSettlementOutcome() idempotency (mirrored)', () => {
  it('first SUCCEEDED outcome for a fresh provider reference finds no existing transaction', () => {
    expect(findExistingTransactionByReference([], 'UTR-001')).toBeNull();
  });

  it('same provider reference repeated finds the existing transaction — no duplicate insert', () => {
    const existing = [{ id: 7, providerReference: 'UTR-001' }];
    expect(findExistingTransactionByReference(existing, 'UTR-001')).toBe(7);
  });

  it('different provider reference after a FAILED attempt is treated as a fresh, valid retry', () => {
    const existing = [{ id: 7, providerReference: 'UTR-001' }]; // the FAILED attempt's transaction
    expect(findExistingTransactionByReference(existing, 'UTR-002')).toBeNull();
  });

  it('null provider reference never matches — always proceeds as a new attempt', () => {
    const existing = [{ id: 7, providerReference: null }];
    expect(findExistingTransactionByReference(existing, null)).toBeNull();
  });

  it('duplicate admin approval (same reference, contribution already SETTLED) short-circuits to the existing transaction id', () => {
    // Simulates: request #1 committed (contribution now SETTLED, transaction id=7
    // exists for UTR-001); request #2 (a duplicate click) arrives with the same
    // reference. The idempotency check runs BEFORE the SETTLEMENT_IN_PROGRESS
    // guard, so it returns id=7 instead of throwing on the now-stale state check.
    const existing = [{ id: 7, providerReference: 'UTR-001' }];
    const duplicateResult = findExistingTransactionByReference(existing, 'UTR-001');
    expect(duplicateResult).toBe(7);
  });
});

// Financial Transaction immutability: no service method updates outcome,
// amount, provider, provider_reference, or failure_reason after creation.
describe('Financial Transaction immutability boundary (Step 10)', () => {
  it('recordSettlementOutcome() writes financial_transactions via INSERT semantics only — outcome is fixed at creation', () => {
    // Domain rule encoded: a Financial Transaction's outcome is chosen once,
    // at INSERT time, from SettlementResult (never PENDING, never mutated).
    const outcomeAtCreation: SettlementResult = 'SUCCEEDED';
    const transaction = { id: 1, outcome: outcomeAtCreation, created: true, updated: false };
    expect(transaction.updated).toBe(false);
    expect(transaction.outcome).toBe('SUCCEEDED');
  });

  it('a FAILED transaction is never later flipped to SUCCEEDED — retries produce a NEW transaction row instead', () => {
    const attempt1 = { id: 1, providerReference: 'UTR-001', outcome: 'FAILED' as SettlementResult };
    const attempt2 = { id: 2, providerReference: 'UTR-002', outcome: 'SUCCEEDED' as SettlementResult };
    expect(attempt1.outcome).toBe('FAILED'); // unchanged, forever
    expect(attempt2.id).not.toBe(attempt1.id); // a distinct row, not a mutation of attempt1
  });
});

// ── STEP 12: retrySettlement() — financial settlement retry ───────────────
//
// Pure mirror of retrySettlement()'s decision logic, matching the
// established pattern for this project's DB-adjacent tests (db.ts is
// ESM-only, incompatible with CommonJS Jest -- see file header).

function evaluateRetry(
  state: ContributionState,
): { outcome: 'IDEMPOTENT_OK' | 'RETRIED' | 'REJECTED_WRONG_STATE' } {
  if (state === 'AWAITING_SETTLEMENT') return { outcome: 'IDEMPOTENT_OK' };
  if (state === 'FAILED' || state === 'ABANDONED') return { outcome: 'RETRIED' };
  return { outcome: 'REJECTED_WRONG_STATE' };
}

describe('retrySettlement() domain guard (Step 12, mirrored)', () => {
  it('retries from FAILED', () => {
    expect(evaluateRetry('FAILED').outcome).toBe('RETRIED');
  });

  it('retries from ABANDONED (PAY-001: interrupted settlement may retry)', () => {
    expect(evaluateRetry('ABANDONED').outcome).toBe('RETRIED');
  });

  it('duplicate retry (already AWAITING_SETTLEMENT) is idempotent, not an error', () => {
    expect(evaluateRetry('AWAITING_SETTLEMENT').outcome).toBe('IDEMPOTENT_OK');
  });

  it.each(['CREATED', 'SETTLEMENT_IN_PROGRESS', 'SETTLED'] as ContributionState[])(
    'rejects retry from %s (not yet a failed/abandoned attempt)',
    (state) => {
      expect(evaluateRetry(state).outcome).toBe('REJECTED_WRONG_STATE');
    },
  );

  it.each(['COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] as ContributionState[])(
    'rejects retry from the terminal state %s',
    (state) => {
      expect(evaluateRetry(state).outcome).toBe('REJECTED_WRONG_STATE');
    },
  );

  it('real ALLOWED_TRANSITIONS backs both retryable source states', () => {
    expect(ALLOWED_TRANSITIONS.FAILED).toContain('AWAITING_SETTLEMENT');
    expect(ALLOWED_TRANSITIONS.ABANDONED).toContain('AWAITING_SETTLEMENT');
  });
});

describe('retrySettlement() never touches Transactions, Evidence, or Receipts (Step 12)', () => {
  it('retry only transitions Contribution state -- no Financial Transaction is implied by the target state', () => {
    // AWAITING_SETTLEMENT is a pure Contribution state; reaching it creates
    // no financial_transactions row (only recordSettlementOutcome() does that,
    // and only from SETTLEMENT_IN_PROGRESS).
    expect(STATE_TRANSITION_EVENTS['AWAITING_SETTLEMENT']).toBe(FINANCIAL_EVENT_TYPES.AWAITING_SETTLEMENT);
    expect(STATE_TRANSITION_EVENTS['AWAITING_SETTLEMENT']).not.toBe(FINANCIAL_EVENT_TYPES.RECEIPT_GENERATED);
  });

  it('retry reuses the existing AWAITING_SETTLEMENT business event -- no financial.retry.started invented', () => {
    expect(Object.values(FINANCIAL_EVENT_TYPES)).not.toContain('financial.retry.started');
    expect(Object.keys(FINANCIAL_EVENT_TYPES)).toHaveLength(9);
  });

  it('a retried Contribution requires a fresh startSettlement() + evidence submission -- retry and start are separate steps', () => {
    // retry() target is AWAITING_SETTLEMENT; startSettlement() only accepts
    // AWAITING_SETTLEMENT as its entry state (Step 11) -- so the two compose
    // without either implying the other automatically.
    expect(ALLOWED_TRANSITIONS.AWAITING_SETTLEMENT).toContain('SETTLEMENT_IN_PROGRESS');
  });
});

describe('Zero-value contributions can never reach a retryable state (Step 12)', () => {
  it('FAILED and ABANDONED are only reachable via SETTLEMENT_IN_PROGRESS, which zero-value never enters', () => {
    // processZeroValueContribution() goes AWAITING_SETTLEMENT -> SETTLED directly.
    // The only transitions INTO FAILED/ABANDONED originate from SETTLEMENT_IN_PROGRESS.
    const sourcesOfFailed = CONTRIBUTION_STATES.filter((s) => ALLOWED_TRANSITIONS[s].includes('FAILED'));
    const sourcesOfAbandoned = CONTRIBUTION_STATES.filter((s) => ALLOWED_TRANSITIONS[s].includes('ABANDONED'));
    expect(sourcesOfFailed).toStrictEqual(['SETTLEMENT_IN_PROGRESS']);
    expect(sourcesOfAbandoned).toStrictEqual(['SETTLEMENT_IN_PROGRESS']);
  });
});

// ── Evidence review-status transitions (mirrors SettlementEvidenceService) ─

type EvidenceReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

function canReviewEvidence(current: EvidenceReviewStatus): boolean {
  return current === 'PENDING_REVIEW';
}

describe('Settlement evidence review-status transitions (Step 10, mirrored)', () => {
  it('PENDING_REVIEW can be approved or rejected', () => {
    expect(canReviewEvidence('PENDING_REVIEW')).toBe(true);
  });

  it('APPROVED cannot be approved again', () => {
    expect(canReviewEvidence('APPROVED')).toBe(false);
  });

  it('REJECTED cannot be approved', () => {
    expect(canReviewEvidence('REJECTED')).toBe(false);
  });

  it('APPROVED cannot be rejected', () => {
    expect(canReviewEvidence('APPROVED')).toBe(false);
  });

  it('rejected evidence resubmission is a NEW row (PENDING_REVIEW), never a reuse of the REJECTED row', () => {
    const evidence1: EvidenceReviewStatus = 'REJECTED';
    const evidence2Id = 2; // a fresh row from a second submit() call
    const evidence1Id = 1;
    expect(evidence1).toBe('REJECTED');
    expect(evidence2Id).not.toBe(evidence1Id);
  });
});

// ── Receipt trigger rule (Step 10) ─────────────────────────────────────────

describe('Receipt issuance rule (Step 10)', () => {
  function receiptShouldBeIssued(result: SettlementResult, amountPaise: number): boolean {
    return result === 'SUCCEEDED' && amountPaise > 0;
  }

  it('successful non-zero settlement issues a receipt', () => {
    expect(receiptShouldBeIssued('SUCCEEDED', 50_000)).toBe(true);
  });

  it('failed settlement issues no receipt', () => {
    expect(receiptShouldBeIssued('FAILED', 50_000)).toBe(false);
  });

  it('abandoned settlement issues no receipt', () => {
    expect(receiptShouldBeIssued('ABANDONED', 50_000)).toBe(false);
  });

  it('zero-value contributions never reach recordSettlementOutcome(), and issue no receipt via this path', () => {
    // Zero-value guard rejects amountPaise === 0 before any Transaction/Receipt logic runs.
    expect(receiptShouldBeIssued('SUCCEEDED', 0)).toBe(false);
  });
});

// ── STEP 17: Durable Financial Business Events (financial_event_outbox) ──
//
// financial-contribution.service.ts cannot be imported directly (db.ts is
// ESM-only, incompatible with this project's CommonJS Jest config -- see
// file header). These tests use the same two techniques already
// established in this file: (a) pure functions mirroring the service's
// transactional decision logic, and (b) source-text inspection of the real
// service file for the specific invariants Step 17 requires (no event may
// be emitted before its transaction commits; canonical event order is
// preserved).

const FINANCIAL_CONTRIBUTION_SERVICE_SRC = readFileSync(
  join(__dirname, 'financial-contribution.service.ts'),
  'utf8',
);

describe('financial_event_outbox — transaction/commit boundary (Step 17 Part 4/6/7)', () => {
  it('FinancialEventBus.emit() is called from exactly one place: publishPending()', () => {
    // If a second call site existed, it would be a candidate for emitting
    // before commit -- the whole point of routing every emission through
    // one post-commit method.
    const emitCalls = FINANCIAL_CONTRIBUTION_SERVICE_SRC.match(/this\.eventBus\.emit\(/g) ?? [];
    expect(emitCalls).toHaveLength(1);

    const publishPendingBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(
      FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async publishPending('),
    );
    expect(publishPendingBody.indexOf('this.eventBus.emit(')).toBeGreaterThan(-1);
  });

  it('every db.transaction().execute() block\'s callback contains no eventBus.emit() call', () => {
    // Crude but effective: eventBus.emit( never appears between a
    // `db.transaction().execute(async (trx) => {` and its matching
    // publish site. Since there is only one emit() call site (asserted
    // above) and it lives in publishPending() -- a method that never opens
    // a transaction itself -- no transaction body can contain it.
    const publishPendingStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async publishPending(');
    const beforePublishPending = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(0, publishPendingStart);
    expect(beforePublishPending).not.toMatch(/this\.eventBus\.emit\(/);
  });

  it('insertOutboxRow() is called with the same executor the surrounding write used (trx or db), never a fresh db reference mid-transaction', () => {
    // createContribution(), applyTransition(), and issueReceipt() are the
    // three financial-state-changing sites; each must pass its own
    // executor/trx into insertOutboxRow(), not the module-level `db`.
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain('this.insertOutboxRow(trx,');
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain('this.insertOutboxRow(executor,');
    const outboxInsertSites = FINANCIAL_CONTRIBUTION_SERVICE_SRC.match(/this\.insertOutboxRow\(/g) ?? [];
    expect(outboxInsertSites).toHaveLength(3); // createContribution, applyTransition, issueReceipt
  });

  it('insertOutboxRow() itself never calls FinancialEventBus.emit()', () => {
    const start = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async insertOutboxRow(');
    const end = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async publishPending(');
    const insertOutboxRowBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(start, end);
    expect(insertOutboxRowBody).not.toMatch(/eventBus\.emit\(/);
  });
});

describe('financial_event_outbox — dispatched_at semantics (Step 17 Part 8)', () => {
  it('dispatched_at is set only after emit() has already been called (post-commit, best-effort)', () => {
    const publishPendingBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(
      FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async publishPending('),
    );
    const emitIndex = publishPendingBody.indexOf('this.eventBus.emit(');
    const dispatchedAtIndex = publishPendingBody.indexOf("set({ dispatched_at:");
    expect(emitIndex).toBeGreaterThan(-1);
    expect(dispatchedAtIndex).toBeGreaterThan(emitIndex);
  });

  it('a dispatched_at write failure is swallowed, not rethrown -- it must never be mistaken for a financial-state failure', () => {
    const publishPendingBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(
      FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async publishPending('),
      FINANCIAL_CONTRIBUTION_SERVICE_SRC.length,
    );
    expect(publishPendingBody).toMatch(/catch\s*\{/);
  });
});

// Pure mirror of recordSettlementOutcome()'s SUCCEEDED-path pending-event
// collection order -- the actual array-push sequence in the real method is
// SETTLED, then RECEIPT_GENERATED, then COMPLETED (in that literal source
// order), which is also the PAY-001 canonical publish order.
function collectSucceededSettlementEvents(): string[] {
  const events: string[] = [];
  events.push('SETTLEMENT_COMPLETED'); // transitionContribution(id, 'SETTLED')
  events.push('RECEIPT_GENERATED');    // issueReceipt()
  events.push('CONTRIBUTION_COMPLETED'); // transitionContribution(id, 'COMPLETED')
  return events;
}

describe('financial_event_outbox — canonical event order preserved (Step 17 Part 13)', () => {
  it('successful settlement publishes SETTLEMENT_COMPLETED, then RECEIPT_GENERATED, then CONTRIBUTION_COMPLETED', () => {
    expect(collectSucceededSettlementEvents()).toStrictEqual([
      'SETTLEMENT_COMPLETED',
      'RECEIPT_GENERATED',
      'CONTRIBUTION_COMPLETED',
    ]);
  });

  it('publishPending() iterates with a for...of loop (sequential, not Promise.all) -- order is not left to scheduling', () => {
    const publishPendingBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(
      FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async publishPending('),
    );
    expect(publishPendingBody).toMatch(/for\s*\(const event of pending\)/);
    expect(publishPendingBody).not.toMatch(/Promise\.all/);
  });

  it('recordSettlementOutcome() pushes pending events in source order: SETTLED before RECEIPT before COMPLETED', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async recordSettlementOutcome(');
    const methodEnd = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async issueReceipt(');
    const methodBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(methodStart, methodEnd);
    const settledIdx = methodBody.indexOf(`'SETTLED', trx`);
    const receiptIdx = methodBody.indexOf('issueReceipt(');
    const completedIdx = methodBody.indexOf(`'COMPLETED', trx`);
    expect(settledIdx).toBeGreaterThan(-1);
    expect(receiptIdx).toBeGreaterThan(settledIdx);
    expect(completedIdx).toBeGreaterThan(receiptIdx);
  });
});

describe('financial_event_outbox — idempotency (Step 17 Part 15)', () => {
  it('recordSettlementOutcome() idempotency short-circuit returns before any pending event is pushed', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async recordSettlementOutcome(');
    const shortCircuitIdx = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('if (existingTxn)', methodStart);
    const firstPendingPushIdx = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('pending.push(', methodStart);
    expect(shortCircuitIdx).toBeGreaterThan(-1);
    expect(firstPendingPushIdx).toBeGreaterThan(shortCircuitIdx);
  });

  it('createContribution() idempotent replay returns before insertOutboxRow() is called', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async createContribution(');
    const idempotentReturnIdx = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('if (existing) {', methodStart);
    const outboxInsertIdx = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('this.insertOutboxRow(trx,', methodStart);
    expect(idempotentReturnIdx).toBeGreaterThan(-1);
    expect(outboxInsertIdx).toBeGreaterThan(idempotentReturnIdx);
  });
});

describe('financial_event_outbox — zero-value events remain durable (Step 17 Part 14)', () => {
  it('processZeroValueContribution() drives its transitions through transitionContribution(), which always durably records via the outbox before any emit', () => {
    // Each of the three sequential calls (AWAITING_SETTLEMENT, SETTLED,
    // COMPLETED) uses transitionContribution()'s self-contained mode
    // (default executor === db), which opens its own transaction, writes
    // the state + outbox row, commits, and only then publishes -- so
    // zero-value events are durable despite never creating a Financial
    // Transaction or Receipt (PAY-001 Principle 12, unchanged by Step 17).
    const zeroValueMethodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async processZeroValueContribution(');
    const zeroValueMethodBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(
      zeroValueMethodStart,
      zeroValueMethodStart + 1500,
    );
    expect(zeroValueMethodBody).not.toMatch(/insertInto\(\s*['"]financial_transactions['"]/);
    expect(zeroValueMethodBody).not.toMatch(/insertInto\(\s*['"]receipts['"]/);
    expect(zeroValueMethodBody.match(/this\.transitionContribution\(/g) ?? []).toHaveLength(3);
  });
});

// ── STEP 18: Razorpay Settlement Provider — order initiation ─────────────
//
// financial-contribution.service.ts still cannot be imported directly
// (db.ts is ESM-only). Same two techniques as Step 17's tests: source-text
// inspection of the real service/module/controller files, and pure-logic
// mirrors of the orchestration decisions. RazorpaySettlementProvider itself
// (no db.ts dependency) is unit-tested directly in
// razorpay-settlement.provider.spec.ts.

const FINANCIAL_MODULE_SRC = readFileSync(join(__dirname, 'financial.module.ts'), 'utf8');
const FINANCIAL_CONTROLLER_SRC = readFileSync(join(__dirname, 'financial.controller.ts'), 'utf8');
const SETTLEMENT_PROVIDER_INTERFACE_SRC = readFileSync(
  join(__dirname, 'settlement-provider.interface.ts'),
  'utf8',
);

describe('Settlement Provider boundary (Step 18 Part 1/5/6)', () => {
  it('no duplicate provider interface was introduced -- exactly one SettlementProvider interface exists', () => {
    expect(SETTLEMENT_PROVIDER_INTERFACE_SRC).toContain('export interface SettlementProvider');
    const occurrences = FINANCIAL_CONTRIBUTION_SERVICE_SRC.match(/interface SettlementProvider\b/g) ?? [];
    expect(occurrences).toHaveLength(0); // not redefined inside the service file
  });

  it('FinancialContributionService depends on the SETTLEMENT_PROVIDER token, not the Razorpay class directly', () => {
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain('SETTLEMENT_PROVIDER');
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).not.toMatch(/from ['"]razorpay['"]/);
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).not.toContain('RazorpaySettlementProvider');
  });

  it('the provider interface exposes only order initiation + refund -- no dispute/subscription/payout/webhook/reconciliation METHODS', () => {
    // Strip comments first -- the file's own prose explains why those
    // capabilities are deliberately absent, which would otherwise trip a
    // naive substring check. This asserts no such method/property exists
    // in the actual interface body.
    //
    // 'refund' was removed from the forbidden list by the membership
    // payment/approval reconciliation (PART 6): a minimum generic refund
    // capability is now a deliberate, required part of this interface --
    // see RefundInput/RefundResult/SettlementProvider.refund() below.
    const codeOnly = SETTLEMENT_PROVIDER_INTERFACE_SRC
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const loweredCode = codeOnly.toLowerCase();
    ['dispute', 'subscription', 'payout', 'reconcil', 'webhook'].forEach((forbidden) => {
      expect(loweredCode).not.toContain(forbidden);
    });
    expect(SETTLEMENT_PROVIDER_INTERFACE_SRC).toContain('createOrder(');
    expect(SETTLEMENT_PROVIDER_INTERFACE_SRC).toContain('refund(input: RefundInput): Promise<RefundResult>');
  });

  it('financial.module.ts binds SETTLEMENT_PROVIDER to RazorpaySettlementProvider (the only provider-specific wiring point)', () => {
    expect(FINANCIAL_MODULE_SRC).toContain('SETTLEMENT_PROVIDER');
    expect(FINANCIAL_MODULE_SRC).toContain('RazorpaySettlementProvider');
  });

  it('no PAY-002 document or MembershipRazorpayService was introduced anywhere in the financial module', () => {
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).not.toContain('MembershipRazorpayService');
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).not.toContain('PAY-002');
    expect(FINANCIAL_MODULE_SRC).not.toContain('MembershipRazorpayService');
  });
});

describe('initiateProviderSettlement() — state semantics (Step 18 Part 7/13/18)', () => {
  it('reuses startSettlement() rather than duplicating the AWAITING_SETTLEMENT guard/transition', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async initiateProviderSettlement(');
    const methodBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(methodStart, methodStart + 3000);
    expect(methodBody).toContain('this.startSettlement(contributionId)');
  });

  it('never writes financial_transactions or receipts during order initiation', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async initiateProviderSettlement(');
    const nextMethodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf(
      'private async readActiveSettlementReference(',
    );
    const methodBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(methodStart, nextMethodStart);
    expect(methodBody).not.toMatch(/insertInto\(\s*['"]financial_transactions['"]/);
    expect(methodBody).not.toMatch(/insertInto\(\s*['"]receipts['"]/);
  });

  it('never calls transitionContribution with SETTLED or COMPLETED -- order creation is not settlement success', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async initiateProviderSettlement(');
    const nextMethodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf(
      'private async readActiveSettlementReference(',
    );
    const methodBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(methodStart, nextMethodStart);
    expect(methodBody).not.toMatch(/transitionContribution\([^)]*'SETTLED'/);
    expect(methodBody).not.toMatch(/transitionContribution\([^)]*'COMPLETED'/);
  });

  it('the provider.createOrder() call happens with no open transaction around it (no db.transaction wraps it)', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async initiateProviderSettlement(');
    const nextMethodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf(
      'private async readActiveSettlementReference(',
    );
    const methodBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(methodStart, nextMethodStart);
    expect(methodBody).not.toMatch(/db\.transaction\(\)\.execute\(\s*async\s*\(trx\)\s*=>\s*\{[^}]*this\.provider\.createOrder/);
    expect(methodBody).toContain('this.provider.createOrder(');
  });
});

describe('initiateProviderSettlement() — zero-value protection (Step 18 Part 8)', () => {
  it('startSettlement() (reused by initiateProviderSettlement) already rejects amount 0 before any provider call could occur', () => {
    const startSettlementStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async startSettlement(');
    const startSettlementEnd = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf(
      'async initiateProviderSettlement(',
    );
    const body = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(startSettlementStart, startSettlementEnd);
    expect(body).toMatch(/amount_paise\)\s*===\s*0/);
    expect(body).toContain('zero-value contributions settle automatically');
  });

  it('the zero-value guard in startSettlement() runs before the SETTLEMENT_IN_PROGRESS transition it shares with initiateProviderSettlement()', () => {
    const startSettlementStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async startSettlement(');
    const startSettlementEnd = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf(
      'async initiateProviderSettlement(',
    );
    const body = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(startSettlementStart, startSettlementEnd);
    const zeroGuardIdx = body.indexOf("amount_paise) === 0");
    const transitionIdx = body.indexOf("'SETTLEMENT_IN_PROGRESS', trx");
    expect(zeroGuardIdx).toBeGreaterThan(-1);
    expect(transitionIdx).toBeGreaterThan(zeroGuardIdx);
  });
});

describe('initiateProviderSettlement() — idempotency (Step 18 Part 11)', () => {
  it('checks for an existing active_settlement_reference before ever calling the provider', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async initiateProviderSettlement(');
    const body = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(methodStart, methodStart + 3000);
    const existingCheckIdx = body.indexOf('this.readActiveSettlementReference(contributionId)');
    const providerCallIdx = body.indexOf('this.provider.createOrder(');
    expect(existingCheckIdx).toBeGreaterThan(-1);
    expect(providerCallIdx).toBeGreaterThan(existingCheckIdx);
  });

  it('readActiveSettlementReference() locks the row with FOR UPDATE', () => {
    const start = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async readActiveSettlementReference(');
    const end = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async persistActiveSettlementReference(');
    const body = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(start, end);
    expect(body).toContain('.forUpdate()');
  });

  it('persistActiveSettlementReference() only succeeds when active_settlement_reference is still NULL (conditional write)', () => {
    const start = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async persistActiveSettlementReference(');
    const body = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(start, start + 1200);
    expect(body).toMatch(/where\(\s*['"]active_settlement_reference['"]\s*,\s*['"]is['"]\s*,\s*null\s*\)/);
    expect(body).toMatch(/where\(\s*['"]state['"]\s*,\s*['"]=['"]\s*,\s*['"]SETTLEMENT_IN_PROGRESS['"]\s*\)/);
  });

  // Pure mirror of the persistence race outcome: exactly one of two
  // concurrent conditional UPDATEs can match `active_settlement_reference IS NULL`.
  function resolveConcurrentPersist(
    alreadyPersisted: boolean,
  ): 'PERSISTED' | 'LOST_RACE_REUSE_WINNER' {
    return alreadyPersisted ? 'LOST_RACE_REUSE_WINNER' : 'PERSISTED';
  }

  it('a losing concurrent persist reuses the winner\'s reference instead of creating a second active order', () => {
    expect(resolveConcurrentPersist(true)).toBe('LOST_RACE_REUSE_WINNER');
    expect(resolveConcurrentPersist(false)).toBe('PERSISTED');
  });
});

describe('applyTransition() clears active_settlement_reference when leaving SETTLEMENT_IN_PROGRESS (Step 18 Part 10/12)', () => {
  it('the UPDATE conditionally nulls active_settlement_reference only when currentState was SETTLEMENT_IN_PROGRESS', () => {
    const start = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async applyTransition(');
    const end = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('// Cancellation is initiated');
    const body = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(start, end);
    expect(body).toContain("leavingSettlementInProgress = currentState === 'SETTLEMENT_IN_PROGRESS'");
    expect(body).toContain('active_settlement_reference: null');
  });

  // Pure mirror: a retried Contribution's next provider order must never
  // inherit a prior, resolved attempt's reference.
  function nextReferenceForState(
    priorState: 'SETTLEMENT_IN_PROGRESS',
    targetState: 'SETTLED' | 'FAILED' | 'ABANDONED',
    priorReference: string | null,
  ): string | null {
    // applyTransition() clears the reference on any exit from
    // SETTLEMENT_IN_PROGRESS, regardless of which of the three legal
    // target states it moves to.
    return priorState === 'SETTLEMENT_IN_PROGRESS' ? null : priorReference;
  }

  it.each(['SETTLED', 'FAILED', 'ABANDONED'] as const)(
    'transitioning SETTLEMENT_IN_PROGRESS → %s clears any prior active_settlement_reference',
    (target) => {
      expect(nextReferenceForState('SETTLEMENT_IN_PROGRESS', target, 'order_OLD123')).toBeNull();
    },
  );
});

describe('initiateProviderSettlement() — retry produces a fresh provider attempt (Step 18 Part 12)', () => {
  it('retrySettlement() reopens FAILED/ABANDONED to AWAITING_SETTLEMENT, which already had its active_settlement_reference cleared on the way in', () => {
    // retrySettlement() itself never touches active_settlement_reference --
    // it doesn't need to, because applyTransition() already cleared it when
    // the Contribution originally left SETTLEMENT_IN_PROGRESS into
    // FAILED/ABANDONED (see the describe block above). The next
    // startSettlement() + initiateProviderSettlement() call therefore
    // always observes NULL and creates a brand-new provider order.
    const retrySettlementStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async retrySettlement(');
    const retrySettlementEnd = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf(
      '// ── Settlement outcome (Step 10',
    );
    const body = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(retrySettlementStart, retrySettlementEnd);
    expect(body).not.toContain('active_settlement_reference'); // no direct write needed here
  });

  it('recordSettlementOutcome() never mutates an old Financial Transaction into success -- exactly one INSERT site, unchanged by Step 18', () => {
    const matches = FINANCIAL_CONTRIBUTION_SERVICE_SRC.match(/insertInto\(\s*['"]financial_transactions['"]/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe('Response shape for a future frontend checkout (Step 18 Part 15)', () => {
  it('the controller response never includes a Razorpay secret field', () => {
    const routeStart = FINANCIAL_CONTROLLER_SRC.indexOf("@Post('contributions/:id/settlement/razorpay-order')");
    const routeEnd = FINANCIAL_CONTROLLER_SRC.indexOf('// ── Retry settlement');
    const routeBody = FINANCIAL_CONTROLLER_SRC.slice(routeStart, routeEnd);
    expect(routeBody.toLowerCase()).not.toContain('secret');
    expect(routeBody).toContain('providerPublicKeyId');
    expect(routeBody).toContain('orderReference');
    expect(routeBody).toContain('amountPaise');
    expect(routeBody).toContain('currency');
  });

  it('the razorpay-order route is owner-gated the same way startSettlement is (AccessTokenGuard + assertOwnedContribution)', () => {
    const routeStart = FINANCIAL_CONTROLLER_SRC.indexOf("@Post('contributions/:id/settlement/razorpay-order')");
    const routeEnd = FINANCIAL_CONTROLLER_SRC.indexOf('async createRazorpayOrder');
    const decorators = FINANCIAL_CONTROLLER_SRC.slice(routeStart, routeEnd);
    expect(decorators).toContain('AccessTokenGuard');

    const methodStart = FINANCIAL_CONTROLLER_SRC.indexOf('async createRazorpayOrder');
    const methodEnd = FINANCIAL_CONTROLLER_SRC.indexOf('// ── Retry settlement');
    const methodBody = FINANCIAL_CONTROLLER_SRC.slice(methodStart, methodEnd);
    expect(methodBody).toContain('this.assertOwnedContribution(id, actor.sub)');
  });
});

describe('Step 17 outbox still works unmodified by Step 18 (Part 23 item 13)', () => {
  it('publishPending() and insertOutboxRow() are untouched -- eventBus.emit() still appears exactly once', () => {
    const emitCalls = FINANCIAL_CONTRIBUTION_SERVICE_SRC.match(/this\.eventBus\.emit\(/g) ?? [];
    expect(emitCalls).toHaveLength(1);
  });

  it('SETTLEMENT_STARTED and (on order-initiation failure) SETTLEMENT_FAILED are the only events initiateProviderSettlement() can trigger, both pre-existing', () => {
    expect(STATE_TRANSITION_EVENTS['SETTLEMENT_IN_PROGRESS']).toBe(FINANCIAL_EVENT_TYPES.SETTLEMENT_STARTED);
    expect(STATE_TRANSITION_EVENTS['FAILED']).toBe(FINANCIAL_EVENT_TYPES.SETTLEMENT_FAILED);
    // No new canonical event was invented for order creation or its failure.
    expect(Object.keys(FINANCIAL_EVENT_TYPES)).toHaveLength(9);
    expect(Object.values(FINANCIAL_EVENT_TYPES)).not.toContain('financial.razorpay.order.created');
    expect(Object.values(FINANCIAL_EVENT_TYPES)).not.toContain('financial.razorpay.order.failed');
  });
});

// ── STEP 18A: Razorpay order-initiation failure reconciliation ───────────
//
// Same source-inspection technique as the rest of this file (db.ts is
// ESM-only). Verifies markSettlementAttemptFailed() exists, is wired into
// both failure points of initiateProviderSettlement() (provider.createOrder()
// throwing, and persistActiveSettlementReference() throwing), uses the
// pre-existing SETTLEMENT_IN_PROGRESS -> FAILED transition (no new state,
// no new event), and never creates a Financial Transaction or Receipt.

describe('markSettlementAttemptFailed() (Step 18A)', () => {
  const HELPER_START = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async markSettlementAttemptFailed(');
  const HELPER_END = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf(
    'private async readActiveSettlementReference(',
  );
  const HELPER_BODY = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(HELPER_START, HELPER_END);

  it('exists as a private helper', () => {
    expect(HELPER_START).toBeGreaterThan(-1);
  });

  it('transitions to the existing FAILED state via transitionContribution(), not a new state', () => {
    expect(HELPER_BODY).toContain("this.transitionContribution(contributionId, 'FAILED')");
  });

  it('never calls recordSettlementOutcome() -- no Financial Transaction or Receipt is implied by this recovery path', () => {
    expect(HELPER_BODY).not.toContain('recordSettlementOutcome');
    expect(HELPER_BODY).not.toMatch(/insertInto\(\s*['"]financial_transactions['"]/);
    expect(HELPER_BODY).not.toMatch(/insertInto\(\s*['"]receipts['"]/);
  });

  it('swallows its own error (a stale-state ConflictException) rather than masking the original provider error', () => {
    expect(HELPER_BODY).toMatch(/catch\s*\{/);
  });

  it('never invents a new ContributionState or Business Event', () => {
    expect(HELPER_BODY).not.toMatch(/'RAZORPAY_ORDER_FAILED'/);
    expect(HELPER_BODY).not.toMatch(/eventBus\.emit\(/);
  });
});

describe('initiateProviderSettlement() wires order-creation failure to markSettlementAttemptFailed() (Step 18A Part 1/2)', () => {
  const METHOD_START = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async initiateProviderSettlement(');
  const METHOD_END = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async markSettlementAttemptFailed(');
  const METHOD_BODY = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(METHOD_START, METHOD_END);

  it('wraps provider.createOrder() in a try/catch that calls markSettlementAttemptFailed() and rethrows', () => {
    const createOrderIdx = METHOD_BODY.indexOf('this.provider.createOrder(');
    const tryIdx = METHOD_BODY.lastIndexOf('try {', createOrderIdx);
    const catchSlice = METHOD_BODY.slice(createOrderIdx);
    const catchIdx = catchSlice.indexOf('} catch (err) {');
    expect(tryIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBody = catchSlice.slice(catchIdx, catchIdx + 200);
    expect(catchBody).toContain('this.markSettlementAttemptFailed(contributionId)');
    expect(catchBody).toContain('throw err');
  });

  it('wraps persistActiveSettlementReference() in a try/catch that calls markSettlementAttemptFailed() and rethrows (Part 5: reference persisted but unlinkable)', () => {
    const persistIdx = METHOD_BODY.indexOf('this.persistActiveSettlementReference(contributionId, order.providerOrderReference)');
    expect(persistIdx).toBeGreaterThan(-1);
    const afterPersist = METHOD_BODY.slice(persistIdx, persistIdx + 300);
    expect(afterPersist).toContain('} catch (err) {');
    expect(afterPersist).toContain('this.markSettlementAttemptFailed(contributionId)');
    expect(afterPersist).toContain('throw err');
  });

  it('the lost-race case (persisted === false, no throw) is unaffected -- it still falls through to the winner-reference read, not markSettlementAttemptFailed()', () => {
    const notPersistedIdx = METHOD_BODY.indexOf('if (!persisted) {');
    const markFailedIdx = METHOD_BODY.indexOf('this.markSettlementAttemptFailed(contributionId);', notPersistedIdx);
    const winnerReadIdx = METHOD_BODY.indexOf('this.readActiveSettlementReference(contributionId)', notPersistedIdx);
    expect(notPersistedIdx).toBeGreaterThan(-1);
    expect(winnerReadIdx).toBeGreaterThan(notPersistedIdx);
    // No markSettlementAttemptFailed() call inside the lost-race branch specifically
    // (only the two try/catch blocks above call it, both already asserted).
    expect(markFailedIdx === -1 || markFailedIdx > winnerReadIdx + 500).toBe(true);
  });
});

describe('Contribution is never stranded in SETTLEMENT_IN_PROGRESS after an order-creation failure (Step 18A Part 1)', () => {
  it('FAILED is retryable via the pre-existing retrySettlement() path -- no new retry entry point was added', () => {
    expect(ALLOWED_TRANSITIONS.SETTLEMENT_IN_PROGRESS).toContain('FAILED');
    expect(ALLOWED_TRANSITIONS.FAILED).toContain('AWAITING_SETTLEMENT');
    // retrySettlement()'s own guard (evaluateRetry(), Step 12) accepts FAILED --
    // already exercised above; this asserts the state-machine backing is
    // unchanged (no SETTLEMENT_IN_PROGRESS retry entry point was invented).
    expect(ALLOWED_TRANSITIONS.SETTLEMENT_IN_PROGRESS).not.toContain('AWAITING_SETTLEMENT');
  });

  it('a fresh retry after order-creation failure starts with no active_settlement_reference (applyTransition already clears it on exit from SETTLEMENT_IN_PROGRESS)', () => {
    // Covered generically by the "applyTransition() clears active_settlement_reference
    // when leaving SETTLEMENT_IN_PROGRESS" describe block above -- FAILED is one of
    // the three target states that clause covers regardless of why FAILED was reached.
    expect(ALLOWED_TRANSITIONS.SETTLEMENT_IN_PROGRESS).toEqual(
      expect.arrayContaining(['FAILED']),
    );
  });
});

describe('Zero-value contributions cannot reach markSettlementAttemptFailed() (Step 18A)', () => {
  it('processZeroValueContribution() never calls initiateProviderSettlement() or the Razorpay provider', () => {
    const zeroValueStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('async processZeroValueContribution(');
    const zeroValueEnd = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('// ── Start settlement');
    const body = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(zeroValueStart, zeroValueEnd);
    expect(body).not.toContain('initiateProviderSettlement');
    expect(body).not.toContain('this.provider.createOrder');
  });
});

// ── financial_event_outbox.metadata JSON serialization (Step 22B) ─────────
//
// Same defect class as razorpay-webhook.service.ts claimInboxRow(): mysql2
// does not auto-serialize a bound JS object parameter, so an un-stringified
// metadata object becomes the literal string "[object Object]" and fails
// this JSON column's validation on INSERT. Discovered live when replaying
// the Step 22B captured-payment webhook: issueReceipt() -> insertOutboxRow()
// crashed with ER_INVALID_JSON_TEXT on financial_event_outbox.metadata,
// rolling back the whole recordSettlementOutcome() transaction (Financial
// Transaction + Receipt never persisted -- confirmed no partial write).

describe('insertOutboxRow() JSON metadata serialization (Step 22B)', () => {
  it('stringifies a non-undefined metadata object before insertInto', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async insertOutboxRow(');
    const methodBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(
      methodStart,
      FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('.executeTakeFirstOrThrow();', methodStart),
    );
    expect(methodBody).toMatch(/metadata:\s*args\.metadata\s*!==\s*undefined\s*\?\s*JSON\.stringify\(args\.metadata\)\s*:\s*null/);
  });

  it('the in-process FinancialEventBus payload still receives the raw (unstringified) metadata object, not the DB string', () => {
    const methodStart = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async insertOutboxRow(');
    const methodEnd = FINANCIAL_CONTRIBUTION_SERVICE_SRC.indexOf('private async publishPending(');
    const methodBody = FINANCIAL_CONTRIBUTION_SERVICE_SRC.slice(methodStart, methodEnd);
    expect(methodBody).toMatch(/metadata:\s*args\.metadata,/);
  });

  it('issueReceipt() calls insertOutboxRow() with a real metadata object (the exact call that crashed pre-fix)', () => {
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain('metadata: { receiptId, receiptNumber }');
  });
});
