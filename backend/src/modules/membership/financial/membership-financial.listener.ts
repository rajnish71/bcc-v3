// backend/src/modules/membership/financial/membership-financial.listener.ts
//
// Membership module subscriber to Financial Engine Business Events.
//
// Dependency direction (PAY-001 §BUSINESS EVENT MODEL):
//   Financial Engine → FinancialEventBus → MembershipFinancialListener → MembershipLifecycleService
//
// The Financial Engine never imports Membership. This file belongs to Membership
// and is the sole integration point between the two domains.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FinancialEventBus } from '../../financial/financial-event-bus.service';
import { FINANCIAL_EVENT_TYPES } from '../../financial/financial.events';
import type { FinancialEngineEventPayload } from '../../financial/financial.events';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';

const MEMBERSHIP_BUSINESS_MODULE = 'MEMBERSHIP';

@Injectable()
export class MembershipFinancialListener implements OnModuleInit {
  private readonly logger = new Logger(MembershipFinancialListener.name);

  constructor(
    private readonly eventBus: FinancialEventBus,
    private readonly lifecycle: MembershipLifecycleService,
  ) {}

  onModuleInit(): void {
    this.eventBus.on(FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED, (payload) => {
      if (payload.businessModule !== MEMBERSHIP_BUSINESS_MODULE) return;
      this.handleContributionCompleted(payload);
    });

    this.eventBus.on(FINANCIAL_EVENT_TYPES.SETTLEMENT_FAILED, (payload) => {
      if (payload.businessModule !== MEMBERSHIP_BUSINESS_MODULE) return;
      this.handleSettlementFailed(payload);
    });
  }

  private handleContributionCompleted(payload: FinancialEngineEventPayload): void {
    const membershipId = payload.businessReferenceId;
    // activate() is async; errors are caught so a failed activation
    // does not crash the event emitter loop.
    this.lifecycle
      .activate(membershipId, { type: 'SYSTEM' })
      .catch((err: Error) =>
        this.logger.error(
          `activate(${membershipId}) failed after CONTRIBUTION_COMPLETED: ${err.message}`,
        ),
      );
  }

  private handleSettlementFailed(payload: FinancialEngineEventPayload): void {
    const membershipId = payload.businessReferenceId;
    this.lifecycle
      .recordPaymentFailure(membershipId, payload.amountPaise)
      .catch((err: Error) =>
        this.logger.error(
          `recordPaymentFailure(${membershipId}) failed after SETTLEMENT_FAILED: ${err.message}`,
        ),
      );
  }
}
