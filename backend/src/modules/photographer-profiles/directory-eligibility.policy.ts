// backend/src/modules/photographer-profiles/directory-eligibility.policy.ts
//
// Public Photographer Directory eligibility -- PURE (no db import) so it is
// unit-testable under the project's CommonJS Jest config (same pattern as
// gallery/portfolio-exposure.policy.ts).
//
// PROFILE-ARCH-001 §3 (frozen 2026-10-06):
//   LISTED(u) = EXISTING_DIRECTORY_GATES(u)
//           AND HAS_VALID_PROFILE_PHOTO(u)          (user_avatars ORIGINAL row)
//           AND 2 * PROFILE_COMPLETED_COUNT(u) >= 7  (profile-completion.policy.ts)
//           AND PUBLICLY_ELIGIBLE_PORTFOLIO_COUNT(u) >= 5 (MEM-008 exposure path)
//
// This is a LISTING rule only. It never changes membership state,
// entitlements, profile visibility, the public profile route, photographs or
// portfolio selection. Eligibility is always derived from current data --
// there is no persisted flag.

import { PROFILE_ARCH_AUTHORITY, type ProfileCompletion } from './profile-completion.policy';

export const DIRECTORY_MIN_COMPLETION_PERCENT = 50;
export const DIRECTORY_MIN_PORTFOLIO_PHOTOS = 5;

export type ProfileCompletionPolicy =
  | { status: 'PENDING_DEFINITION' }
  | { status: 'APPROVED'; authority: string };

/** The completion definition is frozen by PROFILE-ARCH-001. */
export const PROFILE_COMPLETION_POLICY: ProfileCompletionPolicy = {
  status: 'APPROVED',
  authority: PROFILE_ARCH_AUTHORITY,
};

/** The directory rule is enforced only once every condition can be evaluated. */
export function isDirectoryRuleEnforced(policy: ProfileCompletionPolicy = PROFILE_COMPLETION_POLICY): boolean {
  return policy.status === 'APPROVED';
}


// ---------------------------------------------------------------------------
// Eligibility decision
// ---------------------------------------------------------------------------

export type DirectoryActionKey = 'UPLOAD_PROFILE_PHOTO' | 'COMPLETE_PROFILE' | 'MANAGE_PORTFOLIO';

/** Canonical Members Hub routes for each unmet requirement. */
export const DIRECTORY_ACTIONS: Record<DirectoryActionKey, { label: string; href: string }> = {
  UPLOAD_PROFILE_PHOTO: { label: 'Upload Profile Photo', href: '/hub/profile/#section-identity' },
  COMPLETE_PROFILE:     { label: 'Complete Profile',     href: '/hub/profile/' },
  MANAGE_PORTFOLIO:     { label: 'Manage Portfolio',     href: '/hub/portfolio/' },
};

export interface DirectoryEligibility {
  /** null = undetermined (only possible while a completion definition is pending). */
  directoryEligible: boolean | null;
  hasProfilePhoto: boolean;
  /** Display-only percentage from the completion result; null when no completion result. */
  profileCompletionPercent: number | null;
  /** Integer completion result (completed / total); null when no completion result. */
  profileCompletionCount: { completed: number; total: number } | null;
  publicPortfolioPhotoCount: number;
  requirements: {
    profilePhoto: boolean;
    /** null = cannot be evaluated yet. */
    profileCompletion: boolean | null;
    portfolioPhotos: boolean;
  };
  thresholds: { profileCompletionPercent: number; portfolioPhotos: number };
  /** Only actions for UNMET requirements, in display order. */
  actions: Array<{ key: DirectoryActionKey; label: string; href: string }>;
}

/**
 * @param completion  the result of computeProfileCompletion() (PROFILE-ARCH-001),
 *   or null when no completion result is available. Eligibility uses its
 *   integer threshold test (meetsThreshold), never the display percentage.
 */
export function decideDirectoryEligibility(
  hasProfilePhoto: boolean,
  completion: Pick<ProfileCompletion, 'completed' | 'total' | 'meetsThreshold' | 'displayPercent'> | null,
  publicPortfolioPhotoCount: number,
): DirectoryEligibility {
  const requirements = {
    profilePhoto:      hasProfilePhoto,
    profileCompletion: completion === null ? null : completion.meetsThreshold,
    portfolioPhotos:   publicPortfolioPhotoCount >= DIRECTORY_MIN_PORTFOLIO_PHOTOS,
  };
  const actionKeys: DirectoryActionKey[] = [];
  if (!requirements.profilePhoto) actionKeys.push('UPLOAD_PROFILE_PHOTO');
  if (requirements.profileCompletion === false) actionKeys.push('COMPLETE_PROFILE');
  if (!requirements.portfolioPhotos) actionKeys.push('MANAGE_PORTFOLIO');

  // Any known failure decides "not eligible"; otherwise an unevaluable
  // condition leaves the outcome undetermined rather than guessed.
  let directoryEligible: boolean | null;
  if (!requirements.profilePhoto || !requirements.portfolioPhotos || requirements.profileCompletion === false) {
    directoryEligible = false;
  } else {
    directoryEligible = requirements.profileCompletion === null ? null : true;
  }

  return {
    directoryEligible,
    hasProfilePhoto,
    profileCompletionPercent: completion === null ? null : completion.displayPercent,
    profileCompletionCount: completion === null ? null : { completed: completion.completed, total: completion.total },
    publicPortfolioPhotoCount,
    requirements,
    thresholds: {
      profileCompletionPercent: DIRECTORY_MIN_COMPLETION_PERCENT,
      portfolioPhotos: DIRECTORY_MIN_PORTFOLIO_PHOTOS,
    },
    actions: actionKeys.map(key => ({ key, ...DIRECTORY_ACTIONS[key] })),
  };
}
