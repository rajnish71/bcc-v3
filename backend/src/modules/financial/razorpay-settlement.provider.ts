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
  RefundInput,
  RefundResult,
  SettlementOrderInput,
  SettlementOrderResult,
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
}
