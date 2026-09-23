// backend/src/modules/merchandise/dto/update-product.dto.ts
//
// Validates PATCH /api/v1/merchandise/admin/products/:id.
// All fields optional; the service merges only the keys that are present.
// @nestjs/mapped-types is not a project dependency, so fields are declared
// explicitly here rather than using PartialType(CreateProductDto).

import { IsString, IsOptional, IsInt, IsBoolean, Min, MaxLength, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  price_paise?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock_quantity?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  image_refs?: string[];
}
