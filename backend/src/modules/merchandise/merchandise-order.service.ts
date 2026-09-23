// backend/src/modules/merchandise/merchandise-order.service.ts
//
// Merchandise owns: merchandise_orders, merchandise_order_items,
// merchandise_coupon_redemptions, and the fulfilment lifecycle. PAY-001
// (financial_contributions) is reused UNCHANGED via
// FinancialContributionService -- this service never writes to
// financial_contributions/financial_transactions/receipts directly
// (PAY-001 §OWNERSHIP RULE).
//
// Order lifecycle (authorizing prompt §8):
//   PENDING_PAYMENT -> PAID -> FULFILLED -> COMPLETED
//                   \-> CANCELLED (pre-payment only)
//   PAID/FULFILLED/COMPLETED -> REFUNDED
//
// V1 never leaves an order in DRAFT: createOrder() computes final pricing
// and creates the Financial Obligation in the same call, going straight to
// PENDING_PAYMENT. DRAFT remains a valid schema value for a possible future
// persisted-cart flow but is not reachable through the current API.
//
// Payment completion is NEVER decided here from a browser callback --
// handleContributionCompleted() below is only ever invoked by
// MerchandiseFinancialListener reacting to the Financial Engine's
// CONTRIBUTION_COMPLETED event, which itself only fires after a Razorpay
// webhook resolves the settlement (PAY-001 Step 18/19).

import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import { FinancialContributionService } from '../financial/financial-contribution.service';
import type { FinancialEngineEventPayload } from '../financial/financial.events';
import {
  ACTIVE_REDEMPTION_STATUSES,
  CANCELLABLE_ORDER_STATUSES,
  MERCHANDISE_BUSINESS_MODULE,
  computeOrderPricing,
  type MerchandiseOrderStatus,
} from './merchandise.types';
import type { CreateOrderDto } from './dto/create-order.dto';

export interface OrderItemResponse {
  productId: number;
  productName: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}

export interface OrderResponse {
  id: number;
  uuid: string;
  userId: number;
  status: MerchandiseOrderStatus;
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
  couponCode: string | null;
  financialContributionId: number | null;
  fulfilmentStatus: string;
  pickupNotes: string | null;
  items: OrderItemResponse[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MerchandiseOrderService {
  private readonly logger = new Logger(MerchandiseOrderService.name);

  constructor(private readonly financial: FinancialContributionService) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async createOrder(userId: number, dto: CreateOrderDto): Promise<OrderResponse> {
    const { orderId } = await db.transaction().execute(async (trx) => {
      const productIds = [...new Set(dto.items.map((i) => i.productId))];
      const products = await trx
        .selectFrom('merchandise_products')
        .select(['id', 'price_paise', 'active'])
        .where('id', 'in', productIds)
        .execute();

      const productMap = new Map(products.map((p) => [p.id, p]));
      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new BadRequestException(`Product ${item.productId} does not exist.`);
        if (!product.active) throw new BadRequestException(`Product ${item.productId} is not currently available.`);
      }

      let coupon: { id: number; applicableProductId: number; discountValuePaise: number } | null = null;

      if (dto.couponCode) {
        // Lock the coupon row for the duration of the redemption-count
        // check + insert below -- this is what serializes two concurrent
        // orders racing for the same last available redemption (migration
        // 0098 header comment).
        const couponRow = await trx
          .selectFrom('merchandise_coupons')
          .selectAll()
          .where('code', '=', dto.couponCode)
          .forUpdate()
          .executeTakeFirst();

        if (!couponRow || !couponRow.active) {
          throw new BadRequestException(`Coupon '${dto.couponCode}' is not valid.`);
        }

        const now = new Date();
        if (couponRow.valid_from && new Date(couponRow.valid_from) > now) {
          throw new BadRequestException(`Coupon '${dto.couponCode}' is not yet active.`);
        }
        if (couponRow.valid_until && new Date(couponRow.valid_until) < now) {
          throw new BadRequestException(`Coupon '${dto.couponCode}' has expired.`);
        }
        if (!productIds.includes(couponRow.applicable_product_id)) {
          throw new BadRequestException(`Coupon '${dto.couponCode}' does not apply to the selected products.`);
        }

        const activeCount = await trx
          .selectFrom('merchandise_coupon_redemptions')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('coupon_id', '=', couponRow.id)
          .where('status', 'in', ACTIVE_REDEMPTION_STATUSES as any)
          .executeTakeFirst();

        if (Number(activeCount?.count ?? 0) >= couponRow.max_redemptions) {
          throw new ConflictException(`Coupon '${dto.couponCode}' has already been fully redeemed.`);
        }

        coupon = {
          id: couponRow.id,
          applicableProductId: couponRow.applicable_product_id,
          discountValuePaise: Number(couponRow.discount_value_paise),
        };
      }

      const pricing = computeOrderPricing(
        dto.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPricePaise: Number(productMap.get(i.productId)!.price_paise),
        })),
        coupon ? { applicableProductId: coupon.applicableProductId, discountValuePaise: coupon.discountValuePaise } : null,
      );

      const uuid = randomUUID();
      const orderResult = await trx
        .insertInto('merchandise_orders')
        .values({
          uuid,
          user_id: userId,
          status: 'PENDING_PAYMENT',
          subtotal_paise: pricing.subtotalPaise,
          discount_paise: pricing.discountPaise,
          total_paise: pricing.totalPaise,
          coupon_id: coupon?.id ?? null,
          financial_contribution_id: null,
          fulfilment_status: 'PENDING',
        })
        .executeTakeFirstOrThrow();

      const orderId = Number(orderResult.insertId);

      for (const line of pricing.lines) {
        await trx
          .insertInto('merchandise_order_items')
          .values({
            order_id: orderId,
            product_id: line.productId,
            quantity: line.quantity,
            unit_price_paise: line.unitPricePaise,
            line_total_paise: line.lineTotalPaise,
          })
          .execute();
      }

      if (coupon) {
        await trx
          .insertInto('merchandise_coupon_redemptions')
          .values({
            coupon_id: coupon.id,
            order_id: orderId,
            user_id: userId,
            status: 'PENDING',
          })
          .execute();
      }

      return { orderId };
    });

    // Financial Contribution creation happens strictly after the order
    // transaction commits (same discipline as FinancialContributionService
    // itself: never hold a DB lock across another service's own
    // transaction). idempotencyKey is deterministic per order, so a client
    // retry of a network-failed createOrder() call before this point would
    // create a second order+contribution pair -- acceptable for V1 (no
    // request-level idempotency key from the client), same limitation as
    // the pre-existing membership application flow.
    const order = await this.loadOrder(orderId);
    const contribution = await this.financial.createContribution({
      payerUserId: userId,
      businessModule: MERCHANDISE_BUSINESS_MODULE,
      businessReferenceId: orderId,
      purpose: `BCC Merchandise Order #${orderId}`,
      amountPaise: order.total_paise,
      idempotencyKey: `merch-order-${orderId}`,
    });

    await db
      .updateTable('merchandise_orders')
      .set({ financial_contribution_id: contribution.id })
      .where('id', '=', orderId)
      .execute();

    // A freshly created Contribution starts CREATED (PAY-001 default); it
    // must be made payable before the frontend's Pay Now can call
    // initiateProviderSettlement() (startSettlement() requires
    // AWAITING_SETTLEMENT and rejects CREATED with a 409). Mirrors
    // MembershipLifecycleService.createApplicationContribution()'s
    // identical CREATED -> AWAITING_SETTLEMENT / zero-value split.
    if (order.total_paise === 0) {
      await this.financial.processZeroValueContribution(contribution.id);
    } else {
      await this.financial.transitionContribution(contribution.id, 'AWAITING_SETTLEMENT');
    }

    return this.getOrder(orderId, userId, true);
  }

  // ── Cancel (pre-payment only) ────────────────────────────────────────────

  async cancelOrder(orderId: number, actorId: number, isAdmin: boolean): Promise<OrderResponse> {
    const order = await this.loadOrder(orderId);
    if (order.user_id !== actorId && !isAdmin) {
      throw new ForbiddenException('You do not have access to this order.');
    }
    if (!(CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      throw new ConflictException(`Order ${orderId} in status '${order.status}' cannot be cancelled.`);
    }

    if (order.financial_contribution_id) {
      await this.financial.cancelContribution(order.financial_contribution_id, 'Merchandise order cancelled.');
    }

    await db.updateTable('merchandise_orders').set({ status: 'CANCELLED' }).where('id', '=', orderId).execute();

    await db
      .updateTable('merchandise_coupon_redemptions')
      .set({ status: 'RELEASED' })
      .where('order_id', '=', orderId)
      .where('status', '=', 'PENDING')
      .execute();

    return this.getOrder(orderId, actorId, isAdmin);
  }

  // ── Fulfilment (admin, pickup-only) ─────────────────────────────────────

  async markReadyForPickup(orderId: number): Promise<OrderResponse> {
    const order = await this.loadOrder(orderId);
    if (order.status !== 'PAID') {
      throw new ConflictException(`Order ${orderId} in status '${order.status}' is not ready to mark for pickup.`);
    }
    await db
      .updateTable('merchandise_orders')
      .set({ status: 'FULFILLED', fulfilment_status: 'READY_FOR_PICKUP' })
      .where('id', '=', orderId)
      .execute();
    return this.getOrder(orderId, order.user_id, true);
  }

  async markPickedUp(orderId: number, pickupNotes: string | null): Promise<OrderResponse> {
    const order = await this.loadOrder(orderId);
    if (order.status !== 'FULFILLED') {
      throw new ConflictException(`Order ${orderId} in status '${order.status}' has not been marked ready for pickup yet.`);
    }
    await db
      .updateTable('merchandise_orders')
      .set({ status: 'COMPLETED', fulfilment_status: 'PICKED_UP', pickup_notes: pickupNotes })
      .where('id', '=', orderId)
      .execute();
    return this.getOrder(orderId, order.user_id, true);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getOrder(orderId: number, actorId: number, isAdmin: boolean): Promise<OrderResponse> {
    const order = await this.loadOrder(orderId);
    if (order.user_id !== actorId && !isAdmin) {
      throw new ForbiddenException('You do not have access to this order.');
    }
    return this.toResponse(order);
  }

  async listOrdersForUser(userId: number): Promise<OrderResponse[]> {
    const rows = await db
      .selectFrom('merchandise_orders')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();
    return Promise.all(rows.map((r) => this.toResponse(r)));
  }

  async listAllOrders(filter: { status?: string }): Promise<OrderResponse[]> {
    let q = db.selectFrom('merchandise_orders').selectAll();
    if (filter.status) q = q.where('status', '=', filter.status as MerchandiseOrderStatus);
    const rows = await q.orderBy('created_at', 'desc').limit(200).execute();
    return Promise.all(rows.map((r) => this.toResponse(r)));
  }

  // ── Financial Engine event handlers (called only by MerchandiseFinancialListener) ──

  async handleContributionCompleted(payload: FinancialEngineEventPayload): Promise<void> {
    const orderId = payload.businessReferenceId;

    await db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('merchandise_orders')
        .selectAll()
        .where('id', '=', orderId)
        .forUpdate()
        .executeTakeFirst();
      if (!order) {
        this.logger.error(`CONTRIBUTION_COMPLETED for unknown merchandise order ${orderId}.`);
        return;
      }
      // Idempotent: a redelivered event for an already-PAID order is a no-op.
      if (order.status !== 'PENDING_PAYMENT') return;

      await trx.updateTable('merchandise_orders').set({ status: 'PAID' }).where('id', '=', orderId).execute();

      await trx
        .updateTable('merchandise_coupon_redemptions')
        .set({ status: 'CONFIRMED', confirmed_at: toMysqlDatetime(new Date()) })
        .where('order_id', '=', orderId)
        .where('status', '=', 'PENDING')
        .execute();

      const items = await trx.selectFrom('merchandise_order_items').selectAll().where('order_id', '=', orderId).execute();
      for (const item of items) {
        // Best-effort, atomic decrement guarded by stock_quantity >= quantity.
        // Payment has already succeeded at this point (PAY-001 has already
        // recorded CONTRIBUTION_COMPLETED) -- an oversold product is a
        // fulfilment problem to resolve manually, never a reason to reverse
        // an already-completed Financial Contribution.
        const result = await trx
          .updateTable('merchandise_products')
          .set((eb) => ({ stock_quantity: eb('stock_quantity', '-', item.quantity) }))
          .where('id', '=', item.product_id)
          .where('stock_quantity', 'is not', null)
          .where('stock_quantity', '>=', item.quantity)
          .executeTakeFirst();
        if (Number(result?.numUpdatedRows ?? 0) === 0) {
          const product = await trx
            .selectFrom('merchandise_products')
            .select(['stock_quantity'])
            .where('id', '=', item.product_id)
            .executeTakeFirst();
          if (product?.stock_quantity !== null) {
            this.logger.warn(
              `Merchandise order ${orderId}: product ${item.product_id} oversold (requested ${item.quantity}, ` +
              `remaining ${product?.stock_quantity ?? 'unknown'}). Manual fulfilment review required.`,
            );
          }
        }
      }
    });
  }

  handleSettlementFailed(payload: FinancialEngineEventPayload): void {
    // No state change: PAY-001 permits retrying a FAILED/ABANDONED
    // Contribution (ALLOWED_TRANSITIONS), and the order's own
    // /merchandise/orders/:id/retry-payment route reuses the SAME
    // financial_contribution_id -- no new order or coupon reservation is
    // created for a retry. The coupon redemption row (still PENDING) is
    // deliberately left in place so the SAME order can still complete
    // payment and confirm it; only explicit cancellation
    // (cancelOrder()) releases it.
    this.logger.warn(
      `Merchandise order ${payload.businessReferenceId}: settlement attempt failed (contribution ${payload.contributionId}). Order remains PENDING_PAYMENT and is retryable.`,
    );
  }

  async handleContributionRefunded(payload: FinancialEngineEventPayload): Promise<void> {
    const orderId = payload.businessReferenceId;

    await db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('merchandise_orders')
        .selectAll()
        .where('id', '=', orderId)
        .forUpdate()
        .executeTakeFirst();
      if (!order) {
        this.logger.error(`CONTRIBUTION_REFUNDED for unknown merchandise order ${orderId}.`);
        return;
      }
      if (order.status === 'REFUNDED') return; // idempotent

      await trx.updateTable('merchandise_orders').set({ status: 'REFUNDED' }).where('id', '=', orderId).execute();

      await trx
        .updateTable('merchandise_coupon_redemptions')
        .set({ status: 'REFUNDED' })
        .where('order_id', '=', orderId)
        .where('status', '=', 'CONFIRMED')
        .execute();

      // Restore stock only if it was actually decremented (order had
      // reached PAID or later).
      if (order.status === 'PAID' || order.status === 'FULFILLED' || order.status === 'COMPLETED') {
        const items = await trx.selectFrom('merchandise_order_items').selectAll().where('order_id', '=', orderId).execute();
        for (const item of items) {
          await trx
            .updateTable('merchandise_products')
            .set((eb) => ({ stock_quantity: eb('stock_quantity', '+', item.quantity) }))
            .where('id', '=', item.product_id)
            .where('stock_quantity', 'is not', null)
            .execute();
        }
      }
    });
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async loadOrder(orderId: number) {
    const row = await db.selectFrom('merchandise_orders').selectAll().where('id', '=', orderId).executeTakeFirst();
    if (!row) throw new NotFoundException(`Merchandise order ${orderId} not found.`);
    return row;
  }

  // `order` is typed `any` deliberately -- see merchandise-catalog.service.ts
  // toResponse() comment (CLAUDE.md §5.3: Selectable<> does not collapse
  // Generated<ColumnType<Date, ...>> fields to `Date` in this Kysely version).
  private async toResponse(order: any): Promise<OrderResponse> {
    const itemRows = await db
      .selectFrom('merchandise_order_items')
      .innerJoin('merchandise_products', 'merchandise_products.id', 'merchandise_order_items.product_id')
      .select([
        'merchandise_order_items.product_id',
        'merchandise_products.name as product_name',
        'merchandise_order_items.quantity',
        'merchandise_order_items.unit_price_paise',
        'merchandise_order_items.line_total_paise',
      ])
      .where('merchandise_order_items.order_id', '=', order.id)
      .execute();

    let couponCode: string | null = null;
    if (order.coupon_id) {
      const coupon = await db
        .selectFrom('merchandise_coupons')
        .select('code')
        .where('id', '=', order.coupon_id)
        .executeTakeFirst();
      couponCode = coupon?.code ?? null;
    }

    return {
      id: order.id,
      uuid: order.uuid,
      userId: order.user_id,
      status: order.status as MerchandiseOrderStatus,
      subtotalPaise: Number(order.subtotal_paise),
      discountPaise: Number(order.discount_paise),
      totalPaise: Number(order.total_paise),
      couponCode,
      financialContributionId: order.financial_contribution_id,
      fulfilmentStatus: order.fulfilment_status,
      pickupNotes: order.pickup_notes,
      items: itemRows.map((r) => ({
        productId: r.product_id,
        productName: r.product_name,
        quantity: r.quantity,
        unitPricePaise: Number(r.unit_price_paise),
        lineTotalPaise: Number(r.line_total_paise),
      })),
      createdAt: new Date(order.created_at).toISOString(),
      updatedAt: new Date(order.updated_at).toISOString(),
    };
  }
}
