import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum SocialProvider {
  GOOGLE = 'GOOGLE',
  FACEBOOK = 'FACEBOOK',
  INSTAGRAM = 'INSTAGRAM',
}

// NOTE: this DTO takes the provider profile fields directly (email, name,
// provider_user_id) rather than a raw OAuth code -- the actual token
// exchange with Google/Facebook/Instagram is a frontend/Astro concern
// (or a dedicated OAuthCallbackController) not built in this pass. This
// service trusts its caller to have already verified the token server-side
// before calling here. Flagged: wiring the real OAuth code-exchange step is
// follow-up work, not yet done.
export class SocialLoginDto {
  @IsEnum(SocialProvider)
  provider: SocialProvider;

  @IsString()
  @MinLength(1)
  providerUserId: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName: string;
}
