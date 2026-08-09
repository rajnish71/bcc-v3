// backend/src/modules/financial/settlement-provider.interface.ts
//
// PAY-001 Step 18 — Settlement Provider abstraction.
//
// The Financial Engine talks to a Settlement Provider only through this
// interface. It never constructs provider-specific request objects (e.g.
// Razorpay's `orders.create()` params) and never imports a provider SDK
// directly (PAY-001 §OWNERSHIP RULE / Step 18 Part 6). A concrete adapter
// (RazorpaySettlementProvider today) does that translation.
//
// Deliberately minimal: order initiation only. Refunds, disputes,
// subscriptions, payouts, reconciliation and webhook handling are NOT part
// of this interface -- none of them are required to initiate a positive-
// value settlement attempt, and PAY-001 does not yet require them here.

export const SETTLEMENT_PROVIDER = Symbol('SETTLEMENT_PROVIDER');

// Generic order-initiation input. No Membership/Event/Contest-specific
// field exists here -- same genericity rule as FinancialObligationInput.
export interface SettlementOrderInput {
  contributionId: number;
  amountPaise: number;   // already the contribution's authoritative amount; never recomputed by a provider
  currency: string;      // from financial_contributions.currency
  receiptReference: string; // Business-Engine-generated, <=40 chars, unique per settlement attempt
  metadata?: Record<string, string | number>;
}

// Generic order-initiation result. `providerPublicKeyId` is OPTIONAL and
// only populated by adapters whose checkout flow needs a public
// (non-secret) key handed to the frontend (PAY-001 Step 18 Part 15) --
// never a secret.
export interface SettlementOrderResult {
  providerOrderReference: string;
  amountPaise: number;
  currency: string;
  providerPublicKeyId?: string;
}

// Generic refund-initiation input. No Membership/Event/Contest-specific
// field exists here -- same genericity rule as SettlementOrderInput.
// providerPaymentReference is the ORIGINAL successful settlement attempt's
// financial_transactions.provider_reference (e.g. a Razorpay payment id) --
// refunds are always issued against an already-known successful payment,
// never against a Contribution or Order id.
export interface RefundInput {
  contributionId: number;
  providerPaymentReference: string;
  amountPaise: number;
  reason?: string;
}

// 'COMPLETED' — the provider confirmed the reversal synchronously.
// 'PROCESSING' — the provider accepted the refund request but settlement
// (e.g. bank-side crediting) has not yet been confirmed. Callers must not
// treat 'PROCESSING' as a completed reversal (PAY-001 §10/§12 discipline:
// never claim an outcome the platform has not actually observed).
export interface RefundResult {
  providerRefundReference: string;
  status: 'PROCESSING' | 'COMPLETED';
}

export interface SettlementProvider {
  // Generic tag stored as financial_transactions.provider once an outcome
  // is eventually recorded (e.g. 'RAZORPAY') -- see financial.types.ts
  // SettlementOutcomeInput.provider.
  readonly providerName: string;

  createOrder(input: SettlementOrderInput): Promise<SettlementOrderResult>;

  // Minimum generic refund capability (PAY-001 §OWNERSHIP MATRIX: Refund
  // Processing belongs to the Financial Engine). Provider-specific request
  // construction stays entirely inside the concrete adapter, exactly like
  // createOrder().
  refund(input: RefundInput): Promise<RefundResult>;
}
