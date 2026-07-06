// backend/src/modules/membership/recognition/recognition.controller.ts
import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { CurrentUser } from '../../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/token.util';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RequirePermissions } from '../../identity/rbac/permissions.decorator';
import { RecognitionService } from './recognition.service';
import { AssignRecognitionDto } from '../dto/assign-recognition.dto';
import { RevokeRecognitionDto } from '../dto/revoke-recognition.dto';
import { SetRecognitionCriteriaDto } from '../dto/set-recognition-criteria.dto';

@Controller('api/v1/membership/recognitions')
@UseGuards(AccessTokenGuard, RbacGuard)
export class RecognitionController {
  constructor(private readonly recognitions: RecognitionService) {}

  @Get(':membershipId')
  @HttpCode(200)
  @RequirePermissions('membership.recognition.view')
  async list(@Param('membershipId', ParseIntPipe) membershipId: number) {
    return this.recognitions.listForMembership(membershipId);
  }

  @Post(':membershipId/assign')
  @HttpCode(201)
  @RequirePermissions('membership.recognition.assign')
  async assign(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('membershipId', ParseIntPipe) membershipId: number,
    @Body() dto: AssignRecognitionDto,
  ) {
    await this.recognitions.assign(membershipId, dto.recognitionCode, dto.track, dto.reason, actor.sub, dto.startDate);
    return { ok: true };
  }

  @Post(':membershipId/revoke')
  @HttpCode(200)
  @RequirePermissions('membership.recognition.revoke')
  async revoke(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('membershipId', ParseIntPipe) membershipId: number,
    @Body() dto: RevokeRecognitionDto,
  ) {
    await this.recognitions.revoke(membershipId, dto.reason, actor.sub);
    return { ok: true };
  }

  @Get(':membershipId/auto-eligibility')
  @HttpCode(200)
  @RequirePermissions('membership.recognition.view')
  async autoEligibility(@Param('membershipId', ParseIntPipe) membershipId: number) {
    return this.recognitions.evaluateAutoEligibility(membershipId);
  }

  // ---- Criteria config (Super Admin only via permission grant) --------

  @Get('criteria/all')
  @HttpCode(200)
  @RequirePermissions('membership.recognition.view')
  async listCriteria() {
    return this.recognitions.listCriteria();
  }

  @Post('criteria')
  @HttpCode(200)
  @RequirePermissions('membership.recognition.criteria.manage')
  async setCriteria(@CurrentUser() actor: AccessTokenPayload, @Body() dto: SetRecognitionCriteriaDto) {
    await this.recognitions.setCriteria(dto.recognitionCode, dto.criteriaKey, dto.criteriaValue, actor.sub);
    return { ok: true };
  }
}
