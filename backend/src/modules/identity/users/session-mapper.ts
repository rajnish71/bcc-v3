// backend/src/modules/identity/users/session-mapper.ts

import { sql } from 'kysely';
import { db } from '../../../database/db';

export type PortalState = 'ADMIN' | 'EDITOR' | 'MODERATOR' | 'MEMBER' | 'USER';

/**
 * Resolves the presentation-oriented header state for an authenticated user.
 * Priority cascade: ADMIN -> EDITOR -> MODERATOR -> MEMBER -> USER.
 */
export async function resolvePortalState(userId: number): Promise<PortalState> {
  // 1. Query active roles (filtered by validity timestamps)
  const activeRoles = await db
    .selectFrom('user_roles')
    .innerJoin('roles', 'roles.id', 'user_roles.role_id')
    .select('roles.name as roleName')
    .where('user_roles.user_id', '=', userId)
    .where(sql<boolean>`user_roles.valid_from <= NOW()`)
    .where(sql<boolean>`(user_roles.valid_until IS NULL OR user_roles.valid_until > NOW())`)
    .execute();

  const roleNames = activeRoles.map((r) => r.roleName);

  // Priority 1: ADMIN (Super Admin, Platform Admin, Coordinator)
  const isAdmin = roleNames.some((name) =>
    ['Super Admin', 'Platform Admin', 'Coordinator'].includes(name),
  );
  if (isAdmin) {
    return 'ADMIN';
  }

  // Priority 2: EDITOR (Content Editor)
  const isEditor = roleNames.includes('Content Editor');
  if (isEditor) {
    return 'EDITOR';
  }

  // Priority 3: MODERATOR (Moderator)
  const isModerator = roleNames.includes('Moderator');
  if (isModerator) {
    return 'MODERATOR';
  }

  // Priority 4: MEMBER (Active individual membership)
  const activeMembership = await db
    .selectFrom('memberships')
    .select('id')
    .where('user_id', '=', userId)
    .where('lifecycle_state', '=', 'ACTIVE')
    .executeTakeFirst();

  if (activeMembership) {
    return 'MEMBER';
  }

  // Priority 5: USER (authenticated fall-through)
  return 'USER';
}
