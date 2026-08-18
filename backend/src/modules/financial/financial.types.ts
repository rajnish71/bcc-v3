// backend/src/modules/financial/financial.types.ts
//
// Canonical PAY-001 domain types for the Financial Engine.
// This file is the single source of truth for ContributionState values
// in TypeScript. The DB interface in database/db.ts imports ContributionState
// from here to avoid duplicating the union literal values.

// PAY-001 full 10-state Financial Contribution lifecycle.
// Values must match the ENUM definition in migration 0088.
export const CONTRIBUTION_STATES = [
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
] as const;

export type ContributionState = (typeof CONTRIBUTION_STATES)[number];

// PAY-001: terminal states — no further settlement is possible.
export const TERMINAL_CONTRIBUTION_STATES: ReadonlyArray<ContributionState> = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
];

// States from which a Business Module may request cancellation.
// Cancellation execution belongs to the Financial Engine (PAY-001 §OWNERSHIP MATRIX).
export const CANCELLABLE_CONTRIBUTION_STATES: ReadonlyArray<ContributionState> = [
  'CREATED',
  'AWAITING_SETTLEMENT',
];

export type TransactionOutcome = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'ABANDONED';

// Outcomes a Financial Transaction may be created WITH (Step 10: manual
// settlement foundation). 'PENDING' is deliberately excluded here --
// Financial Transactions are immutable (PAY-001 Principle 10), so a
// Transaction is only ever written once the outcome is already known.
// There is no INSERT-PENDING-then-UPDATE path anywhere in the Financial
// Engine (see recordSettlementOutcome() in financial-contribution.service.ts).
export type SettlementResult = 'SUCCEEDED' | 'FAILED' | 'ABANDONED';

// Input supplied when a Settlement Attempt's outcome becomes known --
// whether from manual/offline verification (Settlement Evidence approval)
// or, in a future step, a Settlement Provider webhook. Generic: this type
// carries no Membership or other Business-Module-specific fields.
export interface SettlementOutcomeInput {
  provider: string;              // e.g. 'BCC_DIRECT_UPI', 'BCC_BANK_TRANSFER', 'RAZORPAY'
  providerReference: string | null; // external reference (UTR, gateway payment ID); null if none
  result: SettlementResult;
  amountPaise: number;           // must equal the contribution's amount_paise
  failureReason?: string | null; // required context for FAILED/ABANDONED, ignored for SUCCEEDED
}

// PAY-001 state machine: every permitted source → target transition.
// Used by FinancialContributionService.transitionContribution() to validate
// every state change before any DB write.
//
// Key design decisions:
// • AWAITING_SETTLEMENT → SETTLED is the zero-value bypass (PAY-001 §12).
//   Zero-value contributions skip SETTLEMENT_IN_PROGRESS entirely.
// • FAILED / ABANDONED → AWAITING_SETTLEMENT: retry is always permitted (PAY-001 §6).
// • CANCELLED / EXPIRED / COMPLETED / REFUNDED: terminal — empty allowed list.
// • AWAITING_SETTLEMENT → CANCELLED / EXPIRED: valid "before settlement" exit (PAY-001 §CANCELLED).
export const ALLOWED_TRANSITIONS: Readonly<Record<ContributionState, readonly ContributionState[]>> = {
  CREATED:                ['AWAITING_SETTLEMENT', 'CANCELLED', 'EXPIRED'],
  AWAITING_SETTLEMENT:    ['SETTLEMENT_IN_PROGRESS', 'SETTLED', 'CANCELLED', 'EXPIRED'],
  SETTLEMENT_IN_PROGRESS: ['SETTLED', 'FAILED', 'ABANDONED'],
  SETTLED:                ['COMPLETED'],
  COMPLETED:              ['REFUNDED'],
  FAILED:                 ['AWAITING_SETTLEMENT'],
  ABANDONED:              ['AWAITING_SETTLEMENT'],
  CANCELLED:              [],
  EXPIRED:                [],
  REFUNDED:               [],
};

// Input supplied by a Business Module when requesting a Financial Contribution.
// Must carry no Business-Module-specific implementation concerns.
// Business Module supplies a deterministic idempotency_key per obligation
// to satisfy PAY-001 Principle 7 (exact-once settlement).
export interface FinancialObligationInput {
  payerUserId: number;
  businessModule: string;       // e.g. 'MEMBERSHIP', 'EVENT'
  businessReferenceId: number;  // PK in the Business Module's own table
  purpose: string;              // human-readable description
  amountPaise: number;          // integer paise; 0 is valid (PAY-001 §12)
  currency?: string;            // defaults to 'INR'
  idempotencyKey: string;       // deterministic, unique per obligation; required
  expiresAt?: Date | null;      // expiry policy set by Business Module
}

// requestRefund() actor identity (F-002 governance decision: domain-local
// explicit discriminator + nullable human reference, mirrored onto
// financial_refunds by migration 0096 -- no SYSTEM user is ever created).
// The union shape makes an invalid pairing (HUMAN with no id, SYSTEM with
// one) a compile-time error for typed callers; requestRefund() itself still
// asserts the pairing at runtime since the value can originate from an
// event payload rather than a literal.
export type RefundActor =
  | { actorType: 'HUMAN'; actorUserId: number }
  | { actorType: 'SYSTEM'; actorUserId: null };
