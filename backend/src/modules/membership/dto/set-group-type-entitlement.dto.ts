import { IsInt, IsPositive, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SetGroupTypeEntitlementDto {
  @IsInt()
  @IsPositive()
  groupMembershipTypeId: number;

  @IsString()
  @Matches(/^[a-z0-9_.]+$/, { message: 'entitlement key must be lower_snake (a-z, 0-9, _, .)' })
  @MinLength(2)
  @MaxLength(100)
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  value: string;
}
