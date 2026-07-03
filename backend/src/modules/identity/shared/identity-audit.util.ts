// backend/src/modules/identity/shared/identity-audit.util.ts
//
// Single insert helper shared by RegistrationService and RbacService so
// every identity-domain write lands in identity_audit_log the same way.
// Deliberately NOT a NestJS-injectable service -- it's a thin wrapper
// around one insert, no state, no reason to go through DI.
//
// MEM-006 P3: this table has no FK to memberships/membership_classes/
// member_recognitions. Keep it that way -- never add a membership-side
// column here, even a nullable one "for convenience".

import { db } from '../../../database/db';

export interface IdentityAuditEntry {
  actorId: number | null;
  targetUserId: number;
  actionType: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

export async function logIdentityAudit(entry: IdentityAuditEntry): Promise<void> {
  await db
    .insertInto('identity_audit_log')
    .values({
      actor_id: entry.actorId,
      target_user_id: entry.targetUserId,
      action_type: entry.actionType,
      old_value: entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : null,
      new_value: entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
      reason: entry.reason ?? null,
    })
    .execute();
}
