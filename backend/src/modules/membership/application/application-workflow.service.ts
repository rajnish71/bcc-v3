// backend/src/modules/membership/application/application-workflow.service.ts
//
// Spec 02.4: document uploads, clarification requests / responses /
// internal notes, and staged approval.
//
// STAGED APPROVAL MODEL:
//   * Constitutional-class applications require COORDINATOR -> COMMITTEE ->
//     FINAL, strictly in order (spec 02.4: "Multi-stage approval for
//     constitutional classes"). Only the FINAL approval fires the actual
//     PENDING -> APPROVED lifecycle transition.
//   * Operational-class and GROUP applications require COORDINATOR only --
//     that single approval fires the transition.
//   * A REJECTED decision at ANY stage fires PENDING -> REJECTED
//     immediately, with the stage note as the rejection reason.
// Stage requirements are computed from the class type, not stored --
// changing them is a code change with a constitution reference.
//
// DOCUMENT UPLOADS are presigned-PUT (see R2Service header): request-upload
// creates an AWAITING_UPLOAD row + returns a signed URL; the browser PUTs
// straight to R2; confirm-upload HEADs the object and marks it UPLOADED.
// Applicants can only attach documents while the application is PENDING.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { CommunicationService } from '../../shared/communication/communication.service';
import { R2Service } from '../../shared/storage/r2.service';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import { logMembershipAudit } from '../shared/membership-audit.util';

export type ApprovalStage = 'COORDINATOR' | 'COMMITTEE' | 'FINAL';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class ApplicationWorkflowService {
  constructor(
    private readonly lifecycle: MembershipLifecycleService,
    private readonly r2: R2Service,
    private readonly communicationService: CommunicationService,
  ) {}

  // ---- shared -----------------------------------------------------------

  private async requirePendingApplication(membershipId: number) {
    const membership = await this.lifecycle.getOrThrow(membershipId);
    if (membership.lifecycle_state !== 'PENDING') {
      throw new ConflictException(
        `Application actions require a PENDING application; membership ${membershipId} is ${membership.lifecycle_state}.`,
      );
    }
    return membership;
  }

  // The applicant = the individual owner, or the group's primary contact.
  private async isApplicant(
    membership: { owner_type: string; user_id: number | null; group_entity_id: number | null },
    userId: number,
  ): Promise<boolean> {
    if (membership.owner_type === 'INDIVIDUAL') return membership.user_id === userId;
    if (!membership.group_entity_id) return false;
    const group = await db
      .selectFrom('group_entities')
      .select('primary_contact_user_id')
      .where('id', '=', membership.group_entity_id)
      .executeTakeFirst();
    return group?.primary_contact_user_id === userId;
  }

  // Required stages, in order, computed from what the application is FOR.
  async requiredStages(membership: {
    owner_type: string;
    membership_class_id: number | null;
  }): Promise<ApprovalStage[]> {
    if (membership.owner_type === 'GROUP') return ['COORDINATOR'];
    const cls = await db
      .selectFrom('membership_classes')
      .select('type')
      .where('id', '=', membership.membership_class_id!)
      .executeTakeFirstOrThrow();
    return cls.type === 'CONSTITUTIONAL' ? ['COORDINATOR', 'COMMITTEE', 'FINAL'] : ['COORDINATOR'];
  }

  // ---- staged approval ---------------------------------------------------

  async recordStageDecision(params: {
    membershipId: number;
    stage: ApprovalStage;
    decision: 'APPROVED' | 'REJECTED';
    actorUserId: number;
    note?: string | null;
  }): Promise<{ applicationState: string; nextStage: ApprovalStage | null }> {
    const membership = await this.requirePendingApplication(params.membershipId);
    const stages = await this.requiredStages(membership);

    if (!stages.includes(params.stage)) {
      throw new BadRequestException(
        `Stage ${params.stage} does not apply to this application (required stages: ${stages.join(' -> ')}).`,
      );
    }

    const decided = await db
      .selectFrom('membership_approval_stages')
      .select(['stage', 'decision'])
      .where('membership_id', '=', params.membershipId)
      .execute();
    const decidedStages = new Set(decided.map((d) => d.stage));

    if (decidedStages.has(params.stage)) {
      throw new ConflictException(`The ${params.stage} stage has already been decided for this application.`);
    }

    // Strict ordering: every earlier required stage must already be
    // APPROVED. (A REJECTED earlier stage would have moved the application
    // out of PENDING, so reaching here with one is impossible -- the check
    // is for missing stages.)
    const stageIndex = stages.indexOf(params.stage);
    for (const earlier of stages.slice(0, stageIndex)) {
      if (!decidedStages.has(earlier)) {
        throw new ConflictException(
          `Stage ${earlier} must be decided before ${params.stage} (order: ${stages.join(' -> ')}).`,
        );
      }
    }

    await db
      .insertInto('membership_approval_stages')
      .values({
        membership_id: params.membershipId,
        stage: params.stage,
        decision: params.decision,
        actor_user_id: params.actorUserId,
        note: params.note ?? null,
      })
      .execute();

    await logMembershipAudit({
      membershipId: params.membershipId,
      eventType: 'APPROVAL_STAGE_DECIDED',
      actorType: 'ADMIN',
      actorUserId: params.actorUserId,
      newValue: { stage: params.stage, decision: params.decision },
      notes: params.note ?? null,
    });

    if (params.decision === 'REJECTED') {
      await this.lifecycle.reject(
        params.membershipId,
        params.actorUserId,
        params.note?.trim() || `Application rejected at the ${params.stage} review stage.`,
      );
      return { applicationState: 'REJECTED', nextStage: null };
    }

    const isFinalRequiredStage = stageIndex === stages.length - 1;
    if (isFinalRequiredStage) {
      await this.lifecycle.approve(params.membershipId, params.actorUserId);
      return { applicationState: 'APPROVED', nextStage: null };
    }

    return { applicationState: 'PENDING', nextStage: stages[stageIndex + 1] };
  }

  async getStageStatus(membershipId: number) {
    const membership = await this.lifecycle.getOrThrow(membershipId);
    const stages = await this.requiredStages(membership);
    const decided = await db
      .selectFrom('membership_approval_stages')
      .selectAll()
      .where('membership_id', '=', membershipId)
      .execute();
    return {
      lifecycleState: membership.lifecycle_state,
      requiredStages: stages,
      decisions: decided,
    };
  }

  // ---- documents ----------------------------------------------------------

  async requestDocumentUpload(params: {
    membershipId: number;
    documentType: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    actorUserId: number;
    actorIsStaff: boolean;
  }): Promise<{ documentUuid: string; uploadUrl: string }> {
    const membership = await this.requirePendingApplication(params.membershipId);

    if (!params.actorIsStaff && !(await this.isApplicant(membership, params.actorUserId))) {
      throw new ForbiddenException('Only the applicant (or membership staff) can attach documents to this application.');
    }

    if (!ALLOWED_MIME_TYPES.includes(params.mimeType)) {
      throw new BadRequestException(`Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`);
    }
    if (params.sizeBytes <= 0 || params.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`File size must be between 1 byte and ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
    }

    const documentUuid = randomUUID();
    const safeName = params.originalFilename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
    const objectKey = `membership-applications/${membership.uuid}/${documentUuid}-${safeName}`;

    // Presign FIRST -- if R2 is unconfigured this throws a clear 503 and no
    // orphan row is created.
    const uploadUrl = await this.r2.presignUpload(objectKey, params.mimeType, params.sizeBytes);

    await db
      .insertInto('membership_application_documents')
      .values({
        uuid: documentUuid,
        membership_id: params.membershipId,
        document_type: params.documentType,
        r2_object_key: objectKey,
        original_filename: params.originalFilename.slice(0, 255),
        mime_type: params.mimeType,
        size_bytes: params.sizeBytes,
        uploaded_by_user_id: params.actorUserId,
      })
      .execute();

    return { documentUuid, uploadUrl };
  }

  async confirmDocumentUpload(documentUuid: string, actorUserId: number, actorIsStaff: boolean): Promise<void> {
    const doc = await db
      .selectFrom('membership_application_documents')
      .selectAll()
      .where('uuid', '=', documentUuid)
      .executeTakeFirst();
    if (!doc) throw new NotFoundException('Document record not found.');
    if (doc.upload_status === 'UPLOADED') return; // idempotent

    const membership = await this.lifecycle.getOrThrow(doc.membership_id);
    if (!actorIsStaff && !(await this.isApplicant(membership, actorUserId))) {
      throw new ForbiddenException('Only the applicant (or membership staff) can confirm this upload.');
    }

    const head = await this.r2.headObject(doc.r2_object_key);
    if (!head.exists) {
      throw new ConflictException('The file has not arrived in storage yet. Complete the upload, then confirm again.');
    }

    await db
      .updateTable('membership_application_documents')
      .set({
        upload_status: 'UPLOADED',
        uploaded_at: toMysqlDatetime(new Date()),
        size_bytes: head.sizeBytes ?? doc.size_bytes,
      })
      .where('id', '=', doc.id)
      .execute();

    await logMembershipAudit({
      membershipId: doc.membership_id,
      eventType: 'APPLICATION_DOCUMENT_UPLOADED',
      actorType: actorIsStaff ? 'ADMIN' : 'MEMBER',
      actorUserId,
      newValue: { documentUuid, documentType: doc.document_type },
    });
  }

  async reviewDocument(params: {
    documentUuid: string;
    reviewStatus: 'ACCEPTED' | 'REJECTED';
    reviewNote?: string | null;
    actorUserId: number;
  }): Promise<void> {
    const doc = await db
      .selectFrom('membership_application_documents')
      .selectAll()
      .where('uuid', '=', params.documentUuid)
      .executeTakeFirst();
    if (!doc) throw new NotFoundException('Document record not found.');
    if (doc.upload_status !== 'UPLOADED') {
      throw new ConflictException('This document has not been uploaded yet and cannot be reviewed.');
    }

    await db
      .updateTable('membership_application_documents')
      .set({
        review_status: params.reviewStatus,
        review_note: params.reviewNote ?? null,
        reviewed_by_user_id: params.actorUserId,
        reviewed_at: toMysqlDatetime(new Date()),
      })
      .where('id', '=', doc.id)
      .execute();

    await logMembershipAudit({
      membershipId: doc.membership_id,
      eventType: 'APPLICATION_DOCUMENT_REVIEWED',
      actorType: 'ADMIN',
      actorUserId: params.actorUserId,
      newValue: { documentUuid: params.documentUuid, reviewStatus: params.reviewStatus },
      notes: params.reviewNote ?? null,
    });
  }

  async listDocuments(membershipId: number) {
    return db
      .selectFrom('membership_application_documents')
      .select([
        'uuid',
        'document_type',
        'original_filename',
        'mime_type',
        'size_bytes',
        'upload_status',
        'uploaded_at',
        'review_status',
        'review_note',
        'reviewed_at',
        'created_at',
      ])
      .where('membership_id', '=', membershipId)
      .orderBy('created_at', 'asc')
      .execute();
  }

  // ---- clarifications & notes ---------------------------------------------

  async requestClarification(membershipId: number, body: string, actorUserId: number): Promise<{ messageId: number }> {
    const membership = await this.requirePendingApplication(membershipId);

    const inserted = await db
      .insertInto('membership_application_messages')
      .values({
        membership_id: membershipId,
        message_type: 'CLARIFICATION_REQUEST',
        body,
        author_user_id: actorUserId,
      })
      .executeTakeFirstOrThrow();

    await logMembershipAudit({
      membershipId,
      eventType: 'CLARIFICATION_REQUESTED',
      actorType: 'ADMIN',
      actorUserId,
    });

    // Notify the applicant (spec 02.4: "Communication at each stage").
    // Email only for now -- WhatsApp/SMS are Module 17 concerns.
    const recipientUserId =
      membership.owner_type === 'INDIVIDUAL'
        ? membership.user_id
        : (
            await db
              .selectFrom('group_entities')
              .select('primary_contact_user_id')
              .where('id', '=', membership.group_entity_id!)
              .executeTakeFirst()
          )?.primary_contact_user_id;

    if (recipientUserId) {
      await this.communicationService.dispatch(
        'MEMBERSHIP_APPLICATION_CLARIFICATION',
        recipientUserId,
        { clarification_note: escapeHtml(body) },
        { actionUrl: '/member/application' },
      );
    }

    return { messageId: Number(inserted.insertId) };
  }

  async respondToClarification(params: {
    membershipId: number;
    clarificationMessageId: number;
    body: string;
    actorUserId: number;
  }): Promise<{ messageId: number }> {
    const membership = await this.requirePendingApplication(params.membershipId);

    if (!(await this.isApplicant(membership, params.actorUserId))) {
      throw new ForbiddenException('Only the applicant can respond to a clarification request.');
    }

    const request = await db
      .selectFrom('membership_application_messages')
      .selectAll()
      .where('id', '=', params.clarificationMessageId)
      .where('membership_id', '=', params.membershipId)
      .where('message_type', '=', 'CLARIFICATION_REQUEST')
      .executeTakeFirst();
    if (!request) throw new NotFoundException('Clarification request not found on this application.');

    const inserted = await db
      .insertInto('membership_application_messages')
      .values({
        membership_id: params.membershipId,
        message_type: 'APPLICANT_RESPONSE',
        body: params.body,
        author_user_id: params.actorUserId,
        parent_message_id: params.clarificationMessageId,
      })
      .executeTakeFirstOrThrow();

    await db
      .updateTable('membership_application_messages')
      .set({ resolved_at: toMysqlDatetime(new Date()) })
      .where('id', '=', params.clarificationMessageId)
      .execute();

    await logMembershipAudit({
      membershipId: params.membershipId,
      eventType: 'CLARIFICATION_ANSWERED',
      actorType: 'MEMBER',
      actorUserId: params.actorUserId,
    });

    return { messageId: Number(inserted.insertId) };
  }

  async addInternalNote(membershipId: number, body: string, actorUserId: number): Promise<{ messageId: number }> {
    await this.lifecycle.getOrThrow(membershipId); // notes allowed in any state -- audit trail continues post-decision

    const inserted = await db
      .insertInto('membership_application_messages')
      .values({
        membership_id: membershipId,
        message_type: 'INTERNAL_NOTE',
        body,
        author_user_id: actorUserId,
      })
      .executeTakeFirstOrThrow();

    return { messageId: Number(inserted.insertId) };
  }

  // Staff see everything; the applicant NEVER sees INTERNAL_NOTE rows.
  async listMessages(membershipId: number, includeInternal: boolean) {
    let query = db
      .selectFrom('membership_application_messages')
      .selectAll()
      .where('membership_id', '=', membershipId);
    if (!includeInternal) {
      query = query.where('message_type', '!=', 'INTERNAL_NOTE');
    }
    return query.orderBy('created_at', 'asc').execute();
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
