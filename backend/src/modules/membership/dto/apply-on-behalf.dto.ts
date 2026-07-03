import { IsInt, IsOptional, IsPositive } from 'class-validator';

// Exactly one of userId / groupEntityId is expected -- enforced in
// MembershipLifecycleService.apply(), not here, since "exactly one of A or
// B" isn't a single-property class-validator decorator.
export class ApplyOnBehalfDto {
  @IsInt()
  @IsPositive()
  membershipClassId: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  userId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  groupEntityId?: number;
}
