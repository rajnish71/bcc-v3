// backend/src/modules/photographer-profiles/directory-eligibility.policy.spec.ts
//
// PROFILE-ARCH-001 §3 -- Public Photographer Directory eligibility. Unit tests
// on the REAL pure policy (directory-eligibility.policy.ts, with the real
// completion threshold and the real MEM-008 portfolio-exposure policy for the
// Basic Member cases), plus static inspection of the db-importing services /
// pages that cannot be instantiated under the CommonJS Jest config (same
// constraint as gallery.service.spec.ts and portfolio-exposure.policy.spec.ts).
// Completion element tests live in profile-completion.policy.spec.ts.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  DIRECTORY_MIN_COMPLETION_PERCENT,
  DIRECTORY_MIN_PORTFOLIO_PHOTOS,
  PROFILE_COMPLETION_POLICY,
  decideDirectoryEligibility,
  isDirectoryRuleEnforced,
} from './directory-eligibility.policy';
import {
  buildExposureSet,
  exposureFromResolved,
  setAllowsPhoto,
} from '../gallery/portfolio-exposure.policy';
import { meetsCompletionThreshold } from './profile-completion.policy';

/** A completion result with `n` of 7 elements complete (threshold from the real policy). */
const comp = (n: number) => ({
  completed: n, total: 7, meetsThreshold: meetsCompletionThreshold(n, 7), displayPercent: Math.floor((n * 100) / 7),
});

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const PROFILES_SRC   = read('backend', 'src', 'modules', 'photographer-profiles', 'photographer-profiles.service.ts');
const CONTROLLER_SRC = read('backend', 'src', 'modules', 'photographer-profiles', 'photographer-profiles.controller.ts');
const ELIG_SRC       = read('backend', 'src', 'modules', 'photographer-profiles', 'directory-eligibility.service.ts');
const POLICY_SRC     = read('backend', 'src', 'modules', 'photographer-profiles', 'directory-eligibility.policy.ts');
const MODULE_SRC     = read('backend', 'src', 'modules', 'photographer-profiles', 'photographer-profiles.module.ts');
const HUB_CTRL_SRC   = read('backend', 'src', 'modules', 'hub', 'profile', 'hub-profile.controller.ts');
const ADMIN_PAGE_SRC = read('frontend', 'src', 'pages', 'hub', 'admin', 'membership', 'index.astro');
const HUB_PAGE_SRC   = read('frontend', 'src', 'pages', 'hub', 'index.astro');
const HUB_PROFILE_PAGE_SRC = read('frontend', 'src', 'pages', 'hub', 'profile', 'index.astro');
const PROFILE_ROUTE_SRC    = read('frontend', 'src', 'pages', 'photographers', '[username].astro');
const LEGACY_ROUTE_SRC     = read('frontend', 'src', 'pages', 'gallery', 'photographer', '[userid].astro');

// ---------------------------------------------------------------------------
// 1. Policy state (PROFILE-ARCH-001 approved; no reminder machinery)
// ---------------------------------------------------------------------------

describe('policy state', () => {
  it('completion policy is APPROVED under PROFILE-ARCH-001 and the rule is enforced', () => {
    expect(PROFILE_COMPLETION_POLICY).toEqual({ status: 'APPROVED', authority: 'PROFILE-ARCH-001' });
    expect(isDirectoryRuleEnforced()).toBe(true);
    expect(isDirectoryRuleEnforced({ status: 'PENDING_DEFINITION' })).toBe(false);
  });

  it('no directory-reminder machinery exists (reminders need separate authorization, PROFILE-ARCH-001 §5)', () => {
    const dir = join(ROOT, 'backend', 'src', 'modules', 'photographer-profiles');
    expect(existsSync(join(dir, 'directory-reminder.service.ts'))).toBe(false);
    expect(existsSync(join(dir, 'directory-admin.controller.ts'))).toBe(false);
    expect(existsSync(join(ROOT, 'database', 'migrations', '0112_directory_eligibility_reminder_notification.sql'))).toBe(false);
    for (const src of [POLICY_SRC, ELIG_SRC, MODULE_SRC, ADMIN_PAGE_SRC]) {
      expect(src).not.toMatch(/DIRECTORY_ELIGIBILITY_REMINDER|directory-reminders|DirectoryReminder|DirectoryAdmin/);
    }
    expect(MODULE_SRC).not.toMatch(/CommunicationModule/);
  });

  it('the service computes completion with the single authoritative policy (no local formula)', () => {
    expect(ELIG_SRC).toMatch(/computeProfileCompletion\(\{/);
    expect(POLICY_SRC).not.toMatch(/function computeProfileCompletion/);
  });

  it('without a completion result the verdict is undetermined, never guessed', () => {
    const d = decideDirectoryEligibility(true, null, 5);
    expect(d.directoryEligible).toBeNull();
    expect(d.requirements.profileCompletion).toBeNull();
    expect(d.actions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. LISTED decision -- the three additive conditions
//    (existing gates are applied by the unchanged base query, tested below)
// ---------------------------------------------------------------------------

describe('decideDirectoryEligibility()', () => {
  it('thresholds are 50% (= 4 of 7) and 5 photographs', () => {
    expect(DIRECTORY_MIN_COMPLETION_PERCENT).toBe(50);
    expect(DIRECTORY_MIN_PORTFOLIO_PHOTOS).toBe(5);
  });

  it('all three new conditions pass (photo, 4/7, portfolio 5) -> ELIGIBLE', () => {
    const d = decideDirectoryEligibility(true, comp(4), 5);
    expect(d.directoryEligible).toBe(true);
    expect(d.requirements).toEqual({ profilePhoto: true, profileCompletion: true, portfolioPhotos: true });
    expect(d.actions).toEqual([]);
  });

  it('profile completion failure (3/7) -> NOT ELIGIBLE', () => {
    const d = decideDirectoryEligibility(true, comp(3), 5);
    expect(d.directoryEligible).toBe(false);
    expect(d.requirements.profileCompletion).toBe(false);
  });

  it('profile photo failure (7/7, portfolio 5) -> NOT ELIGIBLE', () => {
    const d = decideDirectoryEligibility(false, comp(7), 5);
    expect(d.directoryEligible).toBe(false);
    expect(d.requirements.profilePhoto).toBe(false);
  });

  it('portfolio count 4 (< 5) -> NOT ELIGIBLE', () => {
    const d = decideDirectoryEligibility(true, comp(7), 4);
    expect(d.directoryEligible).toBe(false);
    expect(d.requirements.portfolioPhotos).toBe(false);
  });

  it('portfolio count exactly 5 -> ELIGIBLE; 6 (uncapped memberships) -> ELIGIBLE', () => {
    expect(decideDirectoryEligibility(true, comp(4), 5).directoryEligible).toBe(true);
    expect(decideDirectoryEligibility(true, comp(5), 6).directoryEligible).toBe(true);
  });

  it('combined failures -> NOT ELIGIBLE', () => {
    const d = decideDirectoryEligibility(false, comp(2), 1);
    expect(d.directoryEligible).toBe(false);
    expect(d.requirements).toEqual({ profilePhoto: false, profileCompletion: false, portfolioPhotos: false });
  });

  it('exposes the integer completion result alongside the display percentage', () => {
    const d = decideDirectoryEligibility(true, comp(4), 5);
    expect(d.profileCompletionCount).toEqual({ completed: 4, total: 7 });
    expect(d.profileCompletionPercent).toBe(57);
  });

  it('returns only actions for unmet requirements, routed to canonical Hub pages', () => {
    expect(decideDirectoryEligibility(true, comp(5), 3).actions).toEqual([
      { key: 'MANAGE_PORTFOLIO', label: 'Manage Portfolio', href: '/hub/portfolio/' },
    ]);
    expect(decideDirectoryEligibility(false, comp(2), 2).actions.map(a => a.key)).toEqual([
      'UPLOAD_PROFILE_PHOTO', 'COMPLETE_PROFILE', 'MANAGE_PORTFOLIO',
    ]);
    expect(decideDirectoryEligibility(false, comp(2), 2).actions.map(a => a.href)).toEqual([
      '/hub/profile/#section-identity', '/hub/profile/', '/hub/portfolio/',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Basic Member with the MEM-008 portfolio cap (real exposure policy, no exception)
// ---------------------------------------------------------------------------

describe('Basic Member (MEM-008 cap 5) -- public portfolio count feeding eligibility', () => {
  const BASIC = exposureFromResolved({ portfolio_enabled: 'true', public_gallery_enabled: 'true', portfolio_max_photos: '5' });
  const OWNER = 42;

  /** Count PUBLIC photographs exposed by the real exposure policy. */
  function exposedCount(photos: Array<{ id: number; selected: boolean }>): number {
    const selectedIds = photos.filter(p => p.selected).map(p => p.id);
    const set = buildExposureSet(new Map([[OWNER, BASIC]]), 'PORTFOLIO', new Map([[OWNER, selectedIds]]));
    return photos.filter(p => setAllowsPhoto(set, { ownerId: OWNER, id: p.id, selected: p.selected })).length;
  }
  const photos = (n: number, selected: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, selected: i < selected }));

  it('Basic, photo YES, completion 4/7, exactly 5 selected public photos -> ELIGIBLE', () => {
    const count = exposedCount(photos(12, 5));
    expect(count).toBe(5);
    expect(decideDirectoryEligibility(true, comp(4), count).directoryEligible).toBe(true);
  });

  it('Basic with only 4 selected -> NOT ELIGIBLE (unselected uploads never count)', () => {
    const count = exposedCount(photos(30, 4));
    expect(count).toBe(4);
    expect(decideDirectoryEligibility(true, comp(6), count).directoryEligible).toBe(false);
  });

  it('Basic with 0 selected (the state at the MEM-008 rollout) -> 0 public photos', () => {
    expect(exposedCount(photos(20, 0))).toBe(0);
  });

  it('Basic with a selection exceeding the cap exposes nothing -> NOT ELIGIBLE (no subset chosen for them)', () => {
    const count = exposedCount(photos(10, 6));
    expect(count).toBe(0);
    expect(decideDirectoryEligibility(true, comp(6), count).directoryEligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Directory query (static inspection: service imports db)
// ---------------------------------------------------------------------------

describe('directory query -- photographer-profiles.service.ts', () => {
  const list = PROFILES_SRC.slice(PROFILES_SRC.indexOf('async listPhotographers('), PROFILES_SRC.indexOf('async listProfilePaths('));

  it('loads the listable id set (computed over the whole population) from DirectoryEligibilityService', () => {
    expect(list).toMatch(/this\.eligibility\.listableUserIds\(\)/);
    const fn = ELIG_SRC.slice(ELIG_SRC.indexOf('async listableUserIds('));
    expect(fn).toMatch(/const ids = await this\.baseUserIds\(\);/);
    expect(fn).toMatch(/directoryEligible === true/);
  });

  it('the eligibility id predicate is in the shared filter used by BOTH the total count and the row query', () => {
    expect(list).toMatch(/applyFilters = [\s\S]*?where\('u\.id', 'in', eligibleIds\)/);
    expect(list.match(/applyFilters\(directoryBaseQuery\(\)\)/g)).toHaveLength(2);
    // Paging happens in SQL on the filtered set (LIMIT/OFFSET after the predicate).
    expect(list.indexOf('.limit(opts.limit).offset(opts.offset)')).toBeGreaterThan(list.lastIndexOf('applyFilters(directoryBaseQuery())'));
  });

  it('returns an empty page (total 0) when nobody is eligible', () => {
    expect(list).toMatch(/eligibleIds !== null && eligibleIds\.length === 0\)[\s\S]*?meta: meta\(0\)/);
    expect(list).toMatch(/const meta\s+= \(total: number\) => \(\{\s*total_count: total,/);
  });

  it('genre filtering happens in SQL before LIMIT/OFFSET (no JS filter after paging)', () => {
    expect(list).not.toMatch(/genreSet/);
    expect(list).not.toMatch(/\.filter\(r =>/);
    const genre = list.slice(list.indexOf('if (opts.genre)'));
    expect(genre).toMatch(/pt\.category', '=', 'GENRE'/);
    expect(list.indexOf('if (opts.genre)')).toBeLessThan(list.indexOf('// Total count'));
  });

  it('existing directory gates are unchanged (base query)', () => {
    for (const gate of [
      /u\.status', '=', 'ACTIVE'/, /u\.deleted_at', 'is', null/, /u\.profile_visibility', '=', 'PUBLIC'/,
      /u\.username', 'is not', null/, /m\.lifecycle_state', '=', 'ACTIVE'/, /m\.membership_class_id', 'is not', null/,
    ]) expect(ELIG_SRC).toMatch(gate);
  });

  it('getPhotographer() (public profile route) is NOT gated by directory eligibility', () => {
    const detail = PROFILES_SRC.slice(PROFILES_SRC.indexOf('async getPhotographer('));
    expect(detail).not.toMatch(/eligib/i);
  });

  it('profile-paths lists public profiles independent of eligibility; static pages use it', () => {
    const paths = PROFILES_SRC.slice(PROFILES_SRC.indexOf('async listProfilePaths('), PROFILES_SRC.indexOf('async getPhotographer('));
    expect(paths).toMatch(/directoryBaseQuery\(\)/);
    expect(paths).not.toMatch(/this\.eligibility/);
    expect(CONTROLLER_SRC.indexOf("@Get('profile-paths')")).toBeLessThan(CONTROLLER_SRC.indexOf("@Get(':username')"));
    expect(PROFILE_ROUTE_SRC).toMatch(/\/photographers\/profile-paths/);
    expect(PROFILE_ROUTE_SRC).not.toMatch(/\/photographers\?limit/);
    expect(LEGACY_ROUTE_SRC).toMatch(/\/photographers\/profile-paths/);
  });
});

describe('DirectoryEligibilityService reuses the authoritative sources', () => {
  it('portfolio count = PUBLIC + ACTIVE + show_in_portfolio photos exposed by the MEM-008 exposure path', () => {
    const fn = ELIG_SRC.slice(ELIG_SRC.indexOf('private async publicPortfolioCounts('));
    expect(fn).toMatch(/this\.exposure\.getExposureSet\('PORTFOLIO', userIds\)/);
    expect(fn).toMatch(/where\('visibility', '=', 'PUBLIC'\)/);
    expect(fn).toMatch(/where\('status', '=', 'ACTIVE'\)/);
    expect(fn).toMatch(/where\('show_in_portfolio', '=', true/);
    expect(fn).toMatch(/exposedPhotoPredicate\(/);
    expect(fn).not.toMatch(/MEMBERS_ONLY/);
  });

  it('profile photo = the public avatar definition: non-empty ORIGINAL user_avatars row', () => {
    expect(ELIG_SRC).toMatch(/selectFrom\('user_avatars'\)[\s\S]*?size_variant', '=', 'ORIGINAL'\)[\s\S]*?r2_key', '!=', ''\)/);
  });

  it('cover = active user_cover_photos row', () => {
    expect(ELIG_SRC).toMatch(/selectFrom\('user_cover_photos'\)[\s\S]*?is_active', '=', true\)/);
  });

  it('never writes: completion and eligibility are derived, not persisted', () => {
    expect(ELIG_SRC).not.toMatch(/insertInto|updateTable|deleteFrom/);
  });
});

// ---------------------------------------------------------------------------
// Members Hub status endpoint
// ---------------------------------------------------------------------------

describe('Members Hub status endpoint', () => {
  it('GET /api/v1/hub/profile/directory-status returns the derived status for the caller', () => {
    expect(HUB_CTRL_SRC).toMatch(/@Get\('directory-status'\)/);
    expect(HUB_CTRL_SRC).toMatch(/this\.directory\.getStatus\(user\.sub\)/);
    expect(HUB_CTRL_SRC).toMatch(/notListedReason/);
  });

});

// ---------------------------------------------------------------------------
// Members Hub display (static inspection) -- displays backend results only
// ---------------------------------------------------------------------------

describe('Members Hub display', () => {
  const fn = HUB_PAGE_SRC.slice(HUB_PAGE_SRC.indexOf('async function loadDirectoryStatus('), HUB_PAGE_SRC.indexOf('/* ── JOURNEY NUMBERS'));

  it('loads the status from the Hub endpoint on the landing page', () => {
    expect(fn).toMatch(/\$\{API\}\/hub\/profile\/directory-status/);
    expect(HUB_PAGE_SRC).toMatch(/loadDirectoryStatus\(\)\.catch/);
  });

  it('eligible member: "Eligible" state + the confirmation sentence', () => {
    expect(fn).toMatch(/'Eligible'/);
    expect(fn).toMatch(/Your profile currently meets the requirements to appear in the public Photographer Directory\./);
  });

  it('incomplete member: "Not Yet Eligible" + requirement rows with backend values', () => {
    expect(fn).toMatch(/'Not Yet Eligible'/);
    expect(fn).toMatch(/'Profile photo'/);
    expect(fn).toMatch(/Profile completion — \$\{s\.profileCompletionCount\.completed\} of \$\{s\.profileCompletionCount\.total\}/);
    expect(fn).toMatch(/Portfolio — \$\{s\.publicPortfolioPhotoCount\} \/ \$\{s\.thresholds\.portfolioPhotos\} photos/);
    expect(fn).toMatch(/s\.completion\?\.elements \?\? \[\]\)\.filter\(e => !e\.complete\)/);
  });

  it('actions come only from the backend unmet-requirement list, as text links (never the gold CTA)', () => {
    expect(fn).toMatch(/s\.actions\.map\(/);
    expect(fn).not.toMatch(/btn-gold-cta/);
  });

  it('members without an ACTIVE membership see no block; non-PUBLIC profiles get a neutral note with no settings link', () => {
    expect(fn).toMatch(/NO_ACTIVE_MEMBERSHIP'\) return;/);
    const vis = fn.slice(fn.indexOf("'PROFILE_VISIBILITY'"), fn.indexOf('if (!s.ruleEnforced)'));
    expect(vis).not.toMatch(/href=/);
  });

  it('the Hub profile page shows the backend completion result, not the hardcoded 85%', () => {
    expect(HUB_PROFILE_PAGE_SRC).not.toMatch(/>85%<|width: 85%/);
    expect(HUB_PROFILE_PAGE_SRC).toMatch(/\$\{API\}\/directory-status/);
    expect(HUB_PROFILE_PAGE_SRC).toMatch(/profileCompletionPercent/);
  });
});
