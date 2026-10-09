// backend/src/scripts/senior-carry-over-dry-run.ts
//
// WP6-A: READ-ONLY dry run of the future WP6-B carry-over of the eight frozen
// legacy MANUAL Senior records into Senior Status Overlays. SELECTs only --
// there is no --apply mode and no write path in this file or in the planner.
// Exit code: 0 = PASS (READY_FOR_WP6_B), 2 = FAIL.
//
// Usage (server, backend/ as cwd):
//   npx ts-node -r tsconfig-paths/register src/scripts/senior-carry-over-dry-run.ts

import 'dotenv/config';
import { db } from '../database/db';
import { formatCarryOverDryRun, planSeniorCarryOver } from '../modules/membership/recognition/senior-carry-over.dry-run';

(async () => {
  try {
    const result = await planSeniorCarryOver();
    console.log(formatCarryOverDryRun(result));
    process.exitCode = result.verdict === 'PASS' ? 0 : 2;
  } catch (err) {
    console.error('DRY RUN ERROR (no writes were performed):', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
