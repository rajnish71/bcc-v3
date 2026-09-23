// backend/src/modules/merchandise/dto/create-coupon.dto.ts
//
// Validates POST /api/v1/merchandise/admin/coupons.
// Coupons are stored as normal data (authorizing prompt §11) -- no code,
// including 'testorder', is ever special-cased in application logic.

import { IsString, IsIn, IsInt, IsOptional, IsBoolean, Min, MaxLength, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCouponDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsIn(['FIXED'])
  discountType: 'FIXED';

  @IsInt()
  @Min(1)
  @Type(() => Number)
  discountValuePaise: number;

  @IsInt()
  @Type(() => Number)
  applicableProductId: number;

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
