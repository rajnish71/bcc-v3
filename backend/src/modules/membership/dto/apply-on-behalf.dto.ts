import { IsInt, IsOptional, IsPositive } from 'class-validator';

// Two valid shapes, cross-validated in MembershipLifecycleService.apply()
// (multi-property rules aren't single-decorator territory):
//   INDIVIDUAL: userId + membershipClassId
//   GROUP:      groupEntityId + groupMembershipTypeId
// Option B separation (migration 0026): group memberships reference
// group_membership_types, never membership_classes -- MEM-006: "Group
// Memberships are not Membership Classes."
export class ApplyOnBehalfDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  membershipClassId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  groupMembershipTypeId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  userId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  groupEntityId?: number;
}
