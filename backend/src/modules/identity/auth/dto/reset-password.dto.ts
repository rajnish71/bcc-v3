// auth/dto/reset-password.dto.ts

import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token: string; // raw opaque token from the reset URL

  @IsString()
  @MinLength(8)
  newPassword: string;
}
