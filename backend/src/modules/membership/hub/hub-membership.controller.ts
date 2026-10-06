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
import { SubmitGroupApplicationDto } from '../dto/submit-group-application.dto';
import { requestAuditContext } from '../../financial/audit/request-provenance.util';
import { MembershipRenewalService } from '../renewal/membership-renewal.service';
import { RequestRenewalDto } from '../dto/request-renewal.dto';
import { RenewalProofUploadDto } from '../dto/renewal-proof-upload.dto';

@Controller('api/v1/hub/membership')
export class HubMembershipController {
  constructor(
    private readonly hubMembership: HubMembershipService,
    private readonly renewal: MembershipRenewalService,
  ) {}

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
    return this.hubMembership.submitApplication(
      user.sub,
      dto,
      ipAddress,
      userAgent,
      requestAuditContext('MEMBER', req, user),
    );
  }

  // ── Family / Corporate self-service application ─────────────────────────
  //
  // The signed-in user applies and becomes the group's head. Body carries no
  // fee, type id, entity id, head or capacity (SubmitGroupApplicationDto).
  // Payment then uses the existing payer-owned
  // POST api/v1/financial/contributions/:id/settlement/payment-link route.

  @Post('group-application')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async submitGroupApplication(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SubmitGroupApplicationDto,
    @Req() req: FastifyRequest,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip ??
      null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    return this.hubMembership.submitGroupApplication(
      user.sub,
      dto,
      ipAddress,
      userAgent,
      requestAuditContext('MEMBER', req, user),
    );
  }

  // ── Renewal / reinstatement (Release 1) ─────────────────────────────────
  //
  // Server-authoritative: eligibility (plan, 45-day configured window, term
  // end, lifecycle) is decided by MembershipRenewalService, never by route
  // visibility. Body carries only a fresh T&C acceptance -- no profile,
  // plan or class. Payment uses the existing payer-owned PAY-001 routes on
  // the returned operation.contribution.id.

  @Get('renewal')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async getRenewalStatus(@CurrentUser() user: AccessTokenPayload) {
    return this.renewal.getStatus(user.sub);
  }

  @Post('renewal')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async requestRenewal(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RequestRenewalDto,
    @Req() req: FastifyRequest,
  ) {
    return this.renewal.requestRenewal(
      user.sub,
      dto.termsVersion,
      clientIp(req),
      (req.headers['user-agent'] as string | undefined) ?? null,
      requestAuditContext('MEMBER', req, user),
    );
  }

  @Post('renewal/proof/request-upload')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async requestRenewalProofUpload(@CurrentUser() user: AccessTokenPayload, @Body() dto: RenewalProofUploadDto) {
    return this.renewal.requestProofUpload(user.sub, dto);
  }

  @Post('reinstatement')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async requestReinstatement(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RequestRenewalDto,
    @Req() req: FastifyRequest,
  ) {
    return this.renewal.requestReinstatement(
      user.sub,
      dto.termsVersion,
      clientIp(req),
      (req.headers['user-agent'] as string | undefined) ?? null,
    );
  }
}

function clientIp(req: FastifyRequest): string | null {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? null;
}
