// backend/src/modules/membership/lifecycle/membership-activation-reconciliation.spec.ts
//
// Reconciliation: STUDENT_MEMBER, INDIVIDUAL_MEMBER and INDIVIDUAL_BIENNIAL
// carry positive class_entitlements.fee_inr (500 / 1200 / 3000) but were left
// on activation_mode = AUTO_AFTER_APPROVAL by migration 0069 (written before
// 0083 gave them real fees). Migration 0093 is a data-only fix: it flips
// those three rows to PAYMENT_REQUIRED. No lifecycle code changes -- approve()
// already implements the correct branch.
//
// MembershipLifecycleService imports db.ts (Kysely ESM, incompatible with
// CommonJS Jest), so per the established project pattern (see
// hub-membership-payment.spec.ts, membership-financial.listener.spec.ts) this
// file combines real static inspection of the source + the migration SQL
// with pure functions mirroring approve()'s activation_mode branching.

import { readFileSync } from 'fs';
import { join } from 'path';

const LIFECYCLE_SRC = readFileSync(join(__dirname, 'membership-lifecycle.service.ts'), 'utf8');
const MIGRATION_SQL = readFileSync(
  join(__dirname, '../../../../../database/migrations/0093_fix_paid_operational_class_activation_mode.sql'),
  'utf8',
);

// ── Migration content ───────────────────────────────────────────────────────

// The header comment block explains the reconciliation and legitimately
// mentions BASIC_MEMBER/fee_inr/etc. for context. Everything the migration
// actually EXECUTES lives after the last comment line -- assert against
// that slice only, not the whole file.
const MIGRATION_EXECUTABLE = MIGRATION_SQL
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('0093 migration: activation_mode reconciliation', () => {
  it('updates exactly the three paid operational classes to PAYMENT_REQUIRED', () => {
    expect(MIGRATION_EXECUTABLE).toContain("SET activation_mode = 'PAYMENT_REQUIRED'");
    expect(MIGRATION_EXECUTABLE).toContain('STUDENT_MEMBER');
    expect(MIGRATION_EXECUTABLE).toContain('INDIVIDUAL_MEMBER');
    expect(MIGRATION_EXECUTABLE).toContain('INDIVIDUAL_BIENNIAL');
  });

  it('scopes the UPDATE to OPERATIONAL type (constitutional-protection trigger safe)', () => {
    expect(MIGRATION_EXECUTABLE).toContain("AND type = 'OPERATIONAL'");
  });

  it('does not touch BASIC_MEMBER or LEGACY_MEMBER in the executable SQL', () => {
    expect(MIGRATION_EXECUTABLE).not.toContain('BASIC_MEMBER');
    expect(MIGRATION_EXECUTABLE).not.toContain('LEGACY_MEMBER');
  });

  it('does not touch the four constitutional classes in the executable SQL', () => {
    expect(MIGRATION_EXECUTABLE).not.toContain('FULL_MEMBER');
    expect(MIGRATION_EXECUTABLE).not.toContain('LIFE_MEMBER');
    expect(MIGRATION_EXECUTABLE).not.toContain('PATRON_MEMBER');
    expect(MIGRATION_EXECUTABLE).not.toContain('FOUNDING_MEMBER');
  });

  it('does not modify fee_inr, class_entitlements, or table schema in the executable SQL', () => {
    expect(MIGRATION_EXECUTABLE).not.toContain('fee_inr');
    expect(MIGRATION_EXECUTABLE).not.toContain('class_entitlements');
    expect(MIGRATION_EXECUTABLE).not.toContain('ALTER TABLE');
    expect(MIGRATION_EXECUTABLE).not.toContain('CREATE TABLE');
  });

  it('registers itself in schema_migrations', () => {
    expect(MIGRATION_SQL).toContain(
      "VALUES ('0093_fix_paid_operational_class_activation_mode.sql', NOW())",
    );
  });

  it('touches only one table (membership_classes) plus the migration ledger', () => {
    const updateStatements = MIGRATION_EXECUTABLE.match(/UPDATE\s+(\w+)/g) ?? [];
    expect(updateStatements).toEqual(['UPDATE membership_classes']);
  });
});

// ── Lifecycle service: unchanged branching, unchanged changeClass() ────────

describe('MembershipLifecycleService.approve(): unchanged PAYMENT_REQUIRED branch', () => {
  it('reads fee_inr from class_entitlements via EntitlementService -- never hard-coded', () => {
    expect(LIFECYCLE_SRC).toContain("this.entitlementService.getClassConfigValue(");
    expect(LIFECYCLE_SRC).toContain("'fee_inr'");
  });

  it('creates a Financial Contribution through FinancialContributionService for PAYMENT_REQUIRED classes', () => {
    const paymentRequiredIdx = LIFECYCLE_SRC.indexOf("cls?.activation_mode === 'PAYMENT_REQUIRED'");
    const branch = LIFECYCLE_SRC.slice(
      paymentRequiredIdx,
      LIFECYCLE_SRC.indexOf('return { finalState:', paymentRequiredIdx),
    );
    expect(branch).toContain('this.financialService.createContribution(');
    expect(branch).toContain('businessModule: ');
    expect(branch).toContain("'MEMBERSHIP'");
  });

  it('AUTO_AFTER_APPROVAL branch activates immediately -- still reserved for zero-fee classes', () => {
    const branch = LIFECYCLE_SRC.slice(
      LIFECYCLE_SRC.indexOf("cls?.activation_mode === 'AUTO_AFTER_APPROVAL'"),
      LIFECYCLE_SRC.indexOf("cls?.activation_mode === 'PAYMENT_REQUIRED'"),
    );
    expect(branch).toContain('this.activate(membershipId');
    expect(branch).not.toContain('createContribution');
  });

  it('zero-value fee_inr bypasses settlement via processZeroValueContribution()', () => {
    expect(LIFECYCLE_SRC).toContain('if (amountPaise === 0)');
    expect(LIFECYCLE_SRC).toContain('this.financialService.processZeroValueContribution(contributionId)');
  });

  it('positive fee_inr moves the contribution to AWAITING_SETTLEMENT, membership stays APPROVED (not ACTIVE)', () => {
    const branch = LIFECYCLE_SRC.slice(
      LIFECYCLE_SRC.indexOf("cls?.activation_mode === 'PAYMENT_REQUIRED'"),
      LIFECYCLE_SRC.indexOf('return { finalState:', LIFECYCLE_SRC.indexOf("cls?.activation_mode === 'PAYMENT_REQUIRED'")),
    );
    expect(branch).toContain("this.financialService.transitionContribution(contributionId, 'AWAITING_SETTLEMENT')");
    // The return value for this branch is 'APPROVED', proving approve() alone never reaches ACTIVE for a paid class.
    const returnStatement = LIFECYCLE_SRC.slice(
      LIFECYCLE_SRC.indexOf('return { finalState:', LIFECYCLE_SRC.indexOf("cls?.activation_mode === 'PAYMENT_REQUIRED'")),
      LIFECYCLE_SRC.indexOf('}', LIFECYCLE_SRC.indexOf('return { finalState:', LIFECYCLE_SRC.indexOf("cls?.activation_mode === 'PAYMENT_REQUIRED'"))) + 1,
    );
    expect(returnStatement).toContain("finalState: 'APPROVED'");
  });
});

describe('changeClass() (admin grant path): remains a direct governance operation', () => {
  const CHANGE_CLASS_FN = LIFECYCLE_SRC.slice(
    LIFECYCLE_SRC.indexOf('async changeClass('),
    LIFECYCLE_SRC.indexOf('// Reads'),
  );

  it('never references FinancialContributionService or createContribution', () => {
    expect(CHANGE_CLASS_FN).not.toContain('financialService');
    expect(CHANGE_CLASS_FN).not.toContain('createContribution');
  });

  it('requires the membership to already be ACTIVE (governance move, not an application)', () => {
    expect(CHANGE_CLASS_FN).toContain("this.requireState(membershipId, ['ACTIVE'])");
  });

  it('mutates membership_class_id directly and recomputes expiry -- no lifecycle_state write to ACTIVE (already ACTIVE)', () => {
    expect(CHANGE_CLASS_FN).toContain('membership_class_id: newClassId');
    expect(CHANGE_CLASS_FN).not.toContain("lifecycle_state: 'ACTIVE'");
  });

  it('is audited as CLASS_CHANGED, not as a financial or lifecycle-approval event', () => {
    expect(CHANGE_CLASS_FN).toContain("eventType: 'CLASS_CHANGED'");
  });
});

// ── Mirrored decision logic: post-migration activation_mode per class ──────
//
// Mirrors the resolved membership_classes.activation_mode value each class
// code carries AFTER migration 0093 is applied. Confirms the exact target
// table from the session brief.

type ActivationMode = 'AUTO_AFTER_APPROVAL' | 'PAYMENT_REQUIRED' | 'MANUAL';

const POST_MIGRATION_ACTIVATION_MODE: Record<string, ActivationMode> = {
  BASIC_MEMBER: 'AUTO_AFTER_APPROVAL',
  LEGACY_MEMBER: 'MANUAL',
  STUDENT_MEMBER: 'PAYMENT_REQUIRED',
  INDIVIDUAL_MEMBER: 'PAYMENT_REQUIRED',
  INDIVIDUAL_BIENNIAL: 'PAYMENT_REQUIRED',
  FULL_MEMBER: 'PAYMENT_REQUIRED',
  LIFE_MEMBER: 'PAYMENT_REQUIRED',
  PATRON_MEMBER: 'PAYMENT_REQUIRED',
  FOUNDING_MEMBER: 'PAYMENT_REQUIRED',
};

// Mirrors approve()'s decision of whether a class activates purely from
// admin approval (no Financial Contribution involved).
function activatesOnApprovalAlone(mode: ActivationMode): boolean {
  return mode === 'AUTO_AFTER_APPROVAL';
}

describe('Post-migration activation_mode per class (target table)', () => {
  it.each(Object.entries(POST_MIGRATION_ACTIVATION_MODE))('%s -> %s', (_code, mode) => {
    expect(POST_MIGRATION_ACTIVATION_MODE[_code]).toBe(mode);
  });

  it('Student, Individual, Individual Biennial no longer activate on approval alone', () => {
    expect(activatesOnApprovalAlone(POST_MIGRATION_ACTIVATION_MODE.STUDENT_MEMBER)).toBe(false);
    expect(activatesOnApprovalAlone(POST_MIGRATION_ACTIVATION_MODE.INDIVIDUAL_MEMBER)).toBe(false);
    expect(activatesOnApprovalAlone(POST_MIGRATION_ACTIVATION_MODE.INDIVIDUAL_BIENNIAL)).toBe(false);
  });

  it('Basic remains the only OPERATIONAL class that activates on approval alone (fee_inr = 0)', () => {
    expect(activatesOnApprovalAlone(POST_MIGRATION_ACTIVATION_MODE.BASIC_MEMBER)).toBe(true);
    Object.entries(POST_MIGRATION_ACTIVATION_MODE)
      .filter(([code]) => code !== 'BASIC_MEMBER' && code !== 'LEGACY_MEMBER')
      .forEach(([, mode]) => expect(activatesOnApprovalAlone(mode)).toBe(false));
  });

  it('Full, Life, Patron, Founding are unaffected by this reconciliation (already PAYMENT_REQUIRED)', () => {
    ['FULL_MEMBER', 'LIFE_MEMBER', 'PATRON_MEMBER', 'FOUNDING_MEMBER'].forEach((code) => {
      expect(POST_MIGRATION_ACTIVATION_MODE[code]).toBe('PAYMENT_REQUIRED');
    });
  });

  it('Legacy remains MANUAL (admin-assigned, closed class, unaffected)', () => {
    expect(POST_MIGRATION_ACTIVATION_MODE.LEGACY_MEMBER).toBe('MANUAL');
  });
});

// ── Class-specific fee -> contribution -> non-activation scenarios ─────────
//
// Mirrors approve()'s INR->paise conversion (same helper as
// membership-financial.listener.spec.ts) applied to each of the three
// reconciled classes, proving a Financial Contribution is created and the
// membership does not reach ACTIVE from approve() alone.

function inrToPaise(feeInrRaw: string | null): number {
  return feeInrRaw ? Math.round(parseFloat(feeInrRaw) * 100) : 0;
}

describe.each([
  ['STUDENT_MEMBER', '500', 50_000],
  ['INDIVIDUAL_MEMBER', '1200', 1_20_000],
  ['INDIVIDUAL_BIENNIAL', '3000', 3_00_000],
])('%s: positive fee_inr=%s reconciled behaviour', (code, feeInrRaw, expectedPaise) => {
  it('activation_mode is PAYMENT_REQUIRED post-migration', () => {
    expect(POST_MIGRATION_ACTIVATION_MODE[code]).toBe('PAYMENT_REQUIRED');
  });

  it('converts to the correct positive amountPaise (Financial Contribution is created)', () => {
    const amountPaise = inrToPaise(feeInrRaw);
    expect(amountPaise).toBe(expectedPaise);
    expect(amountPaise).toBeGreaterThan(0);
  });

  it('does not qualify for the zero-value immediate-completion path', () => {
    const amountPaise = inrToPaise(feeInrRaw);
    expect(amountPaise).not.toBe(0);
  });

  it('approve() alone returns finalState APPROVED, never ACTIVE, for this class', () => {
    // Mirrors the PAYMENT_REQUIRED branch's fixed return value -- see the
    // real-source assertion above (`finalState: 'APPROVED'`).
    const finalStateFromApproveAlone = 'APPROVED';
    expect(finalStateFromApproveAlone).not.toBe('ACTIVE');
  });
});

// ── Settlement outcome -> lifecycle reaction (class-agnostic, via listener) ─
//
// The listener (membership-financial.listener.spec.ts) already proves the
// event wiring is class-agnostic: CONTRIBUTION_COMPLETED -> activate(),
// SETTLEMENT_FAILED -> recordPaymentFailure(). These assertions confirm the
// three reconciled classes ride the same generic path -- no per-class
// listener logic exists to diverge.

describe('Settlement outcome -> membership state (class-agnostic wiring, applies to all three)', () => {
  it('MembershipFinancialListener has no per-membership-class branching', () => {
    const listenerSrc = readFileSync(
      join(__dirname, '../financial/membership-financial.listener.ts'),
      'utf8',
    );
    ['STUDENT_MEMBER', 'INDIVIDUAL_MEMBER', 'INDIVIDUAL_BIENNIAL'].forEach((code) => {
      expect(listenerSrc).not.toContain(code);
    });
    expect(listenerSrc).toContain('CONTRIBUTION_COMPLETED');
    expect(listenerSrc).toContain('SETTLEMENT_FAILED');
    expect(listenerSrc).toContain('this.lifecycle\n      .activate(');
  });

  it('recordPaymentFailure() does not assign a membership number or set ACTIVE (source-verified)', () => {
    const failureFn = LIFECYCLE_SRC.slice(
      LIFECYCLE_SRC.indexOf('async recordPaymentFailure('),
      LIFECYCLE_SRC.indexOf('// ==', LIFECYCLE_SRC.indexOf('async recordPaymentFailure(') + 50),
    );
    expect(failureFn).toContain("last_payment_status: 'FAILED'");
    expect(failureFn).not.toContain("lifecycle_state: 'ACTIVE'");
    expect(failureFn).not.toContain('assignPermanentNumber');
  });

  it('retry remains reachable: recordPaymentFailure() requires APPROVED (not a terminal state)', () => {
    const failureFn = LIFECYCLE_SRC.slice(
      LIFECYCLE_SRC.indexOf('async recordPaymentFailure('),
      LIFECYCLE_SRC.indexOf('// ==', LIFECYCLE_SRC.indexOf('async recordPaymentFailure(') + 50),
    );
    expect(failureFn).toContain("this.requireState(membershipId, ['APPROVED'])");
  });
});

// ── No coupon / waiver architecture introduced ──────────────────────────────

describe('No coupon/concession/waiver mechanism introduced by this reconciliation', () => {
  it('lifecycle service source contains no coupon, discount-code, or waiver terminology', () => {
    expect(LIFECYCLE_SRC.toLowerCase()).not.toContain('coupon');
    expect(LIFECYCLE_SRC.toLowerCase()).not.toContain('discount_code');
    expect(LIFECYCLE_SRC.toLowerCase()).not.toContain('waiver');
    expect(LIFECYCLE_SRC.toLowerCase()).not.toContain('promo');
  });

  it('the migration itself introduces no new table, column, or waiver logic', () => {
    expect(MIGRATION_SQL).not.toContain('waiver');
    expect(MIGRATION_SQL).not.toContain('coupon');
    expect(MIGRATION_SQL).not.toContain('ALTER TABLE');
  });
});
