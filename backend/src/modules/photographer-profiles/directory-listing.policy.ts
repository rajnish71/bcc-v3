// backend/src/modules/photographer-profiles/directory-listing.policy.ts
//
// Public Photographer Directory -- filter / sort vocabulary and the public
// display-name rule. PURE (no db import) so it is unit-testable under the
// project's CommonJS Jest config (same pattern as directory-eligibility.policy.ts).
//
// Filters narrow the ELIGIBLE directory population only (directoryBaseQuery +
// DirectoryEligibilityService). No filter or sort can widen it.
//
//   all           every directory-eligible photographer
//   active        membership lifecycle_state = 'ACTIVE' (MEM-006 lifecycle).
//                 The directory base population is already ACTIVE-only, so
//                 today this equals 'all'; the predicate is asserted
//                 explicitly so it stays correct if the base ever widens.
//   legacy        Legacy Member membership category (MEM-008 §2):
//                 membership_classes.code = 'LEGACY_MEMBER'
//   honorary      an ACTIVE Honorary Recognition Class (MEM-006 v1.1
//                 Governance Recognition Track / MEM-008 RECOGNITION CLASSES).
//                 Senior Member is a Status Overlay and is NOT honorary.
//   distinctions  BCC Distinguished Photographer read-time predicate
//                 (identity/distinctions/photographic-distinction-badge.ts).
//
// Sorts are deterministic; every order ends on a unique key (u.id).
//   random        CRC32(seed:u.id) -- a per-visitor seed keeps pagination stable
//   newest/earliest  memberships.join_year / join_month (membership-number
//                 YYYY/MM, trigger-frozen once numbered -- 0111), then
//                 number_serial. users.year_joined_bcc is a non-authoritative
//                 self-declaration and is never used.
//   photos_*      PUBLICLY_ELIGIBLE_PORTFOLIO_COUNT (PROFILE-ARCH-001 §3,
//                 MEM-008 exposure path)
//   name_*        public display name (buildDisplayName below)

export const DIRECTORY_FILTERS = ['all', 'active', 'legacy', 'honorary', 'distinctions'] as const;
export type DirectoryFilter = (typeof DIRECTORY_FILTERS)[number];

export const DIRECTORY_SORTS = [
  'random', 'newest', 'earliest', 'photos_desc', 'photos_asc', 'name_asc', 'name_desc',
] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

/** Pre-existing sort values, still accepted so existing callers keep working. */
const SORT_ALIASES: Record<string, DirectorySort> = {
  name:   'name_asc',
  photos: 'photos_desc',
  joined: 'earliest',
};

/** API default when no sort is given (unchanged pre-existing behaviour). */
export const DIRECTORY_API_DEFAULT_SORT: DirectorySort = 'name_asc';

export const LEGACY_MEMBER_CLASS_CODE = 'LEGACY_MEMBER';

/** MEM-006 v1.1 Honorary Recognition Classes. SENIOR_MEMBER (Status Overlay) excluded. */
export const HONORARY_RECOGNITION_CODES = [
  'HONORARY_MEMBER',
  'HONORARY_MENTOR',
  'HONORARY_GRANDMASTER',
  'HONORARY_SENIOR_MEMBER',
] as const;

export function parseDirectoryFilter(raw: unknown): DirectoryFilter {
  return (DIRECTORY_FILTERS as readonly string[]).includes(String(raw)) ? (raw as DirectoryFilter) : 'all';
}

export function parseDirectorySort(raw: unknown, fallback: DirectorySort = DIRECTORY_API_DEFAULT_SORT): DirectorySort {
  const s = String(raw ?? '');
  if ((DIRECTORY_SORTS as readonly string[]).includes(s)) return s as DirectorySort;
  return SORT_ALIASES[s] ?? fallback;
}

export const SEED_MAX = 2_147_483_646;

/** A valid random seed (1..SEED_MAX), or null. */
export function parseSeed(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw);
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= SEED_MAX ? n : null;
}

export function newSeed(rand: () => number = Math.random): number {
  return 1 + Math.floor(rand() * SEED_MAX);
}

// ---------------------------------------------------------------------------
// Public display name
// ---------------------------------------------------------------------------

// Honorifics suppressed from public display — only Dr. is shown.
export const SUPPRESS_TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Shri', 'Smt.', 'Er.', 'Prof.', 'Capt.', 'Col.', 'Maj.'];

export function buildDisplayName(fullName: string | null, nameTitle: string | null): string {
  const name = (fullName ?? '').trim();
  // Strip any suppressed honorific already baked into full_name
  for (const t of SUPPRESS_TITLES) {
    if (name.startsWith(t + ' ')) return name.slice(t.length + 1).trim();
  }
  // Prepend Dr. if name_title says so and it's not already there
  if (nameTitle === 'Dr.' && !name.startsWith('Dr. ')) return `Dr. ${name}`;
  return name;
}

/**
 * MySQL REGEXP (bound as a parameter) matching a leading suppressed honorific
 * followed by a space -- the SQL mirror of buildDisplayName()'s strip step.
 * Case-sensitive in buildDisplayName; the SQL side applies BINARY.
 */
export function suppressedTitleRegex(): string {
  return '^(' + SUPPRESS_TITLES.map(t => t.replace(/[.]/g, '\\.')).join('|') + ') ';
}
