// backend/src/modules/gallery/showcase-photo.predicate.spec.ts
//
// "Photos in Showcase" counts PHOTOS, not contributing photographers, and uses
// the same eligibility predicate as the public Showcase feed.
//
// Behavioural part: the REAL showcasePhotoPredicate (and the real
// exposedPhotoPredicate it composes) is evaluated over fixture photo rows by a
// minimal evaluating stand-in for Kysely's expression builder; the exposure
// set comes from the REAL MEM-008 policy (buildExposureSet, GALLERY scope).
// Static part: GalleryService cannot be instantiated under this CommonJS Jest
// config (Kysely is ESM-only), so its call sites are inspected as source --
// the same convention as portfolio-exposure.policy.spec.ts.

const FALSE_SQL = { __sqlFalse: true };
jest.mock('kysely', () => ({ sql: () => FALSE_SQL }));
jest.mock('../../database/db', () => ({ db: {} }));
jest.mock('../membership/entitlements/entitlement.service', () => ({ EntitlementService: class {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { showcasePhotoPredicate, SHOWCASE_PHOTO_COLS } from './showcase-photo.predicate';
import { buildExposureSet, type OwnerExposure } from './portfolio-exposure.policy';

type Row = Record<string, unknown>;
type Pred = (row: Row) => boolean;

/** Evaluating stand-in for the subset of Kysely's `eb` the predicates use. */
function evalNode(node: unknown, row: Row): boolean {
  if (node === FALSE_SQL) return false;
  if (typeof node === 'function') return (node as Pred)(row);
  throw new Error(`unexpected predicate node: ${JSON.stringify(node)}`);
}
const eb: any = (col: string, op: string, val: unknown): Pred => (row) => {
  const v = row[col];
  switch (op) {
    case '=':  return v === val || (typeof val === 'boolean' && Number(v) === Number(val));
    case '!=': return v !== val;
    case 'in': return (val as unknown[]).includes(v);
    default: throw new Error(`unsupported op ${op}`);
  }
};
eb.and = (nodes: unknown[]): Pred => (row) => nodes.every(n => evalNode(n, row));
eb.or  = (nodes: unknown[]): Pred => (row) => nodes.some(n => evalNode(n, row));

const showcase = (rows: Row[], set: ReturnType<typeof buildExposureSet>) => {
  const pred = showcasePhotoPredicate(eb, set);
  return rows.filter(r => evalNode(pred, r));
};

let nextId = 1;
const photo = (owner: number, over: Partial<Record<string, unknown>> = {}): Row => ({
  'photos.id': nextId++,
  'photos.owner_user_id': owner,
  'photos.status': 'ACTIVE',
  'photos.visibility': 'PUBLIC',
  'photos.show_in_portfolio': 1,
  'photos.portfolio_selected': 0,
  ...over,
});

const exposure = (o: Partial<OwnerExposure>): OwnerExposure => ({
  portfolioEnabled: true, galleryEnabled: true, maxPhotos: null, ...o,
} as OwnerExposure);

// A, B: uncapped with public_gallery_enabled. C: capped at 2 (Basic-style).
// D: portfolio only, no public gallery.
const A = 11, B = 12, C = 13, D = 14;
const owners = new Map<number, OwnerExposure>([
  [A, exposure({})],
  [B, exposure({})],
  [C, exposure({ maxPhotos: 2 })],
  [D, exposure({ galleryEnabled: false })],
]);

describe('Photos in Showcase counts photos, not contributors', () => {
  const aPhotos = [photo(A), photo(A), photo(A)];
  const bPhotos = [photo(B)];
  const rows = [...aPhotos, ...bPhotos];
  const set = buildExposureSet(owners, 'GALLERY', new Map());

  it('photographer A (3 eligible) + photographer B (1 eligible) = 4 photos, not 2 contributors', () => {
    const eligible = showcase(rows, set);
    const contributors = new Set(eligible.map(r => r['photos.owner_user_id'])).size;
    expect(eligible).toHaveLength(4);
    expect(contributors).toBe(2);
    expect(eligible.length).not.toBe(contributors);
  });
});

describe('Showcase eligibility predicate (shared by feed and statistic)', () => {
  const selectedC = photo(C, { 'photos.portfolio_selected': 1 });
  const rows: Row[] = [
    photo(A),                                            // eligible
    photo(A, { 'photos.visibility': 'MEMBERS_ONLY' }),   // members-only: never Showcase
    photo(A, { 'photos.visibility': 'PRIVATE' }),        // private
    photo(A, { 'photos.visibility': 'UNLISTED' }),       // unlisted
    photo(A, { 'photos.status': 'DELETED' }),            // not ACTIVE
    photo(A, { 'photos.show_in_portfolio': 0 }),         // hidden from portfolio
    selectedC,                                           // capped owner, selected slot: eligible
    photo(C),                                            // capped owner, not selected
    photo(D),                                            // no public gallery entitlement
    photo(99),                                           // no ACTIVE membership / unknown owner
  ];
  const set = buildExposureSet(owners, 'GALLERY', new Map([[C, [Number(selectedC['photos.id'])]]]));
  const eligibleIds = () => showcase(rows, set).map(r => r['photos.id']);

  it('admits only ACTIVE + PUBLIC + show_in_portfolio photos exposed by MEM-008 GALLERY', () => {
    expect(eligibleIds()).toEqual([rows[0]['photos.id'], selectedC['photos.id']]);
  });

  it('a capped owner over cap fails closed (no arbitrary subset)', () => {
    const over = buildExposureSet(owners, 'GALLERY', new Map([[C, [1, 2, 3]]]));
    expect(showcase([selectedC], over)).toHaveLength(0);
  });

  it('no exposed owners -> nothing is eligible', () => {
    expect(showcase(rows, buildExposureSet(new Map(), 'GALLERY', new Map()))).toHaveLength(0);
  });

  it('targets the qualified photos columns', () => {
    expect(SHOWCASE_PHOTO_COLS).toEqual({ owner: 'photos.owner_user_id', selected: 'photos.portfolio_selected', id: 'photos.id' });
  });
});

describe('GalleryService: feed and statistic share the one predicate', () => {
  const SRC = readFileSync(join(__dirname, 'gallery.service.ts'), 'utf8');
  const body = (a: string, b: string) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b, SRC.indexOf(a) + 1));
  const feed  = body('async getPublicFeed', 'async countShowcasePhotos');
  const count = body('async countShowcasePhotos', 'async getPhotographerGallery');

  it('getPublicFeed rows and its full-archive total both use showcasePhotoPredicate with the GALLERY set', () => {
    expect(feed).toContain("getExposureSet('GALLERY')");
    expect(feed.match(/\.where\(eb => showcasePhotoPredicate\(eb, gallerySet\)\)/g)).toHaveLength(2);
    // No second inline copy of the eligibility conditions.
    expect(feed).not.toMatch(/where\('photos\.visibility', '=', 'PUBLIC'\)/);
    expect(feed).not.toMatch(/exposedPhotoPredicate\(eb, PHOTO_COLS_QUALIFIED, gallerySet\)/);
  });

  it('countShowcasePhotos uses the same predicate and GALLERY set', () => {
    expect(count).toContain("getExposureSet('GALLERY')");
    expect(count).toMatch(/\.where\(eb => showcasePhotoPredicate\(eb, gallerySet\)\)/);
    expect(count).not.toMatch(/where\('photos\.visibility'/);
  });

  it('countShowcasePhotos counts photo rows -- no per-photographer grouping or distinct owners', () => {
    expect(count).toMatch(/eb\.fn\.count<number>\('photos\.id'\)/);
    expect(count).not.toMatch(/groupBy|DISTINCT|distinct|owner_user_id|onePerPhotographer/);
  });

  it('the Photographers Directory statistic reads countShowcasePhotos()', () => {
    const PROFILES = readFileSync(join(__dirname, '..', 'photographer-profiles', 'photographer-profiles.service.ts'), 'utf8');
    expect(PROFILES).toMatch(/photosInShowcase\]\s*=\s*await Promise\.all\(\[[\s\S]*?this\.gallery\.countShowcasePhotos\(\)/);
  });
});
