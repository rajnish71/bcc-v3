import 'reflect-metadata';
import { db } from '../../../backend/src/database/db';
import { sql, Kysely } from 'kysely';
import { handlers, DependencyReport } from './handlers';
import { DeletionStep } from './handlers/base';
import { execSync } from 'child_process';
import { DB } from '../../../backend/src/database/db';

function hr(char = '─', width = 72): string {
  return char.repeat(width);
}

function pad(s: string | null | undefined, w: number): string {
  return (s ?? '—').padEnd(w).slice(0, w);
}

export function checkSafety() {
  const isProd = process.env.NODE_ENV === 'production';
  const hasForce = process.argv.includes('--force-preproduction');

  if (isProd && !hasForce) {
    console.error(
      `\n[FATAL] Toolkit safety violation:\n` +
      `NODE_ENV is set to production, but the --force-preproduction flag was not supplied.\n` +
      `Purging user data is forbidden on production without explicit overrides.\n`
    );
    process.exit(1);
  }
}

export async function getSafetyMetadata(db: Kysely<DB>) {
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().slice(0, 10);
  } catch (e) {
    // Ignore git errors if not in a git repo
  }

  const dbNameRow = await sql<{ db: string }>`SELECT DATABASE() as db`.execute(db);
  const database = dbNameRow.rows[0]?.db || 'unknown';

  const migrationRow = await db
    .selectFrom('schema_migrations')
    .select('filename')
    .orderBy('filename', 'desc')
    .limit(1)
    .executeTakeFirst();
  const latestMigration = migrationRow?.filename || 'none';

  return {
    database,
    latestMigration,
    gitCommit,
    timestamp: new Date().toISOString()
  };
}

export async function getReassignmentTarget(db: Kysely<DB>, excludeUserIds: number[]): Promise<number> {
  // Find first active SUPER_ADMIN user
  const admin = await db
    .selectFrom('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.role_id')
    .select('ur.user_id')
    .where('r.name', '=', 'SUPER_ADMIN')
    .where('ur.user_id', 'not in', excludeUserIds)
    .orderBy('ur.user_id', 'asc')
    .executeTakeFirst();

  if (admin) return admin.user_id;

  // Fallback to lowest ID user not in exclude list
  const fallback = await db
    .selectFrom('users')
    .select('id')
    .where('id', 'not in', excludeUserIds)
    .orderBy('id', 'asc')
    .executeTakeFirst();

  if (fallback) return fallback.id;

  throw new Error('Could not find any valid user to reassign references to.');
}

// Helper to get total records count for a user across all inspected tables
export function getCountsForUser(inspectReport: Record<number, DependencyReport>, userId: number) {
  const reportData = inspectReport[userId] || {};
  const tableCounts: Record<string, number> = {};
  let total = 0;

  for (const [table, columns] of Object.entries(reportData)) {
    let tableSum = 0;
    for (const count of Object.values(columns)) {
      tableSum += count;
    }
    if (tableSum > 0) {
      tableCounts[table] = tableSum;
      total += tableSum;
    }
  }

  // Add user record itself to the count
  tableCounts['users'] = 1;
  total += 1;

  return { tableCounts, total };
}

async function main() {
  // If this module is run directly
  if (require.main !== module) return;

  // 1. Safety check
  checkSafety();

  // 2. Parse command line arguments
  const args = process.argv.slice(2);
  const isReport = args.includes('--report');
  const allowPermanentDelete = args.includes('--allow-preproduction-permanent-delete');
  
  let userIds: number[] = [];

  // Parse user/users parameters
  const userIdx = args.findIndex(a => a === '--user');
  const usersIdx = args.findIndex(a => a === '--users');

  if (userIdx !== -1 && args[userIdx + 1]) {
    const parsed = parseInt(args[userIdx + 1].trim(), 10);
    if (!isNaN(parsed)) userIds.push(parsed);
  } else if (usersIdx !== -1 && args[usersIdx + 1]) {
    userIds = args[usersIdx + 1]
      .split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id));
  }

  // Parse bulk cleanup modes
  const allTerminated = args.includes('--all-terminated');
  const allTestUsers = args.includes('--all-test-users');

  // Enumerate users based on flags
  if (allTerminated) {
    const terminated = await db
      .selectFrom('memberships')
      .select('user_id')
      .where('lifecycle_state', '=', 'TERMINATED')
      .where('user_id', 'is not', null)
      .execute();
    userIds.push(...terminated.map(m => m.user_id as number));
  }

  if (allTestUsers) {
    const testUsers = await db
      .selectFrom('users')
      .select('id')
      .where((eb) =>
        eb.or([
          eb('username', 'like', 'test%'),
          eb('username', 'in', ['rkkhare1212', 'raghavc']),
          eb('email', 'like', '%test%'),
          eb('full_name', 'like', '%test%')
        ])
      )
      .execute();
    userIds.push(...testUsers.map(u => u.id));
  }

  // Deduplicate user IDs
  userIds = Array.from(new Set(userIds));

  if (userIds.length === 0) {
    if (isReport) {
      console.log(JSON.stringify({ error: 'No users specified or matched.' }));
    } else {
      console.error(
        `\n[ERROR] No target users found. Specify target users using:\n` +
        `  --user <id>\n` +
        `  --users <id1>,<id2>\n` +
        `  --all-terminated\n` +
        `  --all-test-users\n`
      );
    }
    await db.destroy();
    process.exit(1);
  }

  // 3. Verify users exist in database
  const existingUsers = await db
    .selectFrom('users')
    .select(['id', 'username', 'email', 'full_name'])
    .where('id', 'in', userIds)
    .execute();

  const existingIds = existingUsers.map(u => u.id);

  if (existingIds.length === 0) {
    if (isReport) {
      console.log(JSON.stringify({ error: 'None of the specified users exist in the database.' }));
    } else {
      console.error(`\n[ERROR] None of the specified user IDs (${userIds.join(', ')}) exist in the database.`);
    }
    await db.destroy();
    process.exit(1);
  }

  // Fetch Safety Metadata
  const metadata = await getSafetyMetadata(db);

  // 4. Runtime Schema Validation against INFORMATION_SCHEMA
  const fkResult = await sql<{ table_name: string; column_name: string }>`
    SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'users'
  `.execute(db);

  const dbFKs = fkResult.rows.map(r => `${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`);

  const handledFKs = new Set<string>();
  for (const handler of handlers) {
    for (const fk of handler.getHandledFKs()) {
      handledFKs.add(fk.toLowerCase());
    }
  }

  const unhandledFKs: string[] = [];
  for (const fk of dbFKs) {
    if (!handledFKs.has(fk)) {
      unhandledFKs.push(fk);
    }
  }

  if (unhandledFKs.length > 0) {
    if (isReport) {
      console.log(JSON.stringify({ error: `Unhandled FK: ${unhandledFKs.join(', ')}` }));
    } else {
      console.error(`\n[FATAL] Unhandled FK detected:`);
      for (const fk of unhandledFKs) {
        console.error(`  - ${fk}`);
      }
      console.error(`\nCleanup aborted. The deletion utility must refuse execution until every FK is explicitly handled.`);
    }
    await db.destroy();
    process.exit(1);
  }

  // 5. Gather dependency counts from all handlers
  const inspectReport: Record<number, DependencyReport> = {};
  
  for (const userId of existingIds) {
    inspectReport[userId] = {};
    for (const handler of handlers) {
      const handlerReport = await handler.inspect(db, [userId]);
      for (const [table, columns] of Object.entries(handlerReport)) {
        if (!inspectReport[userId][table]) inspectReport[userId][table] = {};
        for (const [col, count] of Object.entries(columns)) {
          inspectReport[userId][table][col] = (inspectReport[userId][table][col] ?? 0) + count;
        }
      }
    }
  }

  // Check if any membership has a permanent number
  const membershipDetails = await db
    .selectFrom('memberships')
    .select(['user_id', 'membership_number', 'number_serial'])
    .where('user_id', 'in', existingIds)
    .execute();

  const numberedMemberships = membershipDetails.filter(m => m.membership_number !== null || m.number_serial !== null);
  const isBlocked = numberedMemberships.length > 0 && !allowPermanentDelete;

  // Compile Deletion Steps dynamically
  const dynamicSteps: DeletionStep[] = [];
  for (const handler of handlers) {
    dynamicSteps.push(...handler.getDeletionSteps());
  }
  // Add target users step as Phase 6
  dynamicSteps.push({
    table: 'users',
    action: 'delete',
    description: 'Delete target users records from the database',
    phase: 6
  });

  // 6. Generate output
  if (isReport) {
    // Generate JSON report output
    const jsonReports = existingUsers.map(user => {
      const { tableCounts, total } = getCountsForUser(inspectReport, user.id);
      
      return {
        user: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        total_records: total,
        tables: tableCounts,
        blocked: numberedMemberships.some(m => m.user_id === user.id) && !allowPermanentDelete
      };
    });

    console.log(JSON.stringify({
      metadata: {
        database: metadata.database,
        latest_migration: metadata.latestMigration,
        git_commit: metadata.gitCommit,
        timestamp: metadata.timestamp,
        fk_validation_coverage: `${dbFKs.length}/${dbFKs.length} handled`
      },
      reports: jsonReports
    }, null, 2));

  } else {
    // Generate human-readable output
    console.log(`\n${hr('=')}`);
    console.log(`PRE-PRODUCTION MAINTENANCE TOOL: DEPENDENCY INSPECTOR`);
    console.log(`Timestamp    : ${metadata.timestamp}`);
    console.log(`Database     : ${metadata.database}`);
    console.log(`Migration v  : ${metadata.latestMigration}`);
    console.log(`Git Commit   : ${metadata.gitCommit}`);
    console.log(`Target Users : ${existingIds.join(', ')}`);
    console.log(`FK validation coverage: ${dbFKs.length}/${dbFKs.length} handled.`);
    console.log(`${hr('=')}`);

    for (const user of existingUsers) {
      console.log(`\nUSER ${user.id} (${user.username ?? 'no username'})`);
      console.log(`  Full Name : ${user.full_name}`);
      console.log(`  Email     : ${user.email ?? 'no email'}`);
      console.log(hr('-'));

      const reportData = inspectReport[user.id] || {};
      
      // Print counts
      console.log(`Identity`);
      printCount(reportData, `Auth Identities`, 'auth_identities');
      printCount(reportData, `Refresh Tokens`, 'refresh_tokens');
      printCount(reportData, `OTP Codes`, 'otp_codes');
      printCount(reportData, `Login History`, 'login_history');
      printCount(reportData, `Account Lockouts`, 'account_lockouts');

      console.log(`\nMembership`);
      printCount(reportData, `Membership Records`, 'memberships');
      printCount(reportData, `Consent Log`, 'membership_consent_log');
      printCount(reportData, `Audit Log`, 'membership_audit_log');
      printCount(reportData, `Number Log`, 'membership_number_log');
      printCount(reportData, `Temp Identifiers`, 'membership_temp_identifiers');
      printCount(reportData, `Recognitions`, 'member_recognitions');
      printCount(reportData, `Entitlements Overrides`, 'individual_overrides');
      printCount(reportData, `Approval Stages`, 'membership_approval_stages');
      printCount(reportData, `Application Docs`, 'membership_application_documents');
      printCount(reportData, `Application Messages`, 'membership_application_messages');
      printCount(reportData, `Payments`, 'payments');

      console.log(`\nPhotos`);
      printCount(reportData, `Photos`, 'photos');
      printCount(reportData, `Comments`, 'photo_comments');
      printCount(reportData, `Reactions`, 'photo_reactions');
      printCount(reportData, `Tag Assignments`, 'photo_tag_assignments');

      console.log(`\nAlbums`);
      printCount(reportData, `Albums`, 'photo_albums');
      printCount(reportData, `Album Items`, 'photo_album_items');
      printCount(reportData, `Album Genres`, 'photo_album_genres');

      console.log(`\nNotifications`);
      printCount(reportData, `In App`, 'in_app_notifications');
      printCount(reportData, `Notification Log`, 'notification_log');
      printCount(reportData, `Notification Prefs`, 'notification_preferences');

      console.log(`\nEvents`);
      printCount(reportData, `Events Created`, 'events');
      printCount(reportData, `Registrations`, 'event_registrations');
      printCount(reportData, `Volunteers`, 'event_volunteers');
      printCount(reportData, `Volunteer Slots`, 'event_volunteer_slots');
      printCount(reportData, `Invite List`, 'event_invite_list');

      console.log(`\nOther`);
      printCount(reportData, `Journal Posts`, 'journal_posts');
      printCount(reportData, `Gallery Spotlight`, 'gallery_spotlight');
      printCount(reportData, `Group Entities`, 'group_entities');
      printCount(reportData, `Group Delegates`, 'group_delegates');
    }

    console.log(`\n${hr('=')}`);
    console.log(`Dynamic Execution Plan`);
    console.log(hr('-'));

    // Consolidate all records count across all targeted users to find what actually has counts > 0
    const consolidatedCounts: Record<string, number> = {};
    for (const userId of existingIds) {
      const { tableCounts } = getCountsForUser(inspectReport, userId);
      for (const [table, count] of Object.entries(tableCounts)) {
        consolidatedCounts[table] = (consolidatedCounts[table] ?? 0) + count;
      }
    }

    // Sort dynamic steps by phase
    const sortedSteps = [...dynamicSteps].sort((a, b) => a.phase - b.phase);
    
    let currentPhase = 0;
    let stepNumber = 1;

    // Resolve reassignment target for representation in execution plan
    let reassignTarget = 'unknown';
    try {
      const targetId = await getReassignmentTarget(db, existingIds);
      const targetUser = await db.selectFrom('users').select('username').where('id', '=', targetId).executeTakeFirst();
      reassignTarget = `user ID ${targetId} (${targetUser?.username || 'no username'})`;
    } catch (e) {}

    for (const step of sortedSteps) {
      // Only print steps where target records actually exist to modify or delete
      const count = consolidatedCounts[step.table] ?? 0;
      if (count > 0 || step.action === 'nullify' || step.action === 'reassign') {
        if (step.phase !== currentPhase) {
          currentPhase = step.phase;
          console.log(`\nPhase ${currentPhase}:`);
        }
        
        let actionStr = step.action.toUpperCase();
        let recordDetails = '';
        if (step.action === 'delete') {
          recordDetails = ` (${count} records)`;
        } else if (step.action === 'reassign') {
          recordDetails = ` to ${reassignTarget}`;
        }

        console.log(`  ${stepNumber++}. [${actionStr}] ${step.table} — ${step.description}${recordDetails}`);
      }
    }

    console.log(`\n${hr('=')}`);

    if (numberedMemberships.length > 0) {
      console.log(`BLOCKING WARNING: Targeted users contain memberships with permanent BCC numbers:`);
      for (const m of numberedMemberships) {
        console.log(`  - User ${m.user_id}: number = ${m.membership_number}, serial = ${m.number_serial}`);
      }
      console.log(`\nDeletions of permanent memberships are BLOCKED by default to prevent accidental data loss.`);
      console.log(`To proceed with deleting these users, you must supply the explicit manual override flag:`);
      console.log(`  --allow-preproduction-permanent-delete\n`);
      
      if (!allowPermanentDelete) {
        console.log(`STATUS: BLOCKED (Requires manual override)`);
        console.log(`${hr('=')}\n`);
        await db.destroy();
        process.exit(1);
      } else {
        console.log(`STATUS: SAFE TO EXECUTE (Manual override --allow-preproduction-permanent-delete supplied)`);
      }
    } else {
      console.log(`STATUS: SAFE TO EXECUTE (READ-ONLY INSPECTION COMPLETED)`);
    }
    console.log(`${hr('=')}\n`);
  }

  // 7. Tear down database pool
  await db.destroy();
}

function printCount(reportData: DependencyReport, label: string, table: string) {
  const columns = reportData[table] || {};
  let sum = 0;
  for (const count of Object.values(columns)) {
    sum += count;
  }
  console.log(`  ${pad(label, 26)} ............. ${sum}`);
}

main().catch((err) => {
  console.error('\nFatal error during user inspection:', err);
  process.exit(1);
});
