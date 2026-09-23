// backend/src/modules/merchandise/dto/create-order.dto.ts
//
// Validates POST /api/v1/merchandise/orders.
//
// The client supplies only WHAT it wants (product ids + quantities) and an
// optional coupon code. It never supplies a price, discount, or total --
// MerchandiseOrderService computes all of that server-side (authorizing
// prompt §14: the browser is never authoritative for the final payable
// amount).

import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested, ArrayMinSize, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsInt()
  @Type(() => Number)
  productId: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;
}
