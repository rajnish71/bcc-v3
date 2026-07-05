// backend/src/modules/notifications/notification.controller.ts
// Module 17 -- self-service notification bell + preferences endpoints.
//
// All routes require AccessTokenGuard only -- no RBAC permission needed
// because every endpoint is scoped to the authenticated user's own data.
// The userId is always taken from the JWT (sub), never from the request body.
//
// Routes:
//   GET  /api/v1/notifications                          list (paginated)
//   GET  /api/v1/notifications/unread-count             { count }
//   POST /api/v1/notifications/mark-all-read            mark all read
//   PATCH /api/v1/notifications/:id/read                mark one read
//   GET  /api/v1/notifications/preferences              preference list
//   PUT  /api/v1/notifications/preferences/:typeKey/:channel  upsert pref
//
// Static sub-routes (unread-count, mark-all-read, preferences) are declared
// BEFORE the :id param route so NestJS does not accidentally match them
// as numeric IDs.

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/token.util';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(AccessTokenGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  // ------------------------------------------------------------------
  // GET /notifications/unread-count
  // ------------------------------------------------------------------
  @Get('unread-count')
  @HttpCode(200)
  async getUnreadCount(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<{ count: number }> {
    return this.notifications.getUnreadCount(user.sub);
  }

  // ------------------------------------------------------------------
  // POST /notifications/mark-all-read
  // ------------------------------------------------------------------
  @Post('mark-all-read')
  @HttpCode(200)
  async markAllRead(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<{ ok: boolean }> {
    await this.notifications.markAllRead(user.sub);
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // GET /notifications/preferences
  // ------------------------------------------------------------------
  @Get('preferences')
  @HttpCode(200)
  async getPreferences(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.getPreferences(user.sub);
  }

  // ------------------------------------------------------------------
  // PUT /notifications/preferences/:typeKey/:channel
  // Body: { optedIn: boolean }
  // ------------------------------------------------------------------
  @Put('preferences/:typeKey/:channel')
  @HttpCode(200)
  async upsertPreference(
    @CurrentUser() user: AccessTokenPayload,
    @Param('typeKey') typeKey: string,
    @Param('channel') channel: string,
    @Body() body: { optedIn?: unknown },
  ): Promise<{ ok: boolean }> {
    const validChannels = ['EMAIL', 'IN_APP', 'WHATSAPP', 'SMS'];
    if (!validChannels.includes(channel.toUpperCase())) {
      throw new BadRequestException(`Invalid channel "${channel}"`);
    }
    if (typeof body.optedIn !== 'boolean') {
      throw new BadRequestException('Body must contain optedIn: boolean');
    }

    const result = await this.notifications.upsertPreference(
      user.sub, typeKey, channel.toUpperCase(), body.optedIn,
    );

    if (!result.ok) {
      if (result.reason?.includes('cannot be opted out')) {
        throw new ForbiddenException(result.reason);
      }
      throw new BadRequestException(result.reason);
    }

    return { ok: true };
  }

  // ------------------------------------------------------------------
  // GET /notifications?page=1&limit=20&unreadOnly=false
  // ------------------------------------------------------------------
  @Get()
  @HttpCode(200)
  async getNotifications(
    @CurrentUser() user: AccessTokenPayload,
    @Query('page')       page:       string,
    @Query('limit')      limit:      string,
    @Query('unreadOnly') unreadOnly: string,
  ) {
    return this.notifications.getNotifications(user.sub, {
      page:       page       ? parseInt(page,  10) : undefined,
      limit:      limit      ? parseInt(limit, 10) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  // ------------------------------------------------------------------
  // PATCH /notifications/:id/read
  // Static sub-routes above this must come first in declaration order.
  // ------------------------------------------------------------------
  @Patch(':id/read')
  @HttpCode(200)
  async markRead(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ ok: boolean }> {
    await this.notifications.markRead(user.sub, id);
    return { ok: true };
  }
}
