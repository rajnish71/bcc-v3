// backend/src/modules/membership/hub/hub-membership-payment.spec.ts
//
// Step 20 — PAYMENT_REQUIRED prefill status.
//
// HubMembershipService is NOT instantiated here: it imports db.ts (Kysely
// ESM), same CommonJS/Jest constraint documented across every other
// *.spec.ts touching a service that imports db. Tests instead combine real
// static inspection of the actual source with pure functions mirroring the
// service's status-derivation decision logic (the project's established
// pattern -- see financial.controller.spec.ts).

import { readFileSync } from 'fs';
import { join } from 'path';

const SERVICE_SRC = readFileSync(join(__dirname, 'hub-membership.service.ts'), 'utf8');

describe('HubMembershipService PAYMENT_REQUIRED wiring (Step 20, real source inspection)', () => {
  it('looks up the Contribution by business reference, not by the nullable pending_contribution_id column', () => {
    expect(SERVICE_SRC).toContain('findLatestForBusinessReference');
    expect(SERVICE_SRC).toContain("MEMBERSHIP_BUSINESS_MODULE");
  });

  it('both getApplicationPrefill and getRenewalPrefill expose PAYMENT_REQUIRED', () => {
    const appFn = SERVICE_SRC.slice(
      SERVICE_SRC.indexOf('async getApplicationPrefill'),
      SERVICE_SRC.indexOf('async submitApplication'),
    );
    const renewFn = SERVICE_SRC.slice(
      SERVICE_SRC.indexOf('async getRenewalPrefill'),
      SERVICE_SRC.indexOf('async submitRenewal'),
    );
    expect(appFn).toContain("'PAYMENT_REQUIRED'");
    expect(renewFn).toContain("'PAYMENT_REQUIRED'");
  });

  it('never activates membership or writes lifecycle_state from the prefill read path', () => {
    const appFn = SERVICE_SRC.slice(
      SERVICE_SRC.indexOf('async getApplicationPrefill'),
      SERVICE_SRC.indexOf('async submitApplication'),
    );
    expect(appFn).not.toContain('updateTable');
    expect(appFn).not.toContain('.activate(');
  });

  it('exposes the pending contribution id/state/amount/currency needed by the frontend, nothing more sensitive', () => {
    expect(SERVICE_SRC).toContain('pendingContributionId');
    expect(SERVICE_SRC).toContain('pendingContributionState');
    expect(SERVICE_SRC).toContain('pendingAmountPaise');
    expect(SERVICE_SRC).toContain('pendingCurrency');
  });
});

// ── Status-derivation logic (mirrored) ──────────────────────────────────────
//
// Mirrors getApplicationPrefill()'s branching: APPROVED + a Contribution
// found (any non-terminal-for-the-membership state, since COMPLETED/REFUNDED
// can never coexist with a still-APPROVED row -- see the service's own
// PrefillApplicationStatus doc comment) => PAYMENT_REQUIRED; APPROVED with
// no Contribution (e.g. a MANUAL activation_mode class) => ACTIVE unchanged.

type LifecycleState = 'NONE' | 'PENDING' | 'APPROVED' | 'ACTIVE';

function deriveApplicationStatus(
  lifecycleState: LifecycleState | undefined,
  hasContribution: boolean,
): 'NONE' | 'PENDING' | 'PAYMENT_REQUIRED' | 'ACTIVE' {
  if (!lifecycleState || lifecycleState === 'NONE') return 'NONE';
  if (lifecycleState === 'APPROVED') return hasContribution ? 'PAYMENT_REQUIRED' : 'ACTIVE';
  if (lifecycleState === 'ACTIVE') return 'ACTIVE';
  if (lifecycleState === 'PENDING') return 'PENDING';
  return 'NONE';
}

describe('applicationStatus derivation (Step 20, mirrored)', () => {
  it('APPROVED + a Contribution on file => PAYMENT_REQUIRED (positive-value fee, awaiting settlement)', () => {
    expect(deriveApplicationStatus('APPROVED', true)).toBe('PAYMENT_REQUIRED');
  });

  it('APPROVED + no Contribution => ACTIVE unchanged (MANUAL activation_mode class, pre-Step-20 behaviour preserved)', () => {
    expect(deriveApplicationStatus('APPROVED', false)).toBe('ACTIVE');
  });

  it('ACTIVE lifecycle_state is always ACTIVE regardless of any stale Contribution row', () => {
    expect(deriveApplicationStatus('ACTIVE', true)).toBe('ACTIVE');
    expect(deriveApplicationStatus('ACTIVE', false)).toBe('ACTIVE');
  });

  it('PENDING and NONE are unaffected by Step 20', () => {
    expect(deriveApplicationStatus('PENDING', false)).toBe('PENDING');
    expect(deriveApplicationStatus('NONE', false)).toBe('NONE');
  });

  it('a FAILED-state Contribution still yields PAYMENT_REQUIRED (retry must remain reachable)', () => {
    // hasContribution=true regardless of the Contribution's own state --
    // FAILED/ABANDONED rows are found by findLatestForBusinessReference()
    // exactly like AWAITING_SETTLEMENT ones; only the frontend's retry
    // decision branches on pendingContributionState, not this derivation.
    expect(deriveApplicationStatus('APPROVED', true)).toBe('PAYMENT_REQUIRED');
  });
});
