// backend/src/modules/membership/numbering/membership-numbering.service.ts
//
// MEM-007 MEMBERSHIP NUMBERING CONSTITUTION — the only file allowed to touch
// membership_number_pool, membership_number_log, or
// memberships.number_serial / membership_number.
//
// assignPermanentNumber() is the SOLE permanent numbering workflow (MP-004).
// It must be called from inside an existing transaction (the caller's
// activate() transaction) — it does not open its own.
//
// Allocation guarantee:
//   • Row-locks membership_number_pool FOR UPDATE, so two concurrent
//     APPROVED → ACTIVE transitions can never draw the same serial.
//   • Increments next_operational_serial atomically.
//   • Guards against double-assignment via WHERE number_serial IS NULL.
//   • Writes an immutable log entry to membership_number_log.
//   • Retires any outstanding temp identifier for the membership.
//   • Rolls back entirely on any failure (caller's transaction).
//
// Membership number format (MEM-007 §5):
//   'BCC' || joinYear || LPAD(joinMonth, 2, '0') || LPAD(serial, 5, '0')
//   e.g. BCC20260800053  (serial 53, activated August 2026)
//
// Historical migration note:
//   Serials 1–52 were bulk-assigned by migration 0078. The pool counter
//   starts at 53. Serials 18, 19, and 28 are permanently unallocated gaps
//   (MP-003: no reuse).

import { ConflictException, Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely';
import { DB } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';

@Injectable()
export class MembershipNumberingService {
  composeMembershipNumber(joinYear: number, joinMonth: number, serial: number): string {
    return `BCC${joinYear}${String(joinMonth).padStart(2, '0')}${String(serial).padStart(5, '0')}`;
  }

  // -------------------------------------------------------------------------
  // Single permanent-number allocation path (MP-004).
  // Called from MembershipLifecycleService.activate() only.
  // MUST be called inside an existing transaction — does not open its own.
  // -------------------------------------------------------------------------
  async assignPermanentNumber(
    trx: Transaction<DB>,
    membershipId: number,
    joinYear: number,
    joinMonth: number,
  ): Promise<{ serial: number; membershipNumber: string }> {
    const pool = await trx
      .selectFrom('membership_number_pool')
      .select('next_operational_serial')
      .where('id', '=', 1)
      .forUpdate()
      .executeTakeFirstOrThrow();

    const serial = pool.next_operational_serial;
    const membershipNumber = this.composeMembershipNumber(joinYear, joinMonth, serial);

    await trx
      .updateTable('membership_number_pool')
      .set({ next_operational_serial: serial + 1 })
      .where('id', '=', 1)
      .execute();

    // WHERE number_serial IS NULL: belt-and-braces idempotency guard.
    // The constitutional trigger (0009/0078) already blocks changing a non-null
    // serial — this guard converts a mistaken double-call into a clean error
    // rather than a hard SQL trigger signal mid-transaction.
    const updateResult = await trx
      .updateTable('memberships')
      .set({
        number_serial: serial,
        membership_number: membershipNumber,
        number_assigned_at: toMysqlDatetime(new Date()),
        join_year: joinYear,
        join_month: joinMonth,
      })
      .where('id', '=', membershipId)
      .where('number_serial', 'is', null)
      .executeTakeFirst();

    if (!updateResult.numUpdatedRows || Number(updateResult.numUpdatedRows) === 0) {
      throw new ConflictException(
        `Membership ${membershipId} already has a permanent number assigned — refusing to allocate a second one (MEM-007 MP-001).`,
      );
    }

    await trx
      .insertInto('membership_number_log')
      .values({
        membership_id: membershipId,
        number_serial: serial,
        membership_number: membershipNumber,
        assignment_type: 'OPERATIONAL_SEQUENTIAL',
        assigned_by_user_id: null,
        notes: null,
      })
      .execute();

    return { serial, membershipNumber };
  }
}
