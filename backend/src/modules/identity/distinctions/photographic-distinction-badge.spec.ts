// BCC Distinguished Photographer Badge -- read-time derivation.
//
// Exercises both the pure rule and findBadgeQualifiedUserIds() (the path a
// caller actually uses) against the recording FakeDb, so the tested rule is
// the production rule. The badge has no table: every "disappearance" case
// below is simply the next read returning a different answer.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});

import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import {
  findBadgeQualifiedUserIds,
  isBadgeQualified,
  type BadgeDeclarationFact,
  type BadgeMembershipFact,
} from './photographic-distinction-badge';

const fake = db as unknown as FakeDb;

const qualifyingDecl = (over: Partial<BadgeDeclarationFact> = {}): BadgeDeclarationFact => ({
  state: 'DECLARED',
  distinction_is_active: 1,
  badge_eligible: 1,
  institution_is_active: 1,
  ...over,
});
const activeIndividual: BadgeMembershipFact = { owner_type: 'INDIVIDUAL', lifecycle_state: 'ACTIVE' };

describe('isBadgeQualified (pure rule)', () => {
  it('qualifying distinction + ACTIVE membership -> badge', () => {
    expect(isBadgeQualified([activeIndividual], [qualifyingDecl()])).toBe(true);
  });

  it('accepts boolean or 0/1 flags (mysql2 TINYINT)', () => {
    expect(isBadgeQualified([activeIndividual], [qualifyingDecl({ distinction_is_active: true, badge_eligible: true, institution_is_active: true })])).toBe(true);
  });

  it.each(['PENDING', 'APPROVED', 'SUSPENDED', 'EXPIRED', 'TERMINATED', 'REJECTED'])(
    'membership %s (not ACTIVE) -> no badge',
    (state) => {
      expect(isBadgeQualified([{ owner_type: 'INDIVIDUAL', lifecycle_state: state }], [qualifyingDecl()])).toBe(false);
    },
  );

  it('no membership at all -> no badge', () => {
    expect(isBadgeQualified([], [qualifyingDecl()])).toBe(false);
  });

  it('withdrawn / removed distinction -> no badge', () => {
    expect(isBadgeQualified([activeIndividual], [qualifyingDecl({ state: 'WITHDRAWN' })])).toBe(false);
    expect(isBadgeQualified([activeIndividual], [qualifyingDecl({ state: 'REMOVED' })])).toBe(false);
  });

  it('inactive distinction -> no badge', () => {
    expect(isBadgeQualified([activeIndividual], [qualifyingDecl({ distinction_is_active: 0 })])).toBe(false);
  });

  it('inactive institution -> no badge', () => {
    expect(isBadgeQualified([activeIndividual], [qualifyingDecl({ institution_is_active: 0 })])).toBe(false);
  });

  it('non-badge-eligible distinction -> no badge', () => {
    expect(isBadgeQualified([activeIndividual], [qualifyingDecl({ badge_eligible: 0 })])).toBe(false);
  });

  it('a group/entity record never qualifies', () => {
    expect(isBadgeQualified([{ owner_type: 'GROUP', lifecycle_state: 'ACTIVE' }], [qualifyingDecl()])).toBe(false);
  });

  it('one qualifying declaration among non-qualifying ones is enough', () => {
    expect(
      isBadgeQualified([activeIndividual], [qualifyingDecl({ badge_eligible: 0 }), qualifyingDecl({ state: 'WITHDRAWN' }), qualifyingDecl()]),
    ).toBe(true);
  });
});

describe('findBadgeQualifiedUserIds (read path)', () => {
  // Declaration rows the DB would return for state = 'DECLARED'.
  let declRows: Array<Record<string, unknown>>;
  let membershipRows: Array<Record<string, unknown>>;

  beforeEach(() => {
    fake.reset();
    declRows = [];
    membershipRows = [];
    fake.responder = (op: FakeOp) => {
      if (op.kind !== 'select') return undefined;
      if (op.table === 'user_photographic_distinctions as upd') return declRows;
      if (op.table === 'memberships') return membershipRows;
      return [];
    };
  });

  const decl = (user_id: number, over: Record<string, unknown> = {}) => ({
    user_id, state: 'DECLARED', distinction_is_active: 1, badge_eligible: 1, institution_is_active: 1, ...over,
  });

  it('any active membership class qualifies; membership class is never read', async () => {
    declRows = [decl(10), decl(11)];
    membershipRows = [
      { user_id: 10, owner_type: 'INDIVIDUAL', lifecycle_state: 'ACTIVE' }, // e.g. Basic
      { user_id: 11, owner_type: 'INDIVIDUAL', lifecycle_state: 'ACTIVE' }, // e.g. Life / Family member record
    ];
    const ids = await findBadgeQualifiedUserIds([10, 11]);
    expect([...ids].sort()).toEqual([10, 11]);
    const memSelect = fake.selects.find((s) => s.table === 'memberships')!;
    expect(memSelect.wheres).toContainEqual(['lifecycle_state', '=', 'ACTIVE']);
    expect(fake.selects.some((s) => /membership_classes|member_recognitions/.test(s.table))).toBe(false);
  });

  it('only DECLARED rows are requested', async () => {
    declRows = [decl(10)];
    membershipRows = [{ user_id: 10, owner_type: 'INDIVIDUAL', lifecycle_state: 'ACTIVE' }];
    await findBadgeQualifiedUserIds([10]);
    const declSelect = fake.selects.find((s) => s.table === 'user_photographic_distinctions as upd')!;
    expect(declSelect.wheres).toContainEqual(['upd.state', '=', 'DECLARED']);
  });

  it('badge disappears when membership ceases ACTIVE', async () => {
    declRows = [decl(10)];
    membershipRows = [{ user_id: 10, owner_type: 'INDIVIDUAL', lifecycle_state: 'ACTIVE' }];
    expect((await findBadgeQualifiedUserIds([10])).has(10)).toBe(true);
    membershipRows = []; // membership now EXPIRED: excluded by the ACTIVE filter
    expect((await findBadgeQualifiedUserIds([10])).has(10)).toBe(false);
  });

  it('badge disappears when the distinction becomes inactive', async () => {
    declRows = [decl(10, { distinction_is_active: 0 })];
    membershipRows = [{ user_id: 10, owner_type: 'INDIVIDUAL', lifecycle_state: 'ACTIVE' }];
    expect((await findBadgeQualifiedUserIds([10])).size).toBe(0);
  });

  it('badge disappears when the institution becomes inactive', async () => {
    declRows = [decl(10, { institution_is_active: 0 })];
    membershipRows = [{ user_id: 10, owner_type: 'INDIVIDUAL', lifecycle_state: 'ACTIVE' }];
    expect((await findBadgeQualifiedUserIds([10])).size).toBe(0);
  });

  it('badge disappears when the distinction is withdrawn or removed', async () => {
    membershipRows = [{ user_id: 10, owner_type: 'INDIVIDUAL', lifecycle_state: 'ACTIVE' }];
    declRows = []; // the only declaration is no longer DECLARED
    expect((await findBadgeQualifiedUserIds([10])).size).toBe(0);
    expect(fake.selects.some((s) => s.table === 'memberships')).toBe(false); // short-circuits
  });

  it('a GROUP-owned membership row never qualifies the user', async () => {
    declRows = [decl(10)];
    membershipRows = [{ user_id: 10, owner_type: 'GROUP', lifecycle_state: 'ACTIVE' }];
    expect((await findBadgeQualifiedUserIds([10])).size).toBe(0);
  });

  it('empty / invalid input does not query', async () => {
    expect((await findBadgeQualifiedUserIds([])).size).toBe(0);
    expect((await findBadgeQualifiedUserIds([0, -1])).size).toBe(0);
    expect(fake.selects).toHaveLength(0);
  });
});
