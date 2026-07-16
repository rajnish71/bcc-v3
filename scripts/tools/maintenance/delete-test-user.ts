import 'reflect-metadata';
import { db } from '../../../backend/src/database/db';
import { sql } from 'kysely';
import { handlers, DependencyReport } from './handlers';
import * as readline from 'readline';
import { createHash } from 'crypto';
import { 
  checkSafety, 
  getSafetyMetadata, 
  getReassignmentTarget, 
  getCountsForUser 
} from './inspect-user';

class DryRunRollbackError extends Error {
  constructor() {
    super('Dry run transaction rollback');
  }
}

function hr(char = '─', width = 72): string {
  return char.repeat(width);
}

function pad(s: string | null | undefined, w: number): string {
  return (s ?? '—').padEnd(w).slice(0, w);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function main() {
  // 1. Safety check
  checkSafety();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
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
    console.error(`\n[ERROR] No target users found. Specify target users using --user, --users, --all-terminated, or --all-test-users.`);
    await db.destroy();
    process.exit(1);
  }

  // Verify users exist in database
  const existingUsers = await db
    .selectFrom('users')
    .select(['id', 'username', 'email', 'full_name'])
    .where('id', 'in', userIds)
    .execute();

  const existingIds = existingUsers.map(u => u.id);

  if (existingIds.length === 0) {
    console.error(`\n[ERROR] None of the specified user IDs exist in the database.`);
    await db.destroy();
    process.exit(1);
  }

  const metadata = await getSafetyMetadata(db);

  // 2. Validate FK Coverage
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

  const unhandledFKs = dbFKs.filter(fk => !handledFKs.has(fk));

  if (unhandledFKs.length > 0) {
    console.error(`\n[FATAL] Unhandled FK detected: ${unhandledFKs.join(', ')}`);
    console.error(`Cleanup aborted. Every FK must be explicitly handled by the handlers registry.`);
    await db.destroy();
    process.exit(1);
  }

  // 3. Compile manifest counts
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

  console.log(`\n${hr('=')}`);
  console.log(`PRE-PRODUCTION MAINTENANCE TOOL: DELETION UTILITY`);
  console.log(`Timestamp    : ${metadata.timestamp}`);
  console.log(`Database     : ${metadata.database}`);
  console.log(`Migration v  : ${metadata.latestMigration}`);
  console.log(`Git Commit   : ${metadata.gitCommit}`);
  console.log(`Target Users : ${existingIds.join(', ')}`);
  console.log(`FK validation coverage: ${dbFKs.length}/${dbFKs.length} handled.`);
  console.log(`Dry-Run Mode : ${dryRun ? 'YES (No changes will be written)' : 'NO (REAL DELETION)'}`);
  console.log(`${hr('=')}`);

  // Check permanent membership warning
  const membershipDetails = await db
    .selectFrom('memberships')
    .select(['user_id', 'membership_number', 'number_serial'])
    .where('user_id', 'in', existingIds)
    .execute();

  const numberedMemberships = membershipDetails.filter(m => m.membership_number !== null || m.number_serial !== null);

  if (numberedMemberships.length > 0) {
    console.log(`\nBLOCKING WARNING: Targeted users contain memberships with permanent BCC numbers:`);
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
    }
  }

  // Print Structured Deletion Manifest
  console.log(`\n${hr('-')}`);
  console.log('DELETION MANIFEST');
  console.log(`${hr('-')}`);
  
  let grandTotal = 0;
  for (const user of existingUsers) {
    console.log(`\nUser ${user.id} (${user.username ?? 'no username'})`);
    console.log(hr('.'));
    const { tableCounts, total } = getCountsForUser(inspectReport, user.id);
    for (const [table, count] of Object.entries(tableCounts)) {
      if (table !== 'users') {
        console.log(`  ${pad(table, 26)} ............. ${count}`);
      }
    }
    console.log(`  ${pad('users', 26)} ............. 1`);
    console.log(hr('.'));
    console.log(`  TOTAL RECORDS ............ ${total}`);
    grandTotal += total;
  }
  if (existingUsers.length > 1) {
    console.log(`\nGRAND TOTAL RECORDS FOR DELETION: ${grandTotal}`);
  }
  console.log(`${hr('-')}\n`);

  // 4. Short-circuit if dry-run (100% read-only)
  if (dryRun) {
    let preservedTriggerSql: string | null = null;
    let shaBefore = '';
    if (numberedMemberships.length > 0) {
      try {
        const triggerRow = await sql<{ 'SQL Original Statement': string }>`SHOW CREATE TRIGGER trg_prevent_numbered_membership_delete`.execute(db);
        if (triggerRow.rows.length > 0) {
          preservedTriggerSql = triggerRow.rows[0]['SQL Original Statement'];
          shaBefore = sha256(preservedTriggerSql);
          console.log(`[TRIGGER] Verified trigger trg_prevent_numbered_membership_delete exists.`);
          console.log(`[TRIGGER] Trigger SHA256 (before): ${shaBefore}`);
        }
      } catch (err) {
        console.warn('[TRIGGER] Warning: Trigger trg_prevent_numbered_membership_delete not found in database.');
      }
    }

    console.log(`${hr('-')}`);
    console.log(`DRY RUN COMPLETED: Completely read-only simulation. No database changes or trigger modifications occurred.`);
    console.log(`${hr('-')}\n`);

    await db.destroy();
    process.exit(0);
  }

  // 5. Interactive Confirmation (Only for real execution)
  const confirmationText = existingIds.length === 1 
    ? `I UNDERSTAND THIS WILL PERMANENTLY DELETE USER ${existingIds[0]}` 
    : `I UNDERSTAND THIS WILL PERMANENTLY DELETE USERS ${existingIds.sort().join(',')}`;

  console.log(`To proceed with the actual deletion of the specified users, you must confirm:`);
  console.log(`Type exactly: ${confirmationText}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('> ', resolve);
  });
  rl.close();

  if (answer.trim() !== confirmationText) {
    console.error('\n[FATAL] Confirmation mismatch. Deletion aborted.');
    await db.destroy();
    process.exit(1);
  }

  // 6. Real execution trigger preservation & drop
  let preservedTriggerSql: string | null = null;
  let shaBefore = '';
  let triggerDropped = false;

  try {
    if (numberedMemberships.length > 0) {
      const triggerRow = await sql<{ 'SQL Original Statement': string }>`SHOW CREATE TRIGGER trg_prevent_numbered_membership_delete`.execute(db);
      if (triggerRow.rows.length > 0) {
        preservedTriggerSql = triggerRow.rows[0]['SQL Original Statement'];
        shaBefore = sha256(preservedTriggerSql);
        console.log(`\n[TRIGGER] Preserved trigger trg_prevent_numbered_membership_delete definition successfully.`);
        console.log(`[TRIGGER] Trigger SHA256 (before): ${shaBefore}`);
      }

      console.log('[TRIGGER] Temporarily dropping trigger trg_prevent_numbered_membership_delete...');
      await sql`DROP TRIGGER IF EXISTS trg_prevent_numbered_membership_delete`.execute(db);
      triggerDropped = true;
    }

    const startTime = process.hrtime();
    let transactionCommitted = false;

    // 7. Execute transaction
    try {
      console.log('\nBEGIN TRANSACTION');
      await db.transaction().execute(async (trx) => {
        console.log(`\n${hr('-')}`);
        console.log(`Executing deletion registry handlers...`);
        console.log(`${hr('-')}`);

        // Call domain handlers in safe reverse-dependency order
        console.log('[TX] Calling PhotoHandler.delete()...');
        await handlers[4].delete(trx, existingIds);

        console.log('[TX] Calling EventHandler.delete()...');
        await handlers[5].delete(trx, existingIds);

        console.log('[TX] Calling MembershipHandler.delete()...');
        await handlers[1].delete(trx, existingIds);

        console.log('[TX] Calling NotificationHandler.delete()...');
        await handlers[2].delete(trx, existingIds);

        console.log('[TX] Calling ProfileHandler.delete()...');
        await handlers[3].delete(trx, existingIds);

        console.log('[TX] Calling AuthHandler.delete()...');
        await handlers[0].delete(trx, existingIds);

        console.log('[TX] Deleting target user records from users table...');
        await trx
          .deleteFrom('users')
          .where('id', 'in', existingIds)
          .execute();

        console.log(`[TX] Deletion logic finished successfully.`);
      });

      transactionCommitted = true;
      const diff = process.hrtime(startTime);
      const elapsedSec = (diff[0] + diff[1] / 1e9).toFixed(2);
      console.log(`\nElapsed: ${elapsedSec} sec`);
      console.log('COMMIT');

    } catch (err) {
      const diff = process.hrtime(startTime);
      const elapsedSec = (diff[0] + diff[1] / 1e9).toFixed(2);
      console.log(`\nElapsed: ${elapsedSec} sec`);
      console.log('ROLLBACK');
      throw err;
    }

    // 8. Restore trigger
    let shaAfter = '';
    if (triggerDropped && preservedTriggerSql) {
      console.log('\n[TRIGGER] Restoring trigger trg_prevent_numbered_membership_delete...');
      await sql.raw(preservedTriggerSql).execute(db);
      console.log('[TRIGGER] Trigger successfully restored.');
      triggerDropped = false;

      // Verify checksum
      const triggerRowAfter = await sql<{ 'SQL Original Statement': string }>`SHOW CREATE TRIGGER trg_prevent_numbered_membership_delete`.execute(db);
      if (triggerRowAfter.rows.length > 0) {
        shaAfter = sha256(triggerRowAfter.rows[0]['SQL Original Statement']);
      }
    }

    // 9. Post-deletion orphan integrity check
    let orphansDetected = false;
    for (const userId of existingIds) {
      for (const handler of handlers) {
        const handlerReport = await handler.inspect(db, [userId]);
        if (Object.keys(handlerReport).length > 0) {
          orphansDetected = true;
          console.warn(`[WARNING] Orphan records remaining in: ${Object.keys(handlerReport).join(', ')} for user ${userId}`);
        }
      }
    }

    // 10. Print integrity summary
    console.log(`\n${hr('=')}`);
    console.log(`Database Integrity Verification`);
    console.log(`${hr('-')}`);
    console.log(`✓ FK validation passed`);
    if (preservedTriggerSql) {
      console.log(`✓ Trigger restored`);
      if (shaBefore === shaAfter) {
        console.log(`✓ Trigger checksum verified (SHA256 matches: ${shaAfter})`);
      } else {
        console.log(`✗ Trigger checksum MISMATCH!`);
      }
    }
    console.log(`✓ Transaction committed`);
    if (!orphansDetected) {
      console.log(`✓ No orphan records detected`);
    } else {
      console.log(`✗ Orphan records detected!`);
    }
    console.log(`${hr('=')}\n`);

  } catch (err) {
    console.error('\nFatal error during user deletion execution:', err);
    
    console.log(`\n${hr('=')}`);
    console.log(`Database Integrity Verification`);
    console.log(`${hr('-')}`);
    console.log(`✓ FK validation passed`);
    console.log(`✗ Transaction rolled back`);
    console.log(`${hr('=')}\n`);
    
    await db.destroy();
    process.exit(1);
  } finally {
    // Restoration fallback if error occurred before restoring inside the main block
    if (triggerDropped && preservedTriggerSql) {
      console.log('\n[TRIGGER] Restoring trigger trg_prevent_numbered_membership_delete (fallback)...');
      try {
        await sql.raw(preservedTriggerSql).execute(db);
        console.log('[TRIGGER] Trigger successfully restored.');
      } catch (err) {
        console.error('[FATAL] Failed to restore trigger in fallback block:', err);
      }
    }
  }

  // 11. Clean database pool
  await db.destroy();
}

main().catch((err) => {
  console.error('\nUnhandled exception in main execution block:', err);
  process.exit(1);
});
