import { IsString, MaxLength, MinLength } from 'class-validator';

// Family/Corporate invitation target: a Registered User's email or username
// (MEM-006 P1 -- members are Registered Users). Never a user id chosen by the
// client, never a membership number.
export class InviteGroupMemberDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  identifier: string;
}

// Administrative revocation: reason is mandatory (ADMIN-ARCH-001 FD-005).
export class RevokeGroupMemberDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
