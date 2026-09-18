// backend/src/scripts/grant-complimentary-membership.ts
//
// One-off administrative script: invokes
// MembershipAdminService.grantComplimentaryMembership() through a real Nest
// application context (same DI graph, same transactions, same audit/
// notification paths as the HTTP endpoint) so this exceptional courtesy
// grant goes through the exact same code as any future admin-triggered
// grant via POST /api/v1/membership/:id/grant-complimentary.
//
// Usage (run on the server, backend/ as cwd):
//   npx ts-node -r tsconfig-paths/register src/scripts/grant-complimentary-membership.ts <membershipId> <actorUserId> <months> "<reason>"

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MembershipAdminService } from '../modules/membership/admin/membership-admin.service';

async function main() {
  const [membershipIdRaw, actorUserIdRaw, monthsRaw, reason] = process.argv.slice(2);
  if (!membershipIdRaw || !actorUserIdRaw || !monthsRaw || !reason) {
    console.error(
      'Usage: grant-complimentary-membership.ts <membershipId> <actorUserId> <months> "<reason>"',
    );
    process.exit(1);
  }

  const membershipId = parseInt(membershipIdRaw, 10);
  const actorUserId = parseInt(actorUserIdRaw, 10);
  const months = parseInt(monthsRaw, 10);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const service = app.get(MembershipAdminService);
    const result = await service.grantComplimentaryMembership(membershipId, actorUserId, months, reason);
    console.log('Complimentary membership granted:', JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0)) // ComplimentaryExpiryCheckService's setInterval (and the
  // Kysely/mysql2 pool) keep the event loop alive after app.close() in a
  // standalone application context -- force exit once work is done.
  .catch((err) => {
    console.error('grant-complimentary-membership.ts failed:', err);
    process.exit(1);
  });
