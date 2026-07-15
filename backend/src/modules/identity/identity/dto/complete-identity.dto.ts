import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

export class CompleteIdentityDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Username may only contain lowercase letters, numbers, and underscores.',
  })
  username: string;

  // Only required when the user record has no full_name set.
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  displayName?: string;
}
