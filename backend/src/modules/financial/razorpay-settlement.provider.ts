// backend/src/modules/financial/razorpay-settlement.provider.ts
//
// PAY-001 Step 18 — Razorpay Settlement Provider adapter.
//
// The ONLY file in this repository allowed to import the `razorpay` SDK or
// construct a Razorpay-shaped request object. FinancialContributionService
// depends on the generic SettlementProvider interface only (see
// settlement-provider.interface.ts) -- it never sees a Razorpay type.
//
// Configuration comes from .env (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET), read
// directly from process.env and initialised lazily -- same pattern as
// R2Service.ensureClient(): the rest of the Financial Engine (manual
// UPI/bank-transfer settlement, zero-value) works with no Razorpay
// configuration present; only an actual createOrder() call hard-requires it.
//
// RAZORPAY_KEY_SECRET never leaves this file: it is passed to the Razorpay
// SDK constructor and nowhere else. createOrder()'s return value carries
// only providerOrderReference (the order id) and, for the eventual
// frontend checkout, the PUBLIC key id -- never the secret.

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Razorpay from 'razorpay';
import type {
  ProviderOrderSnapshot,
  ProviderPaymentSnapshot,
  RefundInput,
  RefundResult,
  SettlementOrderInput,
  SettlementOrderResult,
  SettlementPaymentLinkInput,
  SettlementPaymentLinkResult,
  SettlementProvider,
} from './settlement-provider.interface';

export const RAZORPAY_PROVIDER_NAME = 'RAZORPAY';

@Injectable()
export class RazorpaySettlementProvider implements SettlementProvider {
  readonly providerName = RAZORPAY_PROVIDER_NAME;

  private client: Razorpay | null = null;
  private keyId = '';

  private ensureClient(): Razorpay {
    if (this.client) return this.client;

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException(
        'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env.',
      );
    }

    this.keyId = keyId;
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    return this.client;
  }

  // Public key id only -- never the secret. Used by initiateProviderSettlement()
  // when it reuses an already-created order (no createOrder() call, so the
  // key id would otherwise never reach the response) so the frontend gets a
  // usable key on every call, not just the one that created the order.
  getPublicKeyId(): string {
    this.ensureClient();
    return this.keyId;
  }

  // Translates the Financial Engine's generic order-initiation input into a
  // Razorpay Orders API request (amount already in paise -- Razorpay's
  // `amount` is "currency subunits", the same unit this platform stores
  // amount_paise in; no conversion happens here). Returns only the
  // Razorpay order id + the public key id; never a secret, never the full
  // Razorpay order object.
  async createOrder(input: SettlementOrderInput): Promise<SettlementOrderResult> {
    const client = this.ensureClient();

    const order = await client.orders.create({
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receiptReference,
      notes: input.metadata,
      payment_capture: true,
    });

    return {
      providerOrderReference: order.id,
      amountPaise: input.amountPaise,
      currency: input.currency,
      providerPublicKeyId: this.keyId,
    };
  }

  // Translates the Financial Engine's generic payment-link input into a
  // Razorpay Payment Links API request. Same unit discipline as
  // createOrder(): amount is already in paise. accept_partial is always
  // false -- a Contribution is settled exactly once, in full (PAY-001
  // Principle 7). notify is disabled: the platform hands the hosted URL to
  // whoever requested it; Razorpay never messages the payer on its own.
  // No customer details are sent (the API treats `customer` as optional;
  // the SDK typing does not, hence the cast) -- the platform owns payer
  // identity, not the provider. Returns only the link id + hosted URL.
  async createPaymentLink(input: SettlementPaymentLinkInput): Promise<SettlementPaymentLinkResult> {
    const client = this.ensureClient();

    const params = {
      amount: input.amountPaise,
      currency: input.currency,
      accept_partial: false,
      reference_id: input.referenceId,
      description: input.description,
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: input.metadata,
      ...(input.expiresAt ? { expire_by: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
    } as unknown as Parameters<Razorpay['paymentLink']['create']>[0];

    const link = await client.paymentLink.create(params);

    return {
      providerLinkReference: link.id,
      hostedUrl: link.short_url,
      amountPaise: input.amountPaise,
      currency: input.currency,
    };
  }

  async cancelPaymentLink(providerLinkReference: string): Promise<void> {
    await this.ensureClient().paymentLink.cancel(providerLinkReference);
  }

  // Translates the Financial Engine's generic refund-initiation input into
  // a Razorpay Payment Refund API request. Razorpay's refund response
  // carries its own `status`: 'processed' means the reversal is confirmed
  // (typically instant-refund-eligible methods, e.g. UPI); anything else
  // ('pending' -- bank-side crediting not yet confirmed) is surfaced as
  // 'PROCESSING' rather than claimed as done (PAY-001 §10/§12 discipline —
  // same rule createOrder() already follows: never fabricate an outcome).
  async refund(input: RefundInput): Promise<RefundResult> {
    const client = this.ensureClient();

    const refund = await client.payments.refund(input.providerPaymentReference, {
      amount: input.amountPaise,
      notes: input.reason ? { reason: input.reason } : undefined,
    });

    return {
      providerRefundReference: refund.id,
      status: refund.status === 'processed' ? 'COMPLETED' : 'PROCESSING',
    };
  }

  // OBS-08: read-only GETs against the Orders/Payments APIs, projected down
  // to a few fields. No notes, customer contact details, or card/VPA data.
  async fetchOrder(providerOrderReference: string): Promise<ProviderOrderSnapshot> {
    const order = await this.ensureClient().orders.fetch(providerOrderReference);
    return {
      id: order.id,
      status: String(order.status),
      amountPaise: Number(order.amount),
      amountPaidPaise: order.amount_paid !== undefined ? Number(order.amount_paid) : null,
      currency: String(order.currency),
      receipt: order.receipt ?? null,
      attempts: order.attempts !== undefined ? Number(order.attempts) : null,
      createdAt: order.created_at !== undefined ? Number(order.created_at) : null,
    };
  }

  async fetchPayment(providerPaymentReference: string): Promise<ProviderPaymentSnapshot> {
    const payment = await this.ensureClient().payments.fetch(providerPaymentReference);
    return {
      id: payment.id,
      orderId: payment.order_id ?? null,
      status: String(payment.status),
      amountPaise: Number(payment.amount),
      currency: String(payment.currency),
      method: payment.method ? String(payment.method) : null,
      captured: typeof payment.captured === 'boolean' ? payment.captured : null,
      errorCode: payment.error_code ?? null,
      createdAt: payment.created_at !== undefined ? Number(payment.created_at) : null,
    };
  }
}
