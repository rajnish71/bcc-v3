// backend/src/modules/membership/admin/membership-admin.controller.ts
//
// Admin-only REST endpoints for the MEM-008 membership management console.
//
// Routes:
//   GET  /api/v1/membership/admin/classes           - class list + entitlements
//   GET  /api/v1/membership/admin/stats             - dashboard stats
//   GET  /api/v1/membership/admin/events            - recent audit events
//   GET  /api/v1/membership/admin/expiring          - members expiring <=30d
//   GET  /api/v1/membership/admin/notification-types
//   GET  /api/v1/membership/admin/email-templates
//   GET  /api/v1/membership/admin/senior-status/eligible
//   POST /api/v1/membership/admin/senior-status/evaluate
//   POST /api/v1/membership/:id/upgrade
//   POST /api/v1/membership/:id/downgrade

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
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { CurrentUser } from '../../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/token.util';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RequirePermissions } from '../../identity/rbac/permissions.decorator';
import { MembershipAdminService } from './membership-admin.service';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import { UpgradeMembershipDto } from '../dto/upgrade-membership.dto';
import { DowngradeMembershipDto } from '../dto/downgrade-membership.dto';

@Controller('api/v1/membership')
@UseGuards(AccessTokenGuard, RbacGuard)
export class MembershipAdminController {
  constructor(
    private readonly adminService: MembershipAdminService,
    private readonly lifecycle: MembershipLifecycleService,
  ) {}

  // ── Class catalogue + entitlements ────────────────────────────────────────

  @Get('admin/classes')
  @HttpCode(200)
  @RequirePermissions('membership.record.view')
  async listClasses() {
    return this.adminService.listClassesWithEntitlements();
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('admin/stats')
  @HttpCode(200)
  @RequirePermissions('membership.record.view')
  async stats() {
    return this.adminService.getDashboardStats();
  }

  // ── Audit events ──────────────────────────────────────────────────────────

  @Get('admin/events')
  @HttpCode(200)
  @RequirePermissions('membership.record.view')
  async recentEvents(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 50;
    return this.adminService.listRecentEvents(n);
  }

  // ── Expiring soon ─────────────────────────────────────────────────────────

  @Get('admin/expiring')
  @HttpCode(200)
  @RequirePermissions('membership.record.view')
  async expiringSoon(@Query('days') days?: string) {
    const n = days ? parseInt(days, 10) : 30;
    return this.adminService.listExpiringSoon(n);
  }

  // ── Notification types ────────────────────────────────────────────────────

  @Get('admin/notification-types')
  @HttpCode(200)
  @RequirePermissions('membership.record.view')
  async notificationTypes() {
    return this.adminService.listNotificationTypes();
  }

  // ── Email templates ───────────────────────────────────────────────────────

  @Get('admin/email-templates')
  @HttpCode(200)
  @RequirePermissions('membership.record.view')
  async emailTemplates() {
    return this.adminService.listEmailTemplates();
  }

  // ── Senior status ─────────────────────────────────────────────────────────

  @Get('admin/senior-status/eligible')
  @HttpCode(200)
  @RequirePermissions('membership.recognition.manage')
  async seniorStatusEligible() {
    return this.adminService.listSeniorStatusEligible();
  }

  @Post('admin/senior-status/evaluate')
  @HttpCode(200)
  @RequirePermissions('membership.recognition.manage')
  async evaluateSeniorStatus(@CurrentUser() actor: AccessTokenPayload) {
    return this.adminService.assignSeniorStatusToEligible(actor.sub);
  }

  // ── Renewal reminders ─────────────────────────────────────────────────────

  @Post('admin/renewal-reminders')
  @HttpCode(200)
  @RequirePermissions('membership.lifecycle.activate')
  async dispatchRenewalReminders() {
    return this.adminService.dispatchRenewalReminders();
  }

  // ── Class change (upgrade / downgrade) ───────────────────────────────────

  @Post(':id/upgrade')
  @HttpCode(200)
  @RequirePermissions('membership.lifecycle.activate')
  async upgrade(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpgradeMembershipDto,
  ) {
    await this.lifecycle.changeClass(
      id,
      dto.newClassId,
      'UPGRADE',
      dto.reason ?? '',
      actor.sub,
    );
    return { ok: true };
  }

  @Post(':id/downgrade')
  @HttpCode(200)
  @RequirePermissions('membership.lifecycle.activate')
  async downgrade(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DowngradeMembershipDto,
  ) {
    await this.lifecycle.changeClass(
      id,
      dto.newClassId,
      'DOWNGRADE',
      dto.reason ?? '',
      actor.sub,
    );
    return { ok: true };
  }
}
