// backend/src/modules/photographer-profiles/directory-listing.policy.spec.ts
//
// Public Photographer Directory -- live stats, filters and sorting.
// Unit tests on the REAL pure policy (directory-listing.policy.ts) plus static
// inspection of the db-importing service / controller / page, which cannot be
// instantiated under the CommonJS Jest config (same constraint and pattern as
// directory-eligibility.policy.spec.ts).

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DIRECTORY_API_DEFAULT_SORT,
  DIRECTORY_FILTERS,
  DIRECTORY_SORTS,
  HONORARY_RECOGNITION_CODES,
  LEGACY_MEMBER_CLASS_CODE,
  SEED_MAX,
  SUPPRESS_TITLES,
  buildDisplayName,
  newSeed,
  parseDirectoryFilter,
  parseDirectorySort,
  parseSeed,
  suppressedTitleRegex,
} from './directory-listing.policy';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const SVC_SRC     = read('backend', 'src', 'modules', 'photographer-profiles', 'photographer-profiles.service.ts');
const CTRL_SRC    = read('backend', 'src', 'modules', 'photographer-profiles', 'photographer-profiles.controller.ts');
const GALLERY_SRC = read('backend', 'src', 'modules', 'gallery', 'gallery.service.ts');
const APP_SRC     = read('backend', 'src', 'app.controller.ts');
const MEMBERS_SRC = read('backend', 'src', 'modules', 'membership', 'current-members.query.ts');
const PAGE_SRC    = read('frontend', 'src', 'pages', 'photographers', 'index.astro');

const LIST  = SVC_SRC.slice(SVC_SRC.indexOf('async listPhotographers('), SVC_SRC.indexOf('async getDirectoryStats('));
const STATS = SVC_SRC.slice(SVC_SRC.indexOf('async getDirectoryStats('), SVC_SRC.indexOf('async listProfilePaths('));
const filterBranch = (f: string) => {
  const start = LIST.indexOf(`filter === '${f}'`);
  return LIST.slice(start, LIST.indexOf('} else', start + 1));
};
const sortCase = (s: string) => {
  const start = LIST.indexOf(`case '${s}':`);
  return LIST.slice(start, LIST.indexOf('break;', start));
};

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

describe('filter / sort vocabulary', () => {
  it('exposes exactly the required filters and sorts', () => {
    expect([...DIRECTORY_FILTERS]).toEqual(['all', 'active', 'legacy', 'honorary', 'distinctions']);
    expect([...DIRECTORY_SORTS]).toEqual(
      ['random', 'newest', 'earliest', 'photos_desc', 'photos_asc', 'name_asc', 'name_desc'],
    );
  });

  it('unknown or missing filter falls back to all', () => {
    expect(parseDirectoryFilter(undefined)).toBe('all');
    expect(parseDirectoryFilter('basic')).toBe('all');
    expect(parseDirectoryFilter('legacy')).toBe('legacy');
    expect(parseDirectoryFilter('distinctions')).toBe('distinctions');
  });

  it('API default sort is unchanged (name A–Z) and legacy sort values still map', () => {
    expect(DIRECTORY_API_DEFAULT_SORT).toBe('name_asc');
    expect(parseDirectorySort(undefined)).toBe('name_asc');
    expect(parseDirectorySort('name')).toBe('name_asc');
    expect(parseDirectorySort('photos')).toBe('photos_desc');
    expect(parseDirectorySort('joined')).toBe('earliest');
    expect(parseDirectorySort('random')).toBe('random');
    expect(parseDirectorySort('bogus')).toBe('name_asc');
  });
});

describe('random seed', () => {
  it('accepts only integers in 1..SEED_MAX', () => {
    expect(parseSeed('42')).toBe(42);
    expect(parseSeed(String(SEED_MAX))).toBe(SEED_MAX);
    for (const bad of [undefined, '', '0', '-1', '1.5', 'abc', '99999999999', String(SEED_MAX + 1), '1 OR 1=1']) {
      expect(parseSeed(bad)).toBeNull();
    }
  });

  it('newSeed() always yields a valid seed', () => {
    expect(parseSeed(String(newSeed(() => 0)))).toBe(1);
    expect(parseSeed(String(newSeed(() => 0.999999999)))).not.toBeNull();
    for (let i = 0; i < 200; i++) expect(parseSeed(String(newSeed()))).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Recognition semantics -- Honorary vs Legacy vs Senior
// ---------------------------------------------------------------------------

describe('recognition semantics', () => {
  it('Honorary = the four MEM-006 v1.1 Honorary Recognition Classes; Senior Member (Status Overlay) excluded', () => {
    expect([...HONORARY_RECOGNITION_CODES].sort()).toEqual(
      ['HONORARY_GRANDMASTER', 'HONORARY_MEMBER', 'HONORARY_MENTOR', 'HONORARY_SENIOR_MEMBER'],
    );
    expect(HONORARY_RECOGNITION_CODES as readonly string[]).not.toContain('SENIOR_MEMBER');
  });

  it('Honorary reads ACTIVE member_recognitions on the listed membership; never membership class', () => {
    const b = filterBranch('honorary');
    expect(b).toMatch(/member_recognitions as mr/);
    expect(b).toMatch(/mr\.membership_id', '=', 'm\.id'/);
    expect(b).toMatch(/mr\.status', '=', 'ACTIVE'/);
    expect(b).toMatch(/HONORARY_RECOGNITION_CODES/);
    expect(b).not.toMatch(/membership_classes|LEGACY/);
  });

  it('Legacy reads the canonical membership category; never recognitions or badges', () => {
    expect(LEGACY_MEMBER_CLASS_CODE).toBe('LEGACY_MEMBER');
    const b = filterBranch('legacy');
    expect(b).toMatch(/membership_classes/);
    expect(b).toMatch(/LEGACY_MEMBER_CLASS_CODE/);
    expect(b).not.toMatch(/member_recognitions|HONORARY/);
  });

  it('Active asserts the ACTIVE membership lifecycle state', () => {
    expect(filterBranch('active')).toMatch(/m\.lifecycle_state', '=', 'ACTIVE'/);
  });

  it('Photography Distinctions reuses the canonical read-time badge predicate over the eligible population', () => {
    expect(SVC_SRC).toMatch(/import \{ findBadgeQualifiedUserIds \} from '\.\.\/identity\/distinctions\/photographic-distinction-badge'/);
    expect(LIST).toMatch(/const candidates = eligibleIds \?\? await this\.eligibility\.baseUserIds\(\);/);
    expect(LIST).toMatch(/findBadgeQualifiedUserIds\(candidates\)/);
    // No zero-match leak: an empty qualified set returns an empty page, never an unfiltered one.
    expect(LIST).toMatch(/distinctionIds\.length === 0\) return \{ data: \[\], meta: meta\(0\) \}/);
    expect(LIST).not.toMatch(/user_photo_titles/);
  });
});

// ---------------------------------------------------------------------------
// Eligibility + MEM-008 are never bypassed
// ---------------------------------------------------------------------------

describe('filters and sorts never widen the directory', () => {
  it('every filter lives in the shared applyFilters used by both count and rows, after the eligibility predicate', () => {
    const af = LIST.slice(LIST.indexOf('const applyFilters'), LIST.indexOf('// Total count'));
    expect(af.indexOf("where('u.id', 'in', eligibleIds)")).toBeLessThan(af.indexOf("filter === 'active'"));
    for (const f of ['active', 'legacy', 'honorary', 'distinctions']) expect(af).toMatch(new RegExp(`filter === '${f}'`));
    expect(LIST.match(/applyFilters\(directoryBaseQuery\(\)\)/g)).toHaveLength(2);
  });

  it('pagination is SQL LIMIT/OFFSET on the filtered, sorted set (no load-all, no JS re-sort)', () => {
    expect(LIST).toMatch(/rowQ\.limit\(opts\.limit\)\.offset\(opts\.offset\)\.execute\(\)/);
    expect(LIST).not.toMatch(/\.sort\(\(a, b\)/);
    expect(LIST).not.toMatch(/1000/);
    expect(SVC_SRC).not.toMatch(/batchPhotoCounts/);
  });

  it('photo count = PUBLICLY_ELIGIBLE_PORTFOLIO_COUNT (PUBLIC, ACTIVE, show_in_portfolio, MEM-008 exposure)', () => {
    const sub = LIST.slice(LIST.indexOf(".select(eb =>\n        eb.selectFrom('photos')"), LIST.indexOf(".as('photo_count')"));
    expect(sub).toMatch(/photos\.status', '=', 'ACTIVE'/);
    expect(sub).toMatch(/photos\.visibility', '=', 'PUBLIC'/);
    expect(sub).not.toMatch(/MEMBERS_ONLY/);
    expect(sub).toMatch(/photos\.show_in_portfolio', '=', true/);
    expect(sub).toMatch(/exposedPhotoPredicate\(eb2, P_COLS, exposureSet\)/);
    expect(LIST).toMatch(/getExposureSet\('PORTFOLIO'\)/);
    expect(LIST).toMatch(/photoCount:\s+Number\(r\.photo_count \?\? 0\)/);
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe('sorting', () => {
  it('every sort ends on the unique u.id key (stable pagination)', () => {
    for (const s of ['random', 'newest', 'photos_desc', 'name_desc', 'name_asc']) {
      expect(sortCase(s)).toMatch(/orderBy\('u\.id', /);
    }
  });

  it('random is seeded and deterministic (CRC32(seed:u.id)); the seed is echoed in meta', () => {
    expect(sortCase('random')).toMatch(/CRC32\(CONCAT\(\$\{seed\}, ':', u\.id\)\)/);
    expect(LIST).toMatch(/const seed\s+= opts\.sort === 'random' \? \(opts\.seed \?\? newSeed\(\)\) : null;/);
    expect(LIST).toMatch(/sort: opts\.sort, filter, seed,/);
    expect(LIST).not.toMatch(/RAND\(/i);
  });

  it('newest/earliest use canonical membership join_year/join_month, never users.year_joined_bcc', () => {
    const c = sortCase('newest');
    expect(c).toMatch(/m\.join_year IS NULL/);
    expect(c.indexOf("'m.join_year'")).toBeLessThan(c.indexOf("'m.join_month'"));
    expect(c).toMatch(/m\.number_serial/);
    expect(c).toMatch(/opts\.sort === 'newest' \? 'desc' : 'asc'/);
    expect(SVC_SRC).not.toMatch(/year_joined_bcc/);
  });

  it('most/fewest photos order by the public photo count', () => {
    expect(sortCase('photos_desc')).toMatch(/orderBy\(sql`photo_count`, opts\.sort === 'photos_desc' \? 'desc' : 'asc'\)/);
  });

  it('name sorts use the display-name key, not raw full_name', () => {
    expect(sortCase('name_asc')).toMatch(/displayNameSortKey\(\), 'asc'/);
    expect(sortCase('name_desc')).toMatch(/displayNameSortKey\(\), 'desc'/);
    expect(LIST).not.toMatch(/orderBy\('u\.full_name'/);
  });
});

describe('display name rule and its SQL mirror', () => {
  const re = new RegExp(suppressedTitleRegex());
  const sqlMirror = (full: string | null, title: string | null) => {
    const name = (full ?? '').trim();
    if (re.test(name)) return name.slice(name.indexOf(' ') + 1).trim();
    if (title === 'Dr.' && !/^Dr\. /.test(name)) return `Dr. ${name}`;
    return name;
  };
  const cases: Array<[string | null, string | null, string]> = [
    ['Mr. Ajay Seth', 'Mr.', 'Ajay Seth'],
    ['Mrs. Ritu Ahluwalia', 'Mrs.', 'Ritu Ahluwalia'],
    ['Er. SHIVAM KUMAR PANDEY', 'Er.', 'SHIVAM KUMAR PANDEY'],
    ['Miss Asha Rao', null, 'Asha Rao'],
    ['Dr. Anil Bhati', 'Dr.', 'Dr. Anil Bhati'],
    ['Gita Rani Gupta', 'Dr.', 'Dr. Gita Rani Gupta'],
    ['Abhishek Chouksey', null, 'Abhishek Chouksey'],
    ['  Mr. Padded  ', 'Mr.', 'Padded'],
    ['Mr.NoSpace', null, 'Mr.NoSpace'],
    ['Mrx. Not A Title', null, 'Mrx. Not A Title'],
    [null, null, ''],
  ];

  it.each(cases)('buildDisplayName(%p, %p) = %p', (full, title, expected) => {
    expect(buildDisplayName(full, title)).toBe(expected);
  });

  it.each(cases)('SQL key logic agrees with buildDisplayName for %p', (full, title) => {
    expect(sqlMirror(full, title)).toBe(buildDisplayName(full, title));
  });

  it('the SQL regex covers every suppressed title and escapes dots', () => {
    for (const t of SUPPRESS_TITLES) expect(re.test(`${t} X`)).toBe(true);
    expect(re.test('MrX Y')).toBe(false);
    expect(suppressedTitleRegex()).toContain('Mr\\.');
  });

  it('the service builds its SQL key from the same policy (no second title list)', () => {
    expect(SVC_SRC).toMatch(/REGEXP_LIKE\(\$\{name\}, \$\{suppressedTitleRegex\(\)\}, 'c'\)/);
    expect(SVC_SRC).not.toMatch(/const SUPPRESS_TITLES/);
  });
});

// ---------------------------------------------------------------------------
// Live statistics
// ---------------------------------------------------------------------------

describe('live directory statistics', () => {
  it('GET /api/v1/photographers/stats is declared before :username', () => {
    expect(CTRL_SRC.indexOf("@Get('stats')")).toBeGreaterThan(-1);
    expect(CTRL_SRC.indexOf("@Get('stats')")).toBeLessThan(CTRL_SRC.indexOf("@Get(':username')"));
  });

  it('stats are independent of filter/sort (no query params)', () => {
    const handler = CTRL_SRC.slice(CTRL_SRC.indexOf("@Get('stats')"), CTRL_SRC.indexOf("@Get('profile-paths')"));
    expect(handler).not.toMatch(/@Query/);
    expect(STATS).not.toMatch(/filter|sort/);
  });

  it('Total Members = the canonical current-member query shared with /api/v1/stats (not directory rows)', () => {
    expect(STATS).toMatch(/countCurrentMembers\(\)/);
    expect(APP_SRC).toMatch(/countCurrentMembers\(\)/);
    expect(MEMBERS_SRC).toMatch(/selectFrom\('memberships'\)/);
    expect(MEMBERS_SRC).toMatch(/lifecycle_state', '=', 'ACTIVE'/);
    expect(MEMBERS_SRC).toMatch(/owner_type', '=', 'INDIVIDUAL'/);
    expect(STATS).not.toMatch(/directoryBaseQuery/);
  });

  it('Active Portfolios = the directory-listable population (eligibility service)', () => {
    expect(STATS).toMatch(/this\.eligibility\.listableUserIds\(\)/);
    expect(STATS).toMatch(/eligibleIds\.length/);
  });

  it('Photos in Showcase = the public feed base predicate with GALLERY exposure', () => {
    expect(STATS).toMatch(/this\.gallery\.countShowcasePhotos\(\)/);
    const fn = GALLERY_SRC.slice(GALLERY_SRC.indexOf('async countShowcasePhotos('), GALLERY_SRC.indexOf('async getPhotographerGallery('));
    expect(fn).toMatch(/getExposureSet\('GALLERY'\)/);
    // Shared Showcase predicate (behaviour: gallery/showcase-photo.predicate.spec.ts).
    expect(fn).toMatch(/showcasePhotoPredicate\(eb, gallerySet\)/);
  });
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

describe('/photographers/ page', () => {
  it('uses the exact stat, filter and sort labels', () => {
    for (const label of [
      'Total Members', 'Active Portfolios', 'Photos in Showcase',
      "label: 'All'", "label: 'Active'", "label: 'Legacy'", "label: 'Honorary'", "label: 'Photography Distinctions'",
      '>Random<', '>Newest Members<', '>Earliest Members<', '>Most Photos<', '>Fewest Photos<', '>Name A–Z<', '>Name Z–A<',
    ]) expect(PAGE_SRC).toContain(label);
  });

  it('no constitutional class filter tabs on the public page', () => {
    for (const v of ["value: 'basic'", "value: 'student'", "value: 'individual'", "value: 'life'"]) {
      expect(PAGE_SRC).not.toContain(v);
    }
  });

  it('stats come from the live endpoint, not hardcoded values or the one-per-photographer feed', () => {
    expect(PAGE_SRC).toMatch(/\/api\/v1\/photographers\/stats/);
    expect(PAGE_SRC).not.toMatch(/gallery\/feed\?limit=1/);
  });

  it('pages server-side with filter, sort and a per-view seed; no load-all loop', () => {
    expect(PAGE_SRC).toMatch(/params\.set\('filter'/);
    expect(PAGE_SRC).toMatch(/params\.set\('sort'/);
    expect(PAGE_SRC).toMatch(/params\.set\('seed'/);
    expect(PAGE_SRC).not.toMatch(/fetchAllPhotographers/);
  });

  it('filter/sort state is URL-addressable and back/forward aware', () => {
    expect(PAGE_SRC).toMatch(/history\.pushState/);
    expect(PAGE_SRC).toMatch(/addEventListener\('popstate'/);
  });

  it('defaults to Random in the UI', () => {
    expect(PAGE_SRC).toMatch(/const DEFAULT_SORT: Sort = 'random';/);
  });
});
