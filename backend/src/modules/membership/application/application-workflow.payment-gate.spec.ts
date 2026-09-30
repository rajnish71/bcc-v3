// backend/src/modules/membership/application/application-workflow.payment-gate.spec.ts
//
// Regression: membership 112 (2026-09-29). An administrator clicked Approve
// while the Financial Contribution was still unpaid. recordStageDecision()
// persisted the COORDINATOR/APPROVED stage row + audit entry, THEN
// lifecycle.approve() refused (contribution not COMPLETED). The stage row
// survived, and after payment completed every later Approve failed with
// "The COORDINATOR stage has already been decided for this application."
// (UNIQUE uq_appstage).
//
// Fix: the payment precondition (assertApprovalPreconditions) runs BEFORE the
// stage row is inserted, and approve() shares the same rule.
//
// Same project-established pattern as the other membership specs (db.ts is
// Kysely ESM, incompatible with CommonJS Jest): real static source inspection
// plus a pure function mirroring the ordering. No live DB.

import { readFileSync } from 'fs';
import { join } from 'path';

function readSourceNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const WORKFLOW_SRC = readSourceNormalized(join(__dirname, 'application-workflow.service.ts'));
const LIFECYCLE_SRC = readSourceNormalized(join(__dirname, '../lifecycle/membership-lifecycle.service.ts'));

function slice(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  if (end === -1) throw new Error(`end marker not found: ${endMarker}`);
  return src.slice(start, end);
}

describe('recordStageDecision checks payment BEFORE persisting the stage row', () => {
  const RECORD_FN = slice(WORKFLOW_SRC, 'async recordStageDecision(', 'async getStageStatus(');

  it('calls lifecycle.assertApprovalPreconditions() before inserting into membership_approval_stages', () => {
    const gate = RECORD_FN.indexOf('this.lifecycle.assertApprovalPreconditions(params.membershipId)');
    const insert = RECORD_FN.indexOf("insertInto('membership_approval_stages')");
    const audit = RECORD_FN.indexOf("eventType: 'APPROVAL_STAGE_DECIDED'");
    expect(gate).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(insert);
    expect(gate).toBeLessThan(audit);
  });

  it('applies the gate only to an APPROVED decision on the final required stage', () => {
    expect(RECORD_FN).toContain(
      "if (params.decision === 'APPROVED' && stageIndex === stages.length - 1) {",
    );
  });

  it('still calls lifecycle.approve() after the stage row, on the final required stage', () => {
    expect(RECORD_FN.indexOf('this.lifecycle.approve(')).toBeGreaterThan(
      RECORD_FN.indexOf("insertInto('membership_approval_stages')"),
    );
  });
});

describe('approve() and the workflow share one payment rule', () => {
  const ASSERT_FN = slice(LIFECYCLE_SRC, 'async assertApprovalPreconditions(', 'async approve(');
  const APPROVE_FN = slice(LIFECYCLE_SRC, 'async approve(', 'async reject(');

  it('assertApprovalPreconditions() is read-only and enforces COMPLETED for PAYMENT_REQUIRED classes', () => {
    expect(ASSERT_FN).toContain("this.requireState(membershipId, ['PENDING'])");
    expect(ASSERT_FN).toContain("cls?.activation_mode === 'PAYMENT_REQUIRED'");
    expect(ASSERT_FN).toContain("contribution.state !== 'COMPLETED'");
    expect(ASSERT_FN).not.toContain('updateTable(');
    expect(ASSERT_FN).not.toContain('insertInto(');
  });

  it('approve() delegates to assertApprovalPreconditions() instead of duplicating the rule', () => {
    expect(APPROVE_FN).toContain('await this.assertApprovalPreconditions(membershipId)');
    expect(APPROVE_FN).not.toContain("contribution.state !== 'COMPLETED'");
  });
});

// Pure mirror of the corrected ordering (membership 112 failure sequence).
describe('membership 112 sequence: approve before payment, pay, approve again', () => {
  type Contribution = 'AWAITING_SETTLEMENT' | 'COMPLETED';
  interface World {
    contribution: Contribution;
    lifecycle: 'PENDING' | 'ACTIVE';
    stages: string[];
    audit: string[];
  }

  function recordCoordinatorApproval(w: World): void {
    if (w.stages.includes('COORDINATOR')) {
      throw new Error('The COORDINATOR stage has already been decided for this application.');
    }
    // corrected order: precondition first ...
    if (w.contribution !== 'COMPLETED') throw new Error('approval requires COMPLETED');
    // ... then persist + transition
    w.stages.push('COORDINATOR');
    w.audit.push('APPROVAL_STAGE_DECIDED');
    w.lifecycle = 'ACTIVE';
  }

  it('leaves no stage row or audit entry from the refused approval, and the later approval succeeds once', () => {
    const w: World = { contribution: 'AWAITING_SETTLEMENT', lifecycle: 'PENDING', stages: [], audit: [] };

    expect(() => recordCoordinatorApproval(w)).toThrow('approval requires COMPLETED');
    expect(w.stages).toEqual([]);
    expect(w.audit).toEqual([]);
    expect(w.lifecycle).toBe('PENDING');

    w.contribution = 'COMPLETED';
    w.audit.push('PAYMENT_RECEIVED');

    recordCoordinatorApproval(w);
    expect(w.stages).toEqual(['COORDINATOR']);
    expect(w.lifecycle).toBe('ACTIVE');
    expect(w.audit).toEqual(['PAYMENT_RECEIVED', 'APPROVAL_STAGE_DECIDED']);
  });
});

// Admin Console must not offer an approval the backend would refuse.
describe('Admin Console withholds Approve until payment is COMPLETED', () => {
  const ADMIN_INDEX = readSourceNormalized(
    join(__dirname, '../../../../../frontend/src/pages/hub/admin/index.astro'),
  );
  const ADMIN_USERS = readSourceNormalized(
    join(__dirname, '../../../../../frontend/src/pages/hub/admin/users.astro'),
  );

  it('pending list disables Approve when a PAYMENT_REQUIRED contribution is not COMPLETED', () => {
    expect(ADMIN_INDEX).toContain("r.activation_mode === 'PAYMENT_REQUIRED' && r.contribution_state !== 'COMPLETED'");
    expect(ADMIN_INDEX).toContain('awaitingPayment(r) ?');
  });

  it('users list single and bulk approve apply the same rule', () => {
    const rule = "u.activationMode === 'PAYMENT_REQUIRED' && u.contributionState !== 'COMPLETED'";
    expect(ADMIN_USERS.split(rule).length - 1).toBeGreaterThanOrEqual(2);
  });
});
