// Phase 2B -- public Photographic Distinction visibility.
//
// 1. Runs the REAL PhotographerProfilesService (public profile + directory list)
//    over the recording FakeDb, with its collaborators stubbed, to prove the
//    additive response fields, the PRIVATE gate and the single batched
//    distinction query per directory page (no N+1).
// 2. Inspects / executes the real public pages (frontend has no test runner --
//    see razorpay-checkout-frontend.spec.ts): the profile section and the
//    approved disclosure, empty states, the directory post-nominal line, the
//    unchanged legacy photoTitles rendering, and the §16 build-time boundary.

jest.mock('../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('kysely', () => {
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('?'), values }),
    { ref: (r: string) => ({ ref: r }), raw: (r: string) => ({ raw: r }), lit: (v: unknown) => ({ lit: v }), join: (v: unknown[]) => ({ join: v }) },
  );
  return { sql };
});
jest.mock('../gallery/portfolio-exposure.service', () => ({
  PortfolioExposureService: class {},
  exposedPhotoPredicate: () => ({}),
}));
jest.mock('../gallery/gallery.service', () => ({ GalleryService: class {} }));
jest.mock('../membership/current-members.query', () => ({ countCurrentMembers: async () => 0 }));
jest.mock('./directory-eligibility.service', () => {
  const { db: fakeDb } = jest.requireMock('../../database/db');
  return {
    DirectoryEligibilityService: class {},
    directoryBaseQuery: () => fakeDb.selectFrom('users as u'),
  };
});

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { NotFoundException } from '@nestjs/common';
import { db } from '../../database/db';
import type { FakeDb, FakeOp } from '../../test-support/fake-db';
import { PhotographerProfilesService } from './photographer-profiles.service';

const fake = db as unknown as FakeDb;
const PD_TABLE = 'user_photographic_distinctions as upd';

const exposure = { getExposureSet: async () => ({}) };
const eligibility = { listableUserIds: async () => null as number[] | null, baseUserIds: async () => [] as number[] };
const svc = new PhotographerProfilesService(exposure as any, eligibility as any, {} as any);

const USER = {
  id: 27, username: 'member27', full_name: 'Member Twenty Seven', name_title: null,
  profile_visibility: 'PUBLIC', membership_id: 5, membership_number: 'BCC20191100027',
  class_code: 'INDIVIDUAL_MEMBER', tagline: 't', bio: null, city: 'Bhopal', join_year: 2019,
};
const pd = (user_id: number, institution_code: string, institution_name: string, institution_sort: number, code: string, name: string, distinction_sort: number) => ({
  user_id, state: 'DECLARED', distinction_is_active: 1, institution_is_active: 1,
  institution_code, institution_name, institution_sort, code, name, distinction_sort,
});
const LEGACY_TITLES = [{ body_code: 'FIP', title_code: 'EFIP', body_name: null }];

function script(tables: Record<string, unknown>) {
  let userSelects = 0;
  fake.responder = (op: FakeOp) => {
    if (op.kind !== 'select') return undefined;
    if (op.table === 'users as u') {
      const v = tables['users as u'];
      // listPhotographers: first select is the count, the second the rows.
      if (Array.isArray(v) && Array.isArray(v[0])) return v[Math.min(userSelects++, v.length - 1)];
      return v;
    }
    return tables[op.table] ?? [];
  };
}

beforeEach(() => fake.reset());

// ── Public profile ─────────────────────────────────────────────────────────

describe('GET /photographers/:username -- photographicDistinctions', () => {
  it('lists DECLARED active entries with only the four public fields, in catalogue order', async () => {
    script({
      'users as u': [USER],
      user_photo_titles: LEGACY_TITLES,
      [PD_TABLE]: [
        pd(27, 'GPU', 'Global Photographic Union', 50, 'CROWN3', 'GPU Crown 3', 10),
        pd(27, 'FIP', 'Federation of Indian Photography', 10, 'AFIP', 'AFIP', 10),
      ],
    });
    const { data } = await svc.getPhotographer('member27');
    expect(data.photographicDistinctions).toEqual([
      { institutionCode: 'FIP', institutionName: 'Federation of Indian Photography', code: 'AFIP', name: 'AFIP' },
      { institutionCode: 'GPU', institutionName: 'Global Photographic Union', code: 'CROWN3', name: 'GPU Crown 3' },
    ]);
    // legacy photoTitles unchanged (H5: kept alongside)
    expect(data.photoTitles).toEqual([{ bodyCode: 'FIP', bodyName: 'FIP', titleCode: 'EFIP' }]);
  });

  it('returns [] (never null / omitted) when the member has none', async () => {
    script({ 'users as u': [USER], [PD_TABLE]: [] });
    const { data } = await svc.getPhotographer('member27');
    expect(data).toHaveProperty('photographicDistinctions');
    expect(data.photographicDistinctions).toEqual([]);
  });

  it('exposes no badge state (H6: no badge in 2B)', async () => {
    script({ 'users as u': [USER], [PD_TABLE]: [] });
    const { data } = await svc.getPhotographer('member27');
    expect(Object.keys(data).filter((k) => /badge|distinguished/i.test(k))).toEqual([]);
  });

  it('PRIVATE profile still 404s, and no distinction query is made for it', async () => {
    script({ 'users as u': [{ ...USER, profile_visibility: 'PRIVATE' }], [PD_TABLE]: [pd(27, 'FIP', 'F', 10, 'AFIP', 'AFIP', 10)] });
    await expect(svc.getPhotographer('member27')).rejects.toBeInstanceOf(NotFoundException);
    expect(fake.selects.some((s) => s.table === PD_TABLE)).toBe(false);
  });
});

// ── Directory list ─────────────────────────────────────────────────────────

describe('GET /photographers -- postNominals', () => {
  const listRow = (id: number) => ({ ...USER, id, username: `m${id}`, photo_count: 0, avatar_r2_key: null });

  it('adds ordered post-nominal codes per card, [] when none, with ONE distinction query for the page', async () => {
    script({
      'users as u': [[{ total: 3 }], [listRow(1), listRow(2), listRow(3)]],
      [PD_TABLE]: [
        pd(1, 'FIAP', 'FIAP', 20, 'AFIAP', 'AFIAP', 10),
        pd(1, 'FIP', 'FIP', 10, 'EFIP', 'EFIP', 20),
        pd(1, 'FIP', 'FIP', 10, 'AFIP', 'AFIP', 10),
        pd(3, 'GPU', 'GPU', 50, 'VIP3', 'GPU VIP 3', 20),
      ],
    });
    const res = await svc.listPhotographers({ limit: 40, offset: 0, sort: 'name_asc' } as any);
    expect(res.data.map((r: any) => r.postNominals)).toEqual([['AFIP', 'EFIP', 'AFIAP'], [], ['VIP3']]);
    const pdSelects = fake.selects.filter((s) => s.table === PD_TABLE);
    expect(pdSelects).toHaveLength(1); // no N+1
    expect(pdSelects[0].wheres).toContainEqual(['upd.user_id', 'in', [1, 2, 3]]);
  });

  it('the existing distinctions filter still uses the read-time badge predicate', () => {
    const src = readFileSync(join(__dirname, 'photographer-profiles.service.ts'), 'utf8');
    expect(src).toContain("distinctionIds = [...await findBadgeQualifiedUserIds(candidates)];");
  });
});

// ── Public pages (real source) ─────────────────────────────────────────────

const PAGES = join(__dirname, '../../../../frontend/src/pages/photographers');
const PROFILE = readFileSync(join(PAGES, '[username].astro'), 'utf8');
const DIRECTORY = readFileSync(join(PAGES, 'index.astro'), 'utf8');
const NEW_FIELDS = /photographicDistinctions|postNominals|distinguishedPhotographer/;

describe('public profile page', () => {
  const block = PROFILE.slice(PROFILE.indexOf('// Photographic Distinctions in About rail'), PROFILE.indexOf('// Gear in About rail'));
  const js = ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function render(profile: unknown) {
    const card = { hidden: true };
    const el = { innerHTML: '' };
    const document = { getElementById: (id: string) => (id === 'about-pd-card' ? card : id === 'about-pd' ? el : null) };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('document', 'esc', 'profile', js)(document, esc, profile);
    return { card, el };
  }

  it('has a dedicated "Photographic Distinctions" card with the exact approved disclosure', () => {
    expect(PROFILE).toContain('<div class="about-card-head">Photographic Distinctions</div>');
    expect(PROFILE).toContain('<p class="about-gear-note">Photographic distinctions are self-declared by the member.</p>');
    expect(PROFILE).toMatch(/<div class="about-card" id="about-pd-card" hidden>/);
  });

  it('renders code, full name and institution when entries exist', () => {
    const { card, el } = render({ photographicDistinctions: [
      { institutionCode: 'FIP', institutionName: 'Federation of Indian Photography', code: 'AFIP', name: 'AFIP' },
      { institutionCode: 'GPU', institutionName: 'Global Photographic Union', code: 'CROWN3', name: 'GPU Crown 3' },
    ] });
    expect(card.hidden).toBe(false);
    expect(el.innerHTML).toContain('<span class="about-title-code">AFIP</span>');
    expect(el.innerHTML).toContain('Federation of Indian Photography');
    expect(el.innerHTML).toContain('<span class="about-title-code">CROWN3</span>');
    expect(el.innerHTML).toContain('GPU Crown 3 · Global Photographic Union');
  });

  it('renders nothing (card stays hidden, no rows) when empty or absent', () => {
    for (const profile of [{ photographicDistinctions: [] }, {}]) {
      const { card, el } = render(profile);
      expect(card.hidden).toBe(true);
      expect(el.innerHTML).toBe('');
    }
  });

  it('keeps the legacy photoTitles rendering unchanged (H5)', () => {
    expect(PROFILE).toContain('<div class="about-card-head">Photography Society Titles</div>');
    expect(PROFILE).toContain('const railTitles: Array<{ bodyName: string; titleCode: string }> = Array.isArray(profile.photoTitles) ? profile.photoTitles : [];');
    expect(PROFILE).toContain("const photoTitles: Array<{ bodyCode: string; bodyName: string; titleCode: string }> =");
  });

  it('§16: distinction data never enters frontmatter, build-time props, metadata or JSON-LD', () => {
    const frontmatter = PROFILE.slice(PROFILE.indexOf('---') + 3, PROFILE.indexOf('---', PROFILE.indexOf('---') + 3));
    expect(frontmatter).not.toMatch(NEW_FIELDS);
    expect(frontmatter).toContain('const jsonLd = displayName');
    // only the runtime <script> blocks may read the new field
    const scripts = PROFILE.split('<script>').slice(1).join('\n');
    const markupAndStyle = PROFILE.replace(scripts, '');
    expect(markupAndStyle).not.toMatch(NEW_FIELDS);
  });
});

describe('directory page', () => {
  const block = DIRECTORY.slice(DIRECTORY.indexOf('// Phase 2B: Photographic Distinction post-nominals'), DIRECTORY.indexOf('const taglineHtml'));
  const js = ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const esc = (v: unknown) => String(v ?? '');
  const html = (ph: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('ph', 'esc', `${js}; return postNominalsHtml;`)(ph, esc) as string;

  it('renders "AFIP · EFIAP" under the name when present', () => {
    expect(html({ postNominals: ['AFIP', 'EFIAP'] })).toBe('<div class="ph-card-postnominals">AFIP · EFIAP</div>');
    expect(DIRECTORY).toMatch(/<div class="ph-card-name">\$\{esc\(ph\.displayName \?\? ''\)\}<\/div>\r?\n\s*\$\{postNominalsHtml\}/);
  });

  it('renders nothing when empty or absent (no empty row)', () => {
    expect(html({ postNominals: [] })).toBe('');
    expect(html({})).toBe('');
  });

  it('uses a :global() style (runtime DOM) and no colour-coded chip', () => {
    expect(DIRECTORY).toContain(':global(.ph-card-postnominals) {');
    const rule = DIRECTORY.slice(DIRECTORY.indexOf(':global(.ph-card-postnominals) {'), DIRECTORY.indexOf('}', DIRECTORY.indexOf(':global(.ph-card-postnominals) {')));
    expect(rule).not.toMatch(/background|border/);
  });
});
