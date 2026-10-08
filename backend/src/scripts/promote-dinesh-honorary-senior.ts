// backend/src/scripts/promote-dinesh-honorary-senior.ts
//
// One-off, owner-authorised promotion (Rajnish K. Khare, Human Authority):
//   Dinesh Mawar Saxena (@dinesh, user 85, membership 92)
//   HONORARY_MEMBER -> HONORARY_SENIOR_MEMBER
//
// Uses the existing audited RecognitionService path only:
//   revoke()  -> old row becomes HISTORICAL, RECOGNITION_REVOKED audit row
//   assign()  -> new ACTIVE row, RECOGNITION_ASSIGNED audit row
// The DB unique active_lock guarantees a single active recognition. The two
// steps are not one transaction in the service, so if assign() fails the
// previous HONORARY_MEMBER recognition is re-assigned (compensation).
// Membership class, number and any Senior overlay are never touched.
//
// SAFE BY DEFAULT: without --apply this is a dry run (reads only).
//
// Usage (server, backend/ as cwd):
//   npx ts-node -r tsconfig-paths/register src/scripts/promote-dinesh-honorary-senior.ts
//   npx ts-node -r tsconfig-paths/register src/scripts/promote-dinesh-honorary-senior.ts --apply

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { db } from '../database/db';
import { RecognitionService } from '../modules/membership/recognition/recognition.service';

const ACTOR_USER_ID = 1; // Rajnish Khare, Super Admin
const MEMBERSHIP_ID = 92;
const USER_ID = 85;
const USERNAME = 'dinesh';
const REASON =
  'Promoted from Honorary Member to Honorary Senior Member by Management; authorised by Rajnish K. Khare (Human Authority).';

async function snapshot() {
  const m = await db
    .selectFrom('memberships as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['m.id', 'm.user_id', 'm.lifecycle_state', 'm.owner_type', 'm.membership_class_id', 'm.membership_number', 'u.username'])
    .where('m.id', '=', MEMBERSHIP_ID)
    .executeTakeFirst();
  const recs = await db
    .selectFrom('member_recognitions')
    .select(['id', 'recognition_code', 'track', 'status', 'start_date', 'end_date', 'assigned_by_user_id'])
    .where('membership_id', '=', MEMBERSHIP_ID)
    .orderBy('id')
    .execute();
  return { m, recs };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const before = await snapshot();
  console.log(`mode=${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log('membership:', JSON.stringify(before.m));
  console.log('recognitions before:', JSON.stringify(before.recs));

  const m = before.m;
  if (!m || Number(m.user_id) !== USER_ID || m.username !== USERNAME) throw new Error('Identity pin mismatch -- aborting, nothing written.');
  if (m.lifecycle_state !== 'ACTIVE' || m.owner_type !== 'INDIVIDUAL') throw new Error('Membership not ACTIVE/INDIVIDUAL -- aborting.');
  const active = before.recs.filter((r) => r.status === 'ACTIVE');
  if (active.length !== 1 || active[0].recognition_code !== 'HONORARY_MEMBER' || active[0].track !== 'MANUAL') {
    throw new Error(`Expected exactly one ACTIVE MANUAL HONORARY_MEMBER, found ${JSON.stringify(active)} -- aborting.`);
  }
  if (!apply) {
    console.log('\nDRY RUN OK. Re-run with --apply to execute.');
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const recognitions = app.get(RecognitionService);
    await recognitions.revoke(MEMBERSHIP_ID, `Superseded by promotion to HONORARY_SENIOR_MEMBER. ${REASON}`, ACTOR_USER_ID);
    try {
      await recognitions.assign(MEMBERSHIP_ID, 'HONORARY_SENIOR_MEMBER', 'MANUAL', REASON, ACTOR_USER_ID);
    } catch (err) {
      console.error('assign failed -- restoring HONORARY_MEMBER:', err);
      await recognitions.assign(MEMBERSHIP_ID, 'HONORARY_MEMBER', 'MANUAL', 'Restored after failed promotion attempt.', ACTOR_USER_ID);
      throw err;
    }
  } finally {
    await app.close();
  }

  const after = await snapshot();
  console.log('recognitions after:', JSON.stringify(after.recs));
  const nowActive = after.recs.filter((r) => r.status === 'ACTIVE');
  if (nowActive.length !== 1 || nowActive[0].recognition_code !== 'HONORARY_SENIOR_MEMBER') throw new Error('Post-check failed.');
  console.log('OK: single ACTIVE HONORARY_SENIOR_MEMBER.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('promote-dinesh-honorary-senior.ts failed:', err);
    process.exit(1);
  });
