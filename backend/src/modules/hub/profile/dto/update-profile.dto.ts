import {
  IsOptional, IsString, MaxLength, IsUrl,
  IsArray, ArrayMaxSize, IsIn, IsDateString, Matches,
  IsInt, Min,
} from 'class-validator';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
const RELATIONSHIPS = ['SPOUSE', 'PARENT', 'SIBLING', 'CHILD', 'FRIEND', 'OTHER'] as const;
const CAMERA_SYSTEMS = ['Nikon', 'Canon', 'Sony', 'Fujifilm', 'OM System', 'Other'] as const;
const GALLERY_LAYOUTS = ['justified', 'masonry', 'editorial', 'modular', 'metro', 'magazine'] as const;

export class UpdateProfileDto {
  // Phone (10 digits, must start with 6–9 — +91 prefix is added by the platform)
  @IsOptional() @IsString() @Matches(/^[6-9]\d{9}$/) phone?: string;

  @IsOptional() @IsString() @IsIn(GENDERS) gender?: string;

  @IsOptional() @IsDateString() dateOfBirth?: string;

  // Address
  @IsOptional() @IsString() @MaxLength(255) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(255) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(255) addressLine3?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) pinCode?: string;
  @IsOptional() @IsString() @IsIn(BLOOD_GROUPS) bloodGroup?: string;
  @IsOptional() @IsString() @MaxLength(150) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(15) emergencyContactPhone?: string;
  @IsOptional() @IsString() @IsIn(RELATIONSHIPS) emergencyContactRelationship?: string;

  // Public Profile
  @IsOptional() @IsString() @MaxLength(120) tagline?: string;
  @IsOptional() @IsUrl({}, { message: 'websiteUrl must be a valid URL' }) websiteUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) areasOfExpertise?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) favouriteSubjects?: string[];
  @IsOptional() @IsString() @IsIn(CAMERA_SYSTEMS) preferredCameraSystem?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) photographyGenres?: string[];
  @IsOptional() @IsString() @MaxLength(3000) bio?: string;

  // Temporarily user-editable — will be replaced by membership application date on full launch
  @IsOptional() @IsInt() @Min(1990) yearJoinedBcc?: number;

  @IsOptional() @IsString() @IsIn(GALLERY_LAYOUTS) galleryLayout?: string;
}
