// backend/src/modules/events/financial/events-financial.listener.ts
//
// Module 04 subscriber to Financial Engine Business Events.
//
// Dependency direction (PAY-001 §BUSINESS EVENT MODEL), mirrors
// merchandise/financial/merchandise-financial.listener.ts:
//   Financial Engine → FinancialEventBus → EventsFinancialListener → EventsService
//
// The Financial Engine never imports Module 04. This file is the sole
// PAY-001 → Module 04 integration point. A paid Activity registration is
// confirmed ONLY from CONTRIBUTION_COMPLETED (which itself only fires after
// a signed Razorpay webhook or approved settlement evidence resolves
// settlement) -- never from a browser callback.
//
// SETTLEMENT_FAILED / SETTLEMENT_ABANDONED are deliberately not subscribed:
// the registration simply stays PENDING_PAYMENT and the payer retries the
// SAME Contribution through PAY-001's retry route (Merchandise precedent).
// CONTRIBUTION_REFUNDED needs no handler: refunds are only ever requested
// for registrations/Activities that are already CANCELLED.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FinancialEventBus } from '../../financial/financial-event-bus.service';
import { FINANCIAL_EVENT_TYPES } from '../../financial/financial.events';
import type { FinancialEngineEventPayload } from '../../financial/financial.events';
import { EventsService } from '../events.service';
import { EVENT_REGISTRATION_BUSINESS_MODULE } from '../events.types';

@Injectable()
export class EventsFinancialListener implements OnModuleInit {
  private readonly logger = new Logger(EventsFinancialListener.name);

  constructor(
    private readonly eventBus: FinancialEventBus,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    this.eventBus.on(
      FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
      (payload) => {
        if (payload.businessModule !== EVENT_REGISTRATION_BUSINESS_MODULE)
          return;
        this.handleContributionCompleted(payload);
      },
    );
  }

  // Fire-and-forget with caught errors, same discipline as the Membership
  // and Merchandise listeners -- a failure here must never crash the emitter
  // loop or block another Business Module's listeners. A lost completion is
  // recovered by the user-triggered resume (EventsService.registerForEvent).
  private handleContributionCompleted(
    payload: FinancialEngineEventPayload,
  ): void {
    this.events
      .handleContributionCompleted(payload)
      .catch((err: Error) =>
        this.logger.error(
          `handleContributionCompleted(registration ${payload.businessReferenceId}) failed: ${err.message}`,
        ),
      );
  }
}
