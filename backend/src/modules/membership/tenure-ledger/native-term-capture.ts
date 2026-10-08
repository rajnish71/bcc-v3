// backend/src/modules/membership/tenure-ledger/native-term-capture.ts
//
// TENURE-ARCH-001 v1.1 WP3 -- native lifecycle capture into the Recognized
// Service Ledger (migrations 0119, 0126).
//
// A "native term" is a membership term that the V3 lifecycle itself created
// or extended: first activation, an applied renewal/reinstatement operation.
// Each is written as one append-only ledger row at the moment the term is
// established, inside the caller's lifecycle transaction.
//
// Rules (Human Authority WP3 decisions):
//   * memberships.expires_at is an EXCLUSIVE end instant. The STORED
//     instants are converted, never recomputed:
//       start_date     = IST_DATE(start instant, whole seconds)
//       end_inclusive  = IST_DATE(end instant - 1 second)
//   * NULL expires_at (lifetime / unlimited) is not captured.
//   * Group-linked member rows and non-INDIVIDUAL rows never transfer tenure.
//   * Class changes and complimentary expiry overrides are NOT term evidence
//     and are never routed here.
//   * Suspension is not a boundary; nothing is captured or closed for it.
//   * Termination closes recognized service at MIN(term end, terminated_at):
//     the row is corrected by appending a superseding row. A term that had
//     not yet begun gets a corrected end earlier than its start; that
//     inverted interval is valid and contributes zero service (§6, engine
//     INVERTED_INTERVAL). Nothing is updated in place except the one
//     permitted CURRENT -> CORRECTED move.
//   * Native rows are VERIFIED with verified_by_user_id NULL (0126); no
//     system identity exists. Duplicate-identity reconciliation (29<-119,
//     45<-118) is an operational prerequisite completed before the first
//     WP3 ledger write; the writer carries no identity guard of its own.
//   * Never calculates tenure and never creates Senior status.

import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { logMembershipAudit } from '../shared/membership-audit.util';
import { civilDateInKolkata, compareCivilDates, type CivilDate } from '../tenure/civil-date';
import { TENURE_AUDIT_EVENTS } from './tenure-ledger.vocabulary';

export const NATIVE_SOURCE = Object.freeze({
  ACTIVATION: 'MEMBERSHIP_ACTIVATION', // native_source_id = memberships.id
  RENEWAL_OPERATION: 'RENEWAL_OPERATION', // native_source_id = membership_renewal_operations.id
  TERMINATION: 'MEMBERSHIP_TERMINATION', // native_source_id = memberships.id (correction rows only)
} as const);

export type NativeCaptureSkipReason =
  | 'NULL_EXPIRY'
  | 'NOT_INDIVIDUAL_OWN_TERM'
  | 'EMPTY_TERM'
  | 'ALREADY_CAPTURED';

export type NativeCaptureResult =
  | { captured: true; periodId: number; startDate: CivilDate; endDate: CivilDate }
  | { captured: false; reason: NativeCaptureSkipReason };

const SECOND_MS = 1000;
const wholeSeconds = (d: Date): number => Math.floor(d.getTime() / SECOND_MS) * SECOND_MS;

// Stored instants arrive as UTC wall-clock text ('YYYY-MM-DD HH:MM:SS',
// produced by toMysqlDatetime on the UTC-pinned pool) or as Date objects.
export function parseStoredInstant(value: string | Date): Date {
  if (value instanceof Date) return new Date(wholeSeconds(value));
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!m) throw new Error(`Unparseable stored datetime '${value}'.`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

// Exclusive-end instant -> inclusive civil end date, per the approved rule.
export function inclusiveEndDate(endInstant: Date): CivilDate {
  return civilDateInKolkata(new Date(wholeSeconds(endInstant) - SECOND_MS));
}

export function nativeTermCivilDates(
  startInstant: Date,
  endInstant: Date,
): { startDate: CivilDate; endDate: CivilDate } | null {
  if (wholeSeconds(endInstant) <= wholeSeconds(startInstant)) return null;
  const startDate = civilDateInKolkata(new Date(wholeSeconds(startInstant)));
  const endDate = inclusiveEndDate(endInstant);
  if (compareCivilDates(endDate, startDate) < 0) return null;
  return { startDate, endDate };
}

interface OwnedMembership {
  userId: number;
  ownTerm: boolean;
}

async function loadOwner(trx: Kysely<DB>, membershipId: number): Promise<OwnedMembership> {
  const row = await trx
    .selectFrom('memberships')
    .select(['user_id', 'owner_type', 'parent_membership_id'])
    .where('id', '=', membershipId)
    .executeTakeFirstOrThrow();
  return {
    userId: Number(row.user_id),
    ownTerm: row.owner_type === 'INDIVIDUAL' && row.parent_membership_id == null,
  };
}

export interface CaptureNativeTermInput {
  membershipId: number;
  startInstant: string | Date;
  endInstant: string | Date | null;
  sourceType: typeof NATIVE_SOURCE.ACTIVATION | typeof NATIVE_SOURCE.RENEWAL_OPERATION;
  sourceId: number;
  actorUserId?: number | null;
}

export async function captureNativeTerm(trx: Kysely<DB>, input: CaptureNativeTermInput): Promise<NativeCaptureResult> {
  if (input.endInstant == null) return { captured: false, reason: 'NULL_EXPIRY' };

  const owner = await loadOwner(trx, input.membershipId);
  if (!owner.ownTerm) return { captured: false, reason: 'NOT_INDIVIDUAL_OWN_TERM' };

  const dates = nativeTermCivilDates(parseStoredInstant(input.startInstant), parseStoredInstant(input.endInstant));
  if (!dates) return { captured: false, reason: 'EMPTY_TERM' };

  const existing = await trx
    .selectFrom('recognized_service_periods')
    .select(['id'])
    .where('native_source_type', '=', input.sourceType)
    .where('native_source_id', '=', input.sourceId)
    .where('supersedes_period_id', 'is', null)
    .executeTakeFirst();
  if (existing) return { captured: false, reason: 'ALREADY_CAPTURED' };

  const inserted = await trx
    .insertInto('recognized_service_periods')
    .values({
      user_id: owner.userId,
      membership_id: input.membershipId,
      start_date: dates.startDate,
      start_precision: 'EXACT',
      start_attestation: null,
      end_date: dates.endDate,
      end_precision: 'EXACT',
      end_attestation: null,
      evidence_kind: 'PERIOD',
      continuity_established: 1,
      basis: 'NATIVE_LIFECYCLE',
      native_source_type: input.sourceType,
      native_source_id: input.sourceId,
      evidence_reference: null,
      evidence_note: null,
      verification_status: 'VERIFIED',
      verified_by_user_id: null,
      verified_at: toMysqlDatetime(new Date()),
      verification_reason: null,
      supersedes_period_id: null,
      established_by_type: 'SYSTEM',
      established_by_user_id: null,
    })
    .executeTakeFirstOrThrow();
  const periodId = Number(inserted.insertId);

  await logMembershipAudit(
    {
      membershipId: input.membershipId,
      subjectUserId: owner.userId,
      eventType: TENURE_AUDIT_EVENTS.SERVICE_PERIOD_ESTABLISHED,
      actorType: 'SYSTEM',
      actorUserId: input.actorUserId ?? null,
      newValue: { periodId, ...dates, sourceType: input.sourceType, sourceId: input.sourceId, basis: 'NATIVE_LIFECYCLE' },
    },
    trx,
  );

  return { captured: true, periodId, ...dates };
}

interface LedgerRow {
  id: number;
  start: CivilDate;
  end: CivilDate | null;
}

// mysql2 (timezone 'Z') returns DATE columns as UTC-midnight Dates.
const ymd = (d: Date): CivilDate =>
  `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// Closes recognized native service at MIN(term end, terminated_at).
export async function closeNativePeriodsAtTermination(
  trx: Kysely<DB>,
  membershipId: number,
  terminatedAt: Date,
  actorUserId?: number | null,
): Promise<{ corrected: number }> {
  const owner = await loadOwner(trx, membershipId);
  if (!owner.ownTerm) return { corrected: 0 };

  const newEnd = inclusiveEndDate(terminatedAt);

  const stored = await trx
    .selectFrom('recognized_service_periods')
    .select(['id', 'start_date', 'end_date'])
    .where('membership_id', '=', membershipId)
    .where('basis', '=', 'NATIVE_LIFECYCLE')
    .where('correction_state', '=', 'CURRENT')
    .orderBy('start_date')
    .orderBy('id')
    .forUpdate()
    .execute();
  const rows: LedgerRow[] = stored.map((r) => ({
    id: Number(r.id),
    start: ymd(r.start_date as unknown as Date),
    end: r.end_date == null ? null : ymd(r.end_date as unknown as Date),
  }));

  let corrected = 0;
  for (const row of rows) {
    // An open-ended native row cannot exist (NULL expiry is never captured);
    // a term already ending on or before termination is left untouched.
    if (row.end !== null && compareCivilDates(row.end, newEnd) <= 0) continue;

    const replacement = await trx
      .insertInto('recognized_service_periods')
      .values({
        user_id: owner.userId,
        membership_id: membershipId,
        start_date: row.start,
        start_precision: 'EXACT',
        start_attestation: null,
        end_date: newEnd,
        end_precision: 'EXACT',
        end_attestation: null,
        evidence_kind: 'PERIOD',
        continuity_established: 1,
        basis: 'NATIVE_LIFECYCLE',
        native_source_type: NATIVE_SOURCE.TERMINATION,
        native_source_id: membershipId,
        evidence_reference: null,
        evidence_note: null,
        verification_status: 'VERIFIED',
        verified_by_user_id: null,
        verified_at: toMysqlDatetime(new Date()),
        verification_reason: null,
        supersedes_period_id: row.id,
        established_by_type: 'SYSTEM',
        established_by_user_id: null,
      })
      .executeTakeFirstOrThrow();
    await trx
      .updateTable('recognized_service_periods')
      .set({ correction_state: 'CORRECTED' })
      .where('id', '=', row.id)
      .where('correction_state', '=', 'CURRENT')
      .execute();
    await logMembershipAudit(
      {
        membershipId,
        subjectUserId: owner.userId,
        eventType: TENURE_AUDIT_EVENTS.SERVICE_PERIOD_CORRECTED,
        actorType: 'SYSTEM',
        actorUserId: actorUserId ?? null,
        oldValue: { periodId: row.id, start: row.start, end: row.end },
        newValue: { periodId: Number(replacement.insertId), start: row.start, end: newEnd, reason: 'TERMINATION' },
      },
      trx,
    );
    corrected += 1;
  }
  return { corrected };
}
