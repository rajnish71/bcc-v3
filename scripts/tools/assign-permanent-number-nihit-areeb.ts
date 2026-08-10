// scripts/tools/assign-permanent-number-nihit-areeb.ts
//
// ============================================================
// ONE-TIME ADMINISTRATIVE NUMBER BACKFILL — Nihit & Areeb
// ============================================================
//
// PURPOSE
//   Memberships 75 (Nihit Agrawal, user 68) and 47 (Areeb Ahmed, user 39)
//   are ACTIVE, Basic Member, and hold no permanent membership_number.
//   They activated 2026-08-05 15:17:51 / 15:19:23 -- AFTER the
//   HISTORICAL_MIGRATION_IMPORT batch closed (migration 0078, serials
//   1-52, closed 2026-08-05 15:14:09) and therefore fall inside the
//   Sequential Auto-Allocation era (MEM-007 MP-004 / Amendment 001-C),
//   not the one-time historical manual batch. They simply never received
//   a number because whatever activated them on 2026-08-05 did not
//   invoke MembershipNumberingService.assignPermanentNumber() -- the
//   first real OPERATIONAL_SEQUENTIAL assignment in production wasn't
//   until 2026-08-09 (serial 53).
//
//   MEM-007's own text is explicit: "No future implementation may
//   introduce ... Manual allocation workflows ... without a formally
//   approved amendment," and assignPermanentNumber() is documented and
//   test-enforced (membership-payment-approval-reconciliation.spec.ts,
//   "assignPermanentNumber() is called only from activate()") as the
//   SOLE permanent numbering workflow. This script does NOT introduce a
//   second/manual allocation pathway -- it calls that exact same
//   service method directly, because these two memberships are already
//   ACTIVE and cannot go through activate() again
//   (requireState(['APPROVED']) would reject them).
//
//   Same pool (membership_number_pool), same log
//   (membership_number_log), same immutability trigger protection
//   (trg_membership_number_immutable / trg_prevent_numbered_membership_delete)
//   as every other permanent number ever issued. No new mechanism.
//
// ORDER
//   Processed in activation order (Nihit first, Areeb second) so serials
//   are assigned fairly and sequentially: Nihit -> next serial, Areeb ->
//   the one after. Whatever the pool's next_operational_serial is at
//   execution time is drawn -- this script does not hardcode 55/56.
//
// WHAT THIS SCRIPT DOES NOT DO
//   - does not change lifecycle_state, activated_at, expires_at,
//     pending_contribution_id, or fire any activation notification
//     (those are activate()'s job; these memberships are already ACTIVE)
//   - does not touch any other membership or user
//   - does not modify membership_number_pool structure or MEM-007
//   - does not manually construct or SQL-UPDATE membership_number
//
// PRE-CONDITIONS (script aborts if any fail)
//   - membership 75: user_id=68, lifecycle_state=ACTIVE,
//     membership_number IS NULL, number_serial IS NULL
//   - membership 47: user_id=39, lifecycle_state=ACTIVE,
//     membership_number IS NULL, number_serial IS NULL
//   - user 68: nihitagrawal / nihit.agrawal@gmail.com
//   - user 39: areebbpl@gmail.com
//   - at least one SUPER_ADMIN user exists (used as audit actor)
//
// USAGE (run from the backend directory):
//
//   Dry run:
//     cd /var/www/bcc-v3/backend
//     NODE_PATH=/var/www/bcc-v3/backend/node_modules DOTENV_CONFIG_PATH=.env \
//       npx ts-node --transpile-only -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/assign-permanent-number-nihit-areeb.ts --dry-run
//
//   Live run:
//     cd /var/www/bcc-v3/backend
//     NODE_PATH=/var/www/bcc-v3/backend/node_modules DOTENV_CONFIG_PATH=.env \
//       npx ts-node --transpile-only -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/assign-permanent-number-nihit-areeb.ts

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../backend/src/app.module';
import { MembershipNumberingService } from '../../backend/src/modules/membership/numbering/membership-numbering.service';
import { logMembershipAudit } from '../../backend/src/modules/membership/shared/membership-audit.util';
import { db } from '../../backend/src/database/db';

interface Target {
  membershipId: number;
  expectedUserId: number;
  label: string;
}

// Order matters: Nihit activated 2026-08-05 15:17:51, Areeb 2026-08-05
// 15:19:23 -- Nihit is processed first.
const TARGETS: Target[] = [
  { membershipId: 75, expectedUserId: 68, label: 'Nihit Agrawal (user 68)' },
  { membershipId: 47, expectedUserId: 39, label: 'Areeb Ahmed (user 39)' },
];

function hr(char = '─', width = 72): string {
  return char.repeat(width);
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`\n${hr()}`);
  console.log('BCC Admin — Permanent number backfill: Nihit & Areeb');
  console.log(`Mode : ${isDryRun ? 'DRY RUN  (no changes will be written)' : 'LIVE'}`);
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(hr());

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const numberingService = app.get(MembershipNumberingService);

  try {
    // ── Preconditions ──────────────────────────────────────────────────
    const memberships = await db
      .selectFrom('memberships')
      .select(['id', 'user_id', 'lifecycle_state', 'membership_number', 'number_serial', 'activated_at'])
      .where('id', 'in', TARGETS.map((t) => t.membershipId))
      .execute();

    if (memberships.length !== TARGETS.length) {
      throw new Error(`Expected ${TARGETS.length} memberships, found ${memberships.length}.`);
    }
    const memById = Object.fromEntries(memberships.map((m) => [m.id, m]));

    for (const t of TARGETS) {
      const m = memById[t.membershipId];
      if (!m) throw new Error(`Membership ${t.membershipId} not found.`);
      if (m.user_id !== t.expectedUserId) {
        throw new Error(`Membership ${t.membershipId} belongs to user ${m.user_id}, expected ${t.expectedUserId}. Aborting.`);
      }
      if (m.lifecycle_state !== 'ACTIVE') {
        throw new Error(`Membership ${t.membershipId} is ${m.lifecycle_state}, not ACTIVE. Aborting.`);
      }
      if (m.membership_number !== null || m.number_serial !== null) {
        throw new Error(`Membership ${t.membershipId} already has a number (membership_number=${m.membership_number}, number_serial=${m.number_serial}). Refusing to touch. Aborting.`);
      }
      console.log(`  ${t.label}: membership ${t.membershipId}, state=${m.lifecycle_state}, activated_at=${m.activated_at}, no existing number — OK`);
    }

    const superAdmin = await db
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .innerJoin('users as u', 'u.id', 'ur.user_id')
      .select(['ur.user_id', 'u.username'])
      .where('r.name', '=', 'Super Admin')
      .orderBy('ur.user_id', 'asc')
      .executeTakeFirst();

    if (!superAdmin) {
      throw new Error('No Super Admin user found in user_roles. Cannot record audit actor.');
    }
    console.log(`\nAudit actor: user_id=${superAdmin.user_id} (${superAdmin.username})`);

    const poolBefore = await db
      .selectFrom('membership_number_pool')
      .select('next_operational_serial')
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    console.log(`Pool before: next_operational_serial=${poolBefore.next_operational_serial}`);

    if (isDryRun) {
      console.log(`\n[DRY RUN] Would sequentially assign serials starting at ${poolBefore.next_operational_serial}:`);
      TARGETS.forEach((t, i) => {
        console.log(`  ${t.label} (membership ${t.membershipId}) -> serial ${poolBefore.next_operational_serial + i}`);
      });
      await app.close();
      return;
    }

    // ── Live path ──────────────────────────────────────────────────────
    for (const t of TARGETS) {
      const m = memById[t.membershipId];
      const activatedAt = new Date(m.activated_at as unknown as string);
      const joinYear = activatedAt.getFullYear();
      const joinMonth = activatedAt.getMonth() + 1;

      console.log(`\n[LIVE] Assigning permanent number to membership ${t.membershipId} (${t.label})...`);

      const { serial, membershipNumber } = await db.transaction().execute((trx) =>
        numberingService.assignPermanentNumber(trx, t.membershipId, joinYear, joinMonth),
      );

      console.log(`  Assigned: serial=${serial}, membership_number=${membershipNumber}`);

      await logMembershipAudit({
        membershipId: t.membershipId,
        eventType: 'MEMBERSHIP_NUMBER_ASSIGNED',
        actorType: 'ADMIN',
        actorUserId: superAdmin.user_id,
        oldValue: { membershipNumber: null, numberSerial: null },
        newValue: { membershipNumber, numberSerial: serial },
        notes:
          `Administrative number backfill (2026-08-10): membership activated ${m.activated_at} ` +
          `(after the HISTORICAL_MIGRATION_IMPORT batch closed at serial 52) but the activation ` +
          `flow at that time did not invoke MembershipNumberingService.assignPermanentNumber(). ` +
          `Assigned via the same sole numbering workflow (MP-004), called directly since the ` +
          `membership is already ACTIVE and cannot re-enter activate(). Authorized by Rajnish K. ` +
          `Khare in the BCC V3 numbering-reconciliation session, 2026-08-10.`,
      });
    }

    const poolAfter = await db
      .selectFrom('membership_number_pool')
      .select('next_operational_serial')
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();

    console.log(`\n${hr()}`);
    console.log(`Done. Pool advanced: ${poolBefore.next_operational_serial} -> ${poolAfter.next_operational_serial}.`);
    console.log(hr());
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('\nFatal error during number backfill:', err);
  process.exit(1);
});
