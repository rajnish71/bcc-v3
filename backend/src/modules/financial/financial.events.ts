// backend/src/modules/financial/financial.events.ts
//
// PAY-001 §BUSINESS EVENT MODEL — Financial Engine Business Events.
// The Financial Engine owns emission of all events listed here.
// Business Modules subscribe; Settlement Providers never contact
// Business Modules directly (PAY-001 Principle 11).

import type { ContributionState } from './financial.types';

// PAY-001 canonical Business Event names (9 of 10 — "Financial Obligation Created"
// belongs to the Business Module, not the Financial Engine).
export const FINANCIAL_EVENT_TYPES = {
  CONTRIBUTION_CREATED:   'financial.contribution.created',
  AWAITING_SETTLEMENT:    'financial.awaiting_settlement',
  SETTLEMENT_STARTED:     'financial.settlement.started',
  SETTLEMENT_FAILED:      'financial.settlement.failed',
  SETTLEMENT_ABANDONED:   'financial.settlement.abandoned',
  SETTLEMENT_COMPLETED:   'financial.settlement.completed',
  RECEIPT_GENERATED:      'financial.receipt.generated',
  CONTRIBUTION_COMPLETED: 'financial.contribution.completed',
  CONTRIBUTION_REFUNDED:  'financial.contribution.refunded',
} as const;

export type FinancialEventType = (typeof FINANCIAL_EVENT_TYPES)[keyof typeof FINANCIAL_EVENT_TYPES];

// Payload carried by every Financial Engine Business Event.
// Contains enough generic context for any Business Module to identify
// its own business object. No provider-specific fields are included
// (PAY-001 Principle 14).
export interface FinancialEngineEventPayload {
  eventType: FinancialEventType | string;
  contributionId: number;
  businessModule: string;       // e.g. 'MEMBERSHIP', 'EVENT'
  businessReferenceId: number;  // PK in the Business Module's own table
  amountPaise: number;
  currency: string;
  contributionState: ContributionState;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

// Maps each target ContributionState to its corresponding Business Event.
// States with no PAY-001 Business Event (CANCELLED, EXPIRED) are absent.
export const STATE_TRANSITION_EVENTS: Partial<Readonly<Record<ContributionState, FinancialEventType>>> = {
  AWAITING_SETTLEMENT:    FINANCIAL_EVENT_TYPES.AWAITING_SETTLEMENT,
  SETTLEMENT_IN_PROGRESS: FINANCIAL_EVENT_TYPES.SETTLEMENT_STARTED,
  SETTLED:                FINANCIAL_EVENT_TYPES.SETTLEMENT_COMPLETED,
  COMPLETED:              FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
  FAILED:                 FINANCIAL_EVENT_TYPES.SETTLEMENT_FAILED,
  ABANDONED:              FINANCIAL_EVENT_TYPES.SETTLEMENT_ABANDONED,
  REFUNDED:               FINANCIAL_EVENT_TYPES.CONTRIBUTION_REFUNDED,
  // CANCELLED and EXPIRED: no corresponding PAY-001 canonical Business Event.
};
