// backend/src/modules/merchandise/dto/create-product.dto.ts
//
// Validates POST /api/v1/merchandise/admin/products.

import { IsString, IsOptional, IsInt, IsBoolean, Min, MaxLength, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @MaxLength(50)
  sku: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  price_paise: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // NULL/omitted = stock not tracked (unlimited).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock_quantity?: number;

  // Image/product-detail references; populated later per the authorizing
  // prompt (product photographs supplied after V1 ships).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  image_refs?: string[];
}
