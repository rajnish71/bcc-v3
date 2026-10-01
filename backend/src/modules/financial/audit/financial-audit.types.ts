// backend/src/modules/financial/audit/financial-audit.types.ts
//
// Payment & Authentication Observability Remediation -- OBS-02/Section 13.
//
// This file is the single source of truth for the financial audit event
// vocabulary and the request-provenance shape threaded through the
// Financial Engine's HTTP surface. It intentionally mirrors the discipline
// already established by financial.types.ts: a fixed, explicit set of
// values, never a free-form string or object.

import type { FinancialAuditActorType } from '../../../database/db';

export type { FinancialAuditActorType };

// The approved event vocabulary (remediation Section 7). Do not invent a
// competing vocabulary -- extend this list only if existing code requires
// an exact technical variation.
export const FINANCIAL_AUDIT_EVENT_TYPES = [
  'CONTRIBUTION_CREATED',
  'SETTLEMENT_START_REQUESTED',
  'SETTLEMENT_RETRY_REQUESTED',
  'PROVIDER_ORDER_CREATED',
  'PROVIDER_ORDER_FAILED',
  'SETTLEMENT_EVIDENCE_SUBMITTED',
  'SETTLEMENT_EVIDENCE_APPROVED',
  'SETTLEMENT_EVIDENCE_REJECTED',
  'SETTLEMENT_OUTCOME_RECORDED',
  'REFUND_REQUESTED',
  // HA ruling D1 (2026-10-01): append-only reconciliation annotation on a
  // COMPLETED Contribution whose settlement is later determined not to
  // represent genuine received funds. Records only -- never a transition.
  'SETTLEMENT_RECONCILIATION_ANNOTATED',
] as const;

export type FinancialAuditEventType = (typeof FINANCIAL_AUDIT_EVENT_TYPES)[number];

// OBS-06: PROVIDER_ORDER_CREATED metadata must distinguish these three
// outcomes of FinancialContributionService.initiateProviderSettlement()'s
// existing race-handling logic.
export const PROVIDER_ORDER_OUTCOMES = ['CREATED', 'REUSED', 'DISCARDED_LOST_RACE'] as const;
export type ProviderOrderOutcome = (typeof PROVIDER_ORDER_OUTCOMES)[number];

// Explicit whitelist -- the ONLY fields FinancialAuditService.record() will
// ever serialize into financial_audit_log.metadata_json. Never widen this
// to Record<string, unknown> or accept a caller-supplied arbitrary object
// (Section 6/13: no arbitrary headers, cookies, tokens, or bodies).
export interface FinancialAuditMetadata {
  providerOrderOutcome?: ProviderOrderOutcome;
  // The attempt's own (now-orphaned) provider order reference, retained
  // only on a DISCARDED_LOST_RACE event -- provider_order_ref on that same
  // row carries the WINNING reference instead (OBS-06).
  discardedProviderOrderReference?: string;
  isRetry?: boolean;
  // Present only when the provider attempt is a hosted payment link rather
  // than an embedded-Checkout order (PROVIDER_ORDER_CREATED/FAILED rows are
  // reused for both; absent means the pre-existing Orders path).
  settlementChannel?: SettlementChannel;
  // SETTLEMENT_RECONCILIATION_ANNOTATED only (HA ruling D1).
  settlementClassification?: SettlementClassification;
  // The Settlement Provider account that processed the annotated settlement,
  // read from the original verified webhook payload -- never a credential.
  providerAccountId?: string;
  correctionContributionId?: number;
  reconciliationReason?: string;
}

export const SETTLEMENT_CHANNELS = ['PAYMENT_LINK'] as const;
export type SettlementChannel = (typeof SETTLEMENT_CHANNELS)[number];

export const SETTLEMENT_CLASSIFICATIONS = ['TEST_MODE_NON_GENUINE_SETTLEMENT'] as const;
export type SettlementClassification = (typeof SETTLEMENT_CLASSIFICATIONS)[number];

// Section 13: only the fields required by the current operation should be
// passed. Built once per HTTP request by buildRequestProvenance() and
// threaded explicitly through service method calls -- never a generic
// "capture everything" request logger.
export interface RequestProvenance {
  requestId?: string | null;
  actorUserId?: number | null;
  sessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  route?: string | null;
}

// Bundles "who/what is performing this action" with "what request it
// happened in" -- passed as an optional trailing parameter on Financial
// Engine methods so existing internal callers (membership/merchandise,
// which do not yet thread HTTP provenance through) keep compiling
// unchanged and simply produce an audit row with fewer populated fields.
export interface AuditContext {
  actorType: FinancialAuditActorType;
  provenance?: RequestProvenance;
  // Present only when this action was resolved by/for a specific settlement
  // webhook delivery (OBS-07).
  webhookInboxId?: number | null;
}

export interface FinancialAuditEventInput {
  eventType: FinancialAuditEventType;
  contributionId?: number | null;
  transactionId?: number | null;
  refundId?: number | null;
  settlementEvidenceId?: number | null;
  webhookInboxId?: number | null;
  actorType: FinancialAuditActorType;
  provenance?: RequestProvenance;
  providerOrderRef?: string | null;
  providerPaymentRef?: string | null;
  providerReceiptRef?: string | null;
  previousState?: string | null;
  resultingState?: string | null;
  metadata?: FinancialAuditMetadata;
}
