// backend/src/modules/gallery/portfolio-exposure.policy.ts
//
// MEM-008 public portfolio exposure policy -- PURE (no db import) so it is
// unit-testable under the project's CommonJS Jest config.
//
// Entitlement keys (resolved via EntitlementService: class + recognition +
// individual override -- no parallel permission system):
//   portfolio_enabled       'true' | 'false'   public photographer portfolio
//   public_gallery_enabled  'true' | 'false'   club-wide public gallery / feed
//   portfolio_max_photos    integer | 'unlimited' | (absent = unlimited)
//
// Semantics:
//   * portfolio_max_photos caps how many of a member's PUBLIC photographs may
//     be publicly exposed. It never deletes or mutates photographs.
//   * For a CAPPED owner, only photographs the member explicitly selected
//     (photos.portfolio_selected = 1) are exposed, and at most `max` of them.
//   * For an UNCAPPED owner (null), selection is irrelevant; existing
//     behaviour (visibility + show_in_portfolio) applies unchanged.
//   * Malformed values fail CLOSED (treated as 0).

export const PORTFOLIO_ENABLED_KEY = 'portfolio_enabled';
export const PUBLIC_GALLERY_ENABLED_KEY = 'public_gallery_enabled';
export const PORTFOLIO_MAX_PHOTOS_KEY = 'portfolio_max_photos';
export const PORTFOLIO_UNLIMITED = 'unlimited';

export type ExposureScope = 'PORTFOLIO' | 'GALLERY';

export interface OwnerExposure {
  portfolioEnabled: boolean;
  galleryEnabled: boolean;
  /** null = unlimited */
  maxPhotos: number | null;
}

export const NO_EXPOSURE: OwnerExposure = {
  portfolioEnabled: false,
  galleryEnabled: false,
  maxPhotos: 0,
};

/** undefined / '' / 'unlimited' -> null (no cap). Digits -> number. Junk -> 0. */
export function parseMaxPhotos(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const v = raw.trim().toLowerCase();
  if (v === '' || v === PORTFOLIO_UNLIMITED) return null;
  if (!/^\d+$/.test(v)) return 0;
  return parseInt(v, 10);
}

export function exposureFromResolved(resolved: Record<string, string>): OwnerExposure {
  const portfolioEnabled = resolved[PORTFOLIO_ENABLED_KEY] === 'true';
  return {
    portfolioEnabled,
    // The gallery is a superset surface: it never exists without a portfolio.
    galleryEnabled: portfolioEnabled && resolved[PUBLIC_GALLERY_ENABLED_KEY] === 'true',
    maxPhotos: parseMaxPhotos(resolved[PORTFOLIO_MAX_PHOTOS_KEY]),
  };
}

/** Combine several ACTIVE memberships of one user: most permissive wins. */
export function mergeExposures(list: OwnerExposure[]): OwnerExposure {
  if (list.length === 0) return NO_EXPOSURE;
  let maxPhotos: number | null = 0;
  let portfolioEnabled = false;
  let galleryEnabled = false;
  for (const e of list) {
    portfolioEnabled = portfolioEnabled || e.portfolioEnabled;
    galleryEnabled = galleryEnabled || e.galleryEnabled;
    if (!e.portfolioEnabled) continue;
    if (e.maxPhotos === null) maxPhotos = null;
    else if (maxPhotos !== null) maxPhotos = Math.max(maxPhotos, e.maxPhotos);
  }
  return { portfolioEnabled, galleryEnabled, maxPhotos: portfolioEnabled ? maxPhotos : 0 };
}

/** Set of owners whose PUBLIC photographs are exposed on a given surface. */
export interface ExposureSet {
  uncappedOwnerIds: number[];
  cappedOwnerIds: number[];
  /**
   * Capped owners whose stored selection EXCEEDS the current cap (e.g. after a
   * downgrade). Nothing of theirs is publicly exposed until the member
   * reconciles their own selection: the system never chooses which subset
   * they "meant" to keep. Selection state is retained, never rewritten.
   */
  overCapOwnerIds: number[];
}

export function buildExposureSet(
  owners: Map<number, OwnerExposure>,
  scope: ExposureScope,
  selectedByOwner: Map<number, number[]>,
): ExposureSet {
  const uncappedOwnerIds: number[] = [];
  const cappedOwnerIds: number[] = [];
  const overCapOwnerIds: number[] = [];
  for (const [ownerId, e] of owners) {
    const allowed = scope === 'GALLERY' ? e.galleryEnabled : e.portfolioEnabled;
    if (!allowed) continue;
    if (e.maxPhotos === null) {
      uncappedOwnerIds.push(ownerId);
    } else {
      // Fail closed when over cap: no arbitrary subset is chosen for the member.
      if ((selectedByOwner.get(ownerId) ?? []).length > e.maxPhotos) {
        overCapOwnerIds.push(ownerId);
        continue;
      }
      cappedOwnerIds.push(ownerId);
    }
  }
  return { uncappedOwnerIds, cappedOwnerIds, overCapOwnerIds };
}

/** Row-level check mirroring the SQL predicate built in PortfolioExposureService. */
export function setAllowsPhoto(
  set: ExposureSet,
  photo: { ownerId: number; id: number; selected: boolean },
): boolean {
  if (set.uncappedOwnerIds.includes(photo.ownerId)) return true;
  return set.cappedOwnerIds.includes(photo.ownerId) && photo.selected;
}

export type SelectionDecision = 'OK' | 'NOT_ENABLED' | 'CAP_REACHED';

/**
 * May the member mark one more photograph as selected?
 * Un-selecting is always allowed and never calls this.
 */
export function decideSelection(
  exposure: OwnerExposure,
  currentSelectedCount: number,
  alreadySelected: boolean,
): SelectionDecision {
  if (alreadySelected) return 'OK';
  if (!exposure.portfolioEnabled) return 'NOT_ENABLED';
  if (exposure.maxPhotos !== null && currentSelectedCount >= exposure.maxPhotos) return 'CAP_REACHED';
  return 'OK';
}
