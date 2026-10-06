// backend/src/modules/photographer-profiles/profile-completion.policy.spec.ts
//
// PROFILE-ARCH-001 §2 -- unit tests on the REAL pure completion policy.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  COMPLETION_ELEMENTS,
  COMPLETION_TOTAL,
  N,
  bioComplete,
  cameraGearComplete,
  computeProfileCompletion,
  decodeEntities,
  genresComplete,
  meetsCompletionThreshold,
  socialComplete,
  textComplete,
  websiteComplete,
  type ProfileCompletionInput,
} from './profile-completion.policy';
import { CAMERA_SYSTEMS } from '../hub/profile/dto/profile-field-values';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const EMPTY: ProfileCompletionInput = {
  bio: null, city: null, tagline: null, preferredCameraSystem: null, websiteUrl: null,
  photographyGenres: null, gearTypes: [], socialHandles: [], hasActiveCover: false,
};

/** One complete value per element, in COMPLETION_ELEMENTS order. */
const FILL: Array<Partial<ProfileCompletionInput>> = [
  { bio: '<p>Street photographer</p>' },
  { city: 'Bhopal' },
  { gearTypes: ['BODY'] },
  { socialHandles: [{ platform: 'INSTAGRAM', handle: 'asha.shoots' }] },
  { hasActiveCover: true },
  { photographyGenres: ['street'] },
  { tagline: 'Light and people' },
];
const withN = (n: number): ProfileCompletionInput =>
  FILL.slice(0, n).reduce<ProfileCompletionInput>((acc, f) => ({ ...acc, ...f }), { ...EMPTY });

describe('model: exactly seven equally weighted binary elements', () => {
  it('has the seven frozen elements, in order', () => {
    expect(COMPLETION_TOTAL).toBe(7);
    expect(COMPLETION_ELEMENTS.map(e => e.key)).toEqual([
      'bio', 'city', 'cameraGear', 'socialOrWebsite', 'coverPhoto', 'photographyGenres', 'tagline',
    ]);
  });

  it('each FILL entry completes exactly one distinct element', () => {
    FILL.forEach((f, i) => {
      const c = computeProfileCompletion({ ...EMPTY, ...f });
      expect(c.completed).toBe(1);
      expect(c.elements[i].complete).toBe(true);
    });
  });
});

describe('threshold: 2 * completed >= 7 (4 of 7), integer arithmetic', () => {
  const expected = [false, false, false, false, true, true, true, true];
  for (let n = 0; n <= 7; n++) {
    it(`${n}/7 => ${expected[n] ? 'meets' : 'does not meet'} the completion requirement`, () => {
      const c = computeProfileCompletion(withN(n));
      expect(c.completed).toBe(n);
      expect(c.total).toBe(7);
      expect(c.meetsThreshold).toBe(expected[n]);
    });
  }

  it('meetsCompletionThreshold is the integer test, not a rounded percentage', () => {
    expect(meetsCompletionThreshold(3)).toBe(false);
    expect(meetsCompletionThreshold(4)).toBe(true);
    expect(meetsCompletionThreshold(3, 7)).toBe(false);
    const src = read('backend', 'src', 'modules', 'photographer-profiles', 'profile-completion.policy.ts');
    expect(src).toMatch(/return 2 \* completed >= total;/);
  });

  it('display percent is floor(100 * completed / 7) and never decides eligibility', () => {
    expect(computeProfileCompletion(withN(3)).displayPercent).toBe(42);
    expect(computeProfileCompletion(withN(4)).displayPercent).toBe(57);
    expect(computeProfileCompletion(withN(7)).displayPercent).toBe(100);
  });
});

describe('N(x) normalisation', () => {
  it('null/undefined => empty', () => {
    expect(N(null)).toBe('');
    expect(N(undefined)).toBe('');
  });
  it('decodes entities (named, decimal, hex)', () => {
    expect(decodeEntities('a&amp;b &#65; &#x42;')).toBe('a&b A B');
  });
  it('treats Unicode whitespace incl. U+00A0 as whitespace', () => {
    expect(N('  　\t\n ')).toBe('');
    expect(N('&nbsp;&#160;&#xA0;&ensp;')).toBe('');
  });
  it('a single meaningful character is sufficient', () => {
    expect(N('x')).toBe('x');
  });
});

describe('Element 1 -- Bio / About', () => {
  it.each([
    ['null', null, false],
    ['empty', '', false],
    ['whitespace', '   \n\t', false],
    ['HTML-only', '<p></p><br/>', false],
    ['&nbsp; paragraph', '<p>&nbsp;</p>', false],
    ['NBSP character', '<p> </p>', false],
    ['meaningful text', '<p>I shoot birds</p>', true],
    ['single character', '<p>a</p>', true],
  ])('%s => %s', (_l, v, ok) => {
    expect(bioComplete(v)).toBe(ok);
  });
});

describe('Element 2 -- City', () => {
  it.each([
    ['null', null, false], ['empty', '', false], ['whitespace', '   ', false], ['meaningful city', 'Bhopal', true],
  ])('%s => %s', (_l, v, ok) => {
    expect(textComplete(v)).toBe(ok);
  });
});

describe('Element 7 -- Tagline', () => {
  it.each([
    ['null', null, false], ['empty', '', false], ['whitespace', '\t \n', false], ['meaningful text', 'Monsoon light', true],
  ])('%s => %s', (_l, v, ok) => {
    expect(textComplete(v)).toBe(ok);
  });
});

describe('Element 3 -- Camera Gear', () => {
  it('no gear and no camera system => incomplete', () => {
    expect(cameraGearComplete([], null)).toBe(false);
  });
  it('gear present (any publicly rendered gear_type) => complete', () => {
    for (const t of ['BODY', 'LENS', 'ACCESSORY']) expect(cameraGearComplete([t], null)).toBe(true);
  });
  it('camera system present => complete', () => {
    expect(cameraGearComplete([], 'Nikon')).toBe(true);
  });
  it('both present => complete', () => {
    expect(cameraGearComplete(['LENS'], 'Sony')).toBe(true);
  });
  it('uses the write-path validator set exactly; it contains no "none"/absence value', () => {
    expect([...CAMERA_SYSTEMS]).toEqual(['Nikon', 'Canon', 'Sony', 'Fujifilm', 'OM System', 'Other']);
    for (const v of CAMERA_SYSTEMS) expect(cameraGearComplete([], v)).toBe(true);
  });
  it('values outside the validator set (legacy free text, empty) => incomplete', () => {
    for (const v of ['Nikon D850', 'Fuji film X system', '', ' ', 'none', 'nikon']) {
      expect(cameraGearComplete([], v)).toBe(false);
    }
  });
});

describe('Element 4 -- Social / Website', () => {
  it('neither => incomplete', () => {
    expect(socialComplete([]) || websiteComplete(null)).toBe(false);
  });
  it('social only => complete', () => {
    expect(socialComplete([{ platform: 'FLICKR', handle: 'asha' }])).toBe(true);
  });
  it('website only => complete (existing @IsUrl validator)', () => {
    expect(websiteComplete('https://asha.example')).toBe(true);
    expect(websiteComplete('asha.example.com')).toBe(true);
  });
  it('both => complete', () => {
    const c = computeProfileCompletion({
      ...EMPTY, websiteUrl: 'https://asha.example', socialHandles: [{ platform: 'YOUTUBE', handle: 'asha' }],
    });
    expect(c.elements.find(e => e.key === 'socialOrWebsite')!.complete).toBe(true);
  });
  it('blank handles do not count', () => {
    expect(socialComplete([{ platform: 'INSTAGRAM', handle: '  ' }, { platform: 'X_TWITTER', handle: '&nbsp;' }])).toBe(false);
  });
  it('every write-path platform is rendered publicly and counts (incl. WEBSITE)', () => {
    for (const p of ['INSTAGRAM', 'FLICKR', 'YOUTUBE', 'FIVE_HUNDRED_PX', 'WEBSITE', 'FACEBOOK', 'X_TWITTER', 'TIKTOK', 'LINKEDIN']) {
      expect(socialComplete([{ platform: p, handle: 'h' }])).toBe(true);
    }
    expect(socialComplete([{ platform: 'MYSPACE', handle: 'h' }])).toBe(false);
  });
  it('invalid or blank website does not count', () => {
    expect(websiteComplete('not a url')).toBe(false);
    expect(websiteComplete('   ')).toBe(false);
  });
});

describe('Element 5 -- Cover Photo', () => {
  it('no active cover => incomplete; active cover => complete', () => {
    expect(computeProfileCompletion(EMPTY).elements.find(e => e.key === 'coverPhoto')!.complete).toBe(false);
    expect(computeProfileCompletion({ ...EMPTY, hasActiveCover: true }).elements.find(e => e.key === 'coverPhoto')!.complete).toBe(true);
  });
});

describe('Element 6 -- Photography Genres', () => {
  it.each([
    ['null', null, false],
    ['empty array', [], false],
    ['valid genre', ['street'], true],
    ['multiple valid genres', ['street', 'wildlife'], true],
    ['blank entries only', ['', '  ', ' '], false],
    ['blank + valid', ['', 'birds'], true],
    ['non-string elements (fail @IsString)', [1, null, {}], false],
    ['non-array value (not the stored shape)', 'street', false],
  ])('%s => %s', (_l, v, ok) => {
    expect(genresComplete(v)).toBe(ok);
  });
});

describe('excluded data never counts', () => {
  it('the input model has no field for any excluded element', () => {
    expect(Object.keys(EMPTY).sort()).toEqual([
      'bio', 'city', 'gearTypes', 'hasActiveCover', 'photographyGenres',
      'preferredCameraSystem', 'socialHandles', 'tagline', 'websiteUrl',
    ]);
  });
  it('no second completion formula exists in frontend code', () => {
    for (const f of [['hub', 'index.astro'], ['hub', 'profile', 'index.astro']]) {
      const src = read('frontend', 'src', 'pages', ...f);
      expect(src).not.toMatch(/2 \* \w+ >= 7|completed \* 100|computeProfileCompletion/);
    }
  });
});
