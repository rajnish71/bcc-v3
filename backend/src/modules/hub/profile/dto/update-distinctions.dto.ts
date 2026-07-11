import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDistinctionsDto {
  @IsOptional() @IsString() @MaxLength(500) fiap?: string;
  @IsOptional() @IsString() @MaxLength(500) fip?: string;
  @IsOptional() @IsString() @MaxLength(500) psa?: string;
  @IsOptional() @IsString() @MaxLength(1000) other?: string;
  @IsOptional() @IsString() @MaxLength(10000) awardsHtml?: string;
}
