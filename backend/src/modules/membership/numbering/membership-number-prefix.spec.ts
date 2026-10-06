// backend/src/modules/membership/numbering/membership-number-prefix.spec.ts
//
// Membership Date / Tenure Architecture -- Batch 1 (HA B3, 2026-10-06).
//
// Proves:
//   • New Membership Number YYYY/MM comes from the REGISTRATION date
//     (memberships.applied_at), not approval/activation: registered
//     2026-10-06, activated 2026-10-08 -> BCC202610..., never BCC202608.
//   • activate() exposes no joinYear/joinMonth override; Family/Corporate
//     member records keep their pre-B3 activation-date prefix (unchanged).
//   • The REAL MembershipNumberingService composes the number from the
//     prefix it is given and writes join_year/join_month only on an
//     unnumbered row (WHERE number_serial IS NULL).
//   • Renewal never allocates or rewrites number / date components.
//   • Migration 0111 freezes join_year/join_month once numbered, while
//     preserving the existing membership_number / number_serial guards.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/communication/communication.service', () => ({ CommunicationService: class {} }));
jest.mock('../entitlements/entitlement.service', () => ({ EntitlementService: class {} }));
jest.mock('../../financial/financial-contribution.service', () => ({ FinancialContributionService: class {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../../../database/db';
import { whereValue, type FakeDb, type FakeOp } from '../../../test-support/fake-db';
import type { CommunicationService } from '../../shared/communication/communication.service';
import type { EntitlementService } from '../entitlements/entitlement.service';
import type { FinancialContributionService } from '../../financial/financial-contribution.service';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import { MembershipNumberingService } from './membership-numbering.service';
import { resolveNumberPrefix } from './number-prefix';

const fake = db as unknown as FakeDb;

describe('resolveNumberPrefix() -- registration date -> YYYY/MM (HA B3)', () => {
  it('uses applied_at as returned by mysql2 (Date)', () => {
    expect(resolveNumberPrefix({ applied_at: new Date(2026, 9, 6, 9, 30) }))
      .toEqual({ joinYear: 2026, joinMonth: 10 });
  });

  it('uses applied_at given as a MySQL DATETIME string', () => {
    expect(resolveNumberPrefix({ applied_at: '2026-10-06 09:30:00' }))
      .toEqual({ joinYear: 2026, joinMonth: 10 });
  });

  it('registration month is used even at a month boundary', () => {
    expect(resolveNumberPrefix({ applied_at: '2026-09-30 23:59:00' }))
      .toEqual({ joinYear: 2026, joinMonth: 9 });
  });

  it('falls back to memberships.created_at only when applied_at is missing', () => {
    expect(resolveNumberPrefix({ applied_at: null, created_at: '2026-07-15 10:00:00' }))
      .toEqual({ joinYear: 2026, joinMonth: 7 });
  });

  it('refuses (never uses the activation clock) when no registration date exists', () => {
    expect(() => resolveNumberPrefix({ id: 9, applied_at: null, created_at: null })).toThrow(/no registration date/);
  });
});

describe('MembershipLifecycleService.activate() -- new registration numbering', () => {
  const MEMBERSHIP_ID = 501;
  let poolSerial: number;

  beforeEach(() => {
    fake.reset();
    poolSerial = 112;
    jest.useFakeTimers({ now: new Date(2026, 9, 8, 11, 0, 0), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    fake.responder = (op: FakeOp) => {
      if (op.table === 'memberships' && op.kind === 'select') {
        return [{
          id: MEMBERSHIP_ID, uuid: 'u', owner_type: 'INDIVIDUAL', user_id: 77, group_entity_id: null,
          membership_class_id: 3, group_membership_type_id: null, parent_membership_id: null,
          lifecycle_state: 'APPROVED', join_year: null, join_month: null, number_serial: null,
          membership_number: null, applied_at: new Date(2026, 9, 6, 10, 15, 0), // registered 2026-10-06
          created_at: new Date(2026, 9, 6, 10, 15, 0), expires_at: null,
        }];
      }
      if (op.table === 'membership_number_pool' && op.kind === 'select') {
        return [{ next_operational_serial: poolSerial }];
      }
      return op.kind === 'select' ? [] : undefined;
    };
  });

  afterEach(() => jest.useRealTimers());

  function service() {
    const numbering = new MembershipNumberingService();
    const spy = jest.spyOn(numbering, 'assignPermanentNumber');
    const lifecycle = new MembershipLifecycleService(
      numbering,
      { dispatch: jest.fn() } as unknown as CommunicationService,
      {} as unknown as EntitlementService,
      {} as unknown as FinancialContributionService,
    );
    return { lifecycle, spy };
  }

  it('registered 2026-10-06, activated 2026-10-08 -> BCC202610..., not BCC202608', async () => {
    const { lifecycle, spy } = service();
    const { membershipNumber } = await lifecycle.activate(
      MEMBERSHIP_ID,
      { type: 'ADMIN', userId: 4 },
      { expiresAtOverride: '2027-10-08 11:00:00' },
    );

    expect(membershipNumber).toBe('BCC20261000112');
    expect(membershipNumber!.startsWith('BCC202610')).toBe(true);
    expect(membershipNumber!.startsWith('BCC202608')).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.anything(), MEMBERSHIP_ID, 2026, 10);

    const numberWrite = fake.writes('memberships', 'update').find((op) => op.set?.membership_number !== undefined)!;
    expect(numberWrite.set).toMatchObject({ membership_number: 'BCC20261000112', join_year: 2026, join_month: 10, number_serial: 112 });
    expect(numberWrite.wheres).toContainEqual(['number_serial', 'is', null]);
  });

  it('the lifecycle ACTIVE transition itself never writes number date components', async () => {
    const { lifecycle } = service();
    await lifecycle.activate(MEMBERSHIP_ID, { type: 'ADMIN', userId: 4 }, { expiresAtOverride: '2027-10-08 11:00:00' });
    const transition = fake.writes('memberships', 'update').find((op) => op.set?.lifecycle_state === 'ACTIVE')!;
    expect(transition.set).not.toHaveProperty('join_year');
    expect(transition.set).not.toHaveProperty('join_month');
    expect(transition.set).not.toHaveProperty('membership_number');
    expect(whereValue(transition, 'id')).toBe(MEMBERSHIP_ID);
  });

  it('activate() accepts no joinYear / joinMonth override (approval/activation cannot move YYYY/MM)', () => {
    const src = readFileSync(join(__dirname, '..', 'lifecycle', 'membership-lifecycle.service.ts'), 'utf8');
    const start = src.indexOf('async activate(');
    const body = src.slice(start, src.indexOf('async recordPaymentFailure(', start));
    expect(body).not.toMatch(/opts\?\.join(Year|Month)/);
    expect(body).toContain(': resolveNumberPrefix(membership)');
    // The activation clock survives ONLY in the Family/Corporate member branch
    // (pre-B3 behaviour preserved pending an HA ruling) -- never for individuals.
    expect(body).toMatch(/isGroupMember\s*\?\s*\{ joinYear: now\.getFullYear\(\), joinMonth: now\.getMonth\(\) \+ 1 \}\s*:\s*resolveNumberPrefix\(membership\)/);
    expect((body.match(/now\.getFullYear\(\)/g) ?? []).length).toBe(1);
  });
});

describe('Renewal preserves the existing Membership Number (Release 1 unchanged)', () => {
  const RENEWAL_CODE = readFileSync(join(__dirname, '..', 'renewal', 'membership-renewal.service.ts'), 'utf8')
    .replace(/\/\/.*$/gm, '');

  it('never allocates a number', () => {
    expect(RENEWAL_CODE).not.toMatch(/assignPermanentNumber|MembershipNumberingService|resolveNumberPrefix/);
  });

  it('no memberships write sets number or number-date components', () => {
    const writes = RENEWAL_CODE.match(/updateTable\('memberships'\)\s*\.set\(\{[\s\S]*?\}\)/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w).not.toMatch(/\b(join_year|join_month|number_serial|number_assigned_at|membership_number)\b/);
    }
    expect(RENEWAL_CODE).not.toMatch(/insertInto\('memberships'\)/);
  });
});

describe('Migration 0111 -- join_year / join_month frozen once numbered', () => {
  const SQL = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'database', 'migrations', '0111_freeze_numbered_join_year_month.sql'),
    'utf8',
  );

  it('redefines trg_membership_number_immutable BEFORE UPDATE ON memberships', () => {
    expect(SQL).toContain('DROP TRIGGER IF EXISTS trg_membership_number_immutable');
    expect(SQL).toMatch(/CREATE TRIGGER trg_membership_number_immutable\s+BEFORE UPDATE ON memberships/);
  });

  it('keeps the existing membership_number and number_serial guards', () => {
    expect(SQL).toContain('membership_number is permanent (MP-001)');
    expect(SQL).toContain('number_serial is permanent (MP-001)');
  });

  it('blocks join_year / join_month changes on a numbered row (NULL-safe)', () => {
    expect(SQL).toMatch(/OLD\.number_serial IS NOT NULL OR OLD\.membership_number IS NOT NULL/);
    expect(SQL).toContain('NOT (NEW.join_year <=> OLD.join_year)');
    expect(SQL).toContain('NOT (NEW.join_month <=> OLD.join_month)');
  });

  it('contains no data mutation', () => {
    const withoutComments = SQL.replace(/--.*$/gm, '');
    expect(withoutComments).not.toMatch(/\bUPDATE\s+memberships\b|\bDELETE\s+FROM\b/i);
  });
});
