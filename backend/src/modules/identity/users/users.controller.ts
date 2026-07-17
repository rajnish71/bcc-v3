// backend/src/modules/identity/users/users.controller.ts
//
// Minimal user profile endpoint.
// GET /api/v1/users/me -- returns the authenticated user's public profile.
// Used by the frontend after login to populate nav/hub display name.

import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../../../database/db';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token.util';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { resolvePortalState } from './session-mapper';

@Controller('api/v1/users')
export class UsersController {
  @Get('me')
  @UseGuards(AccessTokenGuard)
  async me(@CurrentUser() user: AccessTokenPayload) {
    const row = await db
      .selectFrom('users')
      .select([
        'id',
        'uuid',
        'email',
        'username',
        'identity_status',
        'identity_completed_at',
        'full_name',
        'status',
        'email_verified_at',
        'phone_verified_at',
        'force_password_reset',
        'registration_method',
        'created_at',
      ])
      .where('id', '=', user.sub)
      .executeTakeFirstOrThrow();

    const portalState = await resolvePortalState(user.sub);

    return {
      id: row.id,
      uuid: row.uuid,
      email: row.email,
      username: row.username ?? null,
      identityStatus: row.identity_status,
      identityCompletedAt: row.identity_completed_at ?? null,
      fullName: row.full_name,
      status: row.status,
      emailVerified: !!row.email_verified_at,
      phoneVerified: !!row.phone_verified_at,
      forcePasswordReset: !!row.force_password_reset,
      registrationMethod: row.registration_method,
      ui: {
        portalState,
      },
    };
  }

  @Get('admin/search')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async adminSearch(@Query('q') q: string) {
    if (!q || q.trim().length < 2) {
      throw new BadRequestException('q must be at least 2 characters');
    }
    const term = `%${q.trim()}%`;
    return db
      .selectFrom('users')
      .select([
        'id', 'username', 'full_name', 'email', 'status',
        'identity_status', 'identity_completed_at',
      ])
      .where(eb =>
        eb.or([
          eb('username', 'like', term),
          eb('full_name', 'like', term),
          eb('email', 'like', term),
        ])
      )
      .orderBy('full_name', 'asc')
      .limit(20)
      .execute();
  }

  @Get('admin/list')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async adminList(
    @Query('lifecycle') lifecycle?: string,
    @Query('classId') classId?: string,
    @Query('roleId') roleId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('sortBy') sortBy = 'name',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc',
  ) {
    let query = db
      .selectFrom('users as u')
      .leftJoin('memberships as m', 'm.user_id', 'u.id')
      .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .leftJoin('user_avatars as ua', (join) =>
        join.onRef('ua.user_id', '=', 'u.id').on('ua.size_variant', '=', 'THUMB')
      )
      .select((eb) => [
        'u.id as userId',
        'u.full_name as fullName',
        'u.username as username',
        'u.email as email',
        'u.status as status',
        'u.identity_status as identityStatus',
        'u.created_at as createdAt',
        'm.id as membershipId',
        'm.membership_number as membershipNumber',
        'm.lifecycle_state as lifecycleState',
        'm.applied_at as appliedAt',
        'm.activated_at as activatedAt',
        'mc.name as className',
        'mc.code as classCode',
        'ua.imagekit_url as avatarUrl',
        eb
          .selectFrom('login_history')
          .select('created_at')
          .whereRef('user_id', '=', 'u.id')
          .where('status', '=', 'SUCCESS')
          .orderBy('created_at', 'desc')
          .limit(1)
          .as('lastLoginAt'),
      ]);

    // Apply filters
    if (lifecycle) {
      query = query.where('m.lifecycle_state', '=', lifecycle as any);
    }
    if (classId) {
      query = query.where('m.membership_class_id', '=', Number(classId));
    }
    if (status) {
      query = query.where('u.status', '=', status as any);
    }
    if (roleId) {
      query = query.where('u.id', 'in', (eb) =>
        eb
          .selectFrom('user_roles')
          .select('user_id')
          .where('role_id', '=', Number(roleId))
          .where(sql<boolean>`valid_from <= NOW()`)
          .where(sql<boolean>`(valid_until IS NULL OR valid_until > NOW())`)
      );
    }

    // Apply search query
    if (q && q.trim().length > 0) {
      const term = `%${q.trim()}%`;
      query = query.where((eb) =>
        eb.or([
          eb('u.full_name', 'like', term),
          eb('u.username', 'like', term),
          eb('u.email', 'like', term),
          eb('m.membership_number', 'like', term),
        ])
      );
    }

    // Apply sorting
    const order = sortOrder === 'desc' ? 'desc' : 'asc';
    if (sortBy === 'membershipNumber') {
      query = query.orderBy('m.membership_number', order);
    } else if (sortBy === 'joinDate') {
      query = query.orderBy('m.activated_at', order).orderBy('m.applied_at', order);
    } else if (sortBy === 'lastLogin') {
      query = query.orderBy('lastLoginAt', order);
    } else if (sortBy === 'lifecycle') {
      query = query.orderBy('m.lifecycle_state', order);
    } else {
      query = query.orderBy('u.full_name', order);
    }

    const users = await query.limit(200).execute();

    // Map active roles
    const activeRoles = await db
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select(['ur.user_id as userId', 'r.name as roleName', 'ur.id as userRoleId'])
      .where(sql<boolean>`ur.valid_from <= NOW()`)
      .where(sql<boolean>`(ur.valid_until IS NULL OR ur.valid_until > NOW())`)
      .execute();

    const rolesByUserId: Record<number, Array<{ userRoleId: number; roleName: string }>> = {};
    for (const ar of activeRoles) {
      if (!rolesByUserId[ar.userId]) {
        rolesByUserId[ar.userId] = [];
      }
      rolesByUserId[ar.userId].push({
        userRoleId: ar.userRoleId,
        roleName: ar.roleName,
      });
    }

    const usersWithRoles = users.map((user) => ({
      ...user,
      roles: rolesByUserId[user.userId] ?? [],
    }));

    const classes = await db
      .selectFrom('membership_classes')
      .select(['id', 'name', 'code'])
      .orderBy('sort_order', 'asc')
      .execute();

    const dbRoles = await db
      .selectFrom('roles')
      .select(['id', 'name'])
      .orderBy('name', 'asc')
      .execute();

    return {
      users: usersWithRoles,
      classes,
      roles: dbRoles,
    };
  }

  @Put('admin/users/:userId')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.approve')
  async adminUpdateUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { fullName?: string; email?: string; status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' },
  ) {
    const updateObj: any = {};
    if (body.fullName !== undefined) updateObj.full_name = body.fullName;
    if (body.email !== undefined) updateObj.email = body.email;
    if (body.status !== undefined) updateObj.status = body.status;

    if (Object.keys(updateObj).length === 0) {
      throw new BadRequestException('No fields provided to update');
    }

    await db
      .updateTable('users')
      .set(updateObj)
      .where('id', '=', userId)
      .execute();

    return { ok: true };
  }
}
