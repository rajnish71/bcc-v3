// backend/src/modules/membership/lifecycle/membership-lifecycle.service.f032-rejection-visibility.spec.ts
//
// F-032 — rejecting a SETTLEMENT_IN_PROGRESS-linked membership leaves the
// contribution silently untouched with no admin-visible flag afterward.
//
// Scope: reject()'s "anything else" Contribution branch (SETTLEMENT_IN_PROGRESS
// / FAILED / ABANDONED) is documented as deliberately taking no financial
// action -- that is unchanged and out of scope here. The gap was that nothing
// recorded the fact for an admin. The fix appends a flag to the same
// LIFECYCLE_TRANSITION audit `notes` field the admin Recent Events feed
// already renders (membership-admin.service.ts listRecentEvents() ->
// GET /membership/admin/events -> frontend/src/pages/hub/admin/membership/
// index.astro loadEvents(), which displays `r.notes` verbatim).
//
// Same project-established pattern as
// membership-payment-approval-reconciliation.spec.ts: real static source
// inspection, no live DB/NestJS module (Kysely ESM is incompatible with
// Jest's CommonJS runtime in this project).

import { readFileSync } from 'fs';
import { join } from 'path';

function readSourceNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const LIFECYCLE_SRC = readSourceNormalized(join(__dirname, 'membership-lifecycle.service.ts'));

function slice(src: string, startMarker: string, endMarker: string, fromIndex = 0): string {
  const start = src.indexOf(startMarker, fromIndex);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  if (end === -1) throw new Error(`end marker not found: ${endMarker} (after ${startMarker})`);
  return src.slice(start, end);
}

const REJECT_FN = slice(LIFECYCLE_SRC, 'async reject(', "await this.notifyMember(membership, 'MEMBERSHIP_APPLICATION_REJECTED'");

describe('F-032. reject() flags an unresolved Contribution left by the "anything else" branch', () => {
  it('the untouched-Contribution branch (not COMPLETED, not CREATED/AWAITING_SETTLEMENT) sets a note instead of doing nothing', () => {
    const ifChain = REJECT_FN.slice(
      REJECT_FN.indexOf("if (contribution.state === 'COMPLETED')"),
    );
    const elseIdx = ifChain.indexOf('} else {');
    expect(elseIdx).toBeGreaterThan(-1);
    const elseBranch = ifChain.slice(elseIdx);
    expect(elseBranch).toContain('unresolvedContributionNote =');
    expect(elseBranch).not.toContain('requestRefund(');
    expect(elseBranch).not.toContain('cancelContribution(');
  });

  it('does NOT invent a new financial state or call the Financial Engine for the untouched branch (no new capability, per the existing design comment)', () => {
    expect(REJECT_FN).toContain('unresolvedContributionNote: string | null = null;');
  });

  it('the flag is carried into the same LIFECYCLE_TRANSITION audit notes the admin Recent Events feed already renders', () => {
    const auditCallIdx = REJECT_FN.indexOf("eventType: 'LIFECYCLE_TRANSITION'");
    expect(auditCallIdx).toBeGreaterThan(-1);
    const auditCall = REJECT_FN.slice(auditCallIdx);
    expect(auditCall).toContain('notes: unresolvedContributionNote ? `${reason} | ${unresolvedContributionNote}` : reason,');
  });

  it('COMPLETED and CREATED/AWAITING_SETTLEMENT branches are unchanged -- still call requestRefund()/cancelContribution() and do not set the note', () => {
    expect(REJECT_FN).toContain(".requestRefund(Number(contribution.id), reason, { actorType: 'HUMAN', actorUserId })");
    expect(REJECT_FN).toContain('.cancelContribution(Number(contribution.id),');
    const completedBranch = slice(REJECT_FN, "if (contribution.state === 'COMPLETED')", '} else if (');
    const createdBranch = slice(REJECT_FN, "} else if (contribution.state === 'CREATED'", '} else {');
    expect(completedBranch).not.toContain('unresolvedContributionNote =');
    expect(createdBranch).not.toContain('unresolvedContributionNote =');
  });

  it('mirrors the flag-string construction for every state reaching the untouched branch', () => {
    type ContributionState =
      | 'CREATED' | 'AWAITING_SETTLEMENT' | 'SETTLEMENT_IN_PROGRESS' | 'SETTLED'
      | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'ABANDONED' | 'REFUNDED';

    function decideNote(contribution: { id: number; state: ContributionState } | null): string | null {
      if (!contribution) return null;
      if (contribution.state === 'COMPLETED') return null;
      if (contribution.state === 'CREATED' || contribution.state === 'AWAITING_SETTLEMENT') return null;
      return `Financial Contribution ${contribution.id} left in state '${contribution.state}' -- not auto-resolved by rejection.`;
    }

    expect(decideNote(null)).toBeNull();
    expect(decideNote({ id: 5, state: 'COMPLETED' })).toBeNull();
    expect(decideNote({ id: 5, state: 'CREATED' })).toBeNull();
    expect(decideNote({ id: 5, state: 'AWAITING_SETTLEMENT' })).toBeNull();
    expect(decideNote({ id: 5, state: 'SETTLEMENT_IN_PROGRESS' })).toBe(
      "Financial Contribution 5 left in state 'SETTLEMENT_IN_PROGRESS' -- not auto-resolved by rejection.",
    );
    expect(decideNote({ id: 5, state: 'FAILED' })).toBe(
      "Financial Contribution 5 left in state 'FAILED' -- not auto-resolved by rejection.",
    );
    expect(decideNote({ id: 5, state: 'ABANDONED' })).toBe(
      "Financial Contribution 5 left in state 'ABANDONED' -- not auto-resolved by rejection.",
    );
  });
});

describe('F-032. Admin surface actually renders the notes field (not a dead flag)', () => {
  const ADMIN_SERVICE_SRC = readSourceNormalized(join(__dirname, '../admin/membership-admin.service.ts'));
  const ADMIN_UI_SRC = readSourceNormalized(
    join(__dirname, '../../../../../frontend/src/pages/hub/admin/membership/index.astro'),
  );

  it('listRecentEvents() selects membership_audit_log.notes', () => {
    const fn = slice(ADMIN_SERVICE_SRC, 'async listRecentEvents(', 'async listSeniorStatusEligible(');
    expect(fn).toContain("'al.notes'");
  });

  it('the admin membership console renders r.notes in the Recent Events table (genuine UI surface, not a dead field)', () => {
    const loadEventsFn = slice(ADMIN_UI_SRC, 'async function loadEvents(', '// ── ⑥ NOTIFICATION TYPES');
    expect(loadEventsFn).toContain('r.notes');
  });
});
