// scripts/tools/repair-approved-memberships.ts
//
// ============================================================
// ONE-TIME MIGRATION RECOVERY UTILITY
// Activation-mode fix — migration 0069 support
// ============================================================
//
// PURPOSE
//   Activates every INDIVIDUAL membership that is currently
//   stuck in lifecycle_state = 'APPROVED' because its class
//   has activation_mode = AUTO_AFTER_APPROVAL and the fix
//   in migration 0069 was not yet deployed when the coordinator
//   approved it.
//
//   SAFETY GATE — identity completion
//   A membership is activated ONLY when ALL three conditions
//   hold simultaneously:
//     1. memberships.lifecycle_state = 'APPROVED'
//     2. membership_classes.activation_mode = 'AUTO_AFTER_APPROVAL'
//     3. users.identity_status = 'IDENTITY_COMPLETE'
//
//   If condition 3 is not met the member is recorded as SKIPPED.
//   Their membership remains APPROVED. They must complete Identity
//   Completion first; the repair can then be re-run to pick them up.
//
//   All transitions execute through MembershipLifecycleService.activate()
//   so that audit logging, membership numbering, expiry calculation,
//   and MEMBERSHIP_ACTIVATED notifications all run through the canonical
//   lifecycle engine. No state is modified directly.
//
// PRE-CONDITIONS
//   • Migration 0068 applied (class_entitlements seeded with
//     renewal_term_months — activate() throws without it)
//   • Migration 0069 applied (activation_mode column present)
//   • Backend .env available at /var/www/bcc-v3/backend/.env
//
// USAGE (run from the backend directory):
//
//   Dry run — inspect report before committing:
//     cd /var/www/bcc-v3/backend
//     DOTENV_CONFIG_PATH=.env \
//       npx ts-node -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/repair-approved-memberships.ts --dry-run
//
//   Live run — activates all eligible candidates:
//     cd /var/www/bcc-v3/backend
//     DOTENV_CONFIG_PATH=.env \
//       npx ts-node -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/repair-approved-memberships.ts
//
//   Re-run safety: activate() guards on requireState(['APPROVED']).
//   Already-ACTIVE memberships throw ConflictException → recorded as FAIL,
//   not corrupted.
//
// OUTPUT
//   • Console: per-membership result, skipped block, summary
//   • JSON:    scripts/tools/reports/repair-<timestamp>[-dry-run].json
//
// REPORT FIELDS
//   membershipId                  numeric DB id
//   membershipUuid                uuid
//   userId                        users.id (null for GROUP memberships)
//   username                      chosen BCC username (null = identity pending)
//   displayName                   users.full_name
//   identityStatus                IDENTITY_COMPLETE | IDENTITY_PENDING
//   membershipClass               e.g. "Basic Member"
//   previousLifecycleState        always APPROVED
//   newLifecycleState             ACTIVE | APPROVED (unchanged) | APPROVED [skipped]
//   membershipNumberAssigned      BCCTempXXXXX assigned by numbering engine
//   expiryDate                    from class_entitlements renewal_term_months
//   notificationSent              MEMBERSHIP_ACTIVATED channels
//   result                        OK | SKIPPED | FAIL | DRY_RUN
//   skipReason                    set on SKIPPED entries
//   error                         set on FAIL entries
//
// ARCHIVAL
//   After a successful live run this file can be moved to
//   scripts/tools/archive/ as historical evidence of the repair.
//   It is not part of the application's permanent operational surface.

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../backend/src/app.module';
import { MembershipLifecycleService } from '../../backend/src/modules/membership/lifecycle/membership-lifecycle.service';
import { db } from '../../backend/src/database/db';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportEntry {
  membershipId: number;
  membershipUuid: string;
  userId: number | null;
  username: string | null;
  displayName: string | null;
  identityStatus: string | null;
  membershipClass: string;
  previousLifecycleState: string;
  newLifecycleState: string;
  membershipNumberAssigned: string | null;
  expiryDate: string | null;
  notificationSent: string;
  result: 'OK' | 'SKIPPED' | 'FAIL' | 'DRY_RUN';
  skipReason?: string;
  error?: string;
}

interface Report {
  generatedAt: string;
  mode: 'DRY_RUN' | 'LIVE';
  summary: {
    candidates: number;
    activated: number;
    skipped_identity_incomplete: number;
    failed: number;
  };
  entries: ReportEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function pad(s: string | null | undefined, w: number): string {
  return (s ?? '—').padEnd(w).slice(0, w);
}

function hr(char = '─', width = 72): string {
  return char.repeat(width);
}

const SKIP_REASON =
  'Identity not complete. User must complete Identity Completion before membership activation.';

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`\n${hr()}`);
  console.log('BCC Membership Repair — APPROVED → ACTIVE (migration 0069 recovery)');
  console.log(`Mode : ${isDryRun ? 'DRY RUN  (no changes will be written)' : 'LIVE'}`);
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(hr());

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const lifecycle = app.get(MembershipLifecycleService);

  // ── Candidate query ────────────────────────────────────────────────────────
  // Fetches ALL APPROVED + AUTO_AFTER_APPROVAL memberships regardless of
  // identity_status. The identity gate is applied in the processing loop so
  // skipped members appear explicitly in the report.
  //
  // LEFT JOIN on users: GROUP memberships have no user_id and will surface
  // with null user fields. They reach activate() and fail naturally, making
  // the gap visible in the report rather than silently hiding it.

  const candidates = await db
    .selectFrom('memberships as m')
    .innerJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
    .leftJoin('users as u', 'u.id', 'm.user_id')
    .select([
      'm.id',
      'm.uuid',
      'm.user_id',
      'm.lifecycle_state',
      'm.membership_class_id',
      'u.username',
      'u.full_name',
      'u.identity_status',
      'mc.name as class_name',
    ])
    .where('m.lifecycle_state', '=', 'APPROVED')
    .where('mc.activation_mode', '=', 'AUTO_AFTER_APPROVAL')
    .orderBy('m.id', 'asc')
    .execute();

  console.log(`\nCandidates (APPROVED + AUTO_AFTER_APPROVAL): ${candidates.length}`);

  if (candidates.length === 0) {
    console.log('Nothing to repair.\n');
    await app.close();
    return;
  }

  // ── Process candidates ─────────────────────────────────────────────────────

  const entries: ReportEntry[] = [];
  let activated = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const m of candidates) {
    const entry: ReportEntry = {
      membershipId:           m.id,
      membershipUuid:         m.uuid,
      userId:                 m.user_id ?? null,
      username:               m.username ?? null,
      displayName:            m.full_name ?? null,
      identityStatus:         m.identity_status ?? null,
      membershipClass:        m.class_name,
      previousLifecycleState: 'APPROVED',
      newLifecycleState:      '',
      membershipNumberAssigned: null,
      expiryDate:             null,
      notificationSent:       '',
      result:                 'OK',
    };

    // ── Identity gate ────────────────────────────────────────────────────────
    // INDIVIDUAL memberships whose user has not completed Identity Completion
    // are skipped. APPROVED stays untouched. The member must finish identity
    // setup; re-running this script afterward will pick them up.
    // (GROUP memberships have user_id = null and pass this gate to reach
    // activate(), which will fail for GROUP memberships as expected.)

    const isIdentityIncomplete =
      m.user_id != null && m.identity_status !== 'IDENTITY_COMPLETE';

    if (isIdentityIncomplete) {
      entry.newLifecycleState  = 'APPROVED (unchanged — identity incomplete)';
      entry.notificationSent   = 'none — skipped';
      entry.result             = 'SKIPPED';
      entry.skipReason         = SKIP_REASON;
      skipped++;
      entries.push(entry);
      continue;
    }

    // ── Dry-run projection ───────────────────────────────────────────────────

    if (isDryRun) {
      const termRow = await db
        .selectFrom('class_entitlements')
        .select('entitlement_value')
        .where('membership_class_id', '=', m.membership_class_id!)
        .where('entitlement_key', '=', 'renewal_term_months')
        .executeTakeFirst();

      const projectedExpiry = termRow
        ? (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + parseInt(termRow.entitlement_value, 10));
            return `${formatDate(d)} [projected]`;
          })()
        : '[renewal_term_months not configured — activate() would throw]';

      entry.newLifecycleState        = 'ACTIVE [projected]';
      entry.membershipNumberAssigned = '[TBD — assigned on activation]';
      entry.expiryDate               = projectedExpiry;
      entry.notificationSent         = 'MEMBERSHIP_ACTIVATED (EMAIL + IN_APP) [would dispatch]';
      entry.result                   = 'DRY_RUN';
      entries.push(entry);
      continue;
    }

    // ── Live activation ──────────────────────────────────────────────────────
    // All lifecycle behaviour executes inside MembershipLifecycleService.activate().
    // No direct DB writes are performed here.

    try {
      const { membershipNumber } = await lifecycle.activate(m.id, { type: 'SYSTEM' });

      const refreshed = await db
        .selectFrom('memberships')
        .select(['lifecycle_state', 'expires_at'])
        .where('id', '=', m.id)
        .executeTakeFirstOrThrow();

      const rawExpiry = refreshed.expires_at as unknown as string | null;

      entry.newLifecycleState        = refreshed.lifecycle_state;
      entry.membershipNumberAssigned = membershipNumber;
      entry.expiryDate               = rawExpiry ? formatDate(new Date(rawExpiry)) : null;
      entry.notificationSent         = 'MEMBERSHIP_ACTIVATED (EMAIL + IN_APP)';
      entry.result                   = 'OK';
      activated++;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.newLifecycleState = 'APPROVED (unchanged)';
      entry.notificationSent  = 'none — activation failed';
      entry.result            = 'FAIL';
      entry.error             = msg;
      failed++;
    }

    entries.push(entry);
  }

  // ── Console report ─────────────────────────────────────────────────────────

  const COL = {
    id:    6,
    user:  20,
    disp:  20,
    istat: 18,
    cls:   14,
    prev:  10,
    next:  26,
    num:   16,
    exp:   22,
    notif: 36,
  };

  console.log(`\n${hr('─', 192)}`);
  console.log(
    `${pad('ID',          COL.id)}  ` +
    `${pad('Username',    COL.user)}  ` +
    `${pad('Display Name',COL.disp)}  ` +
    `${pad('Identity',    COL.istat)}  ` +
    `${pad('Class',       COL.cls)}  ` +
    `${pad('Prev',        COL.prev)}  ` +
    `${pad('New State',   COL.next)}  ` +
    `${pad('Number',      COL.num)}  ` +
    `${pad('Expiry',      COL.exp)}  ` +
    `${pad('Notification',COL.notif)}  Result`,
  );
  console.log(hr('─', 192));

  for (const e of entries) {
    const row =
      `${pad(String(e.membershipId),        COL.id)}  ` +
      `${pad(e.username,                    COL.user)}  ` +
      `${pad(e.displayName,                 COL.disp)}  ` +
      `${pad(e.identityStatus,              COL.istat)}  ` +
      `${pad(e.membershipClass,             COL.cls)}  ` +
      `${pad(e.previousLifecycleState,      COL.prev)}  ` +
      `${pad(e.newLifecycleState,           COL.next)}  ` +
      `${pad(e.membershipNumberAssigned,    COL.num)}  ` +
      `${pad(e.expiryDate,                  COL.exp)}  ` +
      `${pad(e.notificationSent,            COL.notif)}  ` +
      `${e.result}`;
    console.log(row);
    if (e.skipReason) console.log(`${''.padEnd(COL.id + 2)}  ↳ SKIPPED: ${e.skipReason}`);
    if (e.error)      console.log(`${''.padEnd(COL.id + 2)}  ↳ ERROR:   ${e.error}`);
  }

  // ── JSON report ────────────────────────────────────────────────────────────

  const report: Report = {
    generatedAt: new Date().toISOString(),
    mode:        isDryRun ? 'DRY_RUN' : 'LIVE',
    summary: {
      candidates:                  candidates.length,
      activated:                   isDryRun ? 0 : activated,
      skipped_identity_incomplete: skipped,
      failed:                      isDryRun ? 0 : failed,
    },
    entries,
  };

  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const stamp      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const suffix     = isDryRun ? '-dry-run' : '';
  const reportPath = path.join(reportsDir, `repair-approved-memberships-${stamp}${suffix}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  // ── Summary block ──────────────────────────────────────────────────────────

  console.log(`\n${hr()}`);
  console.log('SUMMARY');
  console.log(hr());
  console.log(`Candidates                  : ${candidates.length}`);
  if (isDryRun) {
    console.log(`Would activate              : ${entries.filter(e => e.result === 'DRY_RUN').length}`);
    console.log(`Would skip (identity incmp) : ${skipped}`);
    console.log(`Mode                        : DRY RUN — no changes were made`);
  } else {
    console.log(`Activated                   : ${activated}`);
    console.log(`Skipped (identity incmp)    : ${skipped}`);
    console.log(`Failed                      : ${failed}`);
    if (skipped > 0) {
      console.log('');
      console.log('Skipped members must complete Identity Completion.');
      console.log('Re-run this utility after they have done so.');
    }
    if (failed > 0) {
      console.log('');
      console.log('Failed memberships remain APPROVED. Check report for error details.');
    }
  }
  console.log(`Report                      : ${reportPath}`);
  console.log(hr());

  await app.close();
  // Exit 1 only on hard failures — skips are expected and do not signal error.
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFatal error during repair:', err);
  process.exit(1);
});
