// backend/src/modules/membership/current-members.query.ts
//
// Canonical public "current members" count: memberships in the ACTIVE
// lifecycle state (MEM-006 MEMBERSHIP LIFECYCLE) owned by an individual.
// GROUP-owned relationship rows are entity records, not members; a Family/
// Corporate member's own record is INDIVIDUAL (0105) and counts.
//
// Single source for every public member total:
//   GET /api/v1/stats                     (Home, About)
//   GET /api/v1/photographers/stats       (Photographers Directory)

import { db } from '../../database/db';

export async function countCurrentMembers(): Promise<number> {
  const row = await db
    .selectFrom('memberships')
    .select(eb => eb.fn.count<number>('id').as('cnt'))
    .where('lifecycle_state', '=', 'ACTIVE')
    .where('owner_type', '=', 'INDIVIDUAL')
    .executeTakeFirst();
  return Number(row?.cnt ?? 0);
}
