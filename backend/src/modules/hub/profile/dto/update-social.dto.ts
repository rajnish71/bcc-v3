import { IsArray, IsIn, IsString, ValidateNested, MaxLength, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

const PLATFORMS = [
  'INSTAGRAM', 'FLICKR', 'YOUTUBE', 'FIVE_HUNDRED_PX', 'WEBSITE',
  'FACEBOOK', 'X_TWITTER', 'TIKTOK', 'LINKEDIN',
] as const;

export class SocialLinkDto {
  @IsString() @IsIn(PLATFORMS) platform!: string;
  @IsString() @MaxLength(300) handle!: string;
}

export class UpdateSocialDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SocialLinkDto)
  links!: SocialLinkDto[];
}
