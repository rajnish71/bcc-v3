import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateOverrideDto {
  @IsString()
  @Matches(/^[a-z0-9_.]+$/)
  @MinLength(2)
  @MaxLength(100)
  key: string;

  @IsIn(['GRANT', 'REVOKE'])
  overrideType: 'GRANT' | 'REVOKE';

  // For REVOKE the value is semantically unused; DTO still requires a
  // non-empty string so the DB NOT NULL column is satisfied -- callers
  // conventionally pass 'REVOKED'.
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  value: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
