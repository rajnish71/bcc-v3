import { IsString, MinLength } from 'class-validator';

// Accepts either an email address or a username.
// AuthService.login() detects which by checking for '@'.
export class LoginDto {
  @IsString()
  @MinLength(1)
  identifier: string; // email address OR username

  @IsString()
  @MinLength(1)
  password: string;
}
