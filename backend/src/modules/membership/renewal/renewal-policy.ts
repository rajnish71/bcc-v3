// backend/src/modules/membership/renewal/renewal-policy.ts
//
// Release 1 -- Individual Membership Renewal (frozen HA governance).
// Pure policy helpers shared by MembershipRenewalService, the lifecycle
// service (markExpired / renewFromExpired guards) and the application
// duplicate guard. No DI, no imports of other services -- so it can be
// imported from anywhere in the membership module without a cycle.
//
// Frozen rules encoded here:
//   • Self-service renewal: Individual Annual, Individual Biennial, Student
//     only; same plan, same row, same permanent number.
//   • Window: opens `renewal_window_days` (class configuration, MEM-008) before
//     the current term end, closes AT the current term end.
//   • After term end: administrative reinstatement only.

import { ConflictException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db';

// Frozen Release 1 scope (HA governance). Basic, Legacy, Full, Institutional,
// Family, Corporate, Life, Patron and Founding are excluded.
export const RELEASE1_RENEWAL_CLASS_CODES = ['INDIVIDUAL_MEMBER', 'INDIVIDUAL_BIENNIAL', 'STUDENT_MEMBER'] as const;

export function isRelease1RenewalClass(code: string | null | undefined): boolean {
  return !!code && (RELEASE1_RENEWAL_CLASS_CODES as readonly string[]).includes(code);
}

// class_entitlements keys (layer 1 configuration, never hard-coded values).
export const RENEWAL_WINDOW_DAYS_KEY = 'renewal_window_days';
// Comma-separated document types; absent/empty = no proof required.
export const RENEWAL_PROOF_DOCUMENT_TYPES_KEY = 'renewal_required_document_types';

export const OPEN_OPERATION_STATUSES = ['REQUESTED', 'PROOF_REQUIRED', 'AWAITING_PAYMENT'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RenewalWindowState = 'NOT_YET_OPEN' | 'OPEN' | 'CLOSED';

export function parseWindowDays(raw: string | null | undefined, className: string): number {
  const days = raw != null && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isInteger(days) || days <= 0) {
    throw new ConflictException(
      `Membership configuration is incomplete: "${className}" has no valid ${RENEWAL_WINDOW_DAYS_KEY} in class_entitlements.`,
    );
  }
  return days;
}

export function renewalWindow(termEnd: Date, windowDays: number): { opensAt: Date; closesAt: Date } {
  return { opensAt: new Date(termEnd.getTime() - windowDays * DAY_MS), closesAt: new Date(termEnd.getTime()) };
}

// opensAt <= now < termEnd -> OPEN. Exactly at term end the window is closed.
export function evaluateRenewalWindow(termEnd: Date, windowDays: number, now: Date): RenewalWindowState {
  const { opensAt, closesAt } = renewalWindow(termEnd, windowDays);
  if (now.getTime() < opensAt.getTime()) return 'NOT_YET_OPEN';
  if (now.getTime() < closesAt.getTime()) return 'OPEN';
  return 'CLOSED';
}

export function parseDocumentTypes(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// Deterministic PAY-001 idempotency keys: one obligation per operation, and
// (via membership_renewal_operations.term_key) one renewal operation per term.
export function renewalContributionKey(membershipId: number, operationId: number): string {
  return `MEMBERSHIP-${membershipId}-RENEWAL-OP-${operationId}`;
}
export function reinstatementContributionKey(membershipId: number, operationId: number): string {
  return `MEMBERSHIP-${membershipId}-REINSTATEMENT-OP-${operationId}`;
}
const OPERATION_KEY = /^MEMBERSHIP-(\d+)-(RENEWAL|REINSTATEMENT)-OP-(\d+)$/;

export function parseRenewalOperationKey(
  idempotencyKey: string,
): { membershipId: number; operationType: 'RENEWAL' | 'REINSTATEMENT'; operationId: number } | null {
  const m = OPERATION_KEY.exec(idempotencyKey);
  return m
    ? { membershipId: Number(m[1]), operationType: m[2] as 'RENEWAL' | 'REINSTATEMENT', operationId: Number(m[3]) }
    : null;
}

// One renewal operation per renewal term (UNIQUE term_key).
export function renewalTermKey(membershipId: number, previousTermEnd: Date): string {
  return `RENEWAL-${membershipId}-${previousTermEnd.getTime()}`;
}

export function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { code?: string; errno?: number } | null;
  return !!e && (e.code === 'ER_DUP_ENTRY' || e.errno === 1062);
}

export function toDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Application duplicate guard (Release 1 §20) ──────────────────────────────
//
// Called INSIDE the caller's transaction after the caller has row-locked the
// applicant's users row (SELECT ... FOR UPDATE), so two concurrent new
// applications for one person serialise and the second sees the first.
// Refuses a new membership row when the person already holds:
//   • an open/active record (PENDING / APPROVED / ACTIVE / SUSPENDED) -- the
//     pre-existing rule, now race-safe;
//   • an EXPIRED Release 1 membership (Individual Annual/Biennial/Student) --
//     it continues through renewal/reinstatement on the SAME row and number
//     (MEM-007); a new application would mint a second number.
// No broader re-admission policy is introduced: EXPIRED rows of every other
// class, and TERMINATED/REJECTED rows, keep the existing behaviour.
export async function assertNoBlockingIndividualMembership(trx: Kysely<DB>, userId: number): Promise<void> {
  const rows = await trx
    .selectFrom('memberships as m')
    .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
    .select(['m.id', 'm.lifecycle_state', 'm.parent_membership_id', 'mc.code as class_code'])
    .where('m.user_id', '=', userId)
    .where('m.lifecycle_state', 'in', ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'EXPIRED'])
    .execute();

  for (const row of rows) {
    if (row.lifecycle_state === 'EXPIRED') {
      if (row.parent_membership_id == null && isRelease1RenewalClass(row.class_code)) {
        throw new ConflictException(
          'Your membership has expired. Request reinstatement of your existing membership from the Member Hub instead of applying again.',
        );
      }
      continue;
    }
    if (row.lifecycle_state === 'PENDING') {
      throw new ConflictException('You already have a pending membership application');
    }
    if (row.lifecycle_state === 'SUSPENDED') {
      throw new ConflictException('Your membership is suspended. Please contact the membership team.');
    }
    throw new ConflictException('You already have an active membership');
  }
}
