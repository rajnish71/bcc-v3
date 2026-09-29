// backend/src/modules/gallery/portfolio-exposure.policy.spec.ts
//
// MEM-008 portfolio cap -- unit tests on the REAL pure policy code
// (portfolio-exposure.policy.ts, entitlement-layers.ts), plus static
// inspection of the db-importing services (which cannot be instantiated under
// the CommonJS Jest config -- same constraint as gallery.service.spec.ts).
// End-to-end behaviour against MySQL was additionally verified with a scratch
// database run (see the MEM-008 implementation report).

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildExposureSet,
  decideSelection,
  exposureFromResolved,
  mergeExposures,
  parseMaxPhotos,
  setAllowsPhoto,
  type OwnerExposure,
} from './portfolio-exposure.policy';
import { applyEntitlementLayers } from '../membership/entitlements/entitlement-layers';

const GALLERY_SRC = readFileSync(join(__dirname, 'gallery.service.ts'), 'utf8');
const PROFILES_SRC = readFileSync(join(__dirname, '..', 'photographer-profiles', 'photographer-profiles.service.ts'), 'utf8');
const MIGRATION_SRC = readFileSync(join(__dirname, '..', '..', '..', '..', 'database', 'migrations', '0103_mem008_portfolio_cap.sql'), 'utf8');

// Base class rows as seeded by migrations 0083 + 0103
const BASIC = [
  { key: 'portfolio_enabled', value: 'true' },
  { key: 'portfolio_max_photos', value: '5' },
  { key: 'public_gallery_enabled', value: 'false' },
];
const STUDENT = [
  { key: 'portfolio_enabled', value: 'true' },
  { key: 'portfolio_max_photos', value: '10' },
  { key: 'public_gallery_enabled', value: 'false' },
];
const INDIVIDUAL = [
  { key: 'portfolio_enabled', value: 'true' },
  { key: 'public_gallery_enabled', value: 'true' },
];
const HONORARY_MODS = [
  { key: 'portfolio_enabled', value: 'true' },
  { key: 'public_gallery_enabled', value: 'true' },
  { key: 'portfolio_max_photos', value: 'unlimited' },
];
const resolve = (base: any[], mods: any[] = [], overrides: any[] = []) =>
  exposureFromResolved(applyEntitlementLayers(base, mods, overrides));

describe('parseMaxPhotos', () => {
  it('absent / empty / unlimited => no cap', () => {
    expect(parseMaxPhotos(undefined)).toBeNull();
    expect(parseMaxPhotos('')).toBeNull();
    expect(parseMaxPhotos('unlimited')).toBeNull();
    expect(parseMaxPhotos(' Unlimited ')).toBeNull();
  });
  it('numeric => cap', () => {
    expect(parseMaxPhotos('5')).toBe(5);
    expect(parseMaxPhotos('10')).toBe(10);
  });
  it('malformed fails closed (0), never unlimited', () => {
    expect(parseMaxPhotos('five')).toBe(0);
    expect(parseMaxPhotos('-3')).toBe(0);
    expect(parseMaxPhotos('5.5')).toBe(0);
  });
});

describe('class entitlements (tests 1,4,6,7,8,9)', () => {
  it('Basic: portfolio enabled, max 5, no public gallery', () => {
    expect(resolve(BASIC)).toEqual({ portfolioEnabled: true, galleryEnabled: false, maxPhotos: 5 });
  });
  it('Student: portfolio enabled, max 10, no public gallery', () => {
    expect(resolve(STUDENT)).toEqual({ portfolioEnabled: true, galleryEnabled: false, maxPhotos: 10 });
  });
  it('Individual: full (unlimited) portfolio + public gallery; no number invented', () => {
    expect(resolve(INDIVIDUAL)).toEqual({ portfolioEnabled: true, galleryEnabled: true, maxPhotos: null });
  });
  it('migration seeds exactly Basic=5 and Student=10 and no other class cap', () => {
    expect(MIGRATION_SRC).toMatch(/@id_basic,\s+'portfolio_max_photos', '5'/);
    expect(MIGRATION_SRC).toMatch(/@id_student, 'portfolio_max_photos', '10'/);
    const capSeeds = MIGRATION_SRC.match(/class_entitlements[\s\S]*?ON DUPLICATE/)![0];
    expect(capSeeds).not.toMatch(/@id_(individual|biennial|full|life|patron|founding|legacy)/);
  });
});

describe('selection semantics (tests 1-5, 14, 15)', () => {
  const basic = resolve(BASIC);
  const student = resolve(STUDENT);
  it('Basic: 5th selection ok, 6th rejected', () => {
    expect(decideSelection(basic, 4, false)).toBe('OK');
    expect(decideSelection(basic, 5, false)).toBe('CAP_REACHED');
  });
  it('Student: 10th ok, 11th rejected', () => {
    expect(decideSelection(student, 9, false)).toBe('OK');
    expect(decideSelection(student, 10, false)).toBe('CAP_REACHED');
  });
  it('unlimited members are never capped', () => {
    expect(decideSelection(resolve(INDIVIDUAL), 500, false)).toBe('OK');
  });
  it('re-selecting an already selected photo is a no-op success', () => {
    expect(decideSelection(basic, 5, true)).toBe('OK');
  });
  it('portfolio disabled => cannot select (minor restriction, lapsed)', () => {
    expect(decideSelection({ portfolioEnabled: false, galleryEnabled: false, maxPhotos: 0 }, 0, false)).toBe('NOT_ENABLED');
  });
  it('uploads never select a slot; removal never promotes (wiring)', () => {
    const confirm = GALLERY_SRC.slice(GALLERY_SRC.indexOf('async confirmUpload'), GALLERY_SRC.indexOf('async getAllPhotoIds'));
    expect(confirm).not.toContain('portfolio_selected');
    const del = GALLERY_SRC.slice(GALLERY_SRC.indexOf('async deletePhoto'), GALLERY_SRC.indexOf('// Tags'));
    expect(del).not.toContain('portfolio_selected');
    // only one place ever writes portfolio_selected: the explicit member action
    const writes = GALLERY_SRC.match(/portfolio_selected:\s+selected/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(MIGRATION_SRC).toMatch(/portfolio_selected TINYINT\(1\) NOT NULL DEFAULT 0/);
  });
  it('cap enforced inside a transaction that serialises per member', () => {
    expect(GALLERY_SRC).toMatch(/transaction\(\)\.execute[\s\S]*forUpdate\(\)[\s\S]*decideSelection/);
  });
});

describe('exposure sets (tests 10-13, 24)', () => {
  const owners = new Map<number, OwnerExposure>([
    [1, resolve(BASIC)],
    [2, resolve(INDIVIDUAL)],
    [3, { portfolioEnabled: false, galleryEnabled: false, maxPhotos: 0 }],
  ]);
  const selected = new Map<number, number[]>([[1, [11, 12, 13, 14, 15]]]);
  const overCap = new Map<number, number[]>([[1, [11, 12, 13, 14, 15, 16, 17]]]);
  it('portfolio scope: Basic capped, Individual uncapped, disabled excluded', () => {
    const s = buildExposureSet(owners, 'PORTFOLIO', selected);
    expect(s.cappedOwnerIds).toEqual([1]);
    expect(s.uncappedOwnerIds).toEqual([2]);
  });
  it('gallery scope excludes Basic (no Public Gallery)', () => {
    const s = buildExposureSet(owners, 'GALLERY', selected);
    expect(s.cappedOwnerIds).toEqual([]);
    expect(s.uncappedOwnerIds).toEqual([2]);
  });
  it('over-cap owner: NO arbitrary subset is chosen -- nothing exposed, state retained', () => {
    const s = buildExposureSet(owners, 'PORTFOLIO', overCap); // owner 1 (max 5) has 7 selected
    expect(s.overCapOwnerIds).toEqual([1]);
    expect(s.cappedOwnerIds).toEqual([]);
    for (const id of [11, 12, 13, 14, 15, 16, 17]) {
      expect(setAllowsPhoto(s, { ownerId: 1, id, selected: true })).toBe(false);
    }
  });
  it('exposure resumes once the member reconciles to within the cap (member-chosen set)', () => {
    const ok = buildExposureSet(owners, 'PORTFOLIO', new Map([[1, [11, 12, 13, 14, 15]]]));
    expect(ok.overCapOwnerIds).toEqual([]);
    expect(setAllowsPhoto(ok, { ownerId: 1, id: 12, selected: true })).toBe(true);
  });
  it('no oldest/newest selection fallback exists in the code', () => {
    const svc = readFileSync(join(__dirname, 'portfolio-exposure.service.ts'), 'utf8');
    const pol = readFileSync(join(__dirname, 'portfolio-exposure.policy.ts'), 'utf8');
    expect(svc).not.toMatch(/portfolio_selected_at|excludedPhotoIds/);
    expect(pol).not.toMatch(/excludedPhotoIds|slice\(/);
    expect(GALLERY_SRC).not.toMatch(/excludedPhotoIds/);
  });
  it('setAllowsPhoto: unselected Basic photo withheld; selected shown; Individual shown; disabled withheld', () => {
    const s = buildExposureSet(owners, 'PORTFOLIO', selected);
    expect(setAllowsPhoto(s, { ownerId: 1, id: 99, selected: false })).toBe(false);
    expect(setAllowsPhoto(s, { ownerId: 1, id: 11, selected: true })).toBe(true);
    expect(setAllowsPhoto(s, { ownerId: 2, id: 5, selected: false })).toBe(true);
    expect(setAllowsPhoto(s, { ownerId: 3, id: 6, selected: true })).toBe(false);
  });
  it('no ACTIVE membership (lapsed/suspended) => owner absent => nothing exposed', () => {
    const s = buildExposureSet(new Map(), 'PORTFOLIO', new Map());
    expect(setAllowsPhoto(s, { ownerId: 7, id: 1, selected: true })).toBe(false);
    expect(GALLERY_SRC + readFileSync(join(__dirname, 'portfolio-exposure.service.ts'), 'utf8'))
      .toMatch(/lifecycle_state', '=', 'ACTIVE'/);
  });
  it('mergeExposures: most permissive of several ACTIVE memberships', () => {
    expect(mergeExposures([resolve(BASIC), resolve(INDIVIDUAL)]).maxPhotos).toBeNull();
    expect(mergeExposures([]).portfolioEnabled).toBe(false);
  });
});

describe('overrides & recognition (tests 5-11, 20)', () => {
  // The exact three override rows 0103 writes for each of the four members.
  const adminException = [
    { key: 'portfolio_enabled', type: 'GRANT' as const, value: 'true', expiresAt: null },
    { key: 'portfolio_max_photos', type: 'GRANT' as const, value: 'unlimited', expiresAt: null },
    { key: 'public_gallery_enabled', type: 'GRANT' as const, value: 'true', expiresAt: null },
  ];
  it.each(['Suyash', 'Gaurav', 'Ritu', 'Animesh'])(
    '%s: Basic + admin override => portfolio enabled, unlimited, public gallery enabled',
    () => {
      expect(resolve(BASIC, [], adminException)).toEqual({
        portfolioEnabled: true, galleryEnabled: true, maxPhotos: null,
      });
    },
  );
  it('the override changes only the three listed keys (no other entitlement)', () => {
    const base = applyEntitlementLayers([...BASIC, { key: 'discount_pct', value: '0' }], [], []);
    const withOv = applyEntitlementLayers([...BASIC, { key: 'discount_pct', value: '0' }], [], adminException);
    const changed = Object.keys(withOv).filter((k) => base[k] !== withOv[k]).sort();
    expect(changed).toEqual(['portfolio_max_photos', 'public_gallery_enabled']); // portfolio_enabled was already true
    expect(withOv.discount_pct).toBe('0');
  });
  it('removing an override restores ordinary Basic (max 5, no gallery)', () => {
    expect(resolve(BASIC, [], adminException.slice(1))).toMatchObject({ maxPhotos: null }); // partial removal
    expect(resolve(BASIC, [], [])).toEqual({ portfolioEnabled: true, galleryEnabled: false, maxPhotos: 5 });
  });
  it('an expired override no longer applies', () => {
    const expired = adminException.map((o) => ({ ...o, expiresAt: new Date(Date.now() - 1000) }));
    expect(resolve(BASIC, [], expired)).toEqual({ portfolioEnabled: true, galleryEnabled: false, maxPhotos: 5 });
  });
  it('Honorary recognition keeps working (uncapped + gallery) on a Basic class', () => {
    expect(resolve(BASIC, HONORARY_MODS)).toEqual({ portfolioEnabled: true, galleryEnabled: true, maxPhotos: null });
  });
  it('Senior recognition (no modifiers) does not alter portfolio/gallery entitlements', () => {
    expect(resolve(BASIC, [])).toEqual(resolve(BASIC));
    expect(MIGRATION_SRC).not.toMatch(/'(HONORARY_SENIOR_MEMBER|SENIOR_MEMBER)',\s*'portfolio_max_photos'/);
    expect(MIGRATION_SRC).toMatch(/'HONORARY_MEMBER',\s+'portfolio_max_photos', 'unlimited'/);
    expect(MIGRATION_SRC).toMatch(/'HONORARY_MENTOR',\s+'portfolio_max_photos', 'unlimited'/);
    expect(MIGRATION_SRC).toMatch(/'HONORARY_GRANDMASTER', 'portfolio_max_photos', 'unlimited'/);
  });
  it('minor restriction: portfolio_enabled=false => no portfolio, no gallery, cannot select', () => {
    const minor = [{ key: 'portfolio_enabled', type: 'GRANT' as const, value: 'false', expiresAt: null }];
    const e = resolve(BASIC, [], minor);
    expect(e.portfolioEnabled).toBe(false);
    expect(e.galleryEnabled).toBe(false);
    expect(decideSelection(e, 0, false)).toBe('NOT_ENABLED');
    // migration: MINOR gets only portfolio_enabled=false
    expect(MIGRATION_SRC).toMatch(/'MINOR',\s+'Pranil Kishnani',\s+NULL,\s+'pranilkishani'/);
    expect(MIGRATION_SRC).toMatch(/'portfolio_enabled', 'GRANT', 'false'/);
  });
});

describe('migration 0103 identity safety & scope (tests 9, 12)', () => {
  it('the four exceptions are identified by verified user_id + username + membership_id', () => {
    for (const row of [
      "'Suyash Pratap Singh', 24, 'suyashpratapsingh', 19",
      "'Gaurav Sharma',       48, 'gauravsharma',      55",
      "'Ritu Ahluwalia',      30, 'rituahluwalia',     25",
      "'Animesh Saxena',      29, 'animeshsaxena',     24",
    ]) expect(MIGRATION_SRC).toContain(row);
    expect(MIGRATION_SRC).toMatch(/m\.lifecycle_state = 'ACTIVE'/);
    expect(MIGRATION_SRC).toMatch(/mc\.code = 'BASIC_MEMBER'/);
    expect(MIGRATION_SRC).toMatch(/MISMATCH - SKIPPED/);
    expect(MIGRATION_SRC).not.toMatch(/full_name/);
  });
  it('grants exactly portfolio_enabled=true, portfolio_max_photos=unlimited, public_gallery_enabled=true', () => {
    expect(MIGRATION_SRC).toMatch(/'portfolio_enabled' AS entitlement_key, 'true'/);
    expect(MIGRATION_SRC).toMatch(/'portfolio_max_photos', 'unlimited'/);
    expect(MIGRATION_SRC).toMatch(/'public_gallery_enabled', 'true'/);
    expect(MIGRATION_SRC).toContain('Owner-authorized administrative portfolio exception');
  });
  it('never touches membership class/number/dates/recognition/payments, and deletes no photos', () => {
    expect(MIGRATION_SRC).not.toMatch(/UPDATE\s+memberships/i);
    expect(MIGRATION_SRC).not.toMatch(/(UPDATE|DELETE\s+FROM)\s+(photos|member_recognitions|membership_number|financial)/i);
    expect(MIGRATION_SRC).not.toMatch(/UPDATE\s+photos/i);
  });
  it('the four are not hard-coded in application code', () => {
    for (const name of ['Suyash', 'Gaurav', 'Ritu', 'Animesh', 'Pranil', 'pranilkishani']) {
      expect(GALLERY_SRC).not.toContain(name);
      expect(PROFILES_SRC).not.toContain(name);
    }
  });
});

describe('public read paths are gated at the service layer (tests 10-13, 25)', () => {
  const body = (start: string, end: string) => GALLERY_SRC.slice(GALLERY_SRC.indexOf(start), GALLERY_SRC.indexOf(end, GALLERY_SRC.indexOf(start) + 1));
  it.each([
    ['getAllPhotoIds', 'async getAllPhotoIds', 'async getPhotoByNumericId'],
    ['getPhotoByNumericId', 'async getPhotoByNumericId', 'async getPhoto('],
    ['getPhoto', 'async getPhoto(', 'async listPhotos'],
    ['listPhotos', 'async listPhotos', 'async updatePhoto'],
    ['getPublicFeed', 'async getPublicFeed', 'async getPhotographerGallery'],
    ['getPublicGenres', 'async getPublicGenres', 'async getPhotographerGenres'],
    ['getPhotographerGenres', 'async getPhotographerGenres', 'async getEventPhotos'],
    ['getEventPhotos', 'async getEventPhotos', 'private async assertLinkableEvent'],
    ['getReactions', 'async getReactions', 'async toggleReaction'],
    ['listComments', 'async listComments', 'async addComment'],
    ['getRelatedByPhotographer', 'async getRelatedByPhotographer', 'async recordView'],
    ['recordView', 'async recordView', 'async getPhotoContainers'],
    ['listAlbums', 'async listAlbums', 'async getAlbum'],
    ['getAlbum', 'async getAlbum', 'async updateAlbum'],
  ])('%s consults the exposure service', (_n, a, b) => {
    const fn = body(a, b);
    expect(fn.length).toBeGreaterThan(50);
    expect(fn).toMatch(/exposure\.|exposedPhotoPredicate|assertPublicExposure/);
  });
  it('the club-wide feed uses the GALLERY scope (public_gallery_enabled)', () => {
    expect(body('async getPublicFeed', 'async getPhotographerGallery')).toContain("getExposureSet('GALLERY')");
  });
  it('static generation ids use the exposure set', () => {
    expect(body('async getAllPhotoIds', 'async getPhotoByNumericId')).toContain("getExposureSet('PORTFOLIO')");
  });
  it('photographer directory counts/filters are exposure-aware', () => {
    expect(PROFILES_SRC).toContain('exposedPhotoPredicate');
    expect(PROFILES_SRC).toContain("getExposureSet('PORTFOLIO'");
  });
  it('admin/hero curation paths are NOT entitlement-gated (admin can still inspect/manage)', () => {
    for (const [a, b] of [['async getEligiblePhotos', 'async assignHero'], ['async assignHero', 'async unassignHero']]) {
      expect(body(a, b)).not.toMatch(/exposure\.|exposedPhotoPredicate/);
    }
  });
  it('withheld photographs answer 404, not 403 (existence not disclosed)', () => {
    expect(body('private async assertPublicExposure', 'private async assertVisibility')).toContain('NotFoundException');
  });
});
