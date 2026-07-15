// scripts/tools/admin-bablu-activate.ts
//
// ============================================================
// ONE-TIME ADMINISTRATIVE ACTIVATION UTILITY
// Bablu Khan — Identity Completion & Membership Activation
// ============================================================
//
// PURPOSE
//   Completes Bablu Khan's membership activation after migration 0070
//   has set his identity fields (username=bablukhan, identity_status=
//   IDENTITY_COMPLETE).
//
//   This script handles the membership lifecycle portion through the
//   canonical MembershipLifecycleService so that:
//     • audit logging is correct
//     • MEMBERSHIP_ACTIVATED notification fires
//     • expiry calculation uses the class entitlements engine
//     • BCCTempXXXXX identifier is issued (Amendment 001-B)
//
//   The script detects Bablu Khan's current membership state and
//   takes the appropriate action:
//     APPROVED  -> lifecycle.activate()
//     PENDING   -> workflow.recordStageDecision(COORDINATOR APPROVED)
//                  (BASIC_MEMBER is OPERATIONAL class, COORDINATOR
//                   is the only required stage, which fires approve()
//                   which auto-activates via AUTO_AFTER_APPROVAL)
//     ACTIVE    -> already done; report verification only
//     no record -> apply() then recordStageDecision(COORDINATOR APPROVED)
//
// PRE-CONDITIONS
//   • Migration 0070 applied (Bablu Khan identity fields set)
//   • Backend code change deployed (activate() issues BCCTemp)
//   • Backend .env available at /var/www/bcc-v3/backend/.env
//
// USAGE (run from the backend directory):
//
//   Dry run:
//     cd /var/www/bcc-v3/backend
//     DOTENV_CONFIG_PATH=.env \
//       npx ts-node -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/admin-bablu-activate.ts --dry-run
//
//   Live run:
//     cd /var/www/bcc-v3/backend
//     DOTENV_CONFIG_PATH=.env \
//       npx ts-node -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/admin-bablu-activate.ts
//
//   Re-run safety: lifecycle.activate() guards on requireState(['APPROVED']).
//   An already-ACTIVE membership throws ConflictException → script reports
//   the final state and exits cleanly.

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../backend/src/app.module';
import { MembershipLifecycleService } from '../../backend/src/modules/membership/lifecycle/membership-lifecycle.service';
import { ApplicationWorkflowService } from '../../backend/src/modules/membership/application/application-workflow.service';
import { db } from '../../backend/src/database/db';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Report {
  generatedAt: string;
  mode: 'DRY_RUN' | 'LIVE';
  bablukhan: {
    userId: number | null;
    username: string | null;
    fullName: string | null;
    identityStatus: string | null;
    membershipId: number | null;
    membershipState: string | null;
    actionTaken: string;
    tempIdentifierAssigned: string | null;
    expiryDate: string | null;
    result: 'OK' | 'ALREADY_ACTIVE' | 'SKIPPED' | 'FAIL' | 'DRY_RUN';
    error?: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BABLU_FULL_NAME = 'Bablu Khan';
const BABLU_USERNAME  = 'bablukhan';

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function hr(char = '─', width = 72): string {
  return char.repeat(width);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`\n${hr()}`);
  console.log('BCC Admin — Bablu Khan Identity Completion & Membership Activation');
  console.log(`Mode : ${isDryRun ? 'DRY RUN  (no changes will be written)' : 'LIVE'}`);
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(hr());

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const lifecycle = app.get(MembershipLifecycleService);
  const workflow  = app.get(ApplicationWorkflowService);

  // ── Find Bablu Khan ────────────────────────────────────────────────────────

  const bablukhan = await db
    .selectFrom('users')
    .select(['id', 'username', 'full_name', 'identity_status', 'email'])
    .where((eb) =>
      eb.or([
        eb('username', '=', BABLU_USERNAME),
        eb('full_name', '=', BABLU_FULL_NAME),
      ])
    )
    .executeTakeFirst();

  if (!bablukhan) {
    console.error(
      `\n[FATAL] Could not find a user with username="${BABLU_USERNAME}" or full_name="${BABLU_FULL_NAME}".`,
    );
    console.error('Ensure migration 0070 has been applied before running this script.');
    await app.close();
    process.exit(1);
  }

  console.log(`\nFound user:`);
  console.log(`  ID             : ${bablukhan.id}`);
  console.log(`  Username       : ${bablukhan.username ?? '(not set)'}`);
  console.log(`  Full Name      : ${bablukhan.full_name}`);
  console.log(`  Email          : ${bablukhan.email}`);
  console.log(`  Identity Status: ${bablukhan.identity_status}`);

  // ── Identity guard ─────────────────────────────────────────────────────────

  if (bablukhan.identity_status !== 'IDENTITY_COMPLETE') {
    console.error(
      `\n[FATAL] identity_status is "${bablukhan.identity_status}", not IDENTITY_COMPLETE.`,
    );
    console.error('Apply migration 0070 first, then re-run this script.');
    await app.close();
    process.exit(1);
  }

  // ── Find membership ────────────────────────────────────────────────────────

  const membership = await db
    .selectFrom('memberships as m')
    .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
    .select([
      'm.id',
      'm.uuid',
      'm.lifecycle_state',
      'm.membership_class_id',
      'm.membership_number',
      'mc.name as class_name',
      'mc.activation_mode',
    ])
    .where('m.user_id', '=', bablukhan.id)
    .where('m.owner_type', '=', 'INDIVIDUAL')
    .orderBy('m.created_at', 'desc')
    .executeTakeFirst();

  console.log(`\nMembership:`);
  console.log(`  Record         : ${membership ? `ID ${membership.id} (${membership.uuid})` : 'NONE'}`);
  console.log(`  State          : ${membership?.lifecycle_state ?? 'N/A'}`);
  console.log(`  Class          : ${membership?.class_name ?? 'N/A'}`);
  console.log(`  Activation Mode: ${membership?.activation_mode ?? 'N/A'}`);
  console.log(`  Current Number : ${membership?.membership_number ?? '(none)'}`);

  // ── Find super admin (actor for approval stage) ────────────────────────────

  // Use the lowest-ID user with SUPER_ADMIN role as the approving actor.
  // This is required by ApplicationWorkflowService.recordStageDecision()
  // which logs actor_user_id.
  const superAdmin = await db
    .selectFrom('user_roles as ur')
    .innerJoin('users as u', 'u.id', 'ur.user_id')
    .select(['ur.user_id', 'u.username'])
    .where('ur.role', '=', 'SUPER_ADMIN')
    .orderBy('ur.user_id', 'asc')
    .executeTakeFirst();

  if (!superAdmin) {
    console.error('\n[FATAL] No SUPER_ADMIN user found in user_roles. Cannot record approval stage.');
    await app.close();
    process.exit(1);
  }

  console.log(`\nApproval Actor : user_id=${superAdmin.user_id} (${superAdmin.username})`);

  // ── Report init ────────────────────────────────────────────────────────────

  const report: Report = {
    generatedAt: new Date().toISOString(),
    mode: isDryRun ? 'DRY_RUN' : 'LIVE',
    bablukhan: {
      userId:                bablukhan.id,
      username:              bablukhan.username,
      fullName:              bablukhan.full_name,
      identityStatus:        bablukhan.identity_status,
      membershipId:          membership?.id ?? null,
      membershipState:       membership?.lifecycle_state ?? null,
      actionTaken:           '',
      tempIdentifierAssigned: null,
      expiryDate:            null,
      result:                'OK',
    },
  };

  // ── State machine ──────────────────────────────────────────────────────────

  if (membership?.lifecycle_state === 'ACTIVE') {
    console.log('\n[INFO] Membership is already ACTIVE. Verifying temp identifier...');

    const tempId = await db
      .selectFrom('membership_temp_identifiers')
      .select(['temp_identifier', 'status'])
      .where('membership_id', '=', membership.id)
      .executeTakeFirst();

    report.bablukhan.actionTaken           = 'NO_ACTION (already ACTIVE)';
    report.bablukhan.tempIdentifierAssigned = tempId?.temp_identifier ?? membership.membership_number ?? null;
    report.bablukhan.result                = 'ALREADY_ACTIVE';

    console.log(`  Temp identifier: ${tempId?.temp_identifier ?? membership.membership_number ?? '(none)'}`);
    console.log('  No further action required.');

  } else if (isDryRun) {
    const wouldDo =
      !membership                                  ? 'apply() + recordStageDecision(COORDINATOR APPROVED) → ACTIVE' :
      membership.lifecycle_state === 'PENDING'     ? 'recordStageDecision(COORDINATOR APPROVED) → ACTIVE'           :
      membership.lifecycle_state === 'APPROVED'    ? 'lifecycle.activate()'                                         :
                                                     `UNEXPECTED STATE: ${membership.lifecycle_state}`;

    report.bablukhan.actionTaken           = `[DRY_RUN] Would: ${wouldDo}`;
    report.bablukhan.tempIdentifierAssigned = `[TBD — BCCTemp${String(membership?.id ?? '?????').padStart(5, '0')}]`;
    report.bablukhan.result                = 'DRY_RUN';

    console.log(`\n[DRY RUN] Would perform: ${wouldDo}`);

  } else {
    // ── Live path ────────────────────────────────────────────────────────────

    try {
      let membershipId = membership?.id;
      let tempIdentifier: string | null = null;
      let finalState: string = 'UNKNOWN';

      if (!membership) {
        // No membership record — create one via apply()
        console.log('\n[LIVE] No membership found. Creating PENDING application via apply()...');

        const basicClass = await db
          .selectFrom('membership_classes')
          .select('id')
          .where('code', '=', 'BASIC_MEMBER')
          .executeTakeFirstOrThrow();

        const { id } = await lifecycle.apply({
          ownerType:         'INDIVIDUAL',
          userId:            bablukhan.id,
          membershipClassId: basicClass.id,
        });

        membershipId  = id;
        finalState    = 'PENDING';
        report.bablukhan.membershipId = id;

        console.log(`  Created membership ID: ${id}`);
      }

      if (!membershipId) throw new Error('membershipId is null after apply()');

      // PENDING → APPROVED (+ AUTO_AFTER_APPROVAL → ACTIVE)
      const refreshed = await lifecycle.getOrThrow(membershipId);

      if (refreshed.lifecycle_state === 'PENDING') {
        console.log('\n[LIVE] Membership is PENDING. Recording COORDINATOR APPROVED stage...');

        const decision = await workflow.recordStageDecision({
          membershipId,
          stage:       'COORDINATOR',
          decision:    'APPROVED',
          actorUserId: superAdmin.user_id,
          note:        'Administrative activation — authorized by Rajnish K. Khare (BCC Super Admin), 2026-07-15.',
        });

        finalState = decision.applicationState;
        console.log(`  Post-stage state: ${finalState}`);
      }

      // APPROVED → ACTIVE (only if AUTO_AFTER_APPROVAL didn't already handle it)
      const afterStage = await lifecycle.getOrThrow(membershipId);

      if (afterStage.lifecycle_state === 'APPROVED') {
        console.log('\n[LIVE] Membership is APPROVED. Calling lifecycle.activate()...');

        const { membershipNumber } = await lifecycle.activate(membershipId, {
          type:   'ADMIN',
          userId: superAdmin.user_id,
        });

        tempIdentifier = membershipNumber; // BCCTemp per Amendment 001-B
        finalState     = 'ACTIVE';
        console.log(`  Activated. Temp identifier: ${tempIdentifier}`);
      }

      // Verify final state
      const final = await lifecycle.getOrThrow(membershipId);
      finalState = final.lifecycle_state;

      if (!tempIdentifier) {
        // Fetch from temp identifiers table (auto-activated by approve())
        const t = await db
          .selectFrom('membership_temp_identifiers')
          .select('temp_identifier')
          .where('membership_id', '=', membershipId)
          .where('status', '=', 'ACTIVE')
          .executeTakeFirst();
        tempIdentifier = t?.temp_identifier ?? final.membership_number ?? null;
      }

      const rawExpiry = final.expires_at as unknown as string | null;

      report.bablukhan.membershipState        = finalState;
      report.bablukhan.tempIdentifierAssigned = tempIdentifier;
      report.bablukhan.expiryDate             = rawExpiry ? formatDate(new Date(rawExpiry)) : null;
      report.bablukhan.actionTaken            = `Activated successfully → ${finalState}`;
      report.bablukhan.result                 = 'OK';

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      report.bablukhan.actionTaken = 'FAILED — see error field';
      report.bablukhan.result      = 'FAIL';
      report.bablukhan.error       = msg;
      console.error(`\n[ERROR] ${msg}`);
    }
  }

  // ── Console summary ────────────────────────────────────────────────────────

  console.log(`\n${hr()}`);
  console.log('RESULT SUMMARY');
  console.log(hr());
  console.log(`User           : ${report.bablukhan.fullName} (ID ${report.bablukhan.userId})`);
  console.log(`Username       : ${report.bablukhan.username}`);
  console.log(`Identity Status: ${report.bablukhan.identityStatus}`);
  console.log(`Membership ID  : ${report.bablukhan.membershipId ?? 'N/A'}`);
  console.log(`Final State    : ${report.bablukhan.membershipState ?? 'N/A'}`);
  console.log(`Temp Identifier: ${report.bablukhan.tempIdentifierAssigned ?? 'N/A'}`);
  console.log(`Expiry Date    : ${report.bablukhan.expiryDate ?? 'N/A (lifetime or not set)'}`);
  console.log(`Action Taken   : ${report.bablukhan.actionTaken}`);
  console.log(`Result         : ${report.bablukhan.result}`);
  if (report.bablukhan.error) console.log(`Error          : ${report.bablukhan.error}`);

  // ── JSON report ────────────────────────────────────────────────────────────

  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const stamp      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const suffix     = isDryRun ? '-dry-run' : '';
  const reportPath = path.join(reportsDir, `admin-bablu-activate-${stamp}${suffix}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`\nReport         : ${reportPath}`);
  console.log(hr());

  await app.close();
  process.exit(report.bablukhan.result === 'FAIL' ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFatal error during Bablu Khan activation:', err);
  process.exit(1);
});
