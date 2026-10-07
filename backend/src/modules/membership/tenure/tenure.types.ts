// backend/src/modules/membership/tenure/tenure.types.ts
//
// WP1 calculation contracts for TENURE-ARCH-001 v1.1. These are in-memory
// implementation contracts for the pure engine ONLY. They are not the
// recognized-service ledger schema, the Senior overlay schema or any SQL
// design -- those belong to later work packages.

import type { CivilDate } from './civil-date';

export type DatePrecision = 'EXACT' | 'MONTH' | 'YEAR';

// How the evidence attests an imprecise boundary (R1, §6.3).
//   BOUNDARY -- the boundary lies somewhere within the stated month/year.
//   PERIOD   -- service ran throughout the complete stated month/year.
export type BoundaryAttestation = 'BOUNDARY' | 'PERIOD';

export type ServiceBoundaryInput =
  | { precision: 'EXACT'; value: CivilDate } // 'YYYY-MM-DD'
  | { precision: 'MONTH'; value: string; attestation: BoundaryAttestation } // 'YYYY-MM'
  | { precision: 'YEAR'; value: string; attestation: BoundaryAttestation }; // 'YYYY'

// Evidence kind for the period as a whole (§5.5). POINT evidence never
// establishes a boundary or continuity, so a POINT period never counts.
export type PeriodEvidenceKind = 'BOUNDARY' | 'PERIOD' | 'POINT';

export type PeriodVerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';

export type PeriodLifecycleState = 'CURRENT' | 'CORRECTED' | 'SUPERSEDED';

export interface RecognizedServicePeriodInput {
  periodId: string; // stable identifier; must be unique within one calculation
  start: ServiceBoundaryInput;
  end: ServiceBoundaryInput | null; // null = open-ended (ongoing) service
  evidenceKind: PeriodEvidenceKind;
  // True only when the supplied evidence establishes continuous recognized
  // service between the resolved boundaries (§5.5). Never inferred.
  continuityEstablished: boolean;
  verificationStatus: PeriodVerificationStatus;
  lifecycleState: PeriodLifecycleState;
}

export type PeriodExclusionReason =
  | 'NOT_CURRENT'
  | 'NOT_VERIFIED'
  | 'POINT_EVIDENCE'
  | 'CONTINUITY_NOT_ESTABLISHED'
  | 'INVERTED_INTERVAL'
  | 'NO_SERVICE_BEFORE_EVALUATION_DATE';

export interface ResolvedInterval {
  periodId: string;
  start: CivilDate; // inclusive
  end: CivilDate | null; // inclusive; null = open-ended
}

export interface CountedInterval {
  periodIds: string[]; // sorted; every period coalesced into this interval
  start: CivilDate; // inclusive
  exclusiveEnd: CivilDate; // min(end + 1 day, T)
  months: number; // M: largest whole months with addMonths(start, M) <= exclusiveEnd
  residualDays: number; // exclusiveEnd - addMonths(start, M)
}

export interface RecognizedServiceResult {
  evaluationDate: CivilDate; // T; service counted through T - 1 day
  totalMonths: number; // sum(M) + floor(sum(residual) / 31)
  remainderDays: number; // sum(residual) mod 31
  residualDaysTotal: number; // sum(residual) before 31-day conversion
  resolvedIntervals: ResolvedInterval[]; // sorted by periodId
  countedIntervals: CountedInterval[]; // coalesced, sorted by start
  excluded: Array<{ periodId: string; reason: PeriodExclusionReason }>; // sorted by periodId
}

// ── Date of birth authority (D3 / R3) ─────────────────────────────────────
// Only VERIFIED_FULL_DATE carries a date. Partial or unverified states carry
// none, so they cannot be approximated. A populated users.date_of_birth is
// NOT VERIFIED_FULL_DATE merely because it exists.
export type DobAuthority =
  | { status: 'VERIFIED_FULL_DATE'; dateOfBirth: CivilDate }
  | { status: 'VERIFIED_MONTH_ONLY' }
  | { status: 'VERIFIED_YEAR_ONLY' }
  | { status: 'UNVERIFIED' }
  | { status: 'ABSENT' };

export type SeniorPath = 'P1' | 'P2' | 'P3';

export type SeniorPathStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NOT_EVALUABLE';

export interface SeniorPathResult {
  path: SeniorPath;
  status: SeniorPathStatus;
  // Date the path's constitutional conditions became satisfied (<= T), only
  // when ELIGIBLE. This is eligibility_date -- never an achieved/award date.
  eligibilityDate: CivilDate | null;
  reason: string;
}

// ELIGIBLE: at least one path satisfied as of T.
// NOT_ELIGIBLE: every path was evaluable and none is satisfied.
// INDETERMINATE: none satisfied, but at least one age path is NOT_EVALUABLE.
export type SeniorOverallStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'INDETERMINATE';

export interface SeniorEligibilityDatesResult {
  evaluationDate: CivilDate;
  service: RecognizedServiceResult;
  paths: { P1: SeniorPathResult; P2: SeniorPathResult; P3: SeniorPathResult };
  overall: {
    status: SeniorOverallStatus;
    eligibilityDate: CivilDate | null; // earliest satisfied path
    qualifyingPaths: SeniorPath[];
  };
}
