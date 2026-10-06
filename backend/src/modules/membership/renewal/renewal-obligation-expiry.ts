// backend/src/modules/membership/renewal/renewal-obligation-expiry.ts
//
// Release 1 §9: a RENEWAL obligation that has not entered settlement may
// expire when its renewal window closes (the current term end). Expiry
// policy belongs to the Business Module (PAY-001 §OWNERSHIP MATRIX); the
// Financial Engine performs the transition through its own state machine:
//   CREATED / AWAITING_SETTLEMENT          -> EXPIRED
//   FAILED / ABANDONED (retryable)         -> AWAITING_SETTLEMENT -> EXPIRED
//   SETTLEMENT_IN_PROGRESS                 -> untouched: resolves through the
//                                             normal PAY-001 lifecycle, and a
//                                             genuine late completion is
//                                             applied under R1-02
//   COMPLETED / terminal                   -> untouched
// No scheduler: called lazily (renewal status/request) and from
// MembershipLifecycleService.markExpired(). Standalone (no DI) so the
// lifecycle service can use it without a dependency cycle.

import { Logger } from '@nestjs/common';
import { db } from '../../../database/db';
import type { FinancialContributionService } from '../../financial/financial-contribution.service';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { logMembershipAudit } from '../shared/membership-audit.util';
import { renewalContributionKey, toDate } from './renewal-policy';

const logger = new Logger('RenewalObligationExpiry');

export async function expireClosedRenewalOperations(
  financial: FinancialContributionService,
  membershipId: number,
  now: Date = new Date(),
): Promise<number> {
  const ops = await db
    .selectFrom('membership_renewal_operations')
    .selectAll()
    .where('membership_id', '=', membershipId)
    .where('operation_type', '=', 'RENEWAL')
    .where('status', 'in', ['PROOF_REQUIRED', 'AWAITING_PAYMENT'])
    .execute();

  let expired = 0;
  for (const op of ops) {
    const termEnd = toDate(op.previous_term_end);
    if (!termEnd || now.getTime() < termEnd.getTime()) continue; // window still open

    const opId = Number(op.id);
    let contributionState: string | null = null;
    const contribution = await financial.findByIdempotencyKey(renewalContributionKey(membershipId, opId));
    if (contribution) {
      contributionState = String(contribution.state);
      const cid = Number(contribution.id);
      try {
        if (contributionState === 'FAILED' || contributionState === 'ABANDONED') {
          await financial.transitionContribution(cid, 'AWAITING_SETTLEMENT');
          contributionState = 'AWAITING_SETTLEMENT';
        }
        if (contributionState === 'CREATED' || contributionState === 'AWAITING_SETTLEMENT') {
          await financial.transitionContribution(cid, 'EXPIRED');
          contributionState = 'EXPIRED';
        }
      } catch (err) {
        // Lost a race with a settlement start: the obligation is now in
        // settlement and must resolve through PAY-001 -- leave the operation open.
        logger.warn(`Renewal obligation ${cid} not expired: ${(err as Error).message}`);
        continue;
      }
      if (contributionState !== 'EXPIRED') continue; // in settlement / completed
    }

    const result = await db
      .updateTable('membership_renewal_operations')
      .set({ status: 'EXPIRED', decided_at: toMysqlDatetime(now) })
      .where('id', '=', opId)
      .where('status', 'in', ['PROOF_REQUIRED', 'AWAITING_PAYMENT'])
      .executeTakeFirst();
    if (Number(result.numUpdatedRows ?? 0) === 0) continue;

    expired++;
    await logMembershipAudit({
      membershipId,
      eventType: 'RENEWAL_OPERATION_EXPIRED',
      actorType: 'SYSTEM',
      newValue: { operationId: opId, contributionId: contribution ? Number(contribution.id) : null },
      notes: 'Renewal window closed at the current term end before settlement started.',
    });
  }
  return expired;
}
