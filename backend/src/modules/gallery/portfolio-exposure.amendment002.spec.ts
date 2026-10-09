// backend/src/modules/gallery/portfolio-exposure.amendment002.spec.ts
//
// MEM-008 Amendment 002 (RATIFIED 2026-10-09) -- recognition-based Unlimited
// Public Photographer Portfolio for Senior Member, Honorary Member, Honorary
// Mentor, Honorary Grandmaster and Honorary Senior Member.
//
// Same approach as portfolio-exposure.policy.spec.ts: unit tests on the REAL
// pure policy code + entitlement-layers, plus static inspection of the
// db-importing services (which cannot be instantiated under the project's
// CommonJS Jest config).

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildExposureSet,
  decideSelection,
  exposureFromResolved,
  mergeExposures,
  setAllowsPhoto,
  withRecognitionPortfolio,
  type OwnerExposure,
} from './portfolio-exposure.policy';
import { applyEntitlementLayers } from '../membership/entitlements/entitlement-layers';

const read = (...p: string[]) => readFileSync(join(__dirname, ...p), 'utf8');
const SERVICE_SRC = read('portfolio-exposure.service.ts');
const POLICY_SRC = read('portfolio-exposure.policy.ts');
const GALLERY_SRC = read('gallery.service.ts');
const DIRECTORY_SRC = read('..', 'photographer-profiles', 'directory-eligibility.service.ts');
const ENTITLEMENT_SRC = read('..', 'membership', 'entitlements', 'entitlement.service.ts');

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
// Layer-2 rows as seeded by 0086 + 0103 for the three Honorary Recognition Classes.
const HONORARY_MODS = [
  { key: 'portfolio_enabled', value: 'true' },
  { key: 'public_gallery_enabled', value: 'true' },
  { key: 'portfolio_max_photos', value: 'unlimited' },
];

const resolve = (base: any[], mods: any[] = [], overrides: any[] = []) =>
  exposureFromResolved(applyEntitlementLayers(base, mods, overrides));

const capOverride = (value: string) => [
  { key: 'portfolio_max_photos', type: 'GRANT' as const, value, expiresAt: null },
];
const disableOverride = [{ key: 'portfolio_enabled', type: 'GRANT' as const, value: 'false', expiresAt: null }];
const revokeCap = [{ key: 'portfolio_max_photos', type: 'REVOKE' as const, value: '', expiresAt: null }];

/** Exposure of a recognition holder with an ACTIVE membership on `base` (what the service computes). */
function holderWithMembership(base: any[], mods: any[] = [], overrides: any[] = []): OwnerExposure {
  return withRecognitionPortfolio(resolve(base, mods, overrides), resolve(base, [], overrides));
}
/** Exposure of a recognition holder with NO active membership at all. */
const holderWithoutMembership = (): OwnerExposure => withRecognitionPortfolio(undefined, undefined);

const photosOf = (ownerId: number, n: number, selected = true) =>
  Array.from({ length: n }, (_, i) => ({ ownerId, id: ownerId * 1000 + i, selected }));
const allExposed = (set: ReturnType<typeof buildExposureSet>, photos: ReturnType<typeof photosOf>) =>
  photos.every((p) => setAllowsPhoto(set, p));
const noneExposed = (set: ReturnType<typeof buildExposureSet>, photos: ReturnType<typeof photosOf>) =>
  photos.every((p) => !setAllowsPhoto(set, p));
const selectedMap = (ownerId: number, n: number) =>
  new Map<number, number[]>([[ownerId, photosOf(ownerId, n).map((p) => p.id)]]);

describe('Basic and Student caps are unchanged (Amendment 002 does not touch them)', () => {
  const basic = resolve(BASIC);
  const student = resolve(STUDENT);

  it('Basic only: max 5, no public gallery', () => {
    expect(basic).toEqual({ portfolioEnabled: true, galleryEnabled: false, maxPhotos: 5 });
  });
  it('Student only: max 10, no public gallery', () => {
    expect(student).toEqual({ portfolioEnabled: true, galleryEnabled: false, maxPhotos: 10 });
  });
  it('Basic: 0-5 selected photos are exposed; a 6th selection is refused and no 6-photo set is exposed', () => {
    for (const n of [0, 1, 5]) {
      const set = buildExposureSet(new Map([[1, basic]]), 'PORTFOLIO', selectedMap(1, n));
      expect(allExposed(set, photosOf(1, n))).toBe(true);
    }
    expect(decideSelection(basic, 5, false)).toBe('CAP_REACHED');
    const over = buildExposureSet(new Map([[1, basic]]), 'PORTFOLIO', selectedMap(1, 6));
    expect(noneExposed(over, photosOf(1, 6))).toBe(true); // fail closed: the sixth is never exposed
  });
  it('Student: 0-10 selected photos are exposed; an 11th selection is refused and no 11-photo set is exposed', () => {
    for (const n of [0, 1, 10]) {
      const set = buildExposureSet(new Map([[2, student]]), 'PORTFOLIO', selectedMap(2, n));
      expect(allExposed(set, photosOf(2, n))).toBe(true);
    }
    expect(decideSelection(student, 10, false)).toBe('CAP_REACHED');
    const over = buildExposureSet(new Map([[2, student]]), 'PORTFOLIO', selectedMap(2, 11));
    expect(noneExposed(over, photosOf(2, 11))).toBe(true);
  });
  it('a Basic/Student member with NO recognition is never touched by the recognition path', () => {
    // withRecognitionPortfolio is only ever applied to recognition holders (static check below);
    // the ordinary resolution above keeps the caps.
    expect(basic.maxPhotos).toBe(5);
    expect(student.maxPhotos).toBe(10);
  });
});

describe('five recognition/status classes receive Unlimited Public Photographer Portfolio', () => {
  // Senior and Honorary Senior have no layer-2 modifiers (nothing in 0086/0103); the three Honorary
  // classes DO have them. Amendment 002 must hold for all five regardless of that asymmetry.
  const cases: Array<[string, any[]]> = [
    ['Senior Member', []],
    ['Honorary Member', HONORARY_MODS],
    ['Honorary Mentor', HONORARY_MODS],
    ['Honorary Grandmaster', HONORARY_MODS],
    ['Honorary Senior Member', []],
  ];

  describe.each(cases)('%s', (_name, mods) => {
    it.each([
      ['Basic', BASIC],
      ['Student', STUDENT],
    ])('on a %s membership: no numeric maximum (>5 and >10 selected photos all exposed)', (_c, base) => {
      const e = holderWithMembership(base, mods);
      expect(e.portfolioEnabled).toBe(true);
      expect(e.maxPhotos).toBeNull();
      for (const n of [6, 11, 40]) {
        const set = buildExposureSet(new Map([[7, e]]), 'PORTFOLIO', selectedMap(7, n));
        expect(set.overCapOwnerIds).toEqual([]);
        expect(allExposed(set, photosOf(7, n))).toBe(true);
      }
      expect(decideSelection(e, 500, false)).toBe('OK');
    });

    it('with NO active underlying Membership: portfolio entitlement still applies', () => {
      const e = holderWithoutMembership();
      expect(e).toMatchObject({ portfolioEnabled: true, maxPhotos: null });
      const set = buildExposureSet(new Map([[8, e]]), 'PORTFOLIO', selectedMap(8, 12));
      expect(allExposed(set, photosOf(8, 12))).toBe(true);
      expect(decideSelection(e, 12, false)).toBe('OK');
    });

    it('an Individual Override / restriction cannot cap, reduce or remove it', () => {
      for (const overrides of [capOverride('3'), capOverride('0'), disableOverride, revokeCap, [...capOverride('2'), ...disableOverride]]) {
        const e = holderWithMembership(BASIC, mods, overrides);
        expect(e.portfolioEnabled).toBe(true);
        expect(e.maxPhotos).toBeNull();
        const set = buildExposureSet(new Map([[9, e]]), 'PORTFOLIO', selectedMap(9, 9));
        expect(allExposed(set, photosOf(9, 9))).toBe(true);
      }
    });

    it('does NOT grant Public Gallery', () => {
      expect(holderWithoutMembership().galleryEnabled).toBe(false);
      const onBasic = holderWithMembership(BASIC, [
        // Senior/Honorary Senior carry no gallery modifier; Honorary classes keep THEIR existing one
        ...mods.filter((m) => m.key !== 'public_gallery_enabled'),
      ]);
      expect(onBasic.galleryEnabled).toBe(false);
      const set = buildExposureSet(new Map([[10, onBasic]]), 'GALLERY', selectedMap(10, 8));
      expect(set.uncappedOwnerIds).toEqual([]);
      expect(set.selectionRequiredOwnerIds).toEqual([]);
      expect(set.cappedOwnerIds).toEqual([]);
    });
  });
});

describe('recognition entitlement vs ordinary entitlements', () => {
  it('Public Gallery comes only from ordinary resolution: an existing gallery entitlement is preserved, never added', () => {
    expect(holderWithMembership(BASIC).galleryEnabled).toBe(false);
    expect(holderWithMembership(BASIC, HONORARY_MODS).galleryEnabled).toBe(true); // existing Honorary behaviour, unchanged
    expect(holderWithMembership(INDIVIDUAL).galleryEnabled).toBe(true);
  });
  it('recognition + a class that is already unlimited keeps class-level behaviour (selection irrelevant)', () => {
    const e = holderWithMembership(INDIVIDUAL, []);
    expect(e.maxPhotos).toBeNull();
    expect(e.selectionRequired).toBe(false);
    const set = buildExposureSet(new Map([[11, e]]), 'PORTFOLIO', new Map());
    expect(set.uncappedOwnerIds).toEqual([11]);
  });
  it('recognition + an admin override GRANT unlimited keeps override-level behaviour (selection irrelevant)', () => {
    const e = holderWithMembership(BASIC, [], capOverride('unlimited'));
    expect(e.selectionRequired).toBe(false);
  });
  it('most-permissive merge: a recognition holder with two memberships is not reduced by either', () => {
    expect(mergeExposures([resolve(BASIC), resolve(STUDENT)]).maxPhotos).toBe(10);
    expect(holderWithMembership(STUDENT).maxPhotos).toBeNull();
  });
});

describe('portfolio selection stays explicit (portfolio_selected)', () => {
  const senior = holderWithMembership(BASIC, []);

  it('recognition-based unlimited still requires portfolio_selected = 1: unselected photographs are withheld', () => {
    expect(senior.selectionRequired).toBe(true);
    const set = buildExposureSet(new Map([[12, senior]]), 'PORTFOLIO', new Map());
    expect(set.selectionRequiredOwnerIds).toEqual([12]);
    expect(set.uncappedOwnerIds).toEqual([]);
    expect(allExposed(set, photosOf(12, 30, false))).toBe(false);
    expect(noneExposed(set, photosOf(12, 30, false))).toBe(true);
    expect(allExposed(set, photosOf(12, 30, true))).toBe(true);
  });
  it('no member of the same owner is over-cap-hidden when many photographs are selected', () => {
    const set = buildExposureSet(new Map([[12, senior]]), 'PORTFOLIO', selectedMap(12, 200));
    expect(set.overCapOwnerIds).toEqual([]);
  });
  it('the exposure SQL predicate treats selection-required owners like capped owners (selected = 1)', () => {
    expect(SERVICE_SRC).toMatch(/\.\.\.set\.cappedOwnerIds,\s*\.\.\.set\.selectionRequiredOwnerIds/);
    expect(SERVICE_SRC).toMatch(/eb\(cols\.selected, '=', 1\)/);
  });
  it('the exposure policy/service never WRITE portfolio_selected or auto select/promote/order/trim', () => {
    for (const src of [POLICY_SRC, SERVICE_SRC]) {
      expect(src).not.toMatch(/updateTable\(/);
      expect(src).not.toMatch(/insertInto\(/);
      expect(src).not.toMatch(/portfolio_selected['"]?\s*:/);
      expect(src).not.toMatch(/orderBy\(|\.slice\(|limit\(/);
    }
    // gallery.service still has exactly one writer of portfolio_selected: the explicit member action
    expect(GALLERY_SRC.match(/portfolio_selected:\s+selected/g) ?? []).toHaveLength(1);
  });
});

describe('where Amendment 002 is implemented (single entitlement/policy boundary)', () => {
  it('is applied after the entitlement layers, outside them, so overrides cannot reduce it', () => {
    const body = SERVICE_SRC.slice(SERVICE_SRC.indexOf('async getOwnerExposures'), SERVICE_SRC.indexOf('async getOwnerExposure('));
    expect(body.indexOf('mergeExposures(list)')).toBeGreaterThan(-1);
    expect(body.indexOf('applyRecognitionPortfolio')).toBeGreaterThan(body.indexOf('mergeExposures(list)'));
  });
  it('covers all five classes: four Recognition Classes by code + Senior via SeniorStatusReader', () => {
    expect(SERVICE_SRC).toContain('RECOGNITION_CLASS_CODES');
    expect(SERVICE_SRC).toContain('new SeniorStatusReader().listActive()');
    const reader = read('..', 'membership', 'recognition', 'senior-status.reader.ts');
    for (const code of ['HONORARY_MEMBER', 'HONORARY_MENTOR', 'HONORARY_GRANDMASTER', 'HONORARY_SENIOR_MEMBER']) {
      expect(reader).toContain(`'${code}'`);
    }
  });
  it('does not require an ACTIVE membership for the recognition path', () => {
    const body = SERVICE_SRC.slice(SERVICE_SRC.indexOf('private async getRecognitionHolderIds'));
    expect(body).not.toMatch(/lifecycle_state/);
  });
  it('has no per-person hard-coding (no ad-hoc status checks in controllers/services)', () => {
    expect(GALLERY_SRC).not.toMatch(/SENIOR_MEMBER|HONORARY_/);
  });
  it('resolveMany only gains an opt-in switch; default behaviour (all three layers) is unchanged', () => {
    expect(ENTITLEMENT_SRC).toMatch(/opts: \{ excludeRecognition\?: boolean \} = \{\}/);
    expect(ENTITLEMENT_SRC).toMatch(/opts\.excludeRecognition \? \[\] : modifierRows/);
  });
});

describe('Photographer Directory eligibility is unchanged', () => {
  it('the directory still requires an ACTIVE membership in its base population', () => {
    expect(DIRECTORY_SRC).toMatch(/NO_ACTIVE_MEMBERSHIP/);
    expect(DIRECTORY_SRC).toMatch(/lifecycle_state', '=', 'ACTIVE'/);
  });
  it('directory eligibility code contains no recognition-based shortcut', () => {
    expect(DIRECTORY_SRC).not.toMatch(/SENIOR|HONORARY|withRecognitionPortfolio|RECOGNITION_CLASS_CODES/);
  });
  it('an unlimited holder still needs real selected photographs to count toward the directory portfolio count', () => {
    const e = holderWithoutMembership();
    const set = buildExposureSet(new Map([[13, e]]), 'PORTFOLIO', new Map());
    expect(setAllowsPhoto(set, { ownerId: 13, id: 1, selected: false })).toBe(false);
  });
});
