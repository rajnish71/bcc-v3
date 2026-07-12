// backend/src/modules/identity/users/users.controller.ts
//
// Minimal user profile endpoint.
// GET /api/v1/users/me -- returns the authenticated user's public profile.
// Used by the frontend after login to populate nav/hub display name.

import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
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
      .select(['id', 'username', 'full_name', 'email', 'status'])
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
}
