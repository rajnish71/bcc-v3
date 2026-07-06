// backend/src/modules/membership/application/application-workflow.controller.ts
//
// Spec 02.4 HTTP surface: documents (presigned R2 flow), clarifications,
// internal notes, staged approval status + committee/final decisions.
//
// The COORDINATOR stage has no endpoint here -- it IS the existing
// POST /membership/:id/approve and /reject endpoints in
// MembershipController, which now route through the workflow service (a
// coordinator approval is the coordinator stage; for operational/group
// applications it is also the ONLY stage).
//
// Applicant-facing endpoints (upload, confirm, respond, list own) use
// AccessTokenGuard with the applicant check inside the service; staff
// endpoints use RbacGuard permissions from seed_0003/seed_0005.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { CurrentUser } from '../../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/token.util';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RequirePermissions } from '../../identity/rbac/permissions.decorator';
import { RbacService } from '../../identity/rbac/rbac.service';
import { ApplicationWorkflowService } from './application-workflow.service';
import { RequestDocumentUploadDto } from '../dto/request-document-upload.dto';
import { ReviewDocumentDto } from '../dto/review-document.dto';
import { ApplicationMessageDto, RespondToClarificationDto } from '../dto/application-message.dto';
import { StageDecisionDto } from '../dto/stage-decision.dto';

@Controller('api/v1/membership/applications')
export class ApplicationWorkflowController {
  constructor(
    private readonly workflow: ApplicationWorkflowService,
    private readonly rbac: RbacService,
  ) {}

  private async isStaff(userId: number, permission: string): Promise<boolean> {
    const keys = await this.rbac.getActivePermissionKeys(userId);
    return keys.has(permission);
  }

  // ---- documents ----------------------------------------------------------

  @Post(':id/documents/request-upload')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async requestUpload(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestDocumentUploadDto,
  ) {
    return this.workflow.requestDocumentUpload({
      membershipId: id,
      documentType: dto.documentType,
      originalFilename: dto.originalFilename,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      actorUserId: actor.sub,
      actorIsStaff: await this.isStaff(actor.sub, 'membership.application.review_documents'),
    });
  }

  @Post('documents/:documentUuid/confirm-upload')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async confirmUpload(@CurrentUser() actor: AccessTokenPayload, @Param('documentUuid') documentUuid: string) {
    await this.workflow.confirmDocumentUpload(
      documentUuid,
      actor.sub,
      await this.isStaff(actor.sub, 'membership.application.review_documents'),
    );
    return { ok: true };
  }

  @Post('documents/:documentUuid/review')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.review_documents')
  async reviewDocument(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('documentUuid') documentUuid: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    await this.workflow.reviewDocument({
      documentUuid,
      reviewStatus: dto.reviewStatus,
      reviewNote: dto.reviewNote ?? null,
      actorUserId: actor.sub,
    });
    return { ok: true };
  }

  @Get(':id/documents')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async listDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.workflow.listDocuments(id);
  }

  // ---- clarifications & notes ---------------------------------------------

  @Post(':id/clarifications')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.request_clarification')
  async requestClarification(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplicationMessageDto,
  ) {
    return this.workflow.requestClarification(id, dto.body, actor.sub);
  }

  @Post(':id/clarifications/respond')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async respondToClarification(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RespondToClarificationDto,
  ) {
    return this.workflow.respondToClarification({
      membershipId: id,
      clarificationMessageId: dto.clarificationMessageId,
      body: dto.body,
      actorUserId: actor.sub,
    });
  }

  @Post(':id/internal-notes')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.internal_note')
  async addInternalNote(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplicationMessageDto,
  ) {
    return this.workflow.addInternalNote(id, dto.body, actor.sub);
  }

  @Get(':id/messages')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async listMessages(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    // Staff (internal_note holders) see everything; everyone else --
    // including the applicant -- never sees INTERNAL_NOTE rows.
    const includeInternal = await this.isStaff(actor.sub, 'membership.application.internal_note');
    return this.workflow.listMessages(id, includeInternal);
  }

  // ---- staged approval ------------------------------------------------------

  @Get(':id/stages')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async stageStatus(@Param('id', ParseIntPipe) id: number) {
    return this.workflow.getStageStatus(id);
  }

  @Post(':id/stages/committee')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.stage_committee')
  async committeeDecision(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StageDecisionDto,
  ) {
    return this.workflow.recordStageDecision({
      membershipId: id,
      stage: 'COMMITTEE',
      decision: dto.decision,
      actorUserId: actor.sub,
      note: dto.note ?? null,
    });
  }

  @Post(':id/stages/final')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.stage_final')
  async finalDecision(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StageDecisionDto,
  ) {
    return this.workflow.recordStageDecision({
      membershipId: id,
      stage: 'FINAL',
      decision: dto.decision,
      actorUserId: actor.sub,
      note: dto.note ?? null,
    });
  }
}
