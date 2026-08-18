// backend/src/modules/membership/shared/membership-audit.util.ts
//
// Single insert helper for membership_audit_log, mirroring
// identity/shared/identity-audit.util.ts's pattern exactly. Deliberately
// NOT a NestJS-injectable service -- thin wrapper around one insert, no
// state, no reason to go through DI.
//
// MEM-006 P3: this stays fully separate from identity_audit_log. RBAC/
// identity events never land here; membership lifecycle/recognition/
// entitlement events never land there. Keep it that way.

import type { Kysely } from 'kysely';
import { db, type DB } from '../../../database/db';

export interface MembershipAuditEntry {
  membershipId: number | null;
  eventType: string;
  actorType: 'SYSTEM' | 'ADMIN' | 'MEMBER';
  actorUserId?: number | null;
  oldValue?: unknown;
  newValue?: unknown;
  notes?: string | null;
}

// executor defaults to the module-level `db` for all pre-existing callers;
// callers running inside a transaction pass their `trx` so this insert
// commits/rolls back atomically with the rest of the transaction (F-013,
// mirrors identity/shared/identity-audit.util.ts's executor pattern).
export async function logMembershipAudit(
  entry: MembershipAuditEntry,
  executor: Kysely<DB> = db,
): Promise<void> {
  await executor
    .insertInto('membership_audit_log')
    .values({
      membership_id: entry.membershipId,
      event_type: entry.eventType,
      actor_type: entry.actorType,
      actor_user_id: entry.actorUserId ?? null,
      old_value: entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : null,
      new_value: entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
      notes: entry.notes ?? null,
    })
    .execute();
}
