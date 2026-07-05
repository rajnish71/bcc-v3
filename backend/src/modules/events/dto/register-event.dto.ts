// backend/src/modules/events/dto/register-event.dto.ts
//
// Validates POST /api/v1/events/:id/registrations
// Member registrations: actor supplies nothing extra (identity from JWT).
// Guest registrations (OPEN events only): supply guest_* fields.

import { IsEnum, IsOptional, IsString, IsEmail, MaxLength } from 'class-validator';

export class RegisterEventDto {
  @IsEnum(['MEMBER','GUEST'])
  registration_type: 'MEMBER' | 'GUEST';

  // Required when registration_type = GUEST
  @IsOptional()
  @IsString()
  @MaxLength(255)
  guest_name?: string;

  @IsOptional()
  @IsEmail()
  guest_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  guest_phone?: string;
}

// DTO for cancelling a registration (body is optional -- reason is optional)
export class CancelRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// DTO for creating a volunteer slot
export class CreateVolunteerSlotDto {
  @IsString()
  @MaxLength(100)
  role_name: string;

  @IsOptional()
  @IsString()
  role_description?: string;

  @IsOptional()
  @IsString({ each: true })
  skills_required?: string[];

  @IsOptional()
  slots_count?: number;
}

// DTO for updating volunteer status (confirm, check-in, log hours)
export class UpdateVolunteerStatusDto {
  @IsEnum(['APPLIED','CONFIRMED','CHECKED_IN','NO_SHOW','CANCELLED'])
  status: 'APPLIED' | 'CONFIRMED' | 'CHECKED_IN' | 'NO_SHOW' | 'CANCELLED';

  @IsOptional()
  hours_logged?: number;
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
  user_ids: number[];
}
