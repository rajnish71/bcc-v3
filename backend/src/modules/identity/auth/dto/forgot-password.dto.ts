// auth/dto/forgot-password.dto.ts
//
// Accepts either an email address or a username as the identifier.
// The service detects which form was submitted by checking for '@'.
// Using a single 'identifier' field (rather than separate email/username)
// keeps the UI to one input and matches the expected UX pattern where
// users may not remember which email they registered with.

import { IsString, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @MinLength(1)
  identifier: string; // email address OR username
}
