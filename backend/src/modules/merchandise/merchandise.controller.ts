// backend/src/modules/merchandise/merchandise.controller.ts
//
// Customer-facing Merchandise REST surface.
//
// PUBLIC:
//   GET  /api/v1/merchandise/products             list active products
//
// AUTHENTICATED (AccessTokenGuard only -- registered users, no guest
// checkout per the authorizing prompt §5):
//   POST   /api/v1/merchandise/orders              create order + initiate PAY-001 obligation
//   GET    /api/v1/merchandise/orders/mine         list caller's own orders
//   GET    /api/v1/merchandise/orders/:id          get one order (owner-only)
//   POST   /api/v1/merchandise/orders/:id/cancel   cancel own pre-payment order
//
// Payment itself is NOT handled here: after creating an order, the
// frontend calls the existing, unmodified PAY-001 routes
// (POST /api/v1/financial/contributions/:id/settlement/razorpay-order,
// GET /api/v1/financial/contributions/:id) against the returned
// financialContributionId.

import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/token.util';
import { MerchandiseCatalogService } from './merchandise-catalog.service';
import { MerchandiseOrderService } from './merchandise-order.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('api/v1/merchandise')
export class MerchandiseController {
  constructor(
    private readonly catalog: MerchandiseCatalogService,
    private readonly orders: MerchandiseOrderService,
  ) {}

  @Get('products')
  async listProducts() {
    return this.catalog.listActiveProducts();
  }

  @Post('orders')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async createOrder(@CurrentUser() actor: AccessTokenPayload, @Body() dto: CreateOrderDto) {
    return this.orders.createOrder(actor.sub, dto);
  }

  @Get('orders/mine')
  @UseGuards(AccessTokenGuard)
  async listMine(@CurrentUser() actor: AccessTokenPayload) {
    return this.orders.listOrdersForUser(actor.sub);
  }

  @Get('orders/:id')
  @UseGuards(AccessTokenGuard)
  async getOrder(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.orders.getOrder(id, actor.sub, false);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async cancelOrder(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.orders.cancelOrder(id, actor.sub, false);
  }
}
