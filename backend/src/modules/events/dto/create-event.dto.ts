// backend/src/modules/events/dto/create-event.dto.ts
//
// Validates POST /api/v1/events (creates a new DRAFT event).
// The service enforces business-complete state at publish() time;
// creation only requires title, event_type, and starts_at.

import {
  IsString, IsEnum, IsOptional, IsInt, IsBoolean,
  IsNumber, IsArray, Min, MaxLength, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { EventType, EligibilityMode } from '../../../database/db';

export class CreateEventDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum([
    'PHOTOWALK','BIRD_WALK','WORKSHOP','SEMINAR','TOUR','MEETUP',
    'TRAINING','CONSERVATION','EXHIBITION_EVENT','GOVERNANCE',
    'AWARD_CEREMONY','ONLINE','COLLABORATIVE','OTHER',
  ])
  event_type: EventType;

  @IsOptional()
  @IsEnum(['SINGLE','RECURRING'])
  occurrence?: 'SINGLE' | 'RECURRING';

  // ISO-8601 datetime string; toMysqlDatetime() converts before DB write
  @IsDateString()
  starts_at: string;

  @IsOptional()
  @IsDateString()
  ends_at?: string;

  // Location (all optional -- online events have no physical location)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location_name?: string;

  @IsOptional()
  @IsString()
  location_address?: string;

  @IsOptional()
  @IsNumber()
  location_lat?: number;

  @IsOptional()
  @IsNumber()
  location_lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location_landmark?: string;

  // null / omitted = unlimited attendance
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  waitlist_enabled?: boolean;

  @IsOptional()
  @IsEnum(['FREE','FLAT','MEMBER_DISCOUNTED'])
  fee_type?: 'FREE' | 'FLAT' | 'MEMBER_DISCOUNTED';

  // Stored in paise (1 INR = 100 paise). Must be 0 for FREE events.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  base_fee_paise?: number;

  @IsOptional()
  @IsEnum(['OPEN','MEMBERS_ONLY','SPECIFIC_CLASSES','INVITE_ONLY','CONSTITUTIONAL_MEMBERS_ONLY'])
  eligibility_mode?: EligibilityMode;

  // Required when eligibility_mode = SPECIFIC_CLASSES; ignored otherwise.
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  allowed_class_ids?: number[];

  @IsOptional()
  @IsEnum(['ALL','BEGINNER','INTERMEDIATE','ADVANCED'])
  difficulty_level?: 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

  @IsOptional()
  @IsEnum(['ALL','ADULT','FAMILY'])
  age_restriction?: 'ALL' | 'ADULT' | 'FAMILY';

  @IsOptional()
  @IsBoolean()
  weather_dependent?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  volunteer_slots_needed?: number;

  @IsOptional()
  @IsString()
  what_to_bring?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
