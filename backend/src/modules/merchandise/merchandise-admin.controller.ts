// backend/src/modules/merchandise/merchandise-admin.controller.ts
//
// Merchandise administration -- reuses the existing RbacGuard +
// @RequirePermissions convention (ADMIN-ARCH-001 §Principle 2, and the
// same pattern as financial.controller.ts's admin routes). No new admin
// framework, no new authorization mechanism.

import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { requestAuditContext } from '../financial/audit/request-provenance.util';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/token.util';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RequirePermissions } from '../identity/rbac/permissions.decorator';
import { MerchandiseCatalogService } from './merchandise-catalog.service';
import { MerchandiseOrderService } from './merchandise-order.service';
import { MerchandiseCouponService } from './merchandise-coupon.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { RefundOrderDto } from './dto/refund-order.dto';

const PRODUCT_PERMISSION = 'merchandise.product.manage';
const ORDER_PERMISSION = 'merchandise.order.manage';
const COUPON_PERMISSION = 'merchandise.coupon.manage';
// Refunds move money: the refund decision (order permission) AND the
// financial verifier permission, same AND precedent as the membership
// settlement-correction route.
const FINANCIAL_VERIFY_PERMISSION = 'financial.settlement.verify';

@Controller('api/v1/merchandise/admin')
@UseGuards(AccessTokenGuard, RbacGuard)
export class MerchandiseAdminController {
  constructor(
    private readonly catalog: MerchandiseCatalogService,
    private readonly orders: MerchandiseOrderService,
    private readonly coupons: MerchandiseCouponService,
  ) {}

  // ── Products ──────────────────────────────────────────────────────────────

  @Get('products')
  @RequirePermissions(PRODUCT_PERMISSION)
  async listProducts() {
    return this.catalog.listAllProducts();
  }

  @Post('products')
  @HttpCode(201)
  @RequirePermissions(PRODUCT_PERMISSION)
  async createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Patch('products/:id')
  @RequirePermissions(PRODUCT_PERMISSION)
  async updateProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(id, dto);
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  @Get('orders')
  @RequirePermissions(ORDER_PERMISSION)
  async listOrders(@Query('status') status?: string) {
    return this.orders.listAllOrders({ status });
  }

  @Get('orders/:id')
  @RequirePermissions(ORDER_PERMISSION)
  async getOrder(@Param('id', ParseIntPipe) id: number) {
    // isAdmin ownership bypass -- actorId is irrelevant here since the
    // service only enforces ownership when isAdmin is false.
    return this.orders.getOrder(id, 0, true);
  }

  @Post('orders/:id/ready-for-pickup')
  @HttpCode(200)
  @RequirePermissions(ORDER_PERMISSION)
  async markReadyForPickup(@Param('id', ParseIntPipe) id: number) {
    return this.orders.markReadyForPickup(id);
  }

  @Post('orders/:id/picked-up')
  @HttpCode(200)
  @RequirePermissions(ORDER_PERMISSION)
  async markPickedUp(@Param('id', ParseIntPipe) id: number, @Body() body: { pickupNotes?: string }) {
    return this.orders.markPickedUp(id, body?.pickupNotes ?? null);
  }

  // Delegates entirely to the Financial Engine's requestRefund(); the order
  // becomes REFUNDED only when the engine reports CONTRIBUTION_REFUNDED.
  @Post('orders/:id/refund')
  @HttpCode(200)
  @RequirePermissions(ORDER_PERMISSION, FINANCIAL_VERIFY_PERMISSION)
  async refundOrder(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefundOrderDto,
    @Req() req: FastifyRequest,
  ) {
    return this.orders.requestOrderRefund(id, dto.reason, actor.sub, requestAuditContext('ADMIN', req, actor));
  }

  // ── Coupons ───────────────────────────────────────────────────────────────

  @Get('coupons')
  @RequirePermissions(COUPON_PERMISSION)
  async listCoupons() {
    return this.coupons.listCoupons();
  }

  @Post('coupons')
  @HttpCode(201)
  @RequirePermissions(COUPON_PERMISSION)
  async createCoupon(@Body() dto: CreateCouponDto) {
    return this.coupons.createCoupon(dto);
  }

  @Patch('coupons/:id')
  @RequirePermissions(COUPON_PERMISSION)
  async updateCoupon(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto) {
    return this.coupons.updateCoupon(id, dto);
  }
}
