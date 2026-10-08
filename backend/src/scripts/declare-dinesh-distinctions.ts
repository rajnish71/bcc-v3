// backend/src/scripts/declare-dinesh-distinctions.ts
//
// One-off, Management-approved: declare the six Bio-Data distinctions for
// Dinesh Mawar Saxena (user 85) through the canonical declare path
// (PhotographicDistinctionsService.declare = the holder declare action).
// Requires migration 0128 to be applied first. Identity-pinned; idempotent
// (an existing DECLARED entry, e.g. AFIAP, is left alone); dry run by default.
//
// Usage (server, backend/ as cwd):
//   npx ts-node -r tsconfig-paths/register src/scripts/declare-dinesh-distinctions.ts
//   npx ts-node -r tsconfig-paths/register src/scripts/declare-dinesh-distinctions.ts --apply

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { db } from '../database/db';
import { PhotographicDistinctionsService } from '../modules/identity/distinctions/photographic-distinctions.service';

const USER_ID = 85;
const USERNAME = 'dinesh';
// institution code / distinction code (catalogue keys, in display order)
const WANTED: Array<[string, string]> = [
  ['IIPC', 'AIIPC'],
  ['FIAP', 'AFIAP'],
  ['FIP', 'FFIP'],
  ['ICS', 'HON_FICS'],
  ['FIP', 'FIP_5STAR'],
  ['IIPC', 'IIPC_PLATINUM'],
];

async function main() {
  const apply = process.argv.includes('--apply');
  const user = await db.selectFrom('users').select(['id', 'username']).where('id', '=', USER_ID).executeTakeFirst();
  if (!user || user.username !== USERNAME) throw new Error('Identity pin mismatch -- aborting, nothing written.');

  const plan: Array<{ key: string; distinctionId: number; current: string | null }> = [];
  for (const [inst, code] of WANTED) {
    const d = await db
      .selectFrom('photographic_distinctions as d')
      .innerJoin('photographic_institutions as i', 'i.id', 'd.institution_id')
      .select(['d.id as id', 'd.is_active as da', 'i.is_active as ia'])
      .where('i.code', '=', inst)
      .where('d.code', '=', code)
      .executeTakeFirst();
    if (!d) throw new Error(`Catalogue entry ${inst}/${code} missing -- apply migration 0128 first. Nothing written.`);
    if (!d.da || !d.ia) throw new Error(`Catalogue entry ${inst}/${code} is inactive -- aborting.`);
    const cur = await db
      .selectFrom('user_photographic_distinctions')
      .select('state')
      .where('user_id', '=', USER_ID)
      .where('distinction_id', '=', Number(d.id))
      .executeTakeFirst();
    plan.push({ key: `${inst}/${code}`, distinctionId: Number(d.id), current: cur?.state ?? null });
  }
  for (const p of plan) console.log(`${p.key.padEnd(18)} id=${p.distinctionId} current=${p.current ?? 'none'}`);
  const blocked = plan.filter((p) => p.current === 'REMOVED');
  if (blocked.length) throw new Error(`Administratively REMOVED entries need an admin restore: ${blocked.map((b) => b.key).join(', ')}`);
  if (!apply) {
    console.log('\nDRY RUN OK. Re-run with --apply to declare the missing entries.');
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(PhotographicDistinctionsService);
    for (const p of plan) {
      if (p.current === 'DECLARED') continue;
      await svc.declare(USER_ID, p.distinctionId);
      console.log(`declared ${p.key}`);
    }
  } finally {
    await app.close();
  }
  const after = await db
    .selectFrom('user_photographic_distinctions')
    .select(['distinction_id', 'state'])
    .where('user_id', '=', USER_ID)
    .execute();
  console.log('after:', JSON.stringify(after));
  const declared = after.filter((a) => a.state === 'DECLARED').length;
  if (declared !== WANTED.length) throw new Error(`Expected ${WANTED.length} DECLARED, found ${declared}.`);
  console.log('OK: six DECLARED structured distinctions.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('declare-dinesh-distinctions.ts failed:', err);
    process.exit(1);
  });
