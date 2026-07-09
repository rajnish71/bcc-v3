// backend/src/modules/identity/users/users.controller.ts
//
// Minimal user profile endpoint.
// GET /api/v1/users/me -- returns the authenticated user's public profile.
// Used by the frontend after login to populate nav/hub display name.

import { Controller, Get, UseGuards } from '@nestjs/common';
import { db } from '../../../database/db';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token.util';
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
}
