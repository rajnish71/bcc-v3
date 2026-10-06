// backend/src/modules/membership/renewal/membership-renewal.service.ts
//
// Release 1 -- Individual Membership Renewal and Reinstatement (frozen HA
// governance). Operates ONLY on the member's EXISTING membership row and its
// existing permanent membership number:
//   • never inserts a membership row, never calls activate(), never touches
//     MembershipNumberingService / number_serial / membership_number;
//   • "pending renewal" is an operation status (membership_renewal_operations),
//     never a membership lifecycle state.
//
// Self-service RENEWAL (Individual Annual / Biennial / Student, same plan):
//   request (fresh T&C) -> [Student proof, if configured] -> server window
//   check -> ONE operation (UNIQUE term_key + open_lock, membership row
//   locked) -> ONE PAY-001 obligation (fee_inr frozen at creation, key per
//   operation) -> existing PAY-001 payment flow -> CONTRIBUTION_COMPLETED ->
//   idempotent application to the existing row: new term starts at the
//   previous term end (never payment/approval/webhook/server date).
//
// REINSTATEMENT (after term end): member request -> admin approve/reject
//   (reject = no obligation, so no refund path) -> PAY-001 obligation (fee at
//   approval) -> genuine completion -> existing row ACTIVE, new term starts
//   at genuine payment completion.
//
// Recovery: no outbox replay worker exists. getStatus() is the user-triggered
// self-heal (Module 04 decision D3 precedent): a COMPLETED obligation whose
// event was lost is applied through the same idempotent handler.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import { db, type DB, type RenewalOperationStatus } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import type { FinancialEngineEventPayload } from '../../financial/financial.events';
import type { AuditContext } from '../../financial/audit/financial-audit.types';
import { CommunicationService } from '../../shared/communication/communication.service';
import { R2Service } from '../../shared/storage/r2.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import { logMembershipAudit } from '../shared/membership-audit.util';
import { expireClosedRenewalOperations } from './renewal-obligation-expiry';
import {
  OPEN_OPERATION_STATUSES,
  RENEWAL_PROOF_DOCUMENT_TYPES_KEY,
  RENEWAL_WINDOW_DAYS_KEY,
  evaluateRenewalWindow,
  isDuplicateKeyError,
  isRelease1RenewalClass,
  parseDocumentTypes,
  parseRenewalOperationKey,
  parseWindowDays,
  reinstatementContributionKey,
  renewalContributionKey,
  renewalTermKey,
  renewalWindow,
  toDate,
} from './renewal-policy';

const ALLOWED_PROOF_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

type OperationRow = {
  id: number;
  membership_id: number;
  user_id: number;
  membership_class_id: number;
  operation_type: 'RENEWAL' | 'REINSTATEMENT';
  status: RenewalOperationStatus;
  previous_term_start: unknown;
  previous_term_end: unknown;
  new_term_start: unknown;
  new_term_end: unknown;
  contribution_id: number | null;
  funded_amount_paise: number | null;
  decision_note: string | null;
  created_at: unknown;
};

type ApplyOutcome =
  | { kind: 'APPLIED'; op: OperationRow; newStart: string; newEnd: string; wasExpired: boolean }
  | { kind: 'NOOP' }
  | { kind: 'BLOCKED'; op: OperationRow; reason: string };

function fmt(d: Date | null): string {
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

function iso(value: unknown): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

@Injectable()
export class MembershipRenewalService {
  private readonly logger = new Logger(MembershipRenewalService.name);

  constructor(
    private readonly financial: FinancialContributionService,
    private readonly entitlements: EntitlementService,
    private readonly lifecycle: MembershipLifecycleService,
    private readonly communication: CommunicationService,
    private readonly r2: R2Service,
  ) {}

  // ── Context ────────────────────────────────────────────────────────────────

  // The member's own (non-group) individual membership row, newest first.
  private async currentMembership(userId: number) {
    return db
      .selectFrom('memberships as m')
      .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .select([
        'm.id',
        'm.user_id',
        'm.owner_type',
        'm.parent_membership_id',
        'm.membership_class_id',
        'm.lifecycle_state',
        'm.membership_number',
        'm.activated_at',
        'm.expires_at',
        'mc.code as class_code',
        'mc.name as class_name',
      ])
      .where('m.user_id', '=', userId)
      .where('m.owner_type', '=', 'INDIVIDUAL')
      .where('m.parent_membership_id', 'is', null)
      .where('m.lifecycle_state', 'in', ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'TERMINATED'])
      .orderBy('m.id', 'desc')
      .executeTakeFirst();
  }

  private async loadOperation(executor: Kysely<DB>, operationId: number, forUpdate = false): Promise<OperationRow | undefined> {
    let q = executor.selectFrom('membership_renewal_operations').selectAll().where('id', '=', operationId);
    if (forUpdate) q = q.forUpdate();
    return (await q.executeTakeFirst()) as OperationRow | undefined;
  }

  private async openOperation(membershipId: number): Promise<OperationRow | undefined> {
    return (await db
      .selectFrom('membership_renewal_operations')
      .selectAll()
      .where('membership_id', '=', membershipId)
      .where('status', 'in', [...OPEN_OPERATION_STATUSES])
      .orderBy('id', 'desc')
      .executeTakeFirst()) as OperationRow | undefined;
  }

  private async latestOperation(membershipId: number): Promise<OperationRow | undefined> {
    return (await db
      .selectFrom('membership_renewal_operations')
      .selectAll()
      .where('membership_id', '=', membershipId)
      .orderBy('id', 'desc')
      .executeTakeFirst()) as OperationRow | undefined;
  }

  // Start of the current term: the applied operation that produced the
  // current term end, else the activation date.
  private async currentTermStart(membershipId: number, termEnd: Date | null, activatedAt: unknown): Promise<string | null> {
    if (termEnd) {
      const applied = await db
        .selectFrom('membership_renewal_operations')
        .select(['new_term_start', 'new_term_end'])
        .where('membership_id', '=', membershipId)
        .where('status', '=', 'APPLIED')
        .orderBy('id', 'desc')
        .executeTakeFirst();
      const appliedEnd = toDate(applied?.new_term_end);
      if (applied && appliedEnd && appliedEnd.getTime() === termEnd.getTime()) {
        return toMysqlDatetime(toDate(applied.new_term_start)!);
      }
    }
    const act = toDate(activatedAt);
    return act ? toMysqlDatetime(act) : null;
  }

  private async proofTypes(membershipClassId: number): Promise<string[]> {
    return parseDocumentTypes(
      await this.entitlements.getClassConfigValue(membershipClassId, RENEWAL_PROOF_DOCUMENT_TYPES_KEY),
    );
  }

  private async missingProof(operationId: number, required: string[]): Promise<string[]> {
    if (required.length === 0) return [];
    const accepted = await db
      .selectFrom('membership_application_documents')
      .select(['document_type'])
      .where('renewal_operation_id', '=', operationId)
      .where('upload_status', '=', 'UPLOADED')
      .where('review_status', '=', 'ACCEPTED')
      .execute();
    const have = new Set(accepted.map((d) => d.document_type));
    return required.filter((t) => !have.has(t));
  }

  // ── Status (+ user-triggered self-heal) ───────────────────────────────────

  async getStatus(userId: number) {
    const m = await this.currentMembership(userId);
    if (!m) {
      return { hasMembership: false as const, mode: 'NONE' as const, reason: 'NO_MEMBERSHIP' };
    }
    const membershipId = Number(m.id);
    const eligibleClass = isRelease1RenewalClass(m.class_code);

    if (eligibleClass) {
      // Self-heal: apply a COMPLETED obligation whose completion event was lost.
      const open = await this.openOperation(membershipId);
      if (open && open.status === 'AWAITING_PAYMENT' && open.contribution_id) {
        const c = await this.financial.getContribution(Number(open.contribution_id));
        if (c.state === 'COMPLETED') await this.applyCompletedOperation(Number(open.id));
      }
      await expireClosedRenewalOperations(this.financial, membershipId);
    }

    const fresh = (await this.currentMembership(userId))!;
    const termEnd = toDate(fresh.expires_at);
    const now = new Date();

    let windowDays: number | null = null;
    let configurationError: string | null = null;
    if (eligibleClass) {
      try {
        windowDays = parseWindowDays(
          await this.entitlements.getClassConfigValue(Number(fresh.membership_class_id), RENEWAL_WINDOW_DAYS_KEY),
          fresh.class_name ?? '',
        );
      } catch (err) {
        configurationError = (err as Error).message;
      }
    }

    const windowState = termEnd && windowDays ? evaluateRenewalWindow(termEnd, windowDays, now) : null;
    const window = termEnd && windowDays ? renewalWindow(termEnd, windowDays) : null;
    const lapsed =
      fresh.lifecycle_state === 'EXPIRED' ||
      (fresh.lifecycle_state === 'ACTIVE' && !!termEnd && now.getTime() >= termEnd.getTime());

    let mode: 'RENEWAL' | 'REINSTATEMENT' | 'NONE' = 'NONE';
    let reason: string | null = null;
    if (!eligibleClass) reason = 'CLASS_NOT_SELF_RENEWABLE';
    else if (configurationError) reason = 'CONFIGURATION_INCOMPLETE';
    else if (fresh.lifecycle_state === 'SUSPENDED' || fresh.lifecycle_state === 'TERMINATED') reason = fresh.lifecycle_state;
    else if (!termEnd) reason = 'NO_TERM_END';
    else if (lapsed) mode = 'REINSTATEMENT';
    else if (windowState === 'OPEN') mode = 'RENEWAL';
    else reason = 'WINDOW_NOT_YET_OPEN';

    const op = eligibleClass ? (await this.openOperation(membershipId)) ?? (await this.latestOperation(membershipId)) : undefined;
    const proofTypes = eligibleClass ? await this.proofTypes(Number(fresh.membership_class_id)) : [];

    let feePaise: number | null = null;
    let projectedTerm: { start: string; end: string } | null = null;
    if (eligibleClass && !configurationError) {
      const feeRaw = await this.entitlements.getClassConfigValue(Number(fresh.membership_class_id), 'fee_inr');
      feePaise = feeRaw ? Math.round(parseFloat(feeRaw) * 100) : null;
      if (mode === 'RENEWAL' && termEnd) {
        const end = await this.lifecycle.computeExpiry(
          { owner_type: 'INDIVIDUAL', membership_class_id: fresh.membership_class_id, group_membership_type_id: null },
          termEnd,
        );
        projectedTerm = { start: termEnd.toISOString(), end: toDate(end)!.toISOString() };
      }
    }

    return {
      hasMembership: true as const,
      membershipId,
      membershipNumber: fresh.membership_number,
      classCode: fresh.class_code,
      className: fresh.class_name,
      lifecycleState: fresh.lifecycle_state,
      termStart: iso(await this.currentTermStart(membershipId, termEnd, fresh.activated_at)),
      termEnd: termEnd ? termEnd.toISOString() : null,
      window: window ? { opensAt: window.opensAt.toISOString(), closesAt: window.closesAt.toISOString(), state: windowState } : null,
      mode,
      reason,
      configurationError,
      feePaise,
      projectedTerm,
      proofRequired: proofTypes.length > 0,
      requiredDocumentTypes: proofTypes,
      operation: op ? await this.describeOperation(op) : null,
    };
  }

  private async describeOperation(op: OperationRow) {
    const contribution = op.contribution_id ? await this.financial.getContribution(Number(op.contribution_id)) : null;
    const documents = await db
      .selectFrom('membership_application_documents')
      .select(['uuid', 'document_type', 'original_filename', 'upload_status', 'review_status', 'review_note'])
      .where('renewal_operation_id', '=', Number(op.id))
      .execute();
    return {
      id: Number(op.id),
      type: op.operation_type,
      status: op.status,
      previousTermStart: iso(op.previous_term_start),
      previousTermEnd: iso(op.previous_term_end),
      newTermStart: iso(op.new_term_start),
      newTermEnd: iso(op.new_term_end),
      decisionNote: op.decision_note,
      contribution: contribution
        ? {
            id: Number(contribution.id),
            state: String(contribution.state),
            amountPaise: Number(contribution.amount_paise),
            currency: String(contribution.currency),
          }
        : null,
      documents,
    };
  }

  // ── Self-service RENEWAL request ─────────────────────────────────────────

  async requestRenewal(
    userId: number,
    termsVersion: string,
    ipAddress: string | null,
    userAgent: string | null,
    auditContext?: AuditContext,
  ) {
    const m = await this.currentMembership(userId);
    if (!m) throw new ForbiddenException('No membership found for renewal.');
    if (!isRelease1RenewalClass(m.class_code)) {
      throw new ForbiddenException(`${m.class_name ?? 'This membership'} is not renewable through self-service.`);
    }
    const membershipId = Number(m.id);
    const classId = Number(m.membership_class_id);

    // A lost completion is applied first so a duplicate request never opens
    // a second term operation against a stale term end.
    const pre = await this.openOperation(membershipId);
    if (pre?.status === 'AWAITING_PAYMENT' && pre.contribution_id) {
      const c = await this.financial.getContribution(Number(pre.contribution_id));
      if (c.state === 'COMPLETED') await this.applyCompletedOperation(Number(pre.id));
    }
    await expireClosedRenewalOperations(this.financial, membershipId);

    const windowDays = parseWindowDays(
      await this.entitlements.getClassConfigValue(classId, RENEWAL_WINDOW_DAYS_KEY),
      m.class_name ?? '',
    );
    const proofTypes = await this.proofTypes(classId);

    // Membership row locked: eligibility re-checked and the operation created
    // under the lock; UNIQUE term_key / open_lock back it up at the DB layer.
    let opId: number;
    try {
      opId = await db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('memberships')
          .select(['id', 'lifecycle_state', 'expires_at', 'activated_at', 'membership_class_id', 'parent_membership_id'])
          .where('id', '=', membershipId)
          .forUpdate()
          .executeTakeFirstOrThrow();

        const termEnd = toDate(row.expires_at);
        if (row.lifecycle_state !== 'ACTIVE' || !termEnd) {
          throw new ConflictException(
            row.lifecycle_state === 'EXPIRED'
              ? 'The renewal window has closed. Request reinstatement instead.'
              : `Membership is ${row.lifecycle_state}; self-service renewal requires an ACTIVE membership with a term end.`,
          );
        }
        const state = evaluateRenewalWindow(termEnd, windowDays, new Date());
        if (state === 'NOT_YET_OPEN') {
          const { opensAt } = renewalWindow(termEnd, windowDays);
          throw new ConflictException(`Renewal opens on ${fmt(opensAt)} (${windowDays} days before your membership ends).`);
        }
        if (state === 'CLOSED') {
          throw new ConflictException('The renewal window has closed. Request reinstatement instead.');
        }

        const termKey = renewalTermKey(membershipId, termEnd);
        const existing = await trx
          .selectFrom('membership_renewal_operations')
          .select(['id', 'status'])
          .where('term_key', '=', termKey)
          .executeTakeFirst();
        if (existing) return Number(existing.id); // idempotent duplicate request

        const otherOpen = await trx
          .selectFrom('membership_renewal_operations')
          .select(['id'])
          .where('membership_id', '=', membershipId)
          .where('status', 'in', [...OPEN_OPERATION_STATUSES])
          .executeTakeFirst();
        if (otherOpen) {
          throw new ConflictException('Another renewal or reinstatement request is already open for this membership.');
        }

        const consent = await trx
          .insertInto('membership_consent_log')
          .values({ user_id: userId, consent_type: 'RENEWAL', terms_version: termsVersion, ip_address: ipAddress, user_agent: userAgent })
          .executeTakeFirstOrThrow();

        const previousStart = await this.currentTermStart(membershipId, termEnd, row.activated_at);
        const inserted = await trx
          .insertInto('membership_renewal_operations')
          .values({
            uuid: randomUUID(),
            membership_id: membershipId,
            user_id: userId,
            membership_class_id: classId,
            operation_type: 'RENEWAL',
            status: proofTypes.length > 0 ? 'PROOF_REQUIRED' : 'AWAITING_PAYMENT',
            previous_term_start: previousStart,
            previous_term_end: toMysqlDatetime(termEnd),
            consent_log_id: Number(consent.insertId),
            terms_version: termsVersion,
            term_key: termKey,
          })
          .executeTakeFirstOrThrow();
        const id = Number(inserted.insertId);

        await logMembershipAudit(
          {
            membershipId,
            eventType: 'RENEWAL_REQUESTED',
            actorType: 'MEMBER',
            actorUserId: userId,
            newValue: { operationId: id, previousTermEnd: toMysqlDatetime(termEnd), proofRequired: proofTypes.length > 0 },
          },
          trx,
        );
        return id;
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // Concurrent request won the UNIQUE term_key / open_lock: return its operation.
      const winner = await this.openOperation(membershipId);
      if (!winner || winner.operation_type !== 'RENEWAL') throw new ConflictException('A renewal request is already in progress.');
      opId = Number(winner.id);
    }

    await this.advanceRenewal(opId, proofTypes, auditContext);
    return this.getStatus(userId);
  }

  // PROOF_REQUIRED -> AWAITING_PAYMENT once every configured proof type is
  // ACCEPTED (and the window is still open); then ensure the one obligation.
  private async advanceRenewal(operationId: number, proofTypes: string[], auditContext?: AuditContext): Promise<void> {
    let op = await this.loadOperation(db, operationId);
    if (!op) throw new NotFoundException('Renewal operation not found.');

    if (op.status === 'PROOF_REQUIRED') {
      const missing = await this.missingProof(operationId, proofTypes);
      if (missing.length > 0) return; // no obligation, no payment until proof is accepted
      await db.transaction().execute(async (trx) => {
        await trx.selectFrom('memberships').select('id').where('id', '=', Number(op!.membership_id)).forUpdate().executeTakeFirst();
        const locked = await this.loadOperation(trx, operationId, true);
        if (!locked || locked.status !== 'PROOF_REQUIRED') return;
        const termEnd = toDate(locked.previous_term_end)!;
        if (new Date().getTime() >= termEnd.getTime()) {
          throw new ConflictException('The renewal window has closed. Request reinstatement instead.');
        }
        await trx
          .updateTable('membership_renewal_operations')
          .set({ status: 'AWAITING_PAYMENT' })
          .where('id', '=', operationId)
          .where('status', '=', 'PROOF_REQUIRED')
          .execute();
      });
      op = await this.loadOperation(db, operationId);
    }

    if (op && op.status === 'AWAITING_PAYMENT') {
      await this.ensureObligation(op, auditContext);
    }
  }

  // The ONE PAY-001 obligation for an operation. Looked up by its
  // deterministic key BEFORE pricing, so a fee changed after creation never
  // reprices it (the amount is frozen in the Contribution).
  private async ensureObligation(op: OperationRow, auditContext?: AuditContext) {
    const membershipId = Number(op.membership_id);
    const operationId = Number(op.id);
    const key =
      op.operation_type === 'RENEWAL'
        ? renewalContributionKey(membershipId, operationId)
        : reinstatementContributionKey(membershipId, operationId);

    let contribution = await this.financial.findByIdempotencyKey(key);
    if (!contribution) {
      const feeRaw = await this.entitlements.getClassConfigValue(Number(op.membership_class_id), 'fee_inr');
      const fee = feeRaw != null && feeRaw.trim() !== '' ? Number(feeRaw) : NaN;
      if (!Number.isFinite(fee) || fee < 0) {
        throw new ConflictException('Membership configuration is incomplete: this plan has no valid fee_inr.');
      }
      const amountPaise = Math.round(fee * 100);
      try {
        await this.financial.createContribution(
          {
            payerUserId: Number(op.user_id),
            businessModule: 'MEMBERSHIP',
            businessReferenceId: membershipId,
            purpose: op.operation_type === 'RENEWAL' ? 'Membership renewal fee' : 'Membership reinstatement fee',
            amountPaise,
            idempotencyKey: key,
            // Business-Module expiry policy recorded on the obligation: a
            // renewal obligation's window closes at the current term end.
            expiresAt: op.operation_type === 'RENEWAL' ? toDate(op.previous_term_end) : null,
          },
          auditContext,
        );
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err; // concurrent creator won uq_fc_idempotency_key
      }
      contribution = (await this.financial.findByIdempotencyKey(key))!;
    }

    const cid = Number(contribution.id);
    if (op.contribution_id == null) {
      await db
        .updateTable('membership_renewal_operations')
        .set({ contribution_id: cid, funded_amount_paise: Number(contribution.amount_paise) })
        .where('id', '=', operationId)
        .execute();
    }

    // A concurrent caller may advance the same Contribution first; losing
    // that race is fine as long as it has left CREATED.
    const tolerateRace = async (err: unknown) => {
      const now = await this.financial.getContribution(cid);
      if (now.state === 'CREATED') throw err;
    };
    if (Number(contribution.amount_paise) === 0) {
      if (contribution.state === 'CREATED' || contribution.state === 'AWAITING_SETTLEMENT') {
        await this.financial.processZeroValueContribution(cid).catch(async (err) => {
          const now = await this.financial.getContribution(cid);
          if (now.state !== 'COMPLETED') throw err;
        });
      }
      // Completion event applies it; applied here too (idempotent) in case
      // the in-process event is lost.
      await this.applyCompletedOperation(operationId);
    } else if (contribution.state === 'CREATED') {
      await this.financial.transitionContribution(cid, 'AWAITING_SETTLEMENT').catch(tolerateRace);
    }
  }

  // ── Student proof upload (renewal-scoped) ─────────────────────────────────
  // Confirm/review reuse the existing application-document endpoints (the
  // applicant check passes for the membership owner; review is staff-only).

  async requestProofUpload(
    userId: number,
    params: { documentType: string; originalFilename: string; mimeType: string; sizeBytes: number },
  ): Promise<{ documentUuid: string; uploadUrl: string }> {
    const m = await this.currentMembership(userId);
    if (!m) throw new ForbiddenException('No membership found.');
    const op = await this.openOperation(Number(m.id));
    if (!op || op.operation_type !== 'RENEWAL' || op.status !== 'PROOF_REQUIRED') {
      throw new ConflictException('No renewal is waiting for eligibility proof.');
    }
    const required = await this.proofTypes(Number(op.membership_class_id));
    if (!required.includes(params.documentType)) {
      throw new BadRequestException(`Document type must be one of: ${required.join(', ')}.`);
    }
    if (!ALLOWED_PROOF_MIME_TYPES.includes(params.mimeType)) {
      throw new BadRequestException(`Unsupported file type. Allowed: ${ALLOWED_PROOF_MIME_TYPES.join(', ')}.`);
    }
    if (params.sizeBytes <= 0 || params.sizeBytes > MAX_PROOF_BYTES) {
      throw new BadRequestException('File size must be between 1 byte and 10MB.');
    }

    const membership = await this.lifecycle.getOrThrow(Number(op.membership_id));
    const documentUuid = randomUUID();
    const safeName = params.originalFilename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
    const objectKey = `membership-renewals/${membership.uuid}/${Number(op.id)}/${documentUuid}-${safeName}`;
    const uploadUrl = await this.r2.presignUpload(objectKey, params.mimeType, params.sizeBytes);

    await db
      .insertInto('membership_application_documents')
      .values({
        uuid: documentUuid,
        membership_id: Number(op.membership_id),
        renewal_operation_id: Number(op.id),
        document_type: params.documentType,
        r2_object_key: objectKey,
        original_filename: params.originalFilename.slice(0, 255),
        mime_type: params.mimeType,
        size_bytes: params.sizeBytes,
        uploaded_by_user_id: userId,
      })
      .execute();
    return { documentUuid, uploadUrl };
  }

  // ── REINSTATEMENT ─────────────────────────────────────────────────────────

  async requestReinstatement(
    userId: number,
    termsVersion: string,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    const m = await this.currentMembership(userId);
    if (!m) throw new ForbiddenException('No membership found.');
    if (!isRelease1RenewalClass(m.class_code)) {
      throw new ForbiddenException(`${m.class_name ?? 'This membership'} is not eligible for self-service reinstatement.`);
    }
    const membershipId = Number(m.id);
    await expireClosedRenewalOperations(this.financial, membershipId);

    try {
      await db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('memberships')
          .select(['id', 'lifecycle_state', 'expires_at', 'activated_at', 'membership_class_id'])
          .where('id', '=', membershipId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        const termEnd = toDate(row.expires_at);
        const lapsed =
          row.lifecycle_state === 'EXPIRED' ||
          (row.lifecycle_state === 'ACTIVE' && !!termEnd && Date.now() >= termEnd.getTime());
        if (!lapsed) {
          throw new ConflictException(
            row.lifecycle_state === 'ACTIVE'
              ? 'Your membership is still current; use renewal during the renewal window.'
              : `Membership is ${row.lifecycle_state}; reinstatement is not available.`,
          );
        }
        const open = await trx
          .selectFrom('membership_renewal_operations')
          .select(['id', 'operation_type'])
          .where('membership_id', '=', membershipId)
          .where('status', 'in', [...OPEN_OPERATION_STATUSES])
          .executeTakeFirst();
        if (open) {
          if (open.operation_type === 'REINSTATEMENT') return; // idempotent
          throw new ConflictException('A renewal payment for this membership is still being settled.');
        }

        const consent = await trx
          .insertInto('membership_consent_log')
          .values({ user_id: userId, consent_type: 'RENEWAL', terms_version: termsVersion, ip_address: ipAddress, user_agent: userAgent })
          .executeTakeFirstOrThrow();
        const inserted = await trx
          .insertInto('membership_renewal_operations')
          .values({
            uuid: randomUUID(),
            membership_id: membershipId,
            user_id: userId,
            membership_class_id: Number(row.membership_class_id),
            operation_type: 'REINSTATEMENT',
            status: 'REQUESTED',
            previous_term_start: await this.currentTermStart(membershipId, termEnd, row.activated_at),
            previous_term_end: termEnd ? toMysqlDatetime(termEnd) : null,
            consent_log_id: Number(consent.insertId),
            terms_version: termsVersion,
            term_key: null,
          })
          .executeTakeFirstOrThrow();
        await logMembershipAudit(
          {
            membershipId,
            eventType: 'REINSTATEMENT_REQUESTED',
            actorType: 'MEMBER',
            actorUserId: userId,
            newValue: { operationId: Number(inserted.insertId) },
          },
          trx,
        );
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err; // concurrent request won open_lock
    }
    return this.getStatus(userId);
  }

  // Admin decision. Rejection happens BEFORE any obligation exists -- there
  // is no refund path. Approval creates the PAY-001 obligation (fee frozen now).
  async decideReinstatement(
    operationId: number,
    actorUserId: number,
    decision: 'APPROVED' | 'REJECTED',
    note: string | null,
    auditContext?: AuditContext,
  ) {
    await db.transaction().execute(async (trx) => {
      // Lock order matches every other term operation: membership row, then operation row.
      const peek = await this.loadOperation(trx, operationId);
      if (!peek) throw new NotFoundException('Reinstatement request not found.');
      const membership = await trx
        .selectFrom('memberships')
        .select(['lifecycle_state'])
        .where('id', '=', Number(peek.membership_id))
        .forUpdate()
        .executeTakeFirstOrThrow();
      const locked = (await this.loadOperation(trx, operationId, true))!;
      if (locked.operation_type !== 'REINSTATEMENT') {
        throw new BadRequestException('Only reinstatement requests require an administrative decision.');
      }
      if (locked.status !== 'REQUESTED') {
        throw new ConflictException(`Reinstatement request ${operationId} is ${locked.status}; it has already been decided.`);
      }
      if (decision === 'APPROVED' && !['EXPIRED', 'ACTIVE'].includes(membership.lifecycle_state)) {
        throw new ConflictException(`Membership is ${membership.lifecycle_state}; reinstatement cannot be approved.`);
      }
      await trx
        .updateTable('membership_renewal_operations')
        .set({
          status: decision === 'APPROVED' ? 'AWAITING_PAYMENT' : 'REJECTED',
          decided_by_user_id: actorUserId,
          decision_note: note?.slice(0, 500) ?? null,
          decided_at: toMysqlDatetime(new Date()),
        })
        .where('id', '=', operationId)
        .execute();
      await logMembershipAudit(
        {
          membershipId: Number(locked.membership_id),
          eventType: decision === 'APPROVED' ? 'REINSTATEMENT_APPROVED' : 'REINSTATEMENT_REJECTED',
          actorType: 'ADMIN',
          actorUserId,
          newValue: { operationId },
          notes: note,
        },
        trx,
      );
    });

    if (decision === 'APPROVED') {
      const fresh = (await this.loadOperation(db, operationId))!;
      await this.ensureObligation(fresh, auditContext);
    }
    return this.describeOperation((await this.loadOperation(db, operationId))!);
  }

  async listOperations(status?: RenewalOperationStatus) {
    let q = db
      .selectFrom('membership_renewal_operations as o')
      .innerJoin('memberships as m', 'm.id', 'o.membership_id')
      .innerJoin('users as u', 'u.id', 'o.user_id')
      .leftJoin('membership_classes as mc', 'mc.id', 'o.membership_class_id')
      .select([
        'o.id',
        'o.operation_type',
        'o.status',
        'o.previous_term_end',
        'o.new_term_start',
        'o.new_term_end',
        'o.contribution_id',
        'o.funded_amount_paise',
        'o.created_at',
        'o.decision_note',
        'm.id as membership_id',
        'm.membership_number',
        'm.lifecycle_state',
        'u.full_name',
        'u.email',
        'mc.name as class_name',
      ])
      .orderBy('o.id', 'desc')
      .limit(200);
    if (status) q = q.where('o.status', '=', status);
    return q.execute();
  }

  // ── PAY-001 completion / failure ──────────────────────────────────────────

  // Returns true when the Contribution belongs to a renewal/reinstatement
  // operation (handled here); false lets the existing membership handling run.
  async handleContributionCompleted(payload: FinancialEngineEventPayload): Promise<boolean> {
    const parsed = await this.operationForContribution(payload.contributionId, payload.businessReferenceId);
    if (!parsed) return false;
    await this.applyCompletedOperation(parsed.operationId);
    return true;
  }

  async handleSettlementFailed(payload: FinancialEngineEventPayload): Promise<boolean> {
    const parsed = await this.operationForContribution(payload.contributionId, payload.businessReferenceId);
    if (!parsed) return false;
    // Record only: the obligation stays retryable (PAY-001 §6); the
    // membership and the operation are unchanged.
    await logMembershipAudit({
      membershipId: parsed.membershipId,
      eventType: 'PAYMENT_FAILED',
      actorType: 'SYSTEM',
      newValue: { operationId: parsed.operationId, operationType: parsed.operationType, contributionId: payload.contributionId },
    });
    return true;
  }

  private async operationForContribution(contributionId: number | undefined, membershipId: number) {
    if (contributionId == null) return null;
    const contribution = await this.financial.getContribution(contributionId);
    if (String(contribution.business_module) !== 'MEMBERSHIP') return null;
    const parsed = parseRenewalOperationKey(String(contribution.idempotency_key));
    if (!parsed || parsed.membershipId !== Number(membershipId)) return null;
    return parsed;
  }

  // The single idempotent application handler (listener + self-heal + zero
  // value). Membership row and operation row locked; applies at most once.
  async applyCompletedOperation(operationId: number): Promise<void> {
    const outcome: ApplyOutcome = await db.transaction().execute(async (trx): Promise<ApplyOutcome> => {
      const peek = await this.loadOperation(trx, operationId);
      if (!peek) return { kind: 'NOOP' };
      const membership = await trx
        .selectFrom('memberships')
        .select(['id', 'lifecycle_state', 'expires_at', 'owner_type', 'membership_class_id', 'group_membership_type_id'])
        .where('id', '=', Number(peek.membership_id))
        .forUpdate()
        .executeTakeFirstOrThrow();
      const op = (await this.loadOperation(trx, operationId, true))!;
      if (op.status === 'APPLIED' || op.status === 'BLOCKED') return { kind: 'NOOP' };
      if (!op.contribution_id) return { kind: 'NOOP' };

      const contribution = await this.financial.getContribution(Number(op.contribution_id), trx);
      if (contribution.state !== 'COMPLETED') return { kind: 'NOOP' };

      const block = async (reason: string): Promise<ApplyOutcome> => {
        await trx
          .updateTable('membership_renewal_operations')
          .set({ status: 'BLOCKED', decision_note: reason.slice(0, 500), decided_at: toMysqlDatetime(new Date()) })
          .where('id', '=', operationId)
          .execute();
        await logMembershipAudit(
          { membershipId: Number(membership.id), eventType: 'RENEWAL_APPLICATION_BLOCKED', actorType: 'SYSTEM', newValue: { operationId }, notes: reason },
          trx,
        );
        return { kind: 'BLOCKED', op, reason };
      };

      if (op.status !== 'AWAITING_PAYMENT') {
        return block(`Settlement completed for a ${op.status} ${op.operation_type.toLowerCase()} operation.`);
      }

      const currentEnd = toDate(membership.expires_at);
      const previousEnd = toDate(op.previous_term_end);
      const sameTerm =
        (currentEnd === null && previousEnd === null) ||
        (!!currentEnd && !!previousEnd && currentEnd.getTime() === previousEnd.getTime());
      if (!['ACTIVE', 'EXPIRED'].includes(membership.lifecycle_state)) {
        return block(`Membership is ${membership.lifecycle_state}; the ${op.operation_type.toLowerCase()} cannot be applied.`);
      }
      if (!sameTerm) {
        return block('Another term operation has already changed this membership term.');
      }

      let newStartDate: Date;
      if (op.operation_type === 'RENEWAL') {
        // Term continuity: new term starts at the previous term end -- never
        // the payment, approval, webhook or server date (no gap, no overlap).
        newStartDate = previousEnd!;
      } else {
        // Reinstatement: starts at genuine payment completion.
        const txn = await trx
          .selectFrom('financial_transactions')
          .select(['created_at'])
          .where('contribution_id', '=', Number(op.contribution_id))
          .where('outcome', '=', 'SUCCEEDED')
          .orderBy('created_at', 'desc')
          .executeTakeFirst();
        newStartDate = toDate(txn?.created_at) ?? toDate(contribution.updated_at) ?? new Date();
        if (membership.lifecycle_state === 'ACTIVE' && currentEnd && newStartDate.getTime() < currentEnd.getTime()) {
          return block('Membership term has not ended; reinstatement cannot overlap the current term.');
        }
      }
      const newEnd = await this.lifecycle.computeExpiry(
        { owner_type: 'INDIVIDUAL', membership_class_id: Number(op.membership_class_id), group_membership_type_id: null },
        newStartDate,
      );
      if (!newEnd) return block('This membership plan has no renewable term.');
      const newStart = toMysqlDatetime(newStartDate);

      // Existing row only: lifecycle ACTIVE (EXPIRED -> ACTIVE where lapsed),
      // new term end. membership_number / number_serial / class untouched.
      await trx
        .updateTable('memberships')
        .set({ lifecycle_state: 'ACTIVE', expires_at: newEnd, last_payment_status: 'SUCCEEDED' })
        .where('id', '=', Number(membership.id))
        .execute();
      await trx
        .updateTable('membership_renewal_operations')
        .set({
          status: 'APPLIED',
          new_term_start: newStart,
          new_term_end: newEnd,
          applied_at: toMysqlDatetime(new Date()),
        })
        .where('id', '=', operationId)
        .where('status', '=', 'AWAITING_PAYMENT')
        .execute();
      await logMembershipAudit(
        {
          membershipId: Number(membership.id),
          eventType: op.operation_type === 'RENEWAL' ? 'MEMBERSHIP_RENEWED' : 'MEMBERSHIP_REINSTATED',
          actorType: 'SYSTEM',
          oldValue: { state: membership.lifecycle_state, expiresAt: currentEnd ? toMysqlDatetime(currentEnd) : null },
          newValue: {
            state: 'ACTIVE',
            operationId,
            contributionId: Number(op.contribution_id),
            newTermStart: newStart,
            newTermEnd: newEnd,
          },
        },
        trx,
      );
      return { kind: 'APPLIED', op, newStart, newEnd, wasExpired: membership.lifecycle_state === 'EXPIRED' };
    });

    if (outcome.kind === 'BLOCKED') {
      // Blocked application: the completed payment is routed through PAY-001's
      // established handling -- an automatic SYSTEM refund (F-002 precedent).
      await this.financial
        .requestRefund(
          Number(outcome.op.contribution_id),
          `Automatic refund: ${outcome.op.operation_type.toLowerCase()} could not be applied (${outcome.reason})`,
          { actorType: 'SYSTEM', actorUserId: null },
        )
        .catch((err: Error) => this.logger.error(`Refund for blocked operation ${operationId} failed: ${err.message}`));
      return;
    }
    if (outcome.kind !== 'APPLIED') return;

    const membership = await this.lifecycle.getOrThrow(Number(outcome.op.membership_id));
    const [user, cls] = await Promise.all([
      db.selectFrom('users').select('full_name').where('id', '=', Number(outcome.op.user_id)).executeTakeFirst(),
      db.selectFrom('membership_classes').select('name').where('id', '=', Number(outcome.op.membership_class_id)).executeTakeFirst(),
    ]);
    await this.communication
      .dispatch(
        outcome.op.operation_type === 'RENEWAL' ? 'MEMBERSHIP_RENEWED' : 'MEMBERSHIP_REINSTATED',
        Number(outcome.op.user_id),
        {
          full_name: user?.full_name ?? '',
          membership_class: cls?.name ?? '',
          membership_number: membership.membership_number ?? '',
          valid_from: fmt(toDate(outcome.newStart)),
          valid_to: fmt(toDate(outcome.newEnd)),
          expiry_date: fmt(toDate(outcome.newEnd)),
          portal_link: `${process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info'}/hub/`,
        },
        { actionUrl: '/hub/' },
      )
      .catch((err: Error) => this.logger.error(`Renewal notification for operation ${operationId} failed: ${err.message}`));
  }
}
