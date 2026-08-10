// scripts/tools/legacy-reconciliation-gita-abhishek.ts
//
// ============================================================
// FINAL PRE-2019 HISTORICAL MEMBERSHIP RECONCILIATION
// Gita Rani Gupta & Abhishek Shivhare
// ============================================================
//
// Authority: LEGACY-001-ADDENDUM-001 (Final Pre-2019 Historical Membership
// Verification Window v1.0), approved by Rajnish K. Khare, 2026-08-11.
// Final verification deadline for the window: 15 August 2026, 11:59 PM IST.
//
// PURPOSE
//   Both individuals registered in V3 on 2026-08-10 and are currently
//   BASIC_MEMBER. The BCC administrator has personally confirmed both were
//   associated with / members of Bhopal Camera Club before 31 December
//   2019. Neither appears in the historical source register used by
//   migrations 0078/0080 -- this is not a claim they were omitted from
//   that register, but a separate, individually-authorized reconciliation
//   per the addendum.
//
// WHAT THIS SCRIPT DOES
//   For each of the two memberships:
//     1. Calls the existing, unmodified MembershipLifecycleService
//        .changeClass() -- the same admin mechanism exposed at
//        POST /:id/upgrade -- to move membership_class_id
//        BASIC_MEMBER -> LEGACY_MEMBER. This naturally sets expires_at to
//        NULL (LEGACY_MEMBER has is_renewable=FALSE; see computeExpiry()).
//        This logs a CLASS_CHANGED entry to membership_audit_log with the
//        addendum's required reason string.
//     2. Updates users.year_joined_bcc to 2019, but ONLY if it is currently
//        NULL or greater than 2019 (a genuinely earlier value is
//        preserved), logging the correction via the existing
//        logIdentityAudit() helper.
//
// WHAT THIS SCRIPT DOES NOT DO
//   - does not touch membership_number or number_serial (protected by
//     trg_membership_number_immutable regardless)
//   - does not modify migrations 0078/0080, schema_migrations, or
//     LEGACY-001 itself
//   - does not introduce any new service/controller code -- it calls the
//     existing changeClass() and logIdentityAudit() exactly as production
//     code already does
//   - does not touch any other membership or user
//
// PRE-CONDITIONS (script aborts if any fail)
//   - membership 85: user_id=78, username=gita, lifecycle_state=ACTIVE,
//     membership_class=BASIC_MEMBER, membership_number=BCC20260800057,
//     number_serial=57
//   - membership 86: user_id=80, username=abk_shivhare,
//     lifecycle_state=ACTIVE, membership_class=BASIC_MEMBER,
//     membership_number=BCC20260800058, number_serial=58
//   - LEGACY_MEMBER class exists in membership_classes
//   - at least one SUPER_ADMIN user exists (used as audit actor)
//
// USAGE (run from the backend directory on the production server):
//
//   Dry run:
//     cd /var/www/bcc-v3/backend
//     NODE_PATH=/var/www/bcc-v3/backend/node_modules DOTENV_CONFIG_PATH=.env \
//       npx ts-node --transpile-only -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/legacy-reconciliation-gita-abhishek.ts --dry-run
//
//   Live run:
//     cd /var/www/bcc-v3/backend
//     NODE_PATH=/var/www/bcc-v3/backend/node_modules DOTENV_CONFIG_PATH=.env \
//       npx ts-node --transpile-only -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/legacy-reconciliation-gita-abhishek.ts

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../backend/src/app.module';
import { MembershipLifecycleService } from '../../backend/src/modules/membership/lifecycle/membership-lifecycle.service';
import { logIdentityAudit } from '../../backend/src/modules/identity/shared/identity-audit.util';
import { db } from '../../backend/src/database/db';

const RECONCILIATION_REASON =
  'Final pre-2019 historical membership reconciliation — administrator confirmed.';

interface Target {
  membershipId: number;
  expectedUserId: number;
  expectedUsername: string;
  expectedMembershipNumber: string;
  expectedNumberSerial: number;
  label: string;
}

const TARGETS: Target[] = [
  {
    membershipId: 85,
    expectedUserId: 78,
    expectedUsername: 'gita',
    expectedMembershipNumber: 'BCC20260800057',
    expectedNumberSerial: 57,
    label: 'Gita Rani Gupta (user 78)',
  },
  {
    membershipId: 86,
    expectedUserId: 80,
    expectedUsername: 'abk_shivhare',
    expectedMembershipNumber: 'BCC20260800058',
    expectedNumberSerial: 58,
    label: 'Abhishek Shivhare (user 80)',
  },
];

function hr(char = '─', width = 72): string {
  return char.repeat(width);
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`\n${hr()}`);
  console.log('BCC Admin — Final Legacy reconciliation: Gita & Abhishek');
  console.log('Authority: LEGACY-001-ADDENDUM-001 (deadline 2026-08-15 23:59 IST)');
  console.log(`Mode : ${isDryRun ? 'DRY RUN  (no changes will be written)' : 'LIVE'}`);
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(hr());

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const lifecycle = app.get(MembershipLifecycleService);

  try {
    // ── Preconditions ──────────────────────────────────────────────────
    const legacyClass = await db
      .selectFrom('membership_classes')
      .select(['id', 'code', 'is_closed'])
      .where('code', '=', 'LEGACY_MEMBER')
      .executeTakeFirst();
    if (!legacyClass) throw new Error('LEGACY_MEMBER class not found in membership_classes.');

    const memberships = await db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .innerJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .select([
        'm.id', 'm.user_id', 'm.lifecycle_state', 'm.membership_number', 'm.number_serial',
        'm.membership_class_id', 'mc.code as class_code',
        'u.username', 'u.full_name', 'u.year_joined_bcc',
      ])
      .where('m.id', 'in', TARGETS.map((t) => t.membershipId))
      .execute();

    if (memberships.length !== TARGETS.length) {
      throw new Error(`Expected ${TARGETS.length} memberships, found ${memberships.length}.`);
    }
    const memById = Object.fromEntries(memberships.map((m) => [m.id, m]));

    console.log('\nBEFORE:');
    for (const t of TARGETS) {
      const m = memById[t.membershipId];
      if (!m) throw new Error(`Membership ${t.membershipId} not found.`);
      if (m.user_id !== t.expectedUserId) {
        throw new Error(`Membership ${t.membershipId} belongs to user ${m.user_id}, expected ${t.expectedUserId}. Aborting.`);
      }
      if (m.username !== t.expectedUsername) {
        throw new Error(`Membership ${t.membershipId} user has username "${m.username}", expected "${t.expectedUsername}". Aborting.`);
      }
      if (m.lifecycle_state !== 'ACTIVE') {
        throw new Error(`Membership ${t.membershipId} is ${m.lifecycle_state}, not ACTIVE. Aborting.`);
      }
      if (m.class_code !== 'BASIC_MEMBER') {
        throw new Error(`Membership ${t.membershipId} is class ${m.class_code}, not BASIC_MEMBER. Aborting.`);
      }
      if (m.membership_number !== t.expectedMembershipNumber) {
        throw new Error(`Membership ${t.membershipId} membership_number is "${m.membership_number}", expected "${t.expectedMembershipNumber}". Aborting.`);
      }
      if (m.number_serial !== t.expectedNumberSerial) {
        throw new Error(`Membership ${t.membershipId} number_serial is ${m.number_serial}, expected ${t.expectedNumberSerial}. Aborting.`);
      }
      console.log(
        `  ${t.label}: membership=${m.id} class=${m.class_code} number=${m.membership_number} ` +
        `serial=${m.number_serial} year_joined_bcc=${m.year_joined_bcc} state=${m.lifecycle_state} — OK`,
      );
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

    if (isDryRun) {
      console.log('\n[DRY RUN] Would perform, per target:');
      for (const t of TARGETS) {
        const m = memById[t.membershipId];
        console.log(`  ${t.label}:`);
        console.log(`    changeClass(${t.membershipId}, LEGACY_MEMBER[id=${legacyClass.id}], 'UPGRADE', ...) -> expires_at becomes NULL`);
        const wouldSetYear = m.year_joined_bcc == null || m.year_joined_bcc > 2019;
        console.log(`    year_joined_bcc: ${m.year_joined_bcc} -> ${wouldSetYear ? 2019 : `${m.year_joined_bcc} (preserved, already <= 2019)`}`);
      }
      await app.close();
      process.exit(0);
    }

    // ── Live path ──────────────────────────────────────────────────────
    for (const t of TARGETS) {
      const m = memById[t.membershipId];

      console.log(`\n[LIVE] Reconciling ${t.label}...`);

      await lifecycle.changeClass(
        t.membershipId,
        legacyClass.id,
        'UPGRADE',
        RECONCILIATION_REASON,
        superAdmin.user_id,
      );
      console.log(`  membership_class_id -> LEGACY_MEMBER (${legacyClass.id}); expires_at -> NULL`);

      if (m.year_joined_bcc == null || m.year_joined_bcc > 2019) {
        await db
          .updateTable('users')
          .set({ year_joined_bcc: 2019 })
          .where('id', '=', t.expectedUserId)
          .execute();

        await logIdentityAudit({
          actorId: superAdmin.user_id,
          targetUserId: t.expectedUserId,
          actionType: 'YEAR_JOINED_BCC_NORMALIZED',
          oldValue: { year_joined_bcc: m.year_joined_bcc },
          newValue: { year_joined_bcc: 2019 },
          reason:
            `${RECONCILIATION_REASON} No reliable earlier historical join date on record; ` +
            'normalized to the 2019-12-31 administrative boundary date per LEGACY-001-ADDENDUM-001 Section 6.',
        });
        console.log(`  year_joined_bcc: ${m.year_joined_bcc} -> 2019`);
      } else {
        console.log(`  year_joined_bcc: ${m.year_joined_bcc} (already <= 2019, preserved, not modified)`);
      }
    }

    // ── AFTER snapshot ────────────────────────────────────────────────
    const after = await db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .innerJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .select([
        'm.id', 'm.lifecycle_state', 'm.membership_number', 'm.number_serial',
        'm.expires_at', 'mc.code as class_code', 'u.username', 'u.year_joined_bcc',
      ])
      .where('m.id', 'in', TARGETS.map((t) => t.membershipId))
      .execute();

    console.log(`\n${hr()}`);
    console.log('AFTER:');
    for (const row of after) {
      console.log(
        `  membership=${row.id} (${row.username}) class=${row.class_code} number=${row.membership_number} ` +
        `serial=${row.number_serial} expires_at=${row.expires_at} year_joined_bcc=${row.year_joined_bcc}`,
      );
    }
    console.log(hr());
    console.log('Done.');
  } finally {
    await app.close();
  }

  // `db` is a module-level mysql2 pool (backend/src/database/db.ts) that
  // NestFactory's app.close() does not manage, so the process would
  // otherwise hang on the open pool handle after finishing all work.
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFatal error during Legacy reconciliation:', err);
  process.exit(1);
});
