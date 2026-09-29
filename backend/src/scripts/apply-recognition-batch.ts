// backend/src/scripts/apply-recognition-batch.ts
//
// One-off, owner-authorised recognition batch (Rajnish K. Khare).
//   Honorary Mentor : Anil Bhati, Dr Sanjay Kumar Shukla
//   Honorary Member : Prakash Hatvalne, Dinesh Mawar, Uttam Gurjar,
//                     Kshitij Patle, Syed Taha Pasha
//   Senior (MANUAL owner exception): Meeta Athavale, Ankit Tiwari, Rahil Khan,
//                     Robin Dutta, Akshita Jain, Khalid Khan, Prashant Parate,
//                     Ashok Kumar Bathri
// Prakash and Syed hold Honorary only (single active recognition rule; the
// owner chose Honorary over Senior). Founding members are excluded.
//
// SAFE BY DEFAULT: without --apply this is a dry run (reads only). With
// --apply, every grant runs inside ONE transaction -- all or none -- and the
// notification emails are sent only after it commits.
//
// Each entry pins the expected username, so a drifted/mistyped membership id
// aborts the run instead of granting to the wrong person.
//
// Usage (server, backend/ as cwd):
//   npx ts-node -r tsconfig-paths/register src/scripts/apply-recognition-batch.ts            # dry run
//   npx ts-node -r tsconfig-paths/register src/scripts/apply-recognition-batch.ts --apply    # execute

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { sql } from 'kysely';
import { db } from '../database/db';
import { RecognitionService } from '../modules/membership/recognition/recognition.service';

const ACTOR_USER_ID = 1; // Rajnish Khare, Super Admin

type Code = 'HONORARY_MENTOR' | 'HONORARY_MEMBER' | 'SENIOR_MEMBER';

const HONORARY_REASON = 'Honorary recognition awarded by Management; authorised by Rajnish K. Khare (Human Authority).';
const SENIOR_REASON =
  'Senior Member: owner-authorised exception recorded by Rajnish K. Khare (date of birth not on record; not system-qualified).';
const PRAKASH_SYED_NOTE = ' Senior Member status also authorised; Honorary holds precedence (single active recognition).';

const BATCH: Array<{ membershipId: number; userId: number; username: string; code: Code; reason: string }> = [
  { membershipId: 15, userId: 20, username: 'anilbhati', code: 'HONORARY_MENTOR', reason: HONORARY_REASON },
  { membershipId: 22, userId: 27, username: 'sanjaykumarshukla', code: 'HONORARY_MENTOR', reason: HONORARY_REASON },
  { membershipId: 16, userId: 21, username: 'prakashhatvalne', code: 'HONORARY_MEMBER', reason: HONORARY_REASON + PRAKASH_SYED_NOTE },
  { membershipId: 92, userId: 85, username: 'dinesh', code: 'HONORARY_MEMBER', reason: HONORARY_REASON },
  { membershipId: 18, userId: 23, username: 'uttamgurjar', code: 'HONORARY_MEMBER', reason: HONORARY_REASON },
  { membershipId: 11, userId: 16, username: 'kshitijpatle', code: 'HONORARY_MEMBER', reason: HONORARY_REASON },
  { membershipId: 20, userId: 25, username: 'syedtahapasha', code: 'HONORARY_MEMBER', reason: HONORARY_REASON + PRAKASH_SYED_NOTE },
  { membershipId: 12, userId: 17, username: 'meetaathavale', code: 'SENIOR_MEMBER', reason: SENIOR_REASON },
  { membershipId: 13, userId: 18, username: 'ankittiwari', code: 'SENIOR_MEMBER', reason: SENIOR_REASON },
  { membershipId: 14, userId: 19, username: 'rahilkhan', code: 'SENIOR_MEMBER', reason: SENIOR_REASON },
  { membershipId: 17, userId: 22, username: 'robindutta', code: 'SENIOR_MEMBER', reason: SENIOR_REASON },
  { membershipId: 23, userId: 28, username: 'akshitajain', code: 'SENIOR_MEMBER', reason: SENIOR_REASON },
  { membershipId: 77, userId: 69, username: 'khalidkhan832', code: 'SENIOR_MEMBER', reason: SENIOR_REASON },
  { membershipId: 80, userId: 70, username: 'ppparate', code: 'SENIOR_MEMBER', reason: SENIOR_REASON },
  { membershipId: 81, userId: 74, username: 'ashokbathri', code: 'SENIOR_MEMBER', reason: SENIOR_REASON },
];

async function main() {
  const apply = process.argv.includes('--apply');

  // Which database is this? Host from config, name from the live connection.
  // Host and database name only -- never credentials or a connection string.
  const dbRow = await sql<{ name: string | null }>`SELECT DATABASE() AS name`.execute(db);
  console.log(
    `Database: host=${process.env.DB_HOST ?? '(unset)'} name=${dbRow.rows[0]?.name ?? '(none)'} | mode=${apply ? 'APPLY' : 'DRY RUN'}\n`,
  );

  // ---- Preflight (reads only) ------------------------------------------
  const problems: string[] = [];
  for (const b of BATCH) {
    const row = await db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['m.lifecycle_state', 'm.owner_type', 'u.username', 'u.id as user_id'])
      .where('m.id', '=', b.membershipId)
      .executeTakeFirst();
    if (!row) { problems.push(`membership ${b.membershipId}: not found`); continue; }
    if (Number(row.user_id) !== b.userId) problems.push(`membership ${b.membershipId}: user_id is ${row.user_id}, expected ${b.userId}`);
    if (row.username !== b.username) problems.push(`membership ${b.membershipId}: username is ${row.username}, expected ${b.username}`);
    if (row.lifecycle_state !== 'ACTIVE') problems.push(`membership ${b.membershipId}: state ${row.lifecycle_state}`);
    if (row.owner_type !== 'INDIVIDUAL') problems.push(`membership ${b.membershipId}: owner_type ${row.owner_type}`);

    const active = await db
      .selectFrom('member_recognitions')
      .select(['recognition_code', 'track'])
      .where('membership_id', '=', b.membershipId)
      .where('status', '=', 'ACTIVE')
      .executeTakeFirst();
    console.log(
      `${b.username.padEnd(20)} membership ${String(b.membershipId).padEnd(4)} -> ${b.code.padEnd(16)} | current: ${active ? `${active.recognition_code} (${active.track})` : 'none'}`,
    );
  }
  if (problems.length) {
    console.error('\nPREFLIGHT FAILED -- nothing written:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  if (!apply) {
    console.log(`\nDRY RUN OK (${BATCH.length} grants). Re-run with --apply to execute.`);
    return;
  }

  // ---- Apply: one transaction, emails only after commit ----------------
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const recognitions = app.get(RecognitionService);
    const results = await db.transaction().execute(async (trx) => {
      const out: Array<{ code: Code; userId: number | null; outcome: string }> = [];
      for (const b of BATCH) {
        const r = await recognitions.grantInTransaction(trx, {
          membershipId: b.membershipId,
          recognitionCode: b.code,
          track: 'MANUAL',
          reason: b.reason,
          actorUserId: ACTOR_USER_ID,
        });
        out.push({ code: b.code, userId: r.userId, outcome: r.outcome });
      }
      return out;
    });
    console.log('\nCommitted:', JSON.stringify(results));

    for (const r of results) {
      if (r.outcome === 'NOOP' || r.userId === null) continue;
      try {
        await recognitions.notifyGrant(r.userId, r.code);
      } catch (err) {
        console.error(`notification failed for user ${r.userId} (grant is committed):`, err);
      }
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('apply-recognition-batch.ts failed:', err);
    process.exit(1);
  });
