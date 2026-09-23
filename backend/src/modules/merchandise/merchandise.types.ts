// backend/src/modules/merchandise/merchandise.types.ts
//
// Merchandise V1 domain types. Merchandise is a Business Module consuming
// PAY-001 unchanged (see financial/merchandise-financial.listener.ts) --
// nothing here duplicates Financial Contribution state; ORDER_STATUSES is
// Merchandise's own order/fulfilment lifecycle, distinct from
// ContributionState (financial.types.ts), which the Financial Engine
// continues to own exclusively.

// businessModule value passed to FinancialContributionService.createContribution()
// and matched against FinancialEngineEventPayload.businessModule by
// MerchandiseFinancialListener.
export const MERCHANDISE_BUSINESS_MODULE = 'MERCHANDISE_ORDER';

export const MERCHANDISE_ORDER_STATUSES = [
  'DRAFT',
  'PENDING_PAYMENT',
  'PAID',
  'FULFILLED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
] as const;

export type MerchandiseOrderStatus = (typeof MERCHANDISE_ORDER_STATUSES)[number];

// Cancellable only before payment is confirmed -- once PAID, a refund
// (via PAY-001 requestRefund()) is the correct reversal path, not cancellation.
export const CANCELLABLE_ORDER_STATUSES: ReadonlyArray<MerchandiseOrderStatus> = [
  'DRAFT',
  'PENDING_PAYMENT',
];

export const MERCHANDISE_FULFILMENT_STATUSES = ['PENDING', 'READY_FOR_PICKUP', 'PICKED_UP'] as const;

export type MerchandiseFulfilmentStatus = (typeof MERCHANDISE_FULFILMENT_STATUSES)[number];

export type MerchandiseCouponDiscountType = 'FIXED';

// PENDING: reserved at order-creation time, payment not yet confirmed.
// CONFIRMED: CONTRIBUTION_COMPLETED observed for this order.
// RELEASED / REFUNDED: excluded from the active-redemption count -- the
// coupon becomes available again (migration 0098 comment).
export type MerchandiseCouponRedemptionStatus = 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'REFUNDED';

// Redemption states that count toward a coupon's max_redemptions limit.
export const ACTIVE_REDEMPTION_STATUSES: ReadonlyArray<MerchandiseCouponRedemptionStatus> = [
  'PENDING',
  'CONFIRMED',
];

export interface OrderItemInput {
  productId: number;
  quantity: number;
}

// Pure pricing calculation, kept separate from any DB/service code so it can
// be unit-tested without importing Kysely (db.ts is ESM-only; Jest here runs
// CommonJS -- see financial-contribution.spec.ts header comment for the same
// constraint applied to the Financial Engine).
export interface PriceLine {
  productId: number;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}

export interface PricingResult {
  lines: PriceLine[];
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
}

// Computes subtotal/discount/total server-side from trusted product prices
// (never from client input -- CLAUDE.md/authorizing prompt §14: the browser
// is never authoritative for price). A coupon discount is applied only to
// the line matching couponApplicableProductId, clamped so that line's total
// (and therefore the order total) never goes negative.
export function computeOrderPricing(
  lines: Array<{ productId: number; quantity: number; unitPricePaise: number }>,
  coupon: { applicableProductId: number; discountValuePaise: number } | null,
): PricingResult {
  const priced: PriceLine[] = lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    unitPricePaise: l.unitPricePaise,
    lineTotalPaise: l.unitPricePaise * l.quantity,
  }));

  const subtotalPaise = priced.reduce((sum, l) => sum + l.lineTotalPaise, 0);

  let discountPaise = 0;
  if (coupon) {
    const eligibleLine = priced.find((l) => l.productId === coupon.applicableProductId);
    if (eligibleLine) {
      discountPaise = Math.min(coupon.discountValuePaise, eligibleLine.lineTotalPaise);
    }
  }

  const totalPaise = subtotalPaise - discountPaise;

  return { lines: priced, subtotalPaise, discountPaise, totalPaise };
}
