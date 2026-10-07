// backend/src/modules/membership/tenure-ledger/tenure-ledger.vocabulary.ts
//
// TENURE-ARCH-001 v1.1 WP2 -- vocabulary for the recognized service ledger,
// the Senior Status Overlay and its transition history (migrations
// 0119-0122). These lists mirror the migrations' ENUM definitions exactly
// (tenure-ledger.schema.spec.ts keeps them in sync).
//
// Vocabulary only. WP2 wires no writer, emits no audit event and evaluates
// nothing; ledger capture, carry-over and Senior transitions are later work
// packages.

export const SERVICE_PERIOD_PRECISIONS = ['EXACT', 'MONTH', 'YEAR'] as const;
export const SERVICE_PERIOD_ATTESTATIONS = ['BOUNDARY', 'PERIOD'] as const;
export const SERVICE_PERIOD_EVIDENCE_KINDS = ['BOUNDARY', 'PERIOD', 'POINT'] as const;
export const SERVICE_PERIOD_BASES = ['NATIVE_LIFECYCLE', 'HISTORICAL_RECONCILIATION', 'GOVERNANCE_ATTESTATION'] as const;
export const SERVICE_PERIOD_VERIFICATION_STATUSES = ['UNVERIFIED', 'VERIFIED', 'REJECTED'] as const;
export const SERVICE_PERIOD_CORRECTION_STATES = ['CURRENT', 'CORRECTED', 'SUPERSEDED'] as const;
export const SERVICE_PERIOD_ESTABLISHED_BY = ['SYSTEM', 'ADMIN'] as const;

export const SENIOR_OVERLAY_STATUSES = ['ACTIVE', 'REMOVED'] as const;
export const SENIOR_OVERLAY_PROVENANCES = ['AUTO', 'MANUAL'] as const;

export const SENIOR_TRANSITION_TYPES = ['AWARDED', 'CARRIED_OVER', 'REMOVED', 'RESCINDED'] as const;
export const SENIOR_TRANSITION_ACTOR_TYPES = ['SYSTEM', 'ADMIN'] as const;

// membership_audit_log.event_type values for ledger and Senior overlay
// events (§16). Written with subject_user_id set to the individual
// concerned. DOB verification events are identity events and belong to
// identity_audit_log, not here (MEM-006 P3).
export const TENURE_AUDIT_EVENTS = Object.freeze({
  SERVICE_PERIOD_ESTABLISHED: 'SERVICE_PERIOD_ESTABLISHED',
  SERVICE_PERIOD_CORRECTED: 'SERVICE_PERIOD_CORRECTED',
  SERVICE_PERIOD_SUPERSEDED: 'SERVICE_PERIOD_SUPERSEDED',
  SERVICE_PERIOD_VERIFIED: 'SERVICE_PERIOD_VERIFIED',
  SERVICE_PERIOD_REJECTED: 'SERVICE_PERIOD_REJECTED',
  SENIOR_EVALUATED: 'SENIOR_EVALUATED',
  SENIOR_ACHIEVED: 'SENIOR_ACHIEVED',
  SENIOR_CARRIED_OVER: 'SENIOR_CARRIED_OVER',
  SENIOR_REMOVED: 'SENIOR_REMOVED',
  SENIOR_REMOVAL_RESCINDED: 'SENIOR_REMOVAL_RESCINDED',
} as const);

export type TenureAuditEvent = (typeof TENURE_AUDIT_EVENTS)[keyof typeof TENURE_AUDIT_EVENTS];
