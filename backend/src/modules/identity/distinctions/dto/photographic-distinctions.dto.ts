// backend/src/modules/identity/distinctions/dto/photographic-distinctions.dto.ts
//
// Request DTOs for PhotographicDistinctionsController. Update DTOs declare
// every field explicitly with @IsOptional() (CLAUDE.md 5.4 -- no PartialType).
//
// Catalogue codes are structured identifiers, not free text:
//   institution  ^[A-Z]{2,20}$     (OTHER is rejected in the service)
//   distinction  ^[A-Z0-9_]{2,50}$ machine-safe internal code (AFIP, EFIAP_D1);
//                official punctuation lives in the optional displayCode
//                (EFIAP/d1, MFIP (Nature)). Legacy "GPU-CR3" is not a code.

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const INSTITUTION_CODE_PATTERN = /^[A-Z]{2,20}$/;
export const DISTINCTION_CODE_PATTERN = /^[A-Z0-9_]{2,50}$/;
export const DISPLAY_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 \/().*-]{0,49}$/;

export class DistinctionReasonDto {
  @IsString()
  @MaxLength(500)
  @Matches(/\S/, { message: 'A reason is required.' })
  reason!: string;
}

export class CreateInstitutionDto {
  @Matches(INSTITUTION_CODE_PATTERN, { message: 'code must be 2-20 uppercase letters' })
  code!: string;

  @IsString() @MinLength(1) @MaxLength(255)
  name!: string;

  @IsOptional() @IsInt() @Min(0) @Max(65535)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateInstitutionDto {
  @IsOptional() @Matches(INSTITUTION_CODE_PATTERN, { message: 'code must be 2-20 uppercase letters' })
  code?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  name?: string;

  @IsOptional() @IsInt() @Min(0) @Max(65535)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateDistinctionDto {
  @IsInt() @Min(1)
  institutionId!: number;

  @Matches(DISTINCTION_CODE_PATTERN, { message: 'code must be 2-50 uppercase letters, digits or underscores' })
  code!: string;

  @IsOptional() @Matches(DISPLAY_CODE_PATTERN, { message: 'displayCode may contain letters, digits, spaces and / ( ) . * - only' })
  displayCode?: string;

  @IsString() @MinLength(1) @MaxLength(255)
  name!: string;

  @IsBoolean()
  badgeEligible!: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(65535)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateDistinctionDto {
  @IsOptional() @Matches(DISTINCTION_CODE_PATTERN, { message: 'code must be 2-50 uppercase letters, digits or underscores' })
  code?: string;

  @IsOptional() @Matches(DISPLAY_CODE_PATTERN, { message: 'displayCode may contain letters, digits, spaces and / ( ) . * - only' })
  displayCode?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  name?: string;

  @IsOptional() @IsBoolean()
  badgeEligible?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(65535)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ListDeclarationsQueryDto {
  @IsOptional() @IsIn(['DECLARED', 'WITHDRAWN', 'REMOVED'])
  state?: 'DECLARED' | 'WITHDRAWN' | 'REMOVED';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  userId?: number;

  @IsOptional() @IsString() @MaxLength(64)
  q?: string;
}
