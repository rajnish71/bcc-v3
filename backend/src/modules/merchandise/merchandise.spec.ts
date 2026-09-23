// backend/src/modules/merchandise/merchandise.spec.ts
//
// Unit tests for Merchandise V1 pure domain logic.
// Intentionally avoids importing db.ts/services (Kysely is ESM-only; Jest
// here runs CommonJS -- same constraint documented in
// financial-contribution.spec.ts). Order-creation transaction behaviour,
// coupon-redemption exclusivity, and financial-listener wiring are
// integration-level concerns exercised against the live schema, not here.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MERCHANDISE_ORDER_STATUSES,
  CANCELLABLE_ORDER_STATUSES,
  MERCHANDISE_FULFILMENT_STATUSES,
  ACTIVE_REDEMPTION_STATUSES,
  MERCHANDISE_BUSINESS_MODULE,
  computeOrderPricing,
} from './merchandise.types';

// Regression coverage for the CREATED -> AWAITING_SETTLEMENT production
// defect (first live checkout, 2026-09-23): createOrder() created the
// Financial Contribution but never made it payable, so
// initiateProviderSettlement() -> startSettlement() rejected every Pay Now
// attempt with a 409 ("... can only be started from AWAITING_SETTLEMENT").
// merchandise-order.service.ts imports db.ts (Kysely, ESM-only) and cannot
// be imported into this CommonJS Jest run -- same constraint documented in
// financial-contribution.spec.ts and applied identically in
// membership-payment-approval-reconciliation.spec.ts. This test statically
// inspects the actual source text of createOrder() instead, the same
// "real static source inspection" pattern already established there.
function readSourceNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const ORDER_SERVICE_SRC = readSourceNormalized(join(__dirname, 'merchandise-order.service.ts'));

function slice(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  if (end === -1) throw new Error(`end marker not found: ${endMarker} (after ${startMarker})`);
  return src.slice(start, end);
}

describe('createOrder() makes its Financial Contribution payable (CREATED -> AWAITING_SETTLEMENT)', () => {
  const CREATE_ORDER_FN = slice(ORDER_SERVICE_SRC, 'async createOrder(', 'async cancelOrder(');

  it('creates the Financial Contribution via the unmodified Financial Engine API', () => {
    expect(CREATE_ORDER_FN).toContain('this.financial.createContribution({');
  });

  it('transitions a positive-value contribution out of CREATED before returning, mirroring MembershipLifecycleService.createApplicationContribution()', () => {
    expect(CREATE_ORDER_FN).toContain(
      "await this.financial.transitionContribution(contribution.id, 'AWAITING_SETTLEMENT');",
    );
  });

  it('routes a zero-value order through processZeroValueContribution() instead (PAY-001 Principle 12: zero-value never enters AWAITING_SETTLEMENT/SETTLEMENT_IN_PROGRESS)', () => {
    expect(CREATE_ORDER_FN).toContain('if (order.total_paise === 0) {');
    expect(CREATE_ORDER_FN).toContain('await this.financial.processZeroValueContribution(contribution.id);');
  });

  it('the AWAITING_SETTLEMENT transition happens after financial_contribution_id is persisted on the order', () => {
    const persistIndex = CREATE_ORDER_FN.indexOf('financial_contribution_id: contribution.id');
    const transitionIndex = CREATE_ORDER_FN.indexOf("transitionContribution(contribution.id, 'AWAITING_SETTLEMENT')");
    expect(persistIndex).toBeGreaterThan(-1);
    expect(transitionIndex).toBeGreaterThan(persistIndex);
  });
});

describe('Merchandise order lifecycle constants', () => {
  it('defines exactly 7 order statuses', () => {
    expect(MERCHANDISE_ORDER_STATUSES).toHaveLength(7);
  });

  it('only DRAFT and PENDING_PAYMENT are cancellable', () => {
    expect(CANCELLABLE_ORDER_STATUSES).toEqual(['DRAFT', 'PENDING_PAYMENT']);
  });

  it('PAID is not cancellable (refund is the correct reversal path)', () => {
    expect(CANCELLABLE_ORDER_STATUSES).not.toContain('PAID');
  });

  it('fulfilment is a 3-value pickup-only progression', () => {
    expect(MERCHANDISE_FULFILMENT_STATUSES).toEqual(['PENDING', 'READY_FOR_PICKUP', 'PICKED_UP']);
  });

  it('PENDING and CONFIRMED redemptions count toward max_redemptions; RELEASED/REFUNDED do not', () => {
    expect(ACTIVE_REDEMPTION_STATUSES).toEqual(['PENDING', 'CONFIRMED']);
  });

  it('uses a distinct businessModule identifier for PAY-001', () => {
    expect(MERCHANDISE_BUSINESS_MODULE).toBe('MERCHANDISE_ORDER');
  });
});

describe('computeOrderPricing — server-authoritative pricing (never trusts client input)', () => {
  const CAP_PRODUCT_ID = 1;
  const BADGE_PRODUCT_ID = 2;

  it('computes plain subtotal with no coupon', () => {
    const result = computeOrderPricing(
      [{ productId: CAP_PRODUCT_ID, quantity: 1, unitPricePaise: 32500 }],
      null,
    );
    expect(result.subtotalPaise).toBe(32500);
    expect(result.discountPaise).toBe(0);
    expect(result.totalPaise).toBe(32500);
  });

  it('the testorder scenario: 325 cap - 315 coupon = 10 payable', () => {
    const result = computeOrderPricing(
      [{ productId: CAP_PRODUCT_ID, quantity: 1, unitPricePaise: 32500 }],
      { applicableProductId: CAP_PRODUCT_ID, discountValuePaise: 31500 },
    );
    expect(result.subtotalPaise).toBe(32500);
    expect(result.discountPaise).toBe(31500);
    expect(result.totalPaise).toBe(1000);
  });

  it('only discounts the eligible line; the badge is unaffected', () => {
    const result = computeOrderPricing(
      [
        { productId: CAP_PRODUCT_ID, quantity: 1, unitPricePaise: 32500 },
        { productId: BADGE_PRODUCT_ID, quantity: 1, unitPricePaise: 7500 },
      ],
      { applicableProductId: CAP_PRODUCT_ID, discountValuePaise: 31500 },
    );
    expect(result.subtotalPaise).toBe(40000);
    expect(result.discountPaise).toBe(31500);
    expect(result.totalPaise).toBe(8500);
  });

  it('never produces a negative total: discount is clamped to the eligible line total', () => {
    const result = computeOrderPricing(
      [{ productId: CAP_PRODUCT_ID, quantity: 1, unitPricePaise: 32500 }],
      { applicableProductId: CAP_PRODUCT_ID, discountValuePaise: 100000 },
    );
    expect(result.discountPaise).toBe(32500);
    expect(result.totalPaise).toBe(0);
  });

  it('a coupon scoped to a product not in the order applies no discount', () => {
    const result = computeOrderPricing(
      [{ productId: BADGE_PRODUCT_ID, quantity: 1, unitPricePaise: 7500 }],
      { applicableProductId: CAP_PRODUCT_ID, discountValuePaise: 31500 },
    );
    expect(result.discountPaise).toBe(0);
    expect(result.totalPaise).toBe(7500);
  });

  it('multiplies unit price by quantity per line', () => {
    const result = computeOrderPricing(
      [{ productId: BADGE_PRODUCT_ID, quantity: 3, unitPricePaise: 7500 }],
      null,
    );
    expect(result.lines[0].lineTotalPaise).toBe(22500);
    expect(result.subtotalPaise).toBe(22500);
  });
});
