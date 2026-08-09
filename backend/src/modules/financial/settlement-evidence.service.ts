// backend/src/modules/financial/settlement-evidence.service.ts
//
// Financial Engine — Settlement Evidence (Step 10: manual settlement
// foundation). Owns: financial_settlement_evidence.
//
// Settlement Evidence is NOT a PAY-001 canonical entity. It represents
// "someone claims that payment occurred" -- a mutable, reviewable claim
// that precedes (and, on approval, produces) an authoritative Financial
// Transaction via FinancialContributionService.recordSettlementOutcome().
//
// This service never inserts into financial_transactions directly -- that
// would bypass FinancialContributionService's ownership of the Contribution
// state machine and Transaction immutability guarantees. It only ever
// calls recordSettlementOutcome(), same as any future Settlement Provider
// integration (e.g. a Razorpay webhook handler) would.
//
// Generic by design: no Membership/Event/Contest-specific knowledge here.
// Only financial_contribution_id, never a business-module FK.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import { R2Service } from '../shared/storage/r2.service';
import { FinancialContributionService } from './financial-contribution.service';

export interface SubmitEvidenceInput {
  financialContributionId: number;
  referenceIdentifier: string;
  paymentDate: Date;
  claimedAmountPaise: number;
  proofObjectKey?: string | null;
  proofMimeType?: string | null;
  submittedByUserId: number;
}

// Payment proof is supplementary evidence, not a document-review workflow --
// same allowlist/size ceiling as membership application documents
// (application-workflow.service.ts), the closest existing analog for a
// screenshot/PDF receipt upload.
const PROOF_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_PROOF_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const PROOF_READ_TTL_SECONDS = 5 * 60;
const PROOF_MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class SettlementEvidenceService {
  constructor(
    private readonly financialService: FinancialContributionService,
    private readonly r2: R2Service,
  ) {}

  // ── Payment proof upload target ─────────────────────────────────────────
  //
  // Presigned-PUT only (R2Service.presignUpload), same pattern as
  // ApplicationWorkflowService.requestDocumentUpload(). The object key is
  // entirely server-generated -- financial-evidence/{contribution.uuid}/{uuid}.{ext}
  // -- the client never chooses a bucket, folder, or key. No DB row is
  // created here: financial_settlement_evidence has no upload_status/
  // AWAITING_UPLOAD concept (unlike membership_application_documents), so
  // the object key is only persisted once submit() is called with it.
  async requestProofUpload(params: {
    financialContributionId: number;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{ objectKey: string; uploadUrl: string }> {
    const contribution = await this.financialService.getContribution(params.financialContributionId);
    if (contribution.state !== 'SETTLEMENT_IN_PROGRESS') {
      throw new ConflictException(
        `Contribution ${params.financialContributionId} is in state '${contribution.state}'; ` +
        `payment-proof upload can only be requested while the contribution is SETTLEMENT_IN_PROGRESS.`,
      );
    }

    if (!PROOF_MIME_TYPES.includes(params.mimeType)) {
      throw new BadRequestException(`Unsupported file type. Allowed: ${PROOF_MIME_TYPES.join(', ')}.`);
    }
    if (params.sizeBytes <= 0 || params.sizeBytes > MAX_PROOF_UPLOAD_BYTES) {
      throw new BadRequestException(`File size must be between 1 byte and ${MAX_PROOF_UPLOAD_BYTES / (1024 * 1024)}MB.`);
    }

    const objectKey = `financial-evidence/${contribution.uuid}/${randomUUID()}.${PROOF_MIME_EXTENSIONS[params.mimeType]}`;
    const uploadUrl = await this.r2.presignUpload(objectKey, params.mimeType, params.sizeBytes);
    return { objectKey, uploadUrl };
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  // Append-only: a rejected evidence row is never overwritten. A retry
  // after rejection is a NEW row via this method again (Step 9 §D/Step 10
  // Part 4) -- callers do not update prior rows, they call submit() again.
  async submit(input: SubmitEvidenceInput): Promise<{ id: number; uuid: string }> {
    const contribution = await this.financialService.getContribution(input.financialContributionId);
    if (contribution.state !== 'SETTLEMENT_IN_PROGRESS') {
      throw new ConflictException(
        `Contribution ${input.financialContributionId} is in state '${contribution.state}'; ` +
        `settlement evidence can only be submitted while the contribution is SETTLEMENT_IN_PROGRESS.`,
      );
    }

    // Proof is optional (Step 13 §3): a submission with no proofObjectKey is
    // always valid. When one IS supplied, re-validate it server-side rather
    // than trusting the client -- mimeType against the same allowlist used
    // to presign it, the key against this contribution's own namespace (so
    // a proof requested for one contribution can never be attached to
    // another), and existence in R2 via HEAD (mirrors
    // confirmDocumentUpload()'s guard against referencing an object that
    // was never actually uploaded). The authoritative size always comes
    // from R2's HEAD response, never a client-supplied value.
    let proofSizeBytes: number | null = null;
    if (input.proofObjectKey) {
      if (!input.proofMimeType || !PROOF_MIME_TYPES.includes(input.proofMimeType)) {
        throw new BadRequestException(
          `proofMimeType must be one of: ${PROOF_MIME_TYPES.join(', ')} when proofObjectKey is supplied.`,
        );
      }
      const expectedPrefix = `financial-evidence/${contribution.uuid}/`;
      if (!input.proofObjectKey.startsWith(expectedPrefix)) {
        throw new BadRequestException('proofObjectKey does not belong to this contribution.');
      }
      const head = await this.r2.headObject(input.proofObjectKey);
      if (!head.exists) {
        throw new ConflictException(
          'The payment-proof file has not arrived in storage yet. Complete the upload, then submit again.',
        );
      }
      proofSizeBytes = head.sizeBytes;
    }

    const uuid = randomUUID();
    const result = await db
      .insertInto('financial_settlement_evidence')
      .values({
        uuid,
        financial_contribution_id: input.financialContributionId,
        reference_identifier: input.referenceIdentifier,
        payment_date: toMysqlDatetime(input.paymentDate).slice(0, 10),
        claimed_amount_paise: input.claimedAmountPaise,
        proof_object_key: input.proofObjectKey ?? null,
        proof_mime_type: input.proofObjectKey ? input.proofMimeType : null,
        proof_size_bytes: input.proofObjectKey ? proofSizeBytes : null,
        submitted_by_user_id: input.submittedByUserId,
      })
      .executeTakeFirstOrThrow();

    return { id: Number(result.insertId), uuid };
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getEvidence(id: number) {
    const row = await db
      .selectFrom('financial_settlement_evidence')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException(`Settlement evidence ${id} not found.`);
    return row;
  }

  async listForContribution(contributionId: number) {
    return db
      .selectFrom('financial_settlement_evidence')
      .selectAll()
      .where('financial_contribution_id', '=', contributionId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  // ── Payment proof read (Step 14) ────────────────────────────────────────
  //
  // Resolves evidenceId -> its own proof_object_key and signs a short-lived
  // GET URL. The caller never supplies an object key -- this is the only
  // path by which a verifier can read a proof file, and it can only ever
  // resolve the object that this specific evidence row recorded at submit
  // time. Authorization (financial.settlement.verify) is enforced by the
  // controller, same split as every other route in this service.
  async getProofReadUrl(evidenceId: number): Promise<{ url: string; expiresAt: Date }> {
    const evidence = await this.getEvidence(evidenceId);
    if (!evidence.proof_object_key) {
      throw new NotFoundException(`Evidence ${evidenceId} has no payment proof attached.`);
    }

    const contribution = await this.financialService.getContribution(evidence.financial_contribution_id);
    const expectedPrefix = `financial-evidence/${contribution.uuid}/`;
    if (!evidence.proof_object_key.startsWith(expectedPrefix)) {
      // Defensive only -- proof_object_key is server-generated and validated
      // against this same prefix at submit() time. A mismatch here means
      // stored data has drifted from the namespace invariant, not that the
      // request is malicious.
      throw new ConflictException(`Evidence ${evidenceId} proof object is outside its expected namespace.`);
    }

    const head = await this.r2.headObject(evidence.proof_object_key);
    if (!head.exists) {
      throw new NotFoundException(`The stored payment-proof file for evidence ${evidenceId} could not be found in storage.`);
    }

    const url = await this.r2.presignRead(evidence.proof_object_key, PROOF_READ_TTL_SECONDS);
    const expiresAt = new Date(Date.now() + PROOF_READ_TTL_SECONDS * 1000);
    return { url, expiresAt };
  }

  // ── Admin verification ───────────────────────────────────────────────────

  // Approve: marks evidence APPROVED (guarded against double-approval via a
  // conditional UPDATE), then calls recordSettlementOutcome() -- which owns
  // the immutable Financial Transaction insert, Contribution transition,
  // and Receipt issuance. This method never touches financial_transactions.
  //
  // The Transaction is recorded against the Contribution's own authoritative
  // amount_paise, not the evidence's claimed_amount_paise -- if they
  // disagree, that is a rejection-worthy discrepancy, not something to
  // silently reconcile at approval time.
  async approve(
    evidenceId: number,
    reviewerUserId: number,
    provider: string,
    note?: string | null,
  ): Promise<{ transactionId: number }> {
    const evidence = await this.getEvidence(evidenceId);
    if (evidence.review_status !== 'PENDING_REVIEW') {
      throw new ConflictException(
        `Evidence ${evidenceId} is already '${evidence.review_status}'; only PENDING_REVIEW evidence can be approved.`,
      );
    }

    const contribution = await this.financialService.getContribution(evidence.financial_contribution_id);
    if (Number(evidence.claimed_amount_paise) !== Number(contribution.amount_paise)) {
      throw new ConflictException(
        `Evidence ${evidenceId} claims ${evidence.claimed_amount_paise} paise but contribution ` +
        `${contribution.id} requires ${contribution.amount_paise} paise. Reject this evidence and ` +
        `request a corrected submission rather than approving a mismatched amount.`,
      );
    }

    const updateResult = await db
      .updateTable('financial_settlement_evidence')
      .set({
        review_status: 'APPROVED',
        reviewed_by_user_id: reviewerUserId,
        reviewed_at: toMysqlDatetime(new Date()),
        review_note: note ?? null,
      })
      .where('id', '=', evidenceId)
      .where('review_status', '=', 'PENDING_REVIEW')
      .executeTakeFirst();

    if (Number(updateResult.numUpdatedRows ?? 0) === 0) {
      throw new ConflictException(`Evidence ${evidenceId} was already reviewed by a concurrent request.`);
    }

    const { transactionId } = await this.financialService.recordSettlementOutcome(
      evidence.financial_contribution_id,
      {
        provider,
        providerReference: evidence.reference_identifier,
        result: 'SUCCEEDED',
        amountPaise: Number(contribution.amount_paise),
      },
    );

    return { transactionId };
  }

  // Reject: marks evidence REJECTED, then calls recordSettlementOutcome()
  // with result='FAILED'. Per PAY-001 ("Failed is not a terminal state"),
  // this leaves the Contribution retryable -- transitionContribution() inside
  // recordSettlementOutcome() moves it to FAILED, from which a member may
  // submit() a fresh evidence row after the Contribution returns to
  // AWAITING_SETTLEMENT (a Business Module or a future retry endpoint calls
  // transitionContribution(id, 'AWAITING_SETTLEMENT') to re-open it, then
  // 'SETTLEMENT_IN_PROGRESS' again -- unchanged from the existing state
  // machine; not modified by this step).
  async reject(
    evidenceId: number,
    reviewerUserId: number,
    provider: string,
    reason: string,
  ): Promise<{ transactionId: number }> {
    const evidence = await this.getEvidence(evidenceId);
    if (evidence.review_status !== 'PENDING_REVIEW') {
      throw new ConflictException(
        `Evidence ${evidenceId} is already '${evidence.review_status}'; only PENDING_REVIEW evidence can be rejected.`,
      );
    }

    const contribution = await this.financialService.getContribution(evidence.financial_contribution_id);

    const updateResult = await db
      .updateTable('financial_settlement_evidence')
      .set({
        review_status: 'REJECTED',
        reviewed_by_user_id: reviewerUserId,
        reviewed_at: toMysqlDatetime(new Date()),
        review_note: reason,
      })
      .where('id', '=', evidenceId)
      .where('review_status', '=', 'PENDING_REVIEW')
      .executeTakeFirst();

    if (Number(updateResult.numUpdatedRows ?? 0) === 0) {
      throw new ConflictException(`Evidence ${evidenceId} was already reviewed by a concurrent request.`);
    }

    const { transactionId } = await this.financialService.recordSettlementOutcome(
      evidence.financial_contribution_id,
      {
        provider,
        providerReference: evidence.reference_identifier,
        result: 'FAILED',
        amountPaise: Number(contribution.amount_paise),
        failureReason: reason,
      },
    );

    return { transactionId };
  }
}
