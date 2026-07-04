// Self-service individual membership application.
// Group applications go through POST /membership/applications/on-behalf
// using ApplyOnBehalfDto, which carries groupMembershipTypeId (Option B
// separation, migration 0026 -- group types are not membership classes).
import { IsInt, IsPositive } from 'class-validator';

export class ApplyMembershipDto {
  @IsInt()
  @IsPositive()
  membershipClassId: number;
}
