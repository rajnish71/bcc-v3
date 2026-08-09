import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const SELF_SERVICE_CLASS_CODES = ['BASIC_MEMBER', 'STUDENT_MEMBER', 'INDIVIDUAL_MEMBER'] as const;
export type SelfServiceClassCode = (typeof SELF_SERVICE_CLASS_CODES)[number];

export class SubmitMembershipFormDto {
  @IsDateString()
  dateOfBirth: string;

  @IsIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

  @IsString()
  @Matches(/^(0|\+91)?[6-9]\d{9}$/, { message: 'Enter a valid 10-digit Indian mobile number' })
  phone: string;

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  addressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  state: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter a valid 6-digit PIN code' })
  pinCode: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  termsVersion: string;

  @IsOptional()
  @IsString()
  @IsIn(SELF_SERVICE_CLASS_CODES)
  membershipClassCode?: SelfServiceClassCode;
}
