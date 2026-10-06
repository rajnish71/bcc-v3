// backend/src/modules/hub/profile/dto/profile-field-values.ts
//
// Accepted value sets for Hub profile fields -- the single source shared by
// the write-path validators (UpdateProfileDto, UpdateSocialDto) and the
// PROFILE-ARCH-001 completion policy. Plain constants (no decorators) so they
// can be imported anywhere without class-transformer / reflect-metadata.

export const CAMERA_SYSTEMS = ['Nikon', 'Canon', 'Sony', 'Fujifilm', 'OM System', 'Other'] as const;

export const SOCIAL_PLATFORMS = [
  'INSTAGRAM', 'FLICKR', 'YOUTUBE', 'FIVE_HUNDRED_PX', 'WEBSITE',
  'FACEBOOK', 'X_TWITTER', 'TIKTOK', 'LINKEDIN',
] as const;
