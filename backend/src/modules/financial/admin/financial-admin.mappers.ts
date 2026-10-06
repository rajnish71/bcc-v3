// backend/src/modules/financial/admin/financial-admin.mappers.ts
//
// Track 4 -- Admin Financial Visibility: explicit response mappers.
//
// Every admin financial response is built here from an explicitly selected
// row shape -- never a raw DB row. The mapping boundary is the exposure
// policy for this surface:
//
//   • External identity is the record UUID (or the canonical receipt
//     number). No numeric DB id, payer_user_id, business_reference_id,
//     actor_user_id, requested_by_user_id or reviewed_by_user_id is ever
//     emitted.
//   • No request_id / session_id / client_ip / user_agent / http_route --
//     forensic provenance stays behind financial.audit.view (trace API).
//   • No settlement-evidence proof_object_key, proof URL, or hosted
//     settlement URL (active_settlement_url).
//   • Membership Number is emitted only when it is a permanent MEM-007
//     number (BCC{YYYY}{MM}{SSSSS}). BCCTemp / any other value -> null.
//
// A contribution without a receipt maps to receipt: null (rendered as
// "No receipt issued"); a contribution without transactions maps to an
// empty transactions list. Nothing is fabricated.

import { CONTRIBUTION_STATES, type ContributionState } from '../financial.types';

export const FINANCIAL_READ_PERMISSION = 'financial.read';

// Server-side pagination bounds. pageSize above the maximum is clamped.
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// MEM-007 permanent Membership Number: BCC{YYYY}{MM}{SSSSS}, 14 chars.
export const PERMANENT_MEMBERSHIP_NUMBER = /^BCC\d{11}$/;
// Same rule for the SQL side (MySQL REGEXP), kept next to the TS rule.
export const PERMANENT_MEMBERSHIP_NUMBER_SQL = '^BCC[0-9]{11}$';

export const NO_RECEIPT_LABEL = 'No receipt issued';

export const REFUND_STATUSES = ['REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

// Exception categories -- each is a canonical PAY-001 state predicate, no
// heuristic thresholds. AWAITING_SETTLEMENT_OVERDUE is exactly
// state = AWAITING_SETTLEMENT AND expires_at < now.
export const EXCEPTION_CATEGORIES = [
  'AWAITING_SETTLEMENT_OVERDUE',
  'SETTLEMENT_IN_PROGRESS',
  'FAILED',
  'ABANDONED',
  'REFUND_PROCESSING',
  'REFUND_FAILED',
  'EVIDENCE_PENDING_REVIEW',
] as const;
export type ExceptionCategory = (typeof EXCEPTION_CATEGORIES)[number];

export function permanentMembershipNumber(value: unknown): string | null {
  return typeof value === 'string' && PERMANENT_MEMBERSHIP_NUMBER.test(value) ? value : null;
}

export function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function clampPage(page?: string, pageSize?: string): { page: number; pageSize: number; offset: number } {
  const p = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
  const requested = Number.parseInt(pageSize ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

export function zeroFilled<K extends string>(keys: readonly K[], rows: Array<{ key: unknown; count: unknown }>): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const row of rows) {
    const k = String(row.key) as K;
    if (k in out) out[k] = Number(row.count);
  }
  return out;
}

export const CONTRIBUTION_STATE_KEYS: readonly ContributionState[] = CONTRIBUTION_STATES;

// ── Row shapes (explicitly selected columns, aliased) ──────────────────────

export interface ContributionListRow {
  uuid: string;
  business_module: string;
  purpose: string;
  state: string;
  amount_paise: unknown;
  currency: string;
  expires_at: unknown;
  created_at: unknown;
  updated_at: unknown;
  contributor_name: string | null;
  contributor_username: string | null;
  membership_number: unknown;
  receipt_number: string | null;
  receipt_issued_at: unknown;
  refund_status: string | null;
  latest_provider: string | null;
  latest_outcome: string | null;
  evidence_status: string | null;
}

export interface TransactionRow {
  uuid: string;
  provider: string;
  provider_reference: string | null;
  amount_paise: unknown;
  currency: string;
  outcome: string;
  failure_reason: string | null;
  created_at: unknown;
}

export interface RefundRow {
  uuid: string;
  amount_paise: unknown;
  currency: string;
  provider: string | null;
  provider_reference: string | null;
  status: string;
  reason: string | null;
  failure_reason: string | null;
  requested_by_type: string;
  requested_at: unknown;
  resolved_at: unknown;
}

export interface RefundListRow extends RefundRow {
  contribution_uuid: string;
  business_module: string;
  contribution_state: string;
  contributor_name: string | null;
  contributor_username: string | null;
}

export interface ReceiptListRow {
  uuid: string;
  receipt_number: string;
  amount_paise: unknown;
  currency: string;
  issued_at: unknown;
  contribution_uuid: string;
  business_module: string;
  contributor_name: string | null;
  contributor_username: string | null;
  membership_number: unknown;
}

export interface EvidenceRow {
  uuid: string;
  claimed_amount_paise: unknown;
  payment_date: unknown;
  submitted_at: unknown;
  review_status: string;
  reviewed_at: unknown;
}

export interface AuditRow {
  event_type: string;
  previous_state: string | null;
  resulting_state: string | null;
  actor_type: string;
  created_at: unknown;
}

// ── Mappers ────────────────────────────────────────────────────────────────

function contributor(name: string | null, username: string | null, membershipNumber?: unknown) {
  return {
    name: name ?? null,
    username: username ?? null,
    ...(membershipNumber !== undefined ? { membershipNumber: permanentMembershipNumber(membershipNumber) } : {}),
  };
}

export function toContributionListItem(row: ContributionListRow) {
  return {
    reference: row.uuid,
    businessModule: row.business_module,
    purpose: row.purpose,
    state: row.state,
    amountPaise: Number(row.amount_paise),
    currency: row.currency,
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    contributor: contributor(row.contributor_name, row.contributor_username, row.membership_number),
    receipt: row.receipt_number
      ? { receiptNumber: row.receipt_number, issuedAt: toIso(row.receipt_issued_at) }
      : null,
    refundStatus: row.refund_status ?? null,
    latestTransaction: row.latest_outcome
      ? { provider: row.latest_provider, outcome: row.latest_outcome }
      : null,
    evidenceStatus: row.evidence_status ?? null,
  };
}

export function toTransaction(row: TransactionRow) {
  return {
    reference: row.uuid,
    provider: row.provider,
    providerReference: row.provider_reference,
    amountPaise: Number(row.amount_paise),
    currency: row.currency,
    outcome: row.outcome,
    failureReason: row.failure_reason,
    createdAt: toIso(row.created_at),
  };
}

export function toRefund(row: RefundRow) {
  return {
    reference: row.uuid,
    amountPaise: Number(row.amount_paise),
    currency: row.currency,
    provider: row.provider,
    providerReference: row.provider_reference,
    status: row.status,
    reason: row.reason,
    failureReason: row.failure_reason,
    requestedByType: row.requested_by_type,
    requestedAt: toIso(row.requested_at),
    resolvedAt: toIso(row.resolved_at),
  };
}

export function toRefundListItem(row: RefundListRow) {
  return {
    ...toRefund(row),
    contribution: {
      reference: row.contribution_uuid,
      businessModule: row.business_module,
      state: row.contribution_state,
    },
    contributor: contributor(row.contributor_name, row.contributor_username),
  };
}

export function toReceiptListItem(row: ReceiptListRow) {
  return {
    reference: row.uuid,
    receiptNumber: row.receipt_number,
    amountPaise: Number(row.amount_paise),
    currency: row.currency,
    issuedAt: toIso(row.issued_at),
    contribution: { reference: row.contribution_uuid, businessModule: row.business_module },
    contributor: contributor(row.contributor_name, row.contributor_username, row.membership_number),
  };
}

// Evidence STATE only -- never proof_object_key / reference_identifier /
// submitter or reviewer identity.
export function toEvidence(row: EvidenceRow) {
  return {
    reference: row.uuid,
    claimedAmountPaise: Number(row.claimed_amount_paise),
    paymentDate: toIso(row.payment_date),
    submittedAt: toIso(row.submitted_at),
    reviewStatus: row.review_status,
    reviewedAt: toIso(row.reviewed_at),
  };
}

// Financial audit trail limited to canonical financial facts -- no actor
// identity and no request/session/IP/User-Agent provenance.
export function toAuditEvent(row: AuditRow) {
  return {
    eventType: row.event_type,
    previousState: row.previous_state,
    resultingState: row.resulting_state,
    actorType: row.actor_type,
    occurredAt: toIso(row.created_at),
  };
}
