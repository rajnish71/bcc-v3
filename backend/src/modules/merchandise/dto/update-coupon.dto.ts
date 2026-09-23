// backend/src/modules/merchandise/dto/update-coupon.dto.ts
//
// Validates PATCH /api/v1/merchandise/admin/coupons/:id.
// Explicit optional fields -- no PartialType (project convention, see
// update-product.dto.ts). Redemption count itself is never editable here
// (derived, read-only -- authorizing prompt §17 admin scope).

import { IsInt, IsOptional, IsBoolean, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCouponDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  discountValuePaise?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxRedemptions?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
