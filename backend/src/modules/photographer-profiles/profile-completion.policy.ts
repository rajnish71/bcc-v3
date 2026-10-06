// backend/src/modules/photographer-profiles/profile-completion.policy.ts
//
// PROFILE-ARCH-001 §2 -- Photographer profile completion. The SINGLE
// authoritative calculation (server-side). Consumed by directory eligibility
// and, via the Hub API, by every Hub completion indicator. No other
// completion formula may exist (frontend code only displays this result).
//
// PURE (no db import) so it is unit-testable under the project's CommonJS
// Jest config. DirectoryEligibilityService loads the inputs.
//
// Seven equally weighted binary elements; no partial credit. Threshold:
// at least 50% => 4 of 7, tested with integer arithmetic (2 * completed >= 7).

import { isURL } from 'class-validator';
import { CAMERA_SYSTEMS, SOCIAL_PLATFORMS as PLATFORMS } from '../hub/profile/dto/profile-field-values';

export const PROFILE_ARCH_AUTHORITY = 'PROFILE-ARCH-001';

export type CompletionElementKey =
  | 'bio'
  | 'city'
  | 'cameraGear'
  | 'socialOrWebsite'
  | 'coverPhoto'
  | 'photographyGenres'
  | 'tagline';

/** PROFILE-ARCH-001 §2 -- exactly these seven, in this order. */
export const COMPLETION_ELEMENTS: ReadonlyArray<{ key: CompletionElementKey; label: string }> = [
  { key: 'bio',               label: 'Bio / About' },
  { key: 'city',              label: 'Location (City)' },
  { key: 'cameraGear',        label: 'Camera Gear' },
  { key: 'socialOrWebsite',   label: 'Social / Website' },
  { key: 'coverPhoto',        label: 'Cover Photo' },
  { key: 'photographyGenres', label: 'Photography Genres' },
  { key: 'tagline',           label: 'Tagline' },
];

export const COMPLETION_TOTAL = COMPLETION_ELEMENTS.length; // 7

/**
 * gear_type values the public profile renders as equipment (getPhotographer()
 * groups BODY / LENS / ACCESSORY; the page renders each non-empty group).
 * This is the full user_gear.gear_type enum.
 */
export const PUBLIC_GEAR_TYPES = ['BODY', 'LENS', 'ACCESSORY'] as const;

// ---------------------------------------------------------------------------
// Normalisation N(x) -- PROFILE-ARCH-001 §2.1
// ---------------------------------------------------------------------------

/** Named entities decoded explicitly; every other named entity is a visible character. */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', ensp: ' ', emsp: ' ', emsp13: ' ', emsp14: ' ',
  numsp: ' ', puncsp: ' ', thinsp: ' ', hairsp: ' ', MediumSpace: ' ',
  NewLine: '\n', Tab: '\t',
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[body] ?? m;
  });
}

/**
 * N(x): null => '', decode HTML entities, Unicode whitespace (JS \s is the
 * Unicode White_Space set, including U+00A0) treated as whitespace, trimmed.
 */
export function N(x: unknown): string {
  if (x === null || x === undefined) return '';
  return decodeEntities(String(x)).replace(/\s+/gu, ' ').trim();
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

// ---------------------------------------------------------------------------
// Element predicates -- PROFILE-ARCH-001 §2
// ---------------------------------------------------------------------------

export interface ProfileCompletionInput {
  bio: unknown;                 // users.bio
  city: unknown;                // users.city
  tagline: unknown;             // users.tagline
  preferredCameraSystem: unknown; // users.preferred_camera_system
  websiteUrl: unknown;          // users.website_url
  photographyGenres: unknown;   // users.photography_genres (as delivered by mysql2)
  gearTypes: string[];          // user_gear.gear_type of the user's rows
  socialHandles: Array<{ platform: string; handle: unknown }>; // user_social_handles
  hasActiveCover: boolean;      // user_cover_photos is_active row exists
}

export function bioComplete(bio: unknown): boolean {
  return N(stripTags(bio === null || bio === undefined ? '' : String(bio))) !== '';
}

export function textComplete(v: unknown): boolean {
  return N(v) !== '';
}

/** Value set exactly as enforced by UpdateProfileDto.preferredCameraSystem (@IsIn). None means absence. */
export function cameraSystemComplete(v: unknown): boolean {
  return typeof v === 'string' && (CAMERA_SYSTEMS as readonly string[]).includes(v);
}

export function cameraGearComplete(gearTypes: string[], preferredCameraSystem: unknown): boolean {
  const rendered = gearTypes.some(t => (PUBLIC_GEAR_TYPES as readonly string[]).includes(t));
  return rendered || cameraSystemComplete(preferredCameraSystem);
}

/** Same validator as UpdateProfileDto.websiteUrl: @IsUrl({}) => isURL(value, {}). */
export function websiteComplete(v: unknown): boolean {
  const s = N(v);
  return s !== '' && isURL(s, {});
}

/** Platforms come from the write path (UpdateSocialDto); the public profile renders every one. */
export function socialComplete(handles: Array<{ platform: string; handle: unknown }>): boolean {
  return handles.some(h =>
    (PLATFORMS as readonly string[]).includes(String(h.platform).toUpperCase()) && N(h.handle) !== '');
}

/**
 * The stored value is read exactly as the existing implementation reads it:
 * mysql2 delivers the JSON column already parsed and callers treat it as an
 * array (HubProfileService.getProfile). Write validation is @IsArray +
 * @IsString({ each: true }); a non-array value, or non-string elements, never count.
 */
export function genresComplete(v: unknown): boolean {
  return Array.isArray(v) && v.some(g => typeof g === 'string' && N(g) !== '');
}

// ---------------------------------------------------------------------------
// Completion result + threshold -- PROFILE-ARCH-001 §2.3
// ---------------------------------------------------------------------------

export interface ProfileCompletion {
  completed: number;
  total: number;
  /** 2 * completed >= total -- integer arithmetic, never a rounded percentage. */
  meetsThreshold: boolean;
  /** Display only: floor(100 * completed / total). Never used for eligibility. */
  displayPercent: number;
  elements: Array<{ key: CompletionElementKey; label: string; complete: boolean }>;
}

export function meetsCompletionThreshold(completed: number, total: number = COMPLETION_TOTAL): boolean {
  return 2 * completed >= total;
}

export function computeProfileCompletion(input: ProfileCompletionInput): ProfileCompletion {
  const done: Record<CompletionElementKey, boolean> = {
    bio:               bioComplete(input.bio),
    city:              textComplete(input.city),
    cameraGear:        cameraGearComplete(input.gearTypes, input.preferredCameraSystem),
    socialOrWebsite:   socialComplete(input.socialHandles) || websiteComplete(input.websiteUrl),
    coverPhoto:        input.hasActiveCover,
    photographyGenres: genresComplete(input.photographyGenres),
    tagline:           textComplete(input.tagline),
  };
  const elements = COMPLETION_ELEMENTS.map(e => ({ ...e, complete: done[e.key] }));
  const completed = elements.filter(e => e.complete).length;
  return {
    completed,
    total: COMPLETION_TOTAL,
    meetsThreshold: meetsCompletionThreshold(completed),
    displayPercent: Math.floor((completed * 100) / COMPLETION_TOTAL),
    elements,
  };
}
