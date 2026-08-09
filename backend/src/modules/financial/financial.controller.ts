// backend/src/modules/financial/financial.controller.ts
//
// Financial Engine HTTP surface (Step 11: manual settlement API).
//
// Generic by design: every route operates on a financial_contribution_id
// only. No membershipId/eventId/contestId parameter exists anywhere in this
// controller -- the Contribution itself already identifies the business
// obligation (PAY-001 §OWNERSHIP RULE). This is deliberately NOT a
// MembershipPaymentController; any Business Module's contribution can flow
// through these same routes.
//
// Route prefix: api/v1/financial (no global prefix -- every controller
// declares its full path per CLAUDE.md §4.1).
//
// Ownership model: a member may act on a Financial Contribution only if
// they are its payer_user_id. Reviewing/approving/rejecting evidence
// requires the financial.settlement.verify permission (RbacGuard), same
// mechanism as every other admin action in this repository (e.g.
// ApplicationWorkflowController's document review endpoints).
//
// Controllers never write financial_contributions/financial_transactions/
// receipts/financial_settlement_evidence review outcomes directly -- every
// mutation routes through FinancialContributionService or
// SettlementEvidenceService, which in turn routes financial outcomes
// exclusively through FinancialContributionService.recordSettlementOutcome().

import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/token.util';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RequirePermissions } from '../identity/rbac/permissions.decorator';
import { RbacService } from '../identity/rbac/rbac.service';
import { FinancialContributionService } from './financial-contribution.service';
import { SettlementEvidenceService } from './settlement-evidence.service';
import { SubmitSettlementEvidenceDto } from './dto/submit-settlement-evidence.dto';
import { ApproveSettlementEvidenceDto } from './dto/approve-settlement-evidence.dto';
import { RejectSettlementEvidenceDto } from './dto/reject-settlement-evidence.dto';
import { RequestEvidenceProofUploadDto } from './dto/request-evidence-proof-upload.dto';

// Generic settlement-mechanism marker for manual (offline) settlement in
// this step. Deliberately NOT 'UPI'/'BANK_TRANSFER'/'RAZORPAY' -- Step 11
// scope explicitly excludes inventing method/provider identifiers. This
// value never reaches the API surface; it is an internal implementation
// constant passed to recordSettlementOutcome() via SettlementEvidenceService.
const MANUAL_SETTLEMENT_PROVIDER = 'MANUAL';

const VERIFY_PERMISSION = 'financial.settlement.verify';

@Controller('api/v1/financial')
export class FinancialController {
  constructor(
    private readonly financialService: FinancialContributionService,
    private readonly evidenceService: SettlementEvidenceService,
    private readonly rbac: RbacService,
  ) {}

  private async isVerifier(userId: number): Promise<boolean> {
    const keys = await this.rbac.getActivePermissionKeys(userId);
    return keys.has(VERIFY_PERMISSION);
  }

  private async assertOwnedContribution(contributionId: number, userId: number) {
    const contribution = await this.financialService.getContribution(contributionId);
    if (Number(contribution.payer_user_id) !== userId) {
      throw new ForbiddenException('You do not have access to this financial contribution.');
    }
    return contribution;
  }

  // ── Start settlement ────────────────────────────────────────────────────

  @Post('contributions/:id/settlement/start')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async startSettlement(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    await this.assertOwnedContribution(id, actor.sub);
    const { contributionState } = await this.financialService.startSettlement(id);
    return { contributionId: id, state: contributionState };
  }

  // ── Razorpay settlement order initiation (Step 18) ──────────────────────
  //
  // Owner-only, same authorization model as start-settlement -- initiating
  // a provider checkout is a payer action, not an admin review action.
  // Additive to the existing manual-evidence path: both share
  // startSettlement()'s AWAITING_SETTLEMENT → SETTLEMENT_IN_PROGRESS
  // transition, so a Contribution may still be settled manually even
  // though this route exists. Returns exactly what a future Razorpay
  // Checkout frontend needs (order id, public key id, amount, currency) --
  // never a secret (PAY-001 Step 18 Part 15/21).

  @Post('contributions/:id/settlement/razorpay-order')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async createRazorpayOrder(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    await this.assertOwnedContribution(id, actor.sub);
    const order = await this.financialService.initiateProviderSettlement(id);
    return {
      contributionId: order.contributionId,
      state: order.contributionState,
      provider: order.providerName,
      orderReference: order.providerOrderReference,
      amountPaise: order.amountPaise,
      currency: order.currency,
      providerPublicKeyId: order.providerPublicKeyId ?? null,
    };
  }

  // ── Contribution status (Step 20) ────────────────────────────────────────
  //
  // Owner-only read of a Contribution's current authoritative state. This is
  // the only status source the Razorpay Checkout frontend may trust after a
  // browser success callback -- the callback itself only reports what the
  // Checkout SDK observed client-side, never a settlement outcome (PAY-001
  // Step 18: only the signed webhook may resolve a Contribution). The
  // frontend polls this route until state leaves SETTLEMENT_IN_PROGRESS.

  @Get('contributions/:id')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async getContributionStatus(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    const contribution = await this.assertOwnedContribution(id, actor.sub);
    return {
      contributionId: id,
      state: contribution.state,
      amountPaise: Number(contribution.amount_paise),
      currency: contribution.currency,
    };
  }

  // ── Retry settlement ─────────────────────────────────────────────────────
  //
  // Reopens a FAILED or ABANDONED Contribution for a new Settlement Attempt
  // (Step 12). Owner-only, same authorization model as start-settlement --
  // retry is a re-engagement action initiated by the payer, not an admin
  // review action, so it uses assertOwnedContribution() rather than the
  // verifier bypass used by the read/evidence-review routes below.

  @Post('contributions/:id/settlement/retry')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async retrySettlement(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    await this.assertOwnedContribution(id, actor.sub);
    const { contributionState } = await this.financialService.retrySettlement(id);
    return { contributionId: id, state: contributionState };
  }

  // ── Payment proof upload (Step 13) ──────────────────────────────────────
  //
  // Owner-only, same as submitEvidence -- proof is requested against a
  // contribution the actor already owns, before evidence exists. Reuses
  // the existing R2 presigned-PUT storage abstraction (StorageModule)
  // exclusively via SettlementEvidenceService; this controller never talks
  // to R2Service directly.

  @Post('contributions/:id/settlement/evidence/proof/request-upload')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async requestProofUpload(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestEvidenceProofUploadDto,
  ) {
    await this.assertOwnedContribution(id, actor.sub);
    const { objectKey, uploadUrl } = await this.evidenceService.requestProofUpload({
      financialContributionId: id,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
    return { objectKey, uploadUrl, mimeType: dto.mimeType };
  }

  // ── Evidence submission ─────────────────────────────────────────────────

  @Post('contributions/:id/settlement/evidence')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async submitEvidence(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitSettlementEvidenceDto,
  ) {
    await this.assertOwnedContribution(id, actor.sub);
    const { id: evidenceId, uuid } = await this.evidenceService.submit({
      financialContributionId: id,
      referenceIdentifier: dto.referenceIdentifier,
      paymentDate: new Date(dto.paymentDate),
      claimedAmountPaise: dto.claimedAmountPaise,
      proofObjectKey: dto.proofObjectKey ?? null,
      proofMimeType: dto.proofMimeType ?? null,
      submittedByUserId: actor.sub,
    });
    return { id: evidenceId, uuid, reviewStatus: 'PENDING_REVIEW' as const };
  }

  // ── Evidence retrieval ──────────────────────────────────────────────────

  @Get('contributions/:id/settlement/evidence')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async listEvidenceForContribution(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    if (!(await this.isVerifier(actor.sub))) {
      await this.assertOwnedContribution(id, actor.sub);
    }
    const rows = await this.evidenceService.listForContribution(id);
    return rows.map((row) => this.toEvidenceResponse(row));
  }

  @Get('settlement/evidence/:evidenceId')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async getEvidence(@CurrentUser() actor: AccessTokenPayload, @Param('evidenceId', ParseIntPipe) evidenceId: number) {
    const evidence = await this.evidenceService.getEvidence(evidenceId);
    if (!(await this.isVerifier(actor.sub))) {
      await this.assertOwnedContribution(evidence.financial_contribution_id, actor.sub);
    }
    return this.toEvidenceResponse(evidence);
  }

  // ── Admin verification ──────────────────────────────────────────────────

  @Post('settlement/evidence/:evidenceId/approve')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions(VERIFY_PERMISSION)
  async approveEvidence(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('evidenceId', ParseIntPipe) evidenceId: number,
    @Body() dto: ApproveSettlementEvidenceDto,
  ) {
    const { transactionId } = await this.evidenceService.approve(
      evidenceId,
      actor.sub,
      MANUAL_SETTLEMENT_PROVIDER,
      dto.note,
    );
    return { evidenceId, transactionId, reviewStatus: 'APPROVED' as const };
  }

  // ── Payment proof read (Step 14) ────────────────────────────────────────
  //
  // Verifier-only: mirrors the membership document review precedent
  // (application-workflow.controller `GET :id/documents` requires
  // membership.record.view, not owner access) -- this repository does not
  // give evidence submitters a document-download route, only visibility
  // into hasProof/mime/size via the existing evidence read endpoints. The
  // client supplies only evidenceId; the object key is resolved entirely
  // server-side by SettlementEvidenceService.getProofReadUrl().

  @Get('settlement/evidence/:evidenceId/proof')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions(VERIFY_PERMISSION)
  async getEvidenceProof(@Param('evidenceId', ParseIntPipe) evidenceId: number) {
    const { url, expiresAt } = await this.evidenceService.getProofReadUrl(evidenceId);
    return { url, expiresAt };
  }

  @Post('settlement/evidence/:evidenceId/reject')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions(VERIFY_PERMISSION)
  async rejectEvidence(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('evidenceId', ParseIntPipe) evidenceId: number,
    @Body() dto: RejectSettlementEvidenceDto,
  ) {
    const { transactionId } = await this.evidenceService.reject(
      evidenceId,
      actor.sub,
      MANUAL_SETTLEMENT_PROVIDER,
      dto.reason,
    );
    return { evidenceId, transactionId, reviewStatus: 'REJECTED' as const };
  }

  // ── Response shaping ─────────────────────────────────────────────────────

  // Never returns the raw DB row -- excludes nothing sensitive today (no
  // gateway/provider secrets exist on this table yet), but establishes the
  // mapping boundary so a future field (e.g. an internal review workflow
  // note) doesn't leak onto the API by default.
  //
  // proof_object_key is deliberately NEVER included here (Step 13 §F/§14):
  // it is a private R2 key, not a URL, and this repository has no
  // presigned-download capability yet to make it useful to a client anyway.
  // Callers only learn that proof exists and its declared type/size --
  // mirrors ApplicationWorkflowService.listDocuments(), which likewise
  // omits r2_object_key from its response shape.
  private toEvidenceResponse(row: {
    id: number;
    uuid: string;
    financial_contribution_id: number;
    reference_identifier: string;
    payment_date: unknown;
    claimed_amount_paise: number;
    proof_object_key: string | null;
    proof_mime_type: string | null;
    proof_size_bytes: number | null;
    submitted_by_user_id: number;
    submitted_at: unknown;
    review_status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
    review_note: string | null;
    reviewed_by_user_id: number | null;
    reviewed_at: unknown;
  }) {
    return {
      id: row.id,
      uuid: row.uuid,
      financialContributionId: row.financial_contribution_id,
      referenceIdentifier: row.reference_identifier,
      paymentDate: row.payment_date,
      claimedAmountPaise: Number(row.claimed_amount_paise),
      hasProof: row.proof_object_key !== null,
      proofMimeType: row.proof_mime_type,
      proofSizeBytes: row.proof_size_bytes !== null ? Number(row.proof_size_bytes) : null,
      submittedByUserId: row.submitted_by_user_id,
      submittedAt: row.submitted_at,
      reviewStatus: row.review_status,
      reviewNote: row.review_note,
      reviewedByUserId: row.reviewed_by_user_id,
      reviewedAt: row.reviewed_at,
    };
  }
}
