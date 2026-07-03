import { IsInt, IsPositive } from 'class-validator';

export class ApplyMembershipDto {
  @IsInt()
  @IsPositive()
  membershipClassId: number;
}
