// backend/src/modules/membership/recognition/senior-status.reader.ts
//
// WP5 -- the single authoritative READ-SIDE resolver of Senior Status
// (TENURE-ARCH-001 v1.1 / MEM-006 v1.1 Amendment 001).
//
//   Senior Member          = Status Overlay (not a Recognition Class)
//   Honorary Senior Member = Recognition Class (RECOGNITION_CLASS_CODES)
//
// Resolution order:
//   1. an ACTIVE senior_status_overlays row for the individual;
//   2. otherwise the frozen legacy MANUAL SENIOR_MEMBER recognition row
//      (temporary compatibility until carry-over is separately authorized --
//      it does NOT make SENIOR_MEMBER a Recognition Class);
//   3. otherwise no Senior Status.
//
// STRICTLY READ-ONLY. This module only SELECTs. It creates no overlay, no
// transition and no recognition, awards nothing, evaluates nothing for
// award, persists nothing and invokes no evaluator or scheduler. The WP1
// tenure result may be attached as read-only information; the WP4
// GOVERNANCE_ATTESTATION/BOUNDARY rows have continuity_established = false,
// so WP1 counts zero service for them and they can never yield Senior Status
// here (nothing in this file derives status from tenure).

import type { Kysely } from 'kysely';
import { db, type DB } from '../../../database/db';
import { calculateRecognizedService } from '../tenure/tenure-calculator';
import type { RecognizedServicePeriodInput, ServiceBoundaryInput } from '../tenure/tenure.types';

// Recognition Classes (MEM-006 v1.1). SENIOR_MEMBER is deliberately absent.
export const RECOGNITION_CLASS_CODES = [
  'HONORARY_MEMBER',
  'HONORARY_MENTOR',
  'HONORARY_GRANDMASTER',
  'HONORARY_SENIOR_MEMBER',
] as const;
export type RecognitionClassCode = (typeof RECOGNITION_CLASS_CODES)[number];

export const LEGACY_SENIOR_RECOGNITION_CODE = 'SENIOR_MEMBER';

export type SeniorStatus =
  | { source: 'OVERLAY'; provenance: 'AUTO' | 'MANUAL'; overlayId: number; achievedDate: string | null }
  | { source: 'LEGACY_MANUAL_RECOGNITION'; provenance: 'MANUAL'; recognitionId: number; sinceDate: string | null }
  | { source: 'NONE' };

export interface SeniorTenureInfo {
  evaluationDate: string;
  totalMonths: number;
  remainderDays: number;
  countedIntervals: number;
  excludedReasons: string[];
}

export interface SeniorStatusResult {
  userId: number;
  senior: SeniorStatus;
  // Present only when requested. Read-only WP1 information; never a status input.
  tenure?: SeniorTenureInfo;
}

export interface ActiveSeniorRow {
  userId: number;
  membershipId: number | null;
  fullName: string | null;
  username: string | null;
  membershipNumber: string | null;
  senior: Exclude<SeniorStatus, { source: 'NONE' }>;
}

const ymd = (d: unknown): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

// mysql2 (timezone 'Z') returns DATE columns as UTC-midnight Dates.
export function ledgerRowToEngineInput(r: {
  id: number | string;
  start_date: unknown;
  start_precision: 'EXACT' | 'MONTH' | 'YEAR';
  start_attestation: 'BOUNDARY' | 'PERIOD' | null;
  end_date: unknown;
  end_precision: 'EXACT' | 'MONTH' | 'YEAR' | null;
  end_attestation: 'BOUNDARY' | 'PERIOD' | null;
  evidence_kind: 'BOUNDARY' | 'PERIOD' | 'POINT';
  continuity_established: number | boolean;
  verification_status: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  correction_state: 'CURRENT' | 'CORRECTED' | 'SUPERSEDED';
}): RecognizedServicePeriodInput {
  const boundary = (
    date: string,
    precision: 'EXACT' | 'MONTH' | 'YEAR',
    attestation: 'BOUNDARY' | 'PERIOD' | null,
  ): ServiceBoundaryInput =>
    precision === 'EXACT'
      ? { precision, value: date }
      : { precision, value: precision === 'YEAR' ? date.slice(0, 4) : date.slice(0, 7), attestation: attestation ?? 'BOUNDARY' };
  const start = ymd(r.start_date) as string;
  const end = ymd(r.end_date);
  return {
    periodId: `L${r.id}`,
    start: boundary(start, r.start_precision, r.start_attestation),
    end: end === null || r.end_precision === null ? null : boundary(end, r.end_precision, r.end_attestation),
    evidenceKind: r.evidence_kind,
    continuityEstablished: r.continuity_established === 1 || r.continuity_established === true,
    verificationStatus: r.verification_status,
    lifecycleState: r.correction_state,
  };
}

export class SeniorStatusReader {
  constructor(private readonly executor: Kysely<DB> = db) {}

  async forUser(userId: number, opts: { tenureAsOf?: string } = {}): Promise<SeniorStatusResult> {
    const result: SeniorStatusResult = { userId, senior: await this.resolveStatus(userId) };
    if (opts.tenureAsOf) result.tenure = await this.tenureInfo(userId, opts.tenureAsOf);
    return result;
  }

  async forMembership(membershipId: number, opts: { tenureAsOf?: string } = {}): Promise<SeniorStatusResult | null> {
    const m = await this.executor.selectFrom('memberships').select(['user_id']).where('id', '=', membershipId).executeTakeFirst();
    if (!m || m.user_id == null) return null;
    return this.forUser(Number(m.user_id), opts);
  }

  private async resolveStatus(userId: number): Promise<SeniorStatus> {
    const overlay = await this.executor
      .selectFrom('senior_status_overlays')
      .select(['id', 'provenance', 'achieved_date'])
      .where('user_id', '=', userId)
      .where('status', '=', 'ACTIVE')
      .orderBy('id', 'asc')
      .executeTakeFirst();
    if (overlay) {
      return { source: 'OVERLAY', provenance: overlay.provenance, overlayId: Number(overlay.id), achievedDate: ymd(overlay.achieved_date) };
    }

    const legacy = await this.executor
      .selectFrom('member_recognitions as mr')
      .innerJoin('memberships as m', 'm.id', 'mr.membership_id')
      .select(['mr.id as id', 'mr.start_date as start_date'])
      .where('m.user_id', '=', userId)
      .where('m.owner_type', '=', 'INDIVIDUAL')
      .where('mr.recognition_code', '=', LEGACY_SENIOR_RECOGNITION_CODE)
      .where('mr.track', '=', 'MANUAL')
      .where('mr.status', '=', 'ACTIVE')
      .orderBy('mr.id', 'asc')
      .executeTakeFirst();
    if (legacy) {
      return { source: 'LEGACY_MANUAL_RECOGNITION', provenance: 'MANUAL', recognitionId: Number(legacy.id), sinceDate: ymd(legacy.start_date) };
    }
    return { source: 'NONE' };
  }

  // Everyone currently holding Senior Status (overlay takes precedence over
  // the legacy row for the same individual). Read-only listing for admin.
  async listActive(): Promise<ActiveSeniorRow[]> {
    const overlays = await this.executor
      .selectFrom('senior_status_overlays as o')
      .innerJoin('users as u', 'u.id', 'o.user_id')
      .select(['o.id as id', 'o.provenance as provenance', 'o.achieved_date as achieved_date', 'u.id as user_id', 'u.full_name as full_name', 'u.username as username'])
      .where('o.status', '=', 'ACTIVE')
      .orderBy('o.id', 'asc')
      .execute();
    const legacy = await this.executor
      .selectFrom('member_recognitions as mr')
      .innerJoin('memberships as m', 'm.id', 'mr.membership_id')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['mr.id as id', 'mr.start_date as start_date', 'm.id as membership_id', 'm.membership_number as membership_number', 'u.id as user_id', 'u.full_name as full_name', 'u.username as username'])
      .where('m.owner_type', '=', 'INDIVIDUAL')
      .where('mr.recognition_code', '=', LEGACY_SENIOR_RECOGNITION_CODE)
      .where('mr.track', '=', 'MANUAL')
      .where('mr.status', '=', 'ACTIVE')
      .orderBy('mr.id', 'asc')
      .execute();

    const out: ActiveSeniorRow[] = [];
    const seen = new Set<number>();
    for (const o of overlays) {
      seen.add(Number(o.user_id));
      out.push({
        userId: Number(o.user_id), membershipId: null, fullName: o.full_name, username: o.username, membershipNumber: null,
        senior: { source: 'OVERLAY', provenance: o.provenance, overlayId: Number(o.id), achievedDate: ymd(o.achieved_date) },
      });
    }
    for (const l of legacy) {
      if (seen.has(Number(l.user_id))) continue;
      seen.add(Number(l.user_id));
      out.push({
        userId: Number(l.user_id), membershipId: Number(l.membership_id), fullName: l.full_name, username: l.username, membershipNumber: l.membership_number,
        senior: { source: 'LEGACY_MANUAL_RECOGNITION', provenance: 'MANUAL', recognitionId: Number(l.id), sinceDate: ymd(l.start_date) },
      });
    }
    return out;
  }

  // WP1 result over the individual's ledger. Information only.
  private async tenureInfo(userId: number, evaluationDate: string): Promise<SeniorTenureInfo> {
    const rows = await this.executor.selectFrom('recognized_service_periods').selectAll().where('user_id', '=', userId).execute();
    const service = calculateRecognizedService(rows.map((r) => ledgerRowToEngineInput(r as any)), evaluationDate);
    return {
      evaluationDate,
      totalMonths: service.totalMonths,
      remainderDays: service.remainderDays,
      countedIntervals: service.countedIntervals.length,
      excludedReasons: [...new Set(service.excluded.map((e) => e.reason))].sort(),
    };
  }
}
