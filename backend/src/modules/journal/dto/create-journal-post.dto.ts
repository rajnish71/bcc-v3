// backend/src/modules/journal/dto/create-journal-post.dto.ts
//
// Validates POST /api/v1/journal
//
// Required:  title, body
// Optional:  everything else.  If `slug` is omitted the service auto-generates
//            one from the title + a UUID suffix.
// Lifecycle: status is always DRAFT on creation; use POST /:id/publish to
//            make the post public.

import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateJournalPostDto {
  // ---- Required -----------------------------------------------------------

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  /** HTML body produced by a rich text editor (Quill, TipTap, TinyMCE, etc.). */
  @IsString()
  @MinLength(1)
  body: string;

  // ---- Metadata -----------------------------------------------------------

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Short excerpt shown on listing cards. Falls back to description if omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  /**
   * Custom slug.  If omitted, auto-generated from title + uuid suffix.
   * Must be URL-safe: lowercase letters, digits, and hyphens only.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  // ---- Media --------------------------------------------------------------

  /** Full URL of the hero image (ImageKit CDN, R2 public URL, or legacy URL). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  hero_image_url?: string;

  // ---- Reading time -------------------------------------------------------

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  @Type(() => Number)
  reading_time_minutes?: number;

  // ---- Taxonomy -----------------------------------------------------------

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // ---- Author display -----------------------------------------------------

  /**
   * Override the author display name shown on the article.
   * Defaults to 'Bhopal Camera Club' if omitted.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  author_display_name?: string;

  // ---- SEO overrides ------------------------------------------------------

  @IsOptional()
  @IsString()
  @MaxLength(255)
  seo_title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seo_description?: string;
}
