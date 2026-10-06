import { IsArray, IsIn, IsString, ValidateNested, MaxLength, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { SOCIAL_PLATFORMS } from './profile-field-values';

const PLATFORMS = SOCIAL_PLATFORMS;

export class SocialLinkDto {
  @IsString() @IsIn(PLATFORMS) platform!: string;
  @IsString() @MaxLength(300) handle!: string;
}

export class UpdateSocialDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SocialLinkDto)
  links!: SocialLinkDto[];
}
