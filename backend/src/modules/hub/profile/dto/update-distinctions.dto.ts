import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDistinctionsDto {
  /** @deprecated Legacy scalar fields are accepted but IGNORED; user_photo_titles is read-only in the Hub. */
  @IsOptional() @IsString() @MaxLength(500) fiap?: string;
  /** @deprecated ignored */
  @IsOptional() @IsString() @MaxLength(500) fip?: string;
  /** @deprecated ignored */
  @IsOptional() @IsString() @MaxLength(500) psa?: string;
  /** @deprecated ignored */
  @IsOptional() @IsString() @MaxLength(1000) other?: string;
  @IsOptional() @IsString() @MaxLength(10000) awardsHtml?: string;
}
