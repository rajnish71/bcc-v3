// backend/src/modules/identity/rbac/rbac.service.ts
//
// MEM-006 P3: RBAC is fully decoupled from Membership and Recognition. Every
// query in this file touches only roles / permissions / role_permissions /
// user_roles / identity_audit_log. None of them join, subquery, or in any
// way read memberships / membership_classes / member_recognitions. That's
// not just a style choice -- those tables have no FK path to these ones
// (see 0020_create_rbac_tables.sql), so it isn't even possible by accident.
//
// "Registered User" baseline access (spec 01.1/01.6) is NOT a row in
// `roles`. A user with zero active user_roles rows still has full baseline
// platform access -- that's the default, not a grant. This file only ever
// deals with roles ABOVE that baseline (Coordinator, Judge, Super Admin,
// etc.) per the fixed list in spec 01.5 / seed_0001_rbac_roles.sql. Flagged
// to Rajnish: spec 01.1 says registration creates "a role of Registered
// User" but spec 01.5's role list and the deployed seed both omit it --
// this file assumes that's the correct reading (baseline = absence of
// roles), not an oversight to silently paper over. Confirm or correct.

import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../../../database/db';
import { logIdentityAudit } from '../shared/identity-audit.util';

export interface ActiveRoleAssignment {
  userRoleId: number;
  roleId: number;
  roleName: string;
  category: 'SYSTEM' | 'OPERATIONAL';
  scopeType: string | null;
  scopeId: number | null;
  validFrom: Date;
  validUntil: Date | null;
}

@Injectable()
export class RbacService {
  // -- Reads -------------------------------------------------------------

  /** Active (not expired, already started) role assignments for a user. */
  async getActiveRoles(userId: number): Promise<ActiveRoleAssignment[]> {
    // Raw sql<boolean> fragments for the two date comparisons -- the
    // Generated<ColumnType<Date,...>> double-wrap used for timestamp
    // columns throughout db.ts doesn't resolve cleanly through Kysely's
    // typed .where() overloads for this kind of NOW()-relative comparison.
    // Column names are hardcoded, not user input -- safe as raw sql.
    const rows = await db
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .select([
        'user_roles.id as userRoleId',
        'roles.id as roleId',
        'roles.name as roleName',
        'roles.category as category',
        'user_roles.scope_type as scopeType',
        'user_roles.scope_id as scopeId',
        'user_roles.valid_from as validFrom',
        'user_roles.valid_until as validUntil',
      ])
      .where('user_roles.user_id', '=', userId)
      .where(sql<boolean>`user_roles.valid_from <= NOW()`)
      .where(sql<boolean>`(user_roles.valid_until IS NULL OR user_roles.valid_until > NOW())`)
      .execute();

    return rows as unknown as ActiveRoleAssignment[];
  }

  /** Flat set of permission_key strings the user currently holds, any scope. */
  async getActivePermissionKeys(userId: number): Promise<Set<string>> {
    const rows = await db
      .selectFrom('user_roles')
      .innerJoin('role_permissions', 'role_permissions.role_id', 'user_roles.role_id')
      .innerJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
      .select('permissions.permission_key as permissionKey')
      .where('user_roles.user_id', '=', userId)
      .where(sql<boolean>`user_roles.valid_from <= NOW()`)
      .where(sql<boolean>`(user_roles.valid_until IS NULL OR user_roles.valid_until > NOW())`)
      .execute();

    return new Set(rows.map((r) => r.permissionKey as string));
  }

  async hasPermission(userId: number, permissionKey: string): Promise<boolean> {
    const keys = await this.getActivePermissionKeys(userId);
    return keys.has(permissionKey);
  }

  // -- Writes --------------------------------------------------------------
  // Both of these are meant to sit behind RbacGuard(identity.role.assign) at
  // the controller layer -- they don't re-check permission themselves, same
  // pattern as AuthService not re-checking session ownership internally.

  async assignRole(params: {
    actorId: number;
    targetUserId: number;
    roleName: string;
    scopeType?: string | null;
    scopeId?: number | null;
    validUntil?: Date | null;
    reason?: string | null;
  }): Promise<ActiveRoleAssignment> {
    const role = await db
      .selectFrom('roles')
      .selectAll()
      .where('name', '=', params.roleName)
      .executeTakeFirst();

    if (!role) {
      throw new NotFoundException(`No such role: ${params.roleName}`);
    }

    const inserted = await db
      .insertInto('user_roles')
      .values({
        user_id: params.targetUserId,
        role_id: role.id,
        scope_type: params.scopeType ?? null,
        scope_id: params.scopeId ?? null,
        valid_until: params.validUntil
          ? params.validUntil.toISOString().slice(0, 19).replace('T', ' ')
          : null,
        granted_by: params.actorId,
      })
      .executeTakeFirstOrThrow();

    await logIdentityAudit({
      actorId: params.actorId,
      targetUserId: params.targetUserId,
      actionType: 'ROLE_GRANTED',
      newValue: { role: params.roleName, scopeType: params.scopeType ?? null, scopeId: params.scopeId ?? null },
      reason: params.reason ?? null,
    });

    return {
      userRoleId: Number(inserted.insertId),
      roleId: role.id,
      roleName: role.name,
      category: role.category,
      scopeType: params.scopeType ?? null,
      scopeId: params.scopeId ?? null,
      validFrom: new Date(),
      validUntil: params.validUntil ?? null,
    };
  }

  /**
   * Ends a role assignment's validity (sets valid_until = now) rather than
   * deleting the row -- identity_audit_log stays meaningful, and the exact
   * grant history (who, when, what scope) survives revocation.
   */
  async revokeRole(actorId: number, userRoleId: number, reason?: string | null): Promise<void> {
    const existing = await db
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .select(['user_roles.id', 'user_roles.user_id as userId', 'roles.name as roleName'])
      .where('user_roles.id', '=', userRoleId)
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundException('Role assignment not found');
    }

    const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await db
      .updateTable('user_roles')
      .set({ valid_until: nowSql })
      .where('id', '=', userRoleId)
      .execute();

    await logIdentityAudit({
      actorId,
      targetUserId: existing.userId,
      actionType: 'ROLE_REVOKED',
      oldValue: { role: existing.roleName },
      reason: reason ?? null,
    });
  }
}
