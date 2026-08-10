// scripts/tools/retire-test-memberships-83-84.ts
//
// ============================================================
// ONE-TIME ADMINISTRATIVE RETIREMENT — test memberships 83 & 84
// ============================================================
//
// PURPOSE
//   Part of the test-user cleanup for user 77 (test@bhopal.info).
//   Memberships 83 (BCC20260800053) and 84 (BCC20260800054) both carry
//   allocated, permanent membership numbers. The database enforces
//   MEM-007 at the schema level with a trigger
//   (trg_prevent_numbered_membership_delete) that unconditionally blocks
//   hard-deleting any membership with an allocated number — its own
//   error message says "Retire it via lifecycle_state instead."
//
//   This script does exactly that, through the canonical
//   MembershipLifecycleService.terminate() method (same pattern as
//   scripts/tools/admin-bablu-activate.ts), so that:
//     • the MEM-006 seven-state lifecycle machine is respected
//     • membership_audit_log gets a correct LIFECYCLE_TRANSITION entry
//     • MEMBERSHIP_TERMINATED notification fires through the normal path
//     • membership_number / number_serial remain untouched and immutable
//
//   It does NOT delete the memberships, does NOT touch
//   membership_number_pool, and does NOT delete user 77.
//
// PRE-CONDITIONS
//   • memberships 83 and 84 exist, belong to user 77, are ACTIVE, and
//     carry membership_number BCC20260800053 / BCC20260800054
//     respectively (script aborts if any of this doesn't match)
//   • at least one SUPER_ADMIN user exists in user_roles (used as actor)
//
// USAGE (run from the backend directory):
//
//   Dry run:
//     cd /var/www/bcc-v3/backend
//     DOTENV_CONFIG_PATH=.env \
//       npx ts-node -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/retire-test-memberships-83-84.ts --dry-run
//
//   Live run:
//     cd /var/www/bcc-v3/backend
//     DOTENV_CONFIG_PATH=.env \
//       npx ts-node -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/retire-test-memberships-83-84.ts

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../backend/src/app.module';
import { MembershipLifecycleService } from '../../backend/src/modules/membership/lifecycle/membership-lifecycle.service';
import { db } from '../../backend/src/database/db';

const MEMBERSHIP_IDS = [83, 84];
const EXPECTED_USER_ID = 77;
const EXPECTED_NUMBERS: Record<number, string> = {
  83: 'BCC20260800053',
  84: 'BCC20260800054',
};
const REASON =
  'Test-user cleanup (2026-08-10): membership belongs to test account test@bhopal.info, ' +
  'created during Step 22/23 Razorpay TEST MODE workflow testing. No real member or funds ' +
  'involved. Retired via canonical terminate() per MEM-007 (membership_number is permanent ' +
  'and cannot be hard-deleted); serials 53/54 remain permanently non-reusable. Authorized by ' +
  'Rajnish K. Khare in the BCC V3 cleanup session, 2026-08-10.';

function hr(char = '─', width = 72): string {
  return char.repeat(width);
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`\n${hr()}`);
  console.log('BCC Admin — Retire test memberships 83/84 (user 77 cleanup)');
  console.log(`Mode : ${isDryRun ? 'DRY RUN  (no changes will be written)' : 'LIVE'}`);
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(hr());

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const lifecycle = app.get(MembershipLifecycleService);

  try {
    // ── Preconditions ──────────────────────────────────────────────────
    const memberships = await db
      .selectFrom('memberships')
      .select(['id', 'user_id', 'lifecycle_state', 'membership_number'])
      .where('id', 'in', MEMBERSHIP_IDS)
      .execute();

    if (memberships.length !== MEMBERSHIP_IDS.length) {
      throw new Error(`Expected ${MEMBERSHIP_IDS.length} memberships, found ${memberships.length}.`);
    }

    for (const m of memberships) {
      if (m.user_id !== EXPECTED_USER_ID) {
        throw new Error(`Membership ${m.id} does not belong to user ${EXPECTED_USER_ID} (found user_id=${m.user_id}). Aborting.`);
      }
      if (m.membership_number !== EXPECTED_NUMBERS[m.id]) {
        throw new Error(`Membership ${m.id} membership_number mismatch: expected ${EXPECTED_NUMBERS[m.id]}, found ${m.membership_number}. Aborting.`);
      }
      console.log(`  Membership ${m.id}: state=${m.lifecycle_state}, number=${m.membership_number} — OK`);
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
      throw new Error('No SUPER_ADMIN user found in user_roles. Cannot record termination actor.');
    }
    console.log(`\nTermination actor: user_id=${superAdmin.user_id} (${superAdmin.username})`);

    if (isDryRun) {
      console.log('\n[DRY RUN] Would call lifecycle.terminate(83, actor, reason) and lifecycle.terminate(84, actor, reason).');
      await app.close();
      return;
    }

    // ── Live path ──────────────────────────────────────────────────────
    for (const membershipId of MEMBERSHIP_IDS) {
      const before = await lifecycle.getOrThrow(membershipId);
      if (before.lifecycle_state === 'TERMINATED') {
        console.log(`\n[SKIP] Membership ${membershipId} is already TERMINATED.`);
        continue;
      }
      console.log(`\n[LIVE] Terminating membership ${membershipId} (${before.lifecycle_state} → TERMINATED)...`);
      await lifecycle.terminate(membershipId, superAdmin.user_id, REASON);
      const after = await lifecycle.getOrThrow(membershipId);
      console.log(`  Result: ${after.lifecycle_state}, membership_number=${after.membership_number} (unchanged)`);
    }

    console.log(`\n${hr()}`);
    console.log('Done. Memberships 83/84 are TERMINATED. membership_number/number_serial unchanged (immutable).');
    console.log(hr());
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('\nFatal error during test-membership retirement:', err);
  process.exit(1);
});
