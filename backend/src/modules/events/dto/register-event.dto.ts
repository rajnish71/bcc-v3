// backend/src/modules/events/dto/register-event.dto.ts
//
// DTOs for Activity participation.
//
// Participation is by Registered User: identity comes from the access token,
// so registration takes no body. Membership is consulted only when the
// Activity's eligibility_mode requires it (see EventsService.assertEligibility).
// Anonymous / identity-less GUEST registration was removed in the Stage 1
// reconciliation -- existing GUEST rows remain readable but no new ones are
// created.

import { IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// DTO for cancelling a registration (body is optional -- reason is optional)
export class CancelRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// DTO for cancelling an event
export class CancelEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

// DTO for adding users to an INVITE_ONLY event's invite list
export class AddInviteDto {
  @IsArray()
  @IsInt({ each: true })
  user_ids: number[];
}
