// backend/src/modules/membership/numbering/membership-numbering.service.ts
//
// MEM-007 MEMBERSHIP NUMBERING CONSTITUTION -- the only file in this
// codebase that is allowed to touch membership_number_pool,
// membership_number_log, or memberships.number_serial/membership_number.
//
// assignPermanentNumber() is called from EXACTLY one place:
// MembershipLifecycleService.activate(), inside its transaction, as the
// final step of APPROVED -> ACTIVE (MEM-007 "Allocation Trigger" -- "Permanent
// allocation occurs as the final step of membership activation... Application
// review, payment processing, approval workflows, and temporary identifiers
// do NOT trigger permanent number assignment"). No other caller should ever
// invoke it directly.
//
// assignReservedNumber() is the one-time migration path (MEM-007 §7) for
// Founding (00001-00007) and Historical Block (00008-00020) serials. It is
// NOT wired into the normal application lifecycle -- it exists for the
// deferred bulk founding/historical member onboarding task (see
// PHASE_ROADMAP.md "on the horizon"), gated behind Super-Admin-only RBAC at
// the controller, and is expected to run a handful of times total, ever.
//
// Membership number format -- CONFIRMED by Rajnish this session:
//   'BCC' || join_year || LPAD(join_month, 2, '0') || LPAD(serial, 5, '0')
//   e.g. BCC20260600021
// This was flagged in Phase 0 as Claude's interpretation reconciling
// MEM-007 §4 (plain serials) with §5 (BCC+YYYY+MM+serial) -- now resolved,
// not still open.
//
// join_year/join_month for a fresh (non-migrated) membership are set here,
// at assignment time, to the calendar year/month of activation -- there is
// no "original joining year" ambiguity for a V3-native applicant the way
// there is for a legacy/migrated record. This is a documented assumption,
// not spelled out verbatim in MEM-007 (which is written primarily with
// historical/migrated records in mind); flag if it should instead be tied
// to applied_at or approved_at.
//
// issueTemporaryIdentifier() exists for the same future migration-import
// use case as assignReservedNumber() -- it is NOT called anywhere in the
// standard apply -> approve -> activate flow implemented in this pass. A
// fresh V3-native applicant simply has no membership_number until ACTIVE;
// manufacturing a BCCTempXXXXX for every ordinary applicant would misapply
// a mechanism MEM-007 §6 scopes explicitly to "onboarding, migration, or
// transitional operations."

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely';
import { DB } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';

@Injectable()
export class MembershipNumberingService {
  composeMembershipNumber(joinYear: number, joinMonth: number, serial: number): string {
    return `BCC${joinYear}${String(joinMonth).padStart(2, '0')}${String(serial).padStart(5, '0')}`;
  }

  // --------------------------------------------------------------------
  // Operational path -- next_operational_serial, starts at 21 (MP-004).
  // Row-locked via FOR UPDATE so two concurrent activations can never draw
  // the same serial twice. MUST be called from inside an existing
  // transaction (the caller's activate() transaction) -- this method does
  // not open its own.
  // --------------------------------------------------------------------
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

    // number_serial IS NULL guard: belt-and-braces idempotency. The
    // constitutional trigger (0009) already blocks changing a non-null
    // number, but that trigger fires as a hard SQL error mid-transaction --
    // this WHERE clause means a mistaken double-call instead just updates
    // zero rows, which we detect and turn into a clean application error.
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
        `Membership ${membershipId} already has a permanent number assigned -- refusing to allocate a second one (MEM-007 MP-001).`,
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

    // No-op for the overwhelming majority of memberships (which never had a
    // temp identifier issued in the first place) -- harmless, and correct
    // for the eventual migration-import path where they did.
    await trx
      .updateTable('membership_temp_identifiers')
      .set({ status: 'RETIRED', retired_at: toMysqlDatetime(new Date()) })
      .where('membership_id', '=', membershipId)
      .where('status', '=', 'ACTIVE')
      .execute();

    return { serial, membershipNumber };
  }

  // --------------------------------------------------------------------
  // Migration-only path -- direct assignment of a Founding (1-7) or
  // Historical Block (8-20) serial. Bypasses membership_number_pool
  // entirely, per migration 0008's design ("NOT drawn from this pool").
  // Uniqueness is enforced by membership_number_log's UNIQUE KEY on
  // number_serial -- a duplicate serial throws here, not silently no-ops.
  // --------------------------------------------------------------------
  async assignReservedNumber(
    trx: Transaction<DB>,
    membershipId: number,
    serial: number,
    assignmentType: 'FOUNDING_RESERVED' | 'HISTORICAL_RESERVED',
    joinYear: number,
    joinMonth: number,
    actorUserId: number,
    notes?: string,
  ): Promise<{ serial: number; membershipNumber: string }> {
    if (assignmentType === 'FOUNDING_RESERVED' && (serial < 1 || serial > 7)) {
      throw new BadRequestException('FOUNDING_RESERVED serials must be in range 00001-00007 (MEM-007 §4).');
    }
    if (assignmentType === 'HISTORICAL_RESERVED' && (serial < 8 || serial > 20)) {
      throw new BadRequestException('HISTORICAL_RESERVED serials must be in range 00008-00020 (MEM-007 §4).');
    }

    const membershipNumber = this.composeMembershipNumber(joinYear, joinMonth, serial);

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
      throw new ConflictException(`Membership ${membershipId} already has a permanent number assigned, or does not exist.`);
    }

    // Duplicate-serial protection: uq_number_log_serial throws here if this
    // exact serial was ever assigned before -- exactly what MP-002/MP-003
    // require, enforced at the DB layer, not just by the range check above.
    await trx
      .insertInto('membership_number_log')
      .values({
        membership_id: membershipId,
        number_serial: serial,
        membership_number: membershipNumber,
        assignment_type: assignmentType,
        assigned_by_user_id: actorUserId,
        notes: notes ?? 'One-time migration allocation (MEM-007 §7).',
      })
      .execute();

    return { serial, membershipNumber };
  }

  // --------------------------------------------------------------------
  // Temporary onboarding identifiers (MEM-007 §6) -- migration/onboarding
  // use only. See file header: not called anywhere in this pass's standard
  // application lifecycle.
  // --------------------------------------------------------------------
  async issueTemporaryIdentifier(trx: Transaction<DB>, membershipId: number): Promise<string> {
    const tempIdentifier = `BCCTemp${String(membershipId).padStart(5, '0')}`;
    await trx
      .insertInto('membership_temp_identifiers')
      .values({ membership_id: membershipId, temp_identifier: tempIdentifier, status: 'ACTIVE' })
      .execute();
    return tempIdentifier;
  }
}
