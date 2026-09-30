import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Self-service Family / Corporate application (authenticated Hub).
//
// Deliberately carries NO fee, amount, membership-type id, group/entity id,
// primary contact, capacity, membership number or user id: the applicant is
// the access-token identity, the head is always that applicant, and the
// fee / term / capacity come only from group_type_entitlements (MEM-008) via
// the existing lifecycle. groupType is only the entity KIND; the matching
// group_membership_types row is resolved server-side.
export const SELF_SERVICE_GROUP_TYPES = ['FAMILY', 'CORPORATE'] as const;
export type SelfServiceGroupType = (typeof SELF_SERVICE_GROUP_TYPES)[number];

export class SubmitGroupApplicationDto {
  @IsIn(SELF_SERVICE_GROUP_TYPES)
  groupType: SelfServiceGroupType;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  groupName: string;

  // Same validation as the individual application (SubmitMembershipFormDto).
  @IsString()
  @Matches(/^(0|\+91)?[6-9]\d{9}$/, { message: 'Enter a valid 10-digit Indian mobile number' })
  phone: string;

  // Same validation as the individual application (SubmitMembershipFormDto).
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  termsVersion: string;
}
