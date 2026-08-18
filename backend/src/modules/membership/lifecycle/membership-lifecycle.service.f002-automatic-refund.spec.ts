// backend/src/modules/membership/lifecycle/membership-lifecycle.service.f002-automatic-refund.spec.ts
//
// F-002 — permanently stuck rejected-membership settlements.
//
// Original finding: reject() already leaves a SETTLEMENT_IN_PROGRESS
// Contribution untouched (F-032's "anything else" branch). If that
// settlement subsequently SUCCEEDS, CONTRIBUTION_COMPLETED reaches
// MembershipFinancialListener -> recordPaymentReceived() for a membership
// that is now REJECTED. Before this change, recordPaymentReceived() only
// allowed ['PENDING'] and threw for REJECTED (caught/logged by the
// listener) -- no refund was ever requested, and the settled money was
// stuck against a rejected application with no automatic recovery path.
//
// Authorized rule: the settlement completes normally, the rejected
// membership is NOT activated, and the platform automatically refunds the
// completed settlement through the existing Financial Engine requestRefund()
// path -- with a SYSTEM actor (no human requested it) per the F-002
// system-actor governance decision (financial_refunds.requested_by_type,
// migration 0096).
//
// Same project-established pattern as membership-payment-approval-
// reconciliation.spec.ts and membership-lifecycle.service.f032-rejection-
// visibility.spec.ts: real static source inspection, no live DB/NestJS
// module (Kysely ESM is incompatible with Jest's CommonJS runtime in this
// project). Every test below is STRUCTURAL/SOURCE-PATTERN coverage -- no
// runtime execution, no provider mocking, no DB. That classification is
// deliberate, not a shortcut: it is the same technique the two specs above
// already use for this exact file.

import { readFileSync } from 'fs';
import { join } from 'path';

function readSourceNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function slice(src: string, startMarker: string, endMarker: string, fromIndex = 0): string {
  const start = src.indexOf(startMarker, fromIndex);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  if (end === -1) throw new Error(`end marker not found: ${endMarker} (after ${startMarker})`);
  return src.slice(start, end);
}

const LIFECYCLE_SRC = readSourceNormalized(join(__dirname, 'membership-lifecycle.service.ts'));
const FINANCIAL_CONTRIBUTION_SERVICE_SRC = readSourceNormalized(
  join(__dirname, '../../financial/financial-contribution.service.ts'),
);
const FINANCIAL_TYPES_SRC = readSourceNormalized(join(__dirname, '../../financial/financial.types.ts'));
const MIGRATION_SRC = readSourceNormalized(
  join(__dirname, '../../../../../database/migrations/0096_add_financial_refund_actor_type.sql'),
);

const REJECT_FN = slice(
  LIFECYCLE_SRC,
  'async reject(',
  "await this.notifyMember(membership, 'MEMBERSHIP_APPLICATION_REJECTED'",
);
const RECORD_PAYMENT_RECEIVED_FN = slice(
  LIFECYCLE_SRC,
  'async recordPaymentReceived(',
  '\n  // ======================================================================\n  // ACTIVE -> SUSPENDED',
);

// ═══════════════════════════════════════════════════════════════════════
// Test 1 — Rejection preserves the in-progress Contribution
// (STRUCTURAL/SOURCE-PATTERN)
// ═══════════════════════════════════════════════════════════════════════
describe('F-002 Test 1: reject() does not cancel/abandon/expire a SETTLEMENT_IN_PROGRESS Contribution', () => {
  it('the "anything else" branch (SETTLEMENT_IN_PROGRESS included) takes no financial action -- unchanged by F-002', () => {
    const ifChain = REJECT_FN.slice(REJECT_FN.indexOf("if (contribution.state === 'COMPLETED')"));
    const elseIdx = ifChain.indexOf('} else {');
    expect(elseIdx).toBeGreaterThan(-1);
    const elseBranch = ifChain.slice(elseIdx);
    expect(elseBranch).not.toContain('requestRefund(');
    expect(elseBranch).not.toContain('cancelContribution(');
    expect(elseBranch).not.toContain("transitionContribution(");
    expect(elseBranch).toContain('unresolvedContributionNote =');
  });

  it('reject() only ever mutates memberships.lifecycle_state, never financial_contributions, for the untouched branch', () => {
    // The only DB mutation in reject() itself is the membership state
    // transition inside the F-013 transaction block; the Contribution branch
    // above it is read-only (getMembershipContribution) except for the
    // explicit COMPLETED/CREATED/AWAITING_SETTLEMENT calls into the
    // Financial Engine, neither of which fires for SETTLEMENT_IN_PROGRESS.
    expect(REJECT_FN).toContain("updateTable('memberships').set({ lifecycle_state: 'REJECTED' })");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Test 2 — Successful settlement after rejection triggers the automatic
// SYSTEM refund (STRUCTURAL/SOURCE-PATTERN)
// ═══════════════════════════════════════════════════════════════════════
describe('F-002 Test 2: recordPaymentReceived() on a REJECTED membership requests a SYSTEM refund', () => {
  it('recordPaymentReceived() now accepts REJECTED in addition to PENDING', () => {
    expect(RECORD_PAYMENT_RECEIVED_FN).toContain("requireState(membershipId, ['PENDING', 'REJECTED'])");
  });

  it('the REJECTED branch calls the existing requestRefund() with a SYSTEM actor and no human actorUserId', () => {
    const rejectedBranch = slice(
      RECORD_PAYMENT_RECEIVED_FN,
      "if (membership.lifecycle_state === 'REJECTED')",
      '\n    }\n\n    await logMembershipAudit(',
    );
    expect(rejectedBranch).toContain('this.financialService.requestRefund(');
    expect(rejectedBranch).toContain("{ actorType: 'SYSTEM', actorUserId: null }");
  });

  it('the REJECTED branch reuses getMembershipContribution() -- no new Financial Engine query path is invented', () => {
    const rejectedBranch = slice(
      RECORD_PAYMENT_RECEIVED_FN,
      "if (membership.lifecycle_state === 'REJECTED')",
      '\n    }\n\n    await logMembershipAudit(',
    );
    expect(rejectedBranch).toContain('this.getMembershipContribution(membershipId)');
  });

  it('normal settlement/PENDING processing (audit log + notify) is unchanged and unreachable from the REJECTED branch', () => {
    const rejectedBranch = slice(
      RECORD_PAYMENT_RECEIVED_FN,
      "if (membership.lifecycle_state === 'REJECTED')",
      '\n    }\n\n    await logMembershipAudit(',
    );
    expect(rejectedBranch.trim().endsWith('return;')).toBe(true);
    expect(RECORD_PAYMENT_RECEIVED_FN).toContain("eventType: 'PAYMENT_RECEIVED'");
    expect(RECORD_PAYMENT_RECEIVED_FN).toContain("notifyMember(membership, 'MEMBERSHIP_PAYMENT_RECEIVED')");
  });

  it('original provider reference is reused -- requestRefund() (unchanged in this respect) sources the refund from the settled financial_transactions row, not a new one', () => {
    const REFUND_FN = slice(FINANCIAL_CONTRIBUTION_SERVICE_SRC, 'async requestRefund(', '\n  // ── Zero-value path');
    expect(REFUND_FN).toContain("where('outcome', '=', 'SUCCEEDED')");
    expect(REFUND_FN).toContain('succeededTxn.provider_reference');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Test 3 — Human-initiated refund is unchanged (protects existing
// behaviour) (STRUCTURAL/SOURCE-PATTERN)
// ═══════════════════════════════════════════════════════════════════════
describe('F-002 Test 3: human/admin refund path (reject() on a COMPLETED Contribution) is unchanged', () => {
  it('reject() still passes the real admin actorUserId, now wrapped in the HUMAN actor shape', () => {
    expect(REJECT_FN).toContain(".requestRefund(Number(contribution.id), reason, { actorType: 'HUMAN', actorUserId })");
  });

  it('requestRefund() rejects a HUMAN actor with no actorUserId rather than silently recording ambiguous provenance', () => {
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain(
      "if (actor.actorType === 'HUMAN' && !actor.actorUserId) {",
    );
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain('A HUMAN refund actor requires a valid actorUserId.');
  });

  it('requestRefund() rejects a SYSTEM actor carrying a human actorUserId', () => {
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain(
      "if (actor.actorType === 'SYSTEM' && actor.actorUserId !== null) {",
    );
    expect(FINANCIAL_CONTRIBUTION_SERVICE_SRC).toContain('A SYSTEM refund actor must not carry a human actorUserId.');
  });

  it('the RefundActor union type makes HUMAN-without-id / SYSTEM-with-id a compile-time error for typed callers', () => {
    expect(FINANCIAL_TYPES_SRC).toContain("{ actorType: 'HUMAN'; actorUserId: number }");
    expect(FINANCIAL_TYPES_SRC).toContain("{ actorType: 'SYSTEM'; actorUserId: null }");
  });

  it('provider refund mechanism, idempotency, and state-transition behaviour are untouched by the actor-shape change', () => {
    const REFUND_FN = slice(FINANCIAL_CONTRIBUTION_SERVICE_SRC, 'async requestRefund(', '\n  // ── Zero-value path');
    expect(REFUND_FN).toContain('await this.provider.refund({');
    expect(REFUND_FN).toContain("if (newStatus === 'COMPLETED') {");
    expect(REFUND_FN).toContain("await this.transitionContribution(contributionId, 'REFUNDED');");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Test 4 — Existing refund idempotency remains effective across duplicate
// event delivery (STRUCTURAL/SOURCE-PATTERN + mirrored-logic unit check)
// ═══════════════════════════════════════════════════════════════════════
describe('F-002 Test 4: duplicate CONTRIBUTION_COMPLETED delivery never creates two refund rows', () => {
  it('recordPaymentReceived() implements no refund-specific idempotency of its own -- it delegates entirely to requestRefund()', () => {
    const rejectedBranch = slice(
      RECORD_PAYMENT_RECEIVED_FN,
      "if (membership.lifecycle_state === 'REJECTED')",
      '\n    }\n\n    await logMembershipAudit(',
    );
    expect(rejectedBranch).not.toContain("selectFrom('financial_refunds')");
    expect(rejectedBranch).not.toContain('alreadyRequested');
  });

  it('requestRefund() itself is unmodified in its idempotency guarantee: existing row + unique-constraint race guard both still return the same row', () => {
    const REFUND_FN = slice(FINANCIAL_CONTRIBUTION_SERVICE_SRC, 'async requestRefund(', '\n  // ── Zero-value path');
    expect(REFUND_FN).toContain("where('contribution_id', '=', contributionId)");
    expect(REFUND_FN).toContain('alreadyRequested: true');
    expect(REFUND_FN).toContain('Lost a race against a concurrent requestRefund() call');
  });

  it('mirrored: two SYSTEM-actor requestRefund() calls for the same contributionId resolve to one refund row (same guarantee reject()\'s existing HUMAN-actor duplicate-rejection call already relies on)', () => {
    const refundsByContribution = new Map<number, { refundId: number }>();
    function requestRefundMirror(contributionId: number): { refundId: number; alreadyRequested: boolean } {
      const existing = refundsByContribution.get(contributionId);
      if (existing) return { ...existing, alreadyRequested: true };
      const created = { refundId: refundsByContribution.size + 1 };
      refundsByContribution.set(contributionId, created);
      return { ...created, alreadyRequested: false };
    }
    const first = requestRefundMirror(42);
    const second = requestRefundMirror(42);
    expect(first.alreadyRequested).toBe(false);
    expect(second.alreadyRequested).toBe(true);
    expect(second.refundId).toBe(first.refundId);
    expect(refundsByContribution.size).toBe(1);
  });

  it('the unique-constraint idempotency guard (uq_refund_contribution) is unchanged by migration 0096', () => {
    const originalMigration = readSourceNormalized(
      join(__dirname, '../../../../../database/migrations/0094_create_financial_refunds.sql'),
    );
    expect(originalMigration).toContain('uq_refund_contribution');
    expect(MIGRATION_SRC).not.toContain('DROP');
    expect(MIGRATION_SRC).not.toContain('uq_refund_contribution');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Test 5 — Rejected membership is never activated
// (STRUCTURAL/SOURCE-PATTERN)
// ═══════════════════════════════════════════════════════════════════════
describe('F-002 Test 5: a REJECTED membership is never activated by a late-arriving successful settlement', () => {
  it('the REJECTED branch never calls activate() or writes memberships.lifecycle_state', () => {
    const rejectedBranch = slice(
      RECORD_PAYMENT_RECEIVED_FN,
      "if (membership.lifecycle_state === 'REJECTED')",
      '\n    }\n\n    await logMembershipAudit(',
    );
    expect(rejectedBranch).not.toContain('this.activate(');
    expect(rejectedBranch).not.toContain("updateTable('memberships')");
    expect(rejectedBranch).not.toContain('lifecycle_state:');
  });

  it('recordPaymentReceived() itself never writes memberships.lifecycle_state in either branch -- activation is exclusively approve()/activate()\'s responsibility', () => {
    expect(RECORD_PAYMENT_RECEIVED_FN).not.toContain("updateTable('memberships')");
  });

  it('requireState() throws for any state other than PENDING/REJECTED, so an already-ACTIVE/APPROVED membership cannot silently re-enter this path', () => {
    expect(LIFECYCLE_SRC).toContain(
      "throw new ConflictException(\n        `Membership ${membershipId} is in state ${membership.lifecycle_state}; expected one of [${allowed.join(', ')}].`,",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Migration 0096 — schema-level support for the SYSTEM actor
// (STRUCTURAL/SOURCE-PATTERN)
// ═══════════════════════════════════════════════════════════════════════
describe('F-002 migration 0096: financial_refunds gains a domain-local actor discriminator', () => {
  it('requested_by_user_id becomes nullable and requested_by_type is added, no SYSTEM user is created', () => {
    expect(MIGRATION_SRC).toContain('MODIFY COLUMN requested_by_user_id BIGINT NULL');
    expect(MIGRATION_SRC).toContain("ADD COLUMN requested_by_type ENUM('HUMAN','SYSTEM')");
    expect(MIGRATION_SRC).not.toContain("INSERT INTO users");
  });

  it('a CHECK constraint enforces the HUMAN/SYSTEM pairing at the DB layer, matching the existing chk_ convention', () => {
    expect(MIGRATION_SRC).toContain('CONSTRAINT chk_refund_actor CHECK');
    expect(MIGRATION_SRC).toContain("requested_by_type = 'HUMAN' AND requested_by_user_id IS NOT NULL");
    expect(MIGRATION_SRC).toContain("requested_by_type = 'SYSTEM' AND requested_by_user_id IS NULL");
  });

  it('DEFAULT \'HUMAN\' backfills every pre-existing financial_refunds row correctly (every existing requestRefund() caller was human/admin-initiated)', () => {
    expect(MIGRATION_SRC).toContain("NOT NULL DEFAULT 'HUMAN'");
    expect(MIGRATION_SRC).not.toContain('UPDATE financial_refunds');
  });

  it('no unrelated financial table is touched by this migration', () => {
    expect(MIGRATION_SRC).not.toContain('ALTER TABLE financial_contributions');
    expect(MIGRATION_SRC).not.toContain('ALTER TABLE financial_transactions');
    expect(MIGRATION_SRC).not.toContain('ALTER TABLE financial_event_outbox');
    expect(MIGRATION_SRC).not.toContain('ALTER TABLE settlement_webhook_inbox');
  });

  it('migration filename follows the repository sequential-numbering convention immediately after the latest existing migration', () => {
    expect(MIGRATION_SRC).toContain("VALUES ('0096_add_financial_refund_actor_type.sql', NOW())");
  });
});
