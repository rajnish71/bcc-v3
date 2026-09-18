// backend/src/modules/membership/lifecycle/complimentary-expiry-check.service.ts
//
// Deliberately NOT a general expiry-processing worker -- no such worker
// exists in this codebase (RAM-conscious, deliberate decision recorded in
// membership-lifecycle.service.ts's file header; also PHASE_ROADMAP.md F-003).
// This is a narrow, one-off, self-terminating check scoped to the specific
// membership IDs granted a complimentary period by
// MembershipAdminService.grantComplimentaryMembership(), so the courtesy
// window actually transitions to EXPIRED (and the normal renewal/payment UI
// takes over) without requiring a human to remember to run
// POST admin/process-expiry manually.
//
// Safe to delete once both memberships have resolved (renewed or expired) --
// it is not part of the general lifecycle architecture and must not be
// extended into one without a separate governance decision.

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { db } from '../../../database/db';
import { MembershipLifecycleService } from './membership-lifecycle.service';
import { CommunicationService } from '../../shared/communication/communication.service';
import { EntitlementService } from '../entitlements/entitlement.service';

// One-off, hardcoded to the two memberships authorized for a complimentary
// grant (see PHASE_ROADMAP / session record). Not a general configuration
// point -- intentionally not read from the database or an env var.
const WATCHED_MEMBERSHIP_IDS: number[] = [104, 98];
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

@Injectable()
export class ComplimentaryExpiryCheckService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComplimentaryExpiryCheckService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly lifecycle: MembershipLifecycleService,
    private readonly communicationService: CommunicationService,
    private readonly entitlementService: EntitlementService,
  ) {}

  onModuleInit(): void {
    if (WATCHED_MEMBERSHIP_IDS.length === 0) return;
    this.timer = setInterval(() => {
      this.runCheck().catch((err) => this.logger.error('Complimentary expiry check failed', err));
    }, CHECK_INTERVAL_MS);
    // Also run once shortly after boot rather than waiting a full interval.
    setTimeout(() => {
      this.runCheck().catch((err) => this.logger.error('Complimentary expiry check failed', err));
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runCheck(): Promise<void> {
    let remaining = 0;

    for (const membershipId of WATCHED_MEMBERSHIP_IDS) {
      const membership = await db
        .selectFrom('memberships')
        .select(['id', 'lifecycle_state', 'expires_at', 'user_id', 'membership_class_id'])
        .where('id', '=', membershipId)
        .executeTakeFirst();

      if (!membership || membership.lifecycle_state !== 'ACTIVE') continue; // resolved or not our case anymore
      remaining++;

      if (!membership.expires_at) continue;
      const expiresAt = new Date(membership.expires_at as unknown as string);
      const now = new Date();

      if (now >= expiresAt) {
        await this.lifecycle.markExpired(membershipId, { type: 'SYSTEM' });
        this.logger.log(`Complimentary membership ${membershipId} expired -- processed via markExpired().`);
        continue;
      }

      // Reminder window: 7 days before expiry, once (dedupe via notification_log
      // is handled centrally by MembershipAdminService.dispatchRenewalReminders'
      // pattern -- here a plain 6h-interval re-check would over-send, so this
      // check narrows to a single day-of-week-independent window by only firing
      // when between 7 and 7-days-minus-interval remain).
      const msRemaining = expiresAt.getTime() - now.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (msRemaining <= sevenDaysMs && msRemaining > sevenDaysMs - CHECK_INTERVAL_MS) {
        const [cls, user, feeRaw] = await Promise.all([
          membership.membership_class_id
            ? db.selectFrom('membership_classes').select('name').where('id', '=', membership.membership_class_id).executeTakeFirst()
            : Promise.resolve(undefined),
          membership.user_id
            ? db.selectFrom('users').select('full_name').where('id', '=', membership.user_id).executeTakeFirst()
            : Promise.resolve(undefined),
          membership.membership_class_id
            ? this.entitlementService.getClassConfigValue(membership.membership_class_id, 'fee_inr')
            : Promise.resolve(null),
        ]);
        if (membership.user_id) {
          await this.communicationService.dispatch('MEMBERSHIP_COMPLIMENTARY_ENDING', membership.user_id, {
            full_name: user?.full_name ?? '',
            membership_class: cls?.name ?? '',
            expiry_date: expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
            renewal_fee: feeRaw ? `₹${feeRaw}` : 'the standard fee',
          });
        }
      }
    }

    if (remaining === 0 && this.timer) {
      this.logger.log('Both watched complimentary memberships resolved -- stopping scoped expiry check.');
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
