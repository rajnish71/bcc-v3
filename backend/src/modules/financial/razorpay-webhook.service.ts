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

import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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

// Hosted Payment Link attempts (financial_contributions.active_settlement_url
// set, active_settlement_reference = the plink_ id) resolve ONLY through
// these link-level events:
//   payment_link.paid      -> SUCCEEDED (the link's single, full payment --
//                             links are created with accept_partial=false)
//   payment_link.expired   -> ABANDONED (the attempt ended without payment;
//   payment_link.cancelled    PAY-001: retryable via a new link on the SAME
//                             Contribution)
// A payment.failed for a link's payment is deliberately NOT an attempt
// outcome: the hosted link stays payable after a failed try, so failing the
// Contribution there would let a later payment_link.paid land on a
// Contribution that is no longer SETTLEMENT_IN_PROGRESS. Such payment.*
// events carry the link's internal order id, never the plink_ id, so they
// can never match a link attempt below (they are recorded as unmatched in
// the inbox, with no financial effect). payment_link.partially_paid cannot
// occur (accept_partial=false) and is ignored like any other event.
const EVENT_LINK_PAID = 'payment_link.paid';
const EVENT_LINK_EXPIRED = 'payment_link.expired';
const EVENT_LINK_CANCELLED = 'payment_link.cancelled';
const LINK_EVENT_TYPES: ReadonlySet<string> = new Set([EVENT_LINK_PAID, EVENT_LINK_EXPIRED, EVENT_LINK_CANCELLED]);

// Refund lifecycle: only the two TERMINAL refund events resolve a platform
// refund, through FinancialContributionService.recordRefundOutcome().
// refund.created is not an outcome and stays acknowledged-and-ignored like
// any other unhandled event. A refund event never creates a refund: one
// that matches no platform refund (e.g. a dashboard-initiated refund) is
// recorded FAILED in the inbox with no financial effect -- PAY-001 leaves
// the refund decision to the Business Module.
const EVENT_REFUND_PROCESSED = 'refund.processed';
const EVENT_REFUND_FAILED = 'refund.failed';
const REFUND_EVENT_TYPES: ReadonlySet<string> = new Set([EVENT_REFUND_PROCESSED, EVENT_REFUND_FAILED]);

const HANDLED_EVENT_TYPES: ReadonlySet<string> = new Set([
  EVENT_SUCCESS, EVENT_FAILURE, ...LINK_EVENT_TYPES, ...REFUND_EVENT_TYPES,
]);

const MAX_ERROR_LENGTH = 2000;

interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string | null;
  amount?: number;
  currency?: string;
  error_code?: string | null;
  error_description?: string | null;
}

interface RazorpayRefundEntity {
  id?: string;
  payment_id?: string | null;
  amount?: number;
  currency?: string;
  status?: string;
}

interface RazorpayPaymentLinkEntity {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

// Provider-event -> generic settlement outcome, before contribution matching.
interface ResolvedOutcome {
  matchReference: string;     // compared against active_settlement_reference
  matchLabel: string;         // 'order' | 'payment link' -- diagnostics only
  providerReference: string;  // financial_transactions.provider_reference (idempotency key)
  amountPaise: number;
  currency: string;
  result: 'SUCCEEDED' | 'FAILED' | 'ABANDONED';
  failureReason: string | null;
}

export interface RazorpayWebhookInput {
  rawBody: Buffer;
  signature: string | undefined;
  eventId: string | undefined;
  // Server-generated request id (OBS-01) -- recorded on the
  // SETTLEMENT_OUTCOME_RECORDED audit row and in failure diagnostics.
  requestId?: string | null;
  route?: string | null;
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
      await this.process(claim.id, eventType, event, input);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown processing error';
      this.logger.error(`Webhook inbox ${claim.id} failed [requestId=${input.requestId ?? 'none'}]: ${message}`);
      await this.markFailed(claim.id, message);
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
  private async process(
    inboxId: number,
    eventType: string,
    event: Record<string, unknown>,
    input: RazorpayWebhookInput,
  ): Promise<void> {
    if (!HANDLED_EVENT_TYPES.has(eventType)) {
      await this.markProcessed(inboxId, null);
      return;
    }

    if (REFUND_EVENT_TYPES.has(eventType)) {
      await this.processRefundEvent(inboxId, eventType, event);
      return;
    }

    const resolved = LINK_EVENT_TYPES.has(eventType)
      ? this.resolvePaymentLinkEvent(eventType, event)
      : this.resolvePaymentEvent(eventType, event);
    if (typeof resolved === 'string') {
      await this.markFailed(inboxId, resolved);
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
        resolved.matchReference,
      );
      if (!contribution) {
        await this.markFailed(
          inboxId,
          `No SETTLEMENT_IN_PROGRESS contribution matches ${resolved.matchLabel} '${resolved.matchReference}'.`,
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

    const webhookAmount = resolved.amountPaise;
    if (webhookAmount !== Number(contribution.amount_paise)) {
      await this.markFailed(
        inboxId,
        `Amount mismatch: webhook ${webhookAmount} paise vs contribution ${contribution.amount_paise} paise.`,
      );
      return;
    }

    const webhookCurrency = resolved.currency.toUpperCase();
    if (webhookCurrency !== String(contribution.currency).toUpperCase()) {
      await this.markFailed(
        inboxId,
        `Currency mismatch: webhook '${resolved.currency}' vs contribution '${contribution.currency}'.`,
      );
      return;
    }

    // The EXISTING settlement outcome path (PAY-001 §ABSOLUTE ARCHITECTURAL
    // RULE) -- owns the Financial Transaction, Contribution state,
    // Receipt, and Business Events. providerReference is the Razorpay
    // PAYMENT id (per-attempt uniqueness for financial_transactions);
    // active_settlement_reference already holds the ORDER id separately
    // (PAY-001 Step 19 Part 13). For an expired/cancelled payment link there
    // is no payment, so the plink_ id itself is the per-attempt reference.
    await this.financialService.recordSettlementOutcome(contributionId, {
      provider: RAZORPAY_PROVIDER_NAME,
      providerReference: resolved.providerReference,
      result: resolved.result,
      amountPaise: webhookAmount,
      failureReason: resolved.failureReason,
    }, {
      // No actor user/session/IP: Razorpay, not a member, is the caller.
      actorType: 'WEBHOOK',
      webhookInboxId: inboxId,
      provenance: { requestId: input.requestId ?? null, route: input.route ?? null },
    });

    await this.markProcessed(inboxId, contributionId);
  }

  // ── Refund outcome ───────────────────────────────────────────────────────
  // Matches the verified refund event to the platform's own refund row and
  // hands the terminal outcome to recordRefundOutcome() -- the single place a
  // refund becomes COMPLETED/FAILED (and a Contribution REFUNDED). Writes
  // nothing financial itself.
  private async processRefundEvent(
    inboxId: number,
    eventType: string,
    event: Record<string, unknown>,
  ): Promise<void> {
    const resolved = resolveRefundEvent(eventType, event);
    if (typeof resolved === 'string') {
      await this.markFailed(inboxId, resolved);
      return;
    }

    const refund = await this.financialService.findRefundForProviderEvent(resolved.refundId, resolved.paymentId);
    if (!refund) {
      await this.markFailed(
        inboxId,
        `No platform refund matches provider refund '${resolved.refundId}' (payment '${resolved.paymentId ?? 'none'}'); not created automatically.`,
      );
      return;
    }

    const contributionId = Number(refund.contribution_id);
    await this.storeMatchedContribution(inboxId, contributionId);

    if (resolved.amountPaise !== Number(refund.amount_paise)) {
      await this.markFailed(
        inboxId,
        `Amount mismatch: refund event ${resolved.amountPaise} paise vs platform refund ${refund.amount_paise} paise.`,
      );
      return;
    }
    if (resolved.currency.toUpperCase() !== String(refund.currency).toUpperCase()) {
      await this.markFailed(
        inboxId,
        `Currency mismatch: refund event '${resolved.currency}' vs platform refund '${refund.currency}'.`,
      );
      return;
    }

    try {
      await this.financialService.recordRefundOutcome(Number(refund.id), {
        result: resolved.result,
        providerRefundReference: resolved.refundId,
        failureReason: resolved.result === 'FAILED' ? 'Razorpay reported the refund as failed' : null,
      }, {
        actorType: 'WEBHOOK',
        webhookInboxId: inboxId,
        metadata: { refundOutcomeSource: 'WEBHOOK' },
      });
    } catch (err) {
      // A contradictory outcome / refund-id mismatch is deterministic --
      // recorded as a diagnostic (no state change happened) rather than
      // rethrown, so the provider does not keep redelivering it.
      if (err instanceof ConflictException) {
        await this.markFailed(inboxId, err.message);
        return;
      }
      throw err;
    }

    await this.markProcessed(inboxId, contributionId);
  }

  // ── Provider payload -> generic outcome ──────────────────────────────────
  // Each returns either the resolved outcome or a diagnostic string for the
  // inbox row. Pure reads of the verified payload; no DB access.

  private resolvePaymentEvent(eventType: string, event: Record<string, unknown>): ResolvedOutcome | string {
    const payload = event.payload as { payment?: { entity?: RazorpayPaymentEntity } } | undefined;
    const payment = payload?.payment?.entity;
    if (!payment?.id || !payment.order_id) {
      return `Event '${eventType}' payload missing payment id/order_id.`;
    }
    const result: 'SUCCEEDED' | 'FAILED' = eventType === EVENT_SUCCESS ? 'SUCCEEDED' : 'FAILED';
    return {
      matchReference: payment.order_id,
      matchLabel: 'order',
      providerReference: payment.id,
      amountPaise: Number(payment.amount),
      currency: String(payment.currency ?? ''),
      result,
      failureReason:
        result === 'FAILED'
          ? (payment.error_description ?? payment.error_code ?? 'Razorpay payment failed')
          : null,
    };
  }

  private resolvePaymentLinkEvent(eventType: string, event: Record<string, unknown>): ResolvedOutcome | string {
    const payload = event.payload as
      | { payment_link?: { entity?: RazorpayPaymentLinkEntity }; payment?: { entity?: RazorpayPaymentEntity } }
      | undefined;
    const link = payload?.payment_link?.entity;
    if (!link?.id) {
      return `Event '${eventType}' payload missing payment_link id.`;
    }

    if (eventType === EVENT_LINK_PAID) {
      // The settled amount/currency are the PAYMENT's, exactly as for
      // payment.captured -- never the link's advertised amount.
      const payment = payload?.payment?.entity;
      if (!payment?.id) {
        return `Event '${eventType}' payload missing payment id.`;
      }
      return {
        matchReference: link.id,
        matchLabel: 'payment link',
        providerReference: payment.id,
        amountPaise: Number(payment.amount),
        currency: String(payment.currency ?? ''),
        result: 'SUCCEEDED',
        failureReason: null,
      };
    }

    // expired / cancelled: no payment exists. The link's own amount/currency
    // are still validated against the Contribution below, so a foreign or
    // tampered link can never close this attempt.
    return {
      matchReference: link.id,
      matchLabel: 'payment link',
      providerReference: link.id,
      amountPaise: Number(link.amount),
      currency: String(link.currency ?? ''),
      result: 'ABANDONED',
      failureReason: eventType === EVENT_LINK_EXPIRED ? 'Payment link expired' : 'Payment link cancelled',
    };
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

// Refund event -> generic refund outcome (pure; exported for tests). Returns
// the outcome or a diagnostic string for the inbox row.
export function resolveRefundEvent(
  eventType: string,
  event: Record<string, unknown>,
): { refundId: string; paymentId: string | null; amountPaise: number; currency: string; result: 'COMPLETED' | 'FAILED' } | string {
  const payload = event.payload as { refund?: { entity?: RazorpayRefundEntity } } | undefined;
  const refund = payload?.refund?.entity;
  if (!refund?.id) {
    return `Event '${eventType}' payload missing refund id.`;
  }
  return {
    refundId: refund.id,
    paymentId: refund.payment_id ?? null,
    amountPaise: Number(refund.amount),
    currency: String(refund.currency ?? ''),
    result: eventType === EVENT_REFUND_PROCESSED ? 'COMPLETED' : 'FAILED',
  };
}
