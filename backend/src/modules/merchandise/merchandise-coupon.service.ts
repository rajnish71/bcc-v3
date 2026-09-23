// backend/src/modules/merchandise/merchandise-coupon.service.ts
//
// Coupon admin CRUD. The atomic validate-and-reserve-a-redemption logic
// lives in MerchandiseOrderService (it must run inside the same
// transaction, and under the same row lock, as order creation) -- this
// service only manages coupon definitions and read-only redemption counts
// for the admin screen.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import { ACTIVE_REDEMPTION_STATUSES } from './merchandise.types';
import type { CreateCouponDto } from './dto/create-coupon.dto';
import type { UpdateCouponDto } from './dto/update-coupon.dto';

export interface CouponResponse {
  id: number;
  uuid: string;
  code: string;
  discountType: 'FIXED';
  discountValuePaise: number;
  applicableProductId: number;
  maxRedemptions: number;
  activeRedemptions: number;
  active: boolean;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
}

@Injectable()
export class MerchandiseCouponService {
  async createCoupon(dto: CreateCouponDto): Promise<CouponResponse> {
    const product = await db
      .selectFrom('merchandise_products')
      .select('id')
      .where('id', '=', dto.applicableProductId)
      .executeTakeFirst();
    if (!product) {
      throw new BadRequestException(`Product ${dto.applicableProductId} does not exist.`);
    }

    const uuid = randomUUID();
    await db
      .insertInto('merchandise_coupons')
      .values({
        uuid,
        code: dto.code,
        discount_type: dto.discountType,
        discount_value_paise: dto.discountValuePaise,
        applicable_product_id: dto.applicableProductId,
        max_redemptions: dto.maxRedemptions ?? 1,
        active: dto.active ?? true,
        valid_from: dto.validFrom ? toMysqlDatetime(new Date(dto.validFrom)) : null,
        valid_until: dto.validUntil ? toMysqlDatetime(new Date(dto.validUntil)) : null,
      })
      .execute();

    const row = await db.selectFrom('merchandise_coupons').selectAll().where('uuid', '=', uuid).executeTakeFirstOrThrow();
    return this.toResponse(row);
  }

  async updateCoupon(id: number, dto: UpdateCouponDto): Promise<CouponResponse> {
    await this.getCouponRow(id);

    const patch: Record<string, unknown> = {};
    if (dto.discountValuePaise !== undefined) patch.discount_value_paise = dto.discountValuePaise;
    if (dto.maxRedemptions !== undefined) patch.max_redemptions = dto.maxRedemptions;
    if (dto.active !== undefined) patch.active = dto.active;
    if (dto.validFrom !== undefined) patch.valid_from = toMysqlDatetime(new Date(dto.validFrom));
    if (dto.validUntil !== undefined) patch.valid_until = toMysqlDatetime(new Date(dto.validUntil));

    if (Object.keys(patch).length > 0) {
      await db.updateTable('merchandise_coupons').set(patch as any).where('id', '=', id).execute();
    }

    const row = await this.getCouponRow(id);
    return this.toResponse(row);
  }

  async listCoupons(): Promise<CouponResponse[]> {
    const rows = await db.selectFrom('merchandise_coupons').selectAll().orderBy('created_at', 'desc').execute();
    return Promise.all(rows.map((r) => this.toResponse(r)));
  }

  private async getCouponRow(id: number) {
    const row = await db.selectFrom('merchandise_coupons').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw new NotFoundException(`Coupon ${id} not found.`);
    return row;
  }

  // `row` is typed `any` deliberately -- see merchandise-catalog.service.ts
  // toResponse() comment (CLAUDE.md §5.3: Selectable<> does not collapse
  // Generated<ColumnType<Date, ...>> fields to `Date` in this Kysely version).
  private async toResponse(row: any): Promise<CouponResponse> {
    const activeCount = await db
      .selectFrom('merchandise_coupon_redemptions')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('coupon_id', '=', row.id)
      .where('status', 'in', ACTIVE_REDEMPTION_STATUSES as any)
      .executeTakeFirst();

    return {
      id: row.id,
      uuid: row.uuid,
      code: row.code,
      discountType: row.discount_type as 'FIXED',
      discountValuePaise: Number(row.discount_value_paise),
      applicableProductId: row.applicable_product_id,
      maxRedemptions: row.max_redemptions,
      activeRedemptions: Number(activeCount?.count ?? 0),
      active: Boolean(row.active),
      validFrom: row.valid_from ? new Date(row.valid_from).toISOString() : null,
      validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
