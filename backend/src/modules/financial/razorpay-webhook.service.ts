// backend/src/modules/financial/razorpay-webhook.service.ts
//
// PAY-001 Step 19 — Razorpay webhook ingestion + settlement reconciliation.
//
// Razorpay remains a Settlement Provider (PAY-001 §ABSOLUTE ARCHITECTURAL
// RULE): this service verifies the webhook, matches it to a Financial
// Contribution, validates it, and calls the EXISTING
// FinancialContributionService.recordSettlementOutcome() -- the same method
// SettlementEvidenceService already uses for manual settlement. It never
// writes financial_contributions/financial_transactions/receipts directly,
// never touches Membership, and never introduces a new Contribution state.
//
// Ordering (PAY-001 Step 19 Part 6): verify signature FIRST; only a
// successfully-verified webhook is ever persisted to settlement_webhook_inbox
// or acted upon. An unverified request is rejected before any DB write.
//
// Idempotency (Part 7/18): settlement_webhook_inbox's UNIQUE(provider,
// provider_event_id) is the durable dedup guard for a redelivered webhook.
// recordSettlementOutcome()'s own (contribution_id, provider_reference)
// idempotency check is a second, independent guard at the financial layer --
// so even a crash between a successful match and markProcessed() cannot
// produce a second Financial Transaction on reprocessing (see process()).

import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import { FinancialContributionService } from './financial-contribution.service';
import { RAZORPAY_PROVIDER_NAME } from './razorpay-settlement.provider';
import { verifyRazorpaySignature } from './razorpay-webhook-signature.util';

// Only these two events represent an authoritative settlement outcome for
// this integration (PAY-001 Step 19 Part 14/15 -- verified against current
// Razorpay documentation: payment.captured is the event that actually means
// "settled", NOT payment.authorized, which only means funds are approved but
// not yet captured). Every other event type is acknowledged and ignored.
const EVENT_SUCCESS = 'payment.captured';
const EVENT_FAILURE = 'payment.failed';
const HANDLED_EVENT_TYPES: ReadonlySet<string> = new Set([EVENT_SUCCESS, EVENT_FAILURE]);

const MAX_ERROR_LENGTH = 2000;

interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string | null;
  amount?: number;
  currency?: string;
  error_code?: string | null;
  error_description?: string | null;
}

export interface RazorpayWebhookInput {
  rawBody: Buffer;
  signature: string | undefined;
  eventId: string | undefined;
}

@Injectable()
export class RazorpayWebhookService {
  private readonly logger = new Logger(RazorpayWebhookService.name);

  constructor(private readonly financialService: FinancialContributionService) {}

  // ── Entry point ──────────────────────────────────────────────────────────
  async handle(input: RazorpayWebhookInput): Promise<void> {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      // Fails closed: with no configured secret, no signature can ever be
      // trusted, so no webhook is ever accepted as authoritative.
      throw new UnauthorizedException('Razorpay webhook is not configured.');
    }

    if (!verifyRazorpaySignature(input.rawBody, input.signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    if (!input.eventId) {
      throw new BadRequestException('Missing X-Razorpay-Event-Id header.');
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed webhook payload.');
    }

    const eventType = typeof event.event === 'string' ? event.event : 'unknown';

    const claim = await this.claimInboxRow(input.eventId, eventType, event);
    if (!claim) {
      // Duplicate delivery of an already-processed event -- idempotent no-op
      // (PAY-001 Step 19 Part 7/K). No re-match, no re-call.
      return;
    }

    try {
      await this.process(claim.id, eventType, event);
    } catch (err) {
      await this.markFailed(claim.id, err instanceof Error ? err.message : 'Unknown processing error');
      throw err;
    }
  }

  // ── Inbox claim / dedup ──────────────────────────────────────────────────
  //
  // Attempts to INSERT a fresh inbox row. A duplicate (provider,
  // provider_event_id) fails the INSERT -- the existing row is then
  // consulted: PROCESSED means this exact event already produced its
  // outcome, so the caller does nothing further; RECEIVED/FAILED means a
  // prior attempt did not complete (e.g. a crash) and processing is
  // resumed against the same row.
  private async claimInboxRow(
    eventId: string,
    eventType: string,
    payload: unknown,
  ): Promise<{ id: number } | null> {
    try {
      const result = await db
        .insertInto('settlement_webhook_inbox')
        .values({
          provider: RAZORPAY_PROVIDER_NAME,
          provider_event_id: eventId,
          event_type: eventType,
          // mysql2 does not auto-serialize JS objects bound as query
          // parameters -- an unserialized object becomes the literal string
          // "[object Object]" in the JSON column. Must stringify explicitly
          // (CLAUDE.md §5.7 / same pattern as events.service.ts tags).
          payload: JSON.stringify(payload) as never,
        })
        .executeTakeFirstOrThrow();
      return { id: Number(result.insertId) };
    } catch (err) {
      const existing = await db
        .selectFrom('settlement_webhook_inbox')
        .select(['id', 'status'])
        .where('provider', '=', RAZORPAY_PROVIDER_NAME)
        .where('provider_event_id', '=', eventId)
        .executeTakeFirst();
      if (!existing) throw err; // Not actually a duplicate -- surface the original error.
      if (existing.status === 'PROCESSED') return null;
      return { id: existing.id };
    }
  }

  // ── Processing ───────────────────────────────────────────────────────────
  private async process(inboxId: number, eventType: string, event: Record<string, unknown>): Promise<void> {
    if (!HANDLED_EVENT_TYPES.has(eventType)) {
      await this.markProcessed(inboxId, null);
      return;
    }

    const payload = event.payload as { payment?: { entity?: RazorpayPaymentEntity } } | undefined;
    const payment = payload?.payment?.entity;
    if (!payment?.id || !payment.order_id) {
      await this.markFailed(inboxId, `Event '${eventType}' payload missing payment id/order_id.`);
      return;
    }

    // Resolve the Contribution once and persist it onto the inbox row
    // BEFORE calling recordSettlementOutcome() (PAY-001 Step 19 Part 10/18):
    // if this same inbox row is ever reprocessed (crash recovery), the
    // stored contribution_id is used directly rather than re-matching via
    // active_settlement_reference, which the Financial Engine clears the
    // moment the attempt resolves -- re-matching after that point would
    // wrongly report "no matching contribution" for an event that already
    // succeeded.
    let contributionId = await this.readStoredContributionId(inboxId);
    if (contributionId === null) {
      const contribution = await this.financialService.findContributionByActiveSettlementReference(
        payment.order_id,
      );
      if (!contribution) {
        await this.markFailed(
          inboxId,
          `No SETTLEMENT_IN_PROGRESS contribution matches order '${payment.order_id}'.`,
        );
        return;
      }
      contributionId = Number(contribution.id);
      await this.storeMatchedContribution(inboxId, contributionId);
    }

    const contribution = await this.financialService.getContribution(contributionId);

    // Zero-value contributions never enter SETTLEMENT_IN_PROGRESS (PAY-001
    // §12) and so can never legitimately be the match above -- defensive
    // guard only (PAY-001 Step 19 Part 24).
    if (Number(contribution.amount_paise) === 0) {
      await this.markFailed(
        inboxId,
        `Contribution ${contributionId} is zero-value; a Razorpay webhook cannot settle it.`,
      );
      return;
    }

    const webhookAmount = Number(payment.amount);
    if (webhookAmount !== Number(contribution.amount_paise)) {
      await this.markFailed(
        inboxId,
        `Amount mismatch: webhook ${webhookAmount} paise vs contribution ${contribution.amount_paise} paise.`,
      );
      return;
    }

    const webhookCurrency = String(payment.currency ?? '').toUpperCase();
    if (webhookCurrency !== String(contribution.currency).toUpperCase()) {
      await this.markFailed(
        inboxId,
        `Currency mismatch: webhook '${payment.currency}' vs contribution '${contribution.currency}'.`,
      );
      return;
    }

    const result: 'SUCCEEDED' | 'FAILED' = eventType === EVENT_SUCCESS ? 'SUCCEEDED' : 'FAILED';

    // The EXISTING settlement outcome path (PAY-001 §ABSOLUTE ARCHITECTURAL
    // RULE) -- owns the Financial Transaction, Contribution state,
    // Receipt, and Business Events. providerReference is the Razorpay
    // PAYMENT id (per-attempt uniqueness for financial_transactions);
    // active_settlement_reference already holds the ORDER id separately
    // (PAY-001 Step 19 Part 13).
    await this.financialService.recordSettlementOutcome(contributionId, {
      provider: RAZORPAY_PROVIDER_NAME,
      providerReference: payment.id,
      result,
      amountPaise: webhookAmount,
      failureReason:
        result === 'FAILED'
          ? (payment.error_description ?? payment.error_code ?? 'Razorpay payment failed')
          : null,
    });

    await this.markProcessed(inboxId, contributionId);
  }

  // ── Inbox bookkeeping ────────────────────────────────────────────────────
  private async readStoredContributionId(inboxId: number): Promise<number | null> {
    const row = await db
      .selectFrom('settlement_webhook_inbox')
      .select(['contribution_id'])
      .where('id', '=', inboxId)
      .executeTakeFirst();
    return row?.contribution_id != null ? Number(row.contribution_id) : null;
  }

  private async storeMatchedContribution(inboxId: number, contributionId: number): Promise<void> {
    await db
      .updateTable('settlement_webhook_inbox')
      .set({ contribution_id: contributionId })
      .where('id', '=', inboxId)
      .execute();
  }

  private async markProcessed(inboxId: number, contributionId: number | null): Promise<void> {
    await db
      .updateTable('settlement_webhook_inbox')
      .set({
        status: 'PROCESSED',
        processed_at: toMysqlDatetime(new Date()),
        processing_error: null,
        ...(contributionId !== null ? { contribution_id: contributionId } : {}),
      })
      .where('id', '=', inboxId)
      .execute();
  }

  private async markFailed(inboxId: number, reason: string): Promise<void> {
    try {
      await db
        .updateTable('settlement_webhook_inbox')
        .set({ status: 'FAILED', processing_error: reason.slice(0, MAX_ERROR_LENGTH) })
        .where('id', '=', inboxId)
        .execute();
    } catch (err) {
      // Recoverable -- see FinancialContributionService.publishPending()'s
      // analogous comment. The inbox row's diagnostic status is best-effort;
      // it must never be mistaken for a financial-state failure.
      this.logger.error(`Failed to mark inbox row ${inboxId} FAILED: ${(err as Error).message}`);
    }
  }
}
