import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConsumeMagicLinkDto {
  @IsString()
  token: string;

  // Only used the first time (registration). Ignored on a login-only
  // consumption where the user already exists.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName?: string;
}
