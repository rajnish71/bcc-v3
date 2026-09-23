// backend/src/modules/merchandise/financial/merchandise-financial.listener.ts
//
// Merchandise module subscriber to Financial Engine Business Events.
//
// Dependency direction (PAY-001 §BUSINESS EVENT MODEL), mirrors
// membership/financial/membership-financial.listener.ts exactly:
//   Financial Engine → FinancialEventBus → MerchandiseFinancialListener → MerchandiseOrderService
//
// The Financial Engine never imports Merchandise. This file belongs to
// Merchandise and is the sole integration point between the two domains.
// Payment completion is NEVER decided from a browser callback -- only this
// listener, reacting to a Financial Engine event that itself only fires
// after a signed Razorpay webhook resolves settlement, may mark a
// Merchandise order PAID.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FinancialEventBus } from '../../financial/financial-event-bus.service';
import { FINANCIAL_EVENT_TYPES } from '../../financial/financial.events';
import type { FinancialEngineEventPayload } from '../../financial/financial.events';
import { MerchandiseOrderService } from '../merchandise-order.service';
import { MERCHANDISE_BUSINESS_MODULE } from '../merchandise.types';

@Injectable()
export class MerchandiseFinancialListener implements OnModuleInit {
  private readonly logger = new Logger(MerchandiseFinancialListener.name);

  constructor(
    private readonly eventBus: FinancialEventBus,
    private readonly orders: MerchandiseOrderService,
  ) {}

  onModuleInit(): void {
    this.eventBus.on(FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED, (payload) => {
      if (payload.businessModule !== MERCHANDISE_BUSINESS_MODULE) return;
      this.handleContributionCompleted(payload);
    });

    this.eventBus.on(FINANCIAL_EVENT_TYPES.SETTLEMENT_FAILED, (payload) => {
      if (payload.businessModule !== MERCHANDISE_BUSINESS_MODULE) return;
      this.orders.handleSettlementFailed(payload);
    });

    this.eventBus.on(FINANCIAL_EVENT_TYPES.CONTRIBUTION_REFUNDED, (payload) => {
      if (payload.businessModule !== MERCHANDISE_BUSINESS_MODULE) return;
      this.handleContributionRefunded(payload);
    });
  }

  // Async handlers are fire-and-forget with caught errors, same discipline
  // as MembershipFinancialListener -- a failure here must never crash the
  // event emitter loop or block another Business Module's own listeners.
  private handleContributionCompleted(payload: FinancialEngineEventPayload): void {
    this.orders
      .handleContributionCompleted(payload)
      .catch((err: Error) =>
        this.logger.error(
          `handleContributionCompleted(order ${payload.businessReferenceId}) failed: ${err.message}`,
        ),
      );
  }

  private handleContributionRefunded(payload: FinancialEngineEventPayload): void {
    this.orders
      .handleContributionRefunded(payload)
      .catch((err: Error) =>
        this.logger.error(
          `handleContributionRefunded(order ${payload.businessReferenceId}) failed: ${err.message}`,
        ),
      );
  }
}
