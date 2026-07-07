// backend/src/modules/journal/dto/update-journal-post.dto.ts
//
// Validates PATCH /api/v1/journal/:id
//
// All fields are optional — only supplied fields are patched.
// Cannot change status via this endpoint; use /publish or /archive instead.
// Note: @nestjs/mapped-types is not installed in this project, so all
//       fields are declared explicitly with @IsOptional().

import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateJournalPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  /** HTML body produced by a rich text editor. */
  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  /** Full URL of the hero image. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  hero_image_url?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  @Type(() => Number)
  reading_time_minutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  author_display_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  seo_title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seo_description?: string;
}
