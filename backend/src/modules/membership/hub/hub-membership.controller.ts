// backend/src/modules/membership/hub/hub-membership.controller.ts
//
// Self-service membership endpoints for the authenticated Member Hub.
// All routes require a valid access JWT — no admin permissions needed.
//
// Route prefix: api/v1/hub/membership
// (No global prefix — all controllers declare full path per CLAUDE.md §4.1)

import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { CurrentUser } from '../../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/token.util';
import { HubMembershipService } from './hub-membership.service';
import { SubmitMembershipFormDto } from '../dto/submit-membership-form.dto';

@Controller('api/v1/hub/membership')
export class HubMembershipController {
  constructor(private readonly hubMembership: HubMembershipService) {}

  // ── Application (Variant A — USER role, no active membership) ─────────────

  @Get('application')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async getApplicationPrefill(@CurrentUser() user: AccessTokenPayload) {
    return this.hubMembership.getApplicationPrefill(user.sub);
  }

  @Post('application')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async submitApplication(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SubmitMembershipFormDto,
    @Req() req: FastifyRequest,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip ??
      null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    return this.hubMembership.submitApplication(user.sub, dto, ipAddress, userAgent);
  }

  // ── Renewal (Variant B — MEMBER role, renewal window or expired) ──────────

  @Get('renewal')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async getRenewalPrefill(@CurrentUser() user: AccessTokenPayload) {
    return this.hubMembership.getRenewalPrefill(user.sub);
  }

  @Post('renewal')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async submitRenewal(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SubmitMembershipFormDto,
    @Req() req: FastifyRequest,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip ??
      null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    return this.hubMembership.submitRenewal(user.sub, dto, ipAddress, userAgent);
  }
}
