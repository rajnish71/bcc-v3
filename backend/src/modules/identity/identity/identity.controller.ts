// backend/src/modules/identity/identity/identity.controller.ts
//
// IDENTITY-ARCH-001: Identity completion endpoints.
//
// POST /api/v1/identity/complete
//   Authenticated. Completes identity for the requesting user.
//
// GET  /api/v1/identity/check-username
//   Authenticated. Returns { available, reason? } for a given username.
//
// POST /api/v1/identity/admin/send-completion-link/:userId
//   Admin. Sends a standard completion link email.
//
// POST /api/v1/identity/admin/send-priority-completion-link/:userId
//   Admin. Sends a priority completion link email.
//
// POST /api/v1/identity/admin/resend-welcome/:userId
//   Admin. Resends the welcome email via CommunicationService.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { CompleteIdentityDto } from './dto/complete-identity.dto';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token.util';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';

@Controller('api/v1/identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  // ── Member endpoints ──────────────────────────────────────────────────────

  @Post('complete')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async completeIdentity(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CompleteIdentityDto,
  ) {
    await this.identityService.completeIdentity(user.sub, dto.username, dto.displayName);
    return { message: 'Identity complete.' };
  }

  @Get('check-username')
  @UseGuards(AccessTokenGuard)
  async checkUsername(
    @CurrentUser() user: AccessTokenPayload,
    @Query('username') username: string,
  ) {
    return this.identityService.checkUsernameAvailability(username, user.sub);
  }

  // ── Admin endpoints ───────────────────────────────────────────────────────

  @Post('admin/send-completion-link/:userId')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async sendCompletionLink(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    await this.identityService.sendCompletionLink(actor.sub, userId);
    return { message: 'Completion link sent.' };
  }

  @Post('admin/send-priority-completion-link/:userId')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async sendPriorityCompletionLink(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    await this.identityService.sendPriorityCompletionLink(actor.sub, userId);
    return { message: 'Priority completion link sent.' };
  }

  @Post('admin/resend-welcome/:userId')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async resendWelcome(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    await this.identityService.resendWelcomeEmail(actor.sub, userId);
    return { message: 'Welcome email dispatched.' };
  }
}
