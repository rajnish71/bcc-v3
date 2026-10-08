// TENURE-ARCH-001 v1.1 WP3 -- RUNTIME tests of the real
// MembershipLifecycleService.activate() / terminate() wiring to the native
// ledger writer, over an in-memory transactional store (FakeDb + snapshot
// restore on rollback, the repository's existing pattern).
//
// Covers: activation capture, activation atomicity, termination before
// expiry, termination after expiry, termination atomicity, idempotency.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));
jest.mock('../../shared/communication/communication.service', () => ({ CommunicationService: class {} }));

import { ConflictException } from '@nestjs/common';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { FinancialAuditService } from '../../financial/audit/financial-audit.service';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import { FinancialEventBus } from '../../financial/financial-event-bus.service';
import type { SettlementProvider } from '../../financial/settlement-provider.interface';
import type { CommunicationService } from '../../shared/communication/communication.service';
import type { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import type { MembershipNumberingService } from '../numbering/membership-numbering.service';
import { NATIVE_SOURCE, captureNativeTerm } from './native-term-capture';

const fake = db as unknown as FakeDb;
type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

const MID = 11;
const UID = 7;
const ACTIVATED_AT = new Date('2026-10-08T07:41:09Z'); // 13:11:09 IST on 8 Oct
const TERM_MONTHS = '12';

let tables: Tables;
let nextId: number;

const toDateCell = (v: unknown) => (typeof v === 'string' ? new Date(`${v}T00:00:00Z`) : (v as Date | null));

function matches(r: Row, op: FakeOp): boolean {
  return op.wheres.every(([col, cmp, val]) => {
    const v = r[String(col).split('.').pop()!];
    if (cmp === '=') return v === val;
    if (cmp === '!=') return v !== val;
    if (cmp === 'is') return (v ?? null) === val;
    if (cmp === 'in') return (val as unknown[]).includes(v);
    return true;
  });
}

function install() {
  fake.responder = (op: FakeOp) => {
    const rows = (tables[op.table] ??= []);
    if (op.kind === 'select') {
      let out = rows.filter((r) => matches(r, op)).map((r) => ({ ...r }));
      for (const [col] of [...(op.orderBys ?? [])].reverse()) {
        out = out.sort((a, b) => Number(a[String(col)] instanceof Date ? a[String(col)].getTime() : a[String(col)]) - Number(b[String(col)] instanceof Date ? b[String(col)].getTime() : b[String(col)]));
      }
      return out;
    }
    if (op.kind === 'insert') {
      const v = op.values!;
      if (op.table === 'recognized_service_periods') {
        const lock = v.native_source_type != null && v.supersedes_period_id == null ? `${v.native_source_type}:${v.native_source_id}` : null;
        if (lock && rows.some((r) => r.lock === lock)) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
        const id = nextId++;
        rows.push({ id, correction_state: 'CURRENT', lock, ...v, start_date: toDateCell(v.start_date as string), end_date: toDateCell(v.end_date as string | null) });
        return { insertId: BigInt(id) };
      }
      const id = nextId++;
      rows.push({ id, ...v });
      return { insertId: BigInt(id) };
    }
    if (op.kind === 'update') {
      const hit = rows.filter((r) => matches(r, op));
      hit.forEach((r) => Object.assign(r, op.set));
      return { numUpdatedRows: BigInt(hit.length) };
    }
    return undefined;
  };
}

// Transaction rollback: restore the whole store when the callback throws.
function installRollback() {
  const proto = Object.getPrototypeOf(fake) as FakeDb;
  fake.transaction = (() => ({
    execute: async <T>(cb: (trx: unknown) => Promise<T>): Promise<T> => {
      const saved = structuredClone(tables);
      try {
        return await proto.transaction.call(fake).execute(cb);
      } catch (err) {
        tables = saved;
        throw err;
      }
    },
  })) as any;
}

function services() {
  const bus = new FinancialEventBus();
  const provider = { providerName: 'RAZORPAY', refund: jest.fn() } as unknown as SettlementProvider;
  const financial = new FinancialContributionService(bus, provider, new FinancialAuditService());
  const numbering = { assignPermanentNumber: jest.fn().mockResolvedValue({ membershipNumber: 'BCC20260900099' }) };
  const communication = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const entitlements = {
    getClassConfigValue: jest.fn(async (_c: number, key: string) => (key === 'renewal_term_months' ? TERM_MONTHS : null)),
    getGroupTypeConfigValue: jest.fn(),
  };
  return new MembershipLifecycleService(
    numbering as unknown as MembershipNumberingService,
    communication as unknown as CommunicationService,
    entitlements as unknown as EntitlementService,
    financial,
  );
}

const membership = () => tables.memberships.find((m) => m.id === MID)!;
const ledger = () => tables.recognized_service_periods;
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask', 'setTimeout', 'setInterval'] });
  jest.setSystemTime(ACTIVATED_AT);
  fake.reset();
  nextId = 9000;
  tables = {
    users: [{ id: UID, full_name: 'Test Member', username: null }], // NULL username must not matter
    membership_classes: [{ id: 6, name: 'Individual Member', is_renewable: 1, is_lifetime: 0, voting_eligible: 0 }],
    memberships: [
      {
        id: MID, uuid: 'm-11', owner_type: 'INDIVIDUAL', user_id: UID, group_entity_id: null, parent_membership_id: null,
        membership_class_id: 6, group_membership_type_id: null, lifecycle_state: 'APPROVED',
        applied_at: '2026-09-01 05:00:00', created_at: '2026-09-01 05:00:00', expires_at: null, activated_at: null, terminated_at: null,
      },
    ],
    recognized_service_periods: [],
    membership_audit_log: [],
  };
  install();
  installRollback();
});

afterEach(() => jest.useRealTimers());

describe('WP3 runtime: activation', () => {
  it('1. successful activation creates exactly one native service period', async () => {
    await services().activate(MID, { type: 'ADMIN', userId: 1 });

    expect(membership().lifecycle_state).toBe('ACTIVE');
    expect(ledger()).toHaveLength(1);
    expect(ledger()[0]).toMatchObject({
      user_id: UID, membership_id: MID, basis: 'NATIVE_LIFECYCLE', verification_status: 'VERIFIED', verified_by_user_id: null,
      native_source_type: 'MEMBERSHIP_ACTIVATION', native_source_id: MID, correction_state: 'CURRENT', supersedes_period_id: null,
    });
    expect(ymd(ledger()[0].start_date)).toBe('2026-10-08');
    expect(ymd(ledger()[0].end_date)).toBe('2027-10-08'); // exclusive end 2027-10-08 13:11:09 IST -> same civil day
    expect(tables.membership_audit_log.some((a) => a.event_type === 'SERVICE_PERIOD_ESTABLISHED' && a.subject_user_id === UID)).toBe(true);
  });

  it('2. activation atomicity: a forced capture failure rolls the activation back, leaving no ledger row', async () => {
    fake.failWhen = (op) => (op.kind === 'insert' && op.table === 'recognized_service_periods' ? new Error('forced ledger failure') : null);
    await expect(services().activate(MID, { type: 'ADMIN', userId: 1 })).rejects.toThrow('forced ledger failure');

    expect(membership()).toMatchObject({ lifecycle_state: 'APPROVED', expires_at: null, activated_at: null });
    expect(ledger()).toHaveLength(0);
    expect(tables.membership_audit_log).toHaveLength(0);
  });

  it('6a. idempotency: re-activation is refused and capture of the same source adds nothing', async () => {
    const svc = services();
    await svc.activate(MID, { type: 'ADMIN', userId: 1 });
    await expect(svc.activate(MID, { type: 'ADMIN', userId: 1 })).rejects.toBeInstanceOf(ConflictException);
    expect(ledger()).toHaveLength(1);

    const again = await fake.transaction().execute((trx: any) =>
      captureNativeTerm(trx, {
        membershipId: MID,
        startInstant: ACTIVATED_AT,
        endInstant: membership().expires_at,
        sourceType: NATIVE_SOURCE.ACTIVATION,
        sourceId: MID,
      }),
    );
    expect(again).toEqual({ captured: false, reason: 'ALREADY_CAPTURED' });
    expect(ledger()).toHaveLength(1);
  });

  it('a complimentary expiry override creates no tenure evidence', async () => {
    await services().activate(MID, { type: 'ADMIN', userId: 1 }, { expiresAtOverride: '2026-12-08 07:41:09' });
    expect(membership().lifecycle_state).toBe('ACTIVE');
    expect(ledger()).toHaveLength(0);
  });
});

describe('WP3 runtime: termination', () => {
  async function activated() {
    const svc = services();
    await svc.activate(MID, { type: 'ADMIN', userId: 1 });
    return svc;
  }

  it('3. termination before expiry closes the period at terminated_at (inclusive IST civil end date)', async () => {
    const svc = await activated();
    // 2026-12-31T18:30:00Z == 00:00 IST on 1 Jan 2027 -> last service day is 31 Dec 2026.
    jest.setSystemTime(new Date('2026-12-31T18:30:00Z'));
    await svc.terminate(MID, 1, 'governance');

    expect(membership().lifecycle_state).toBe('TERMINATED');
    expect(ledger()).toHaveLength(2);
    expect(ledger()[0].correction_state).toBe('CORRECTED');
    expect(ledger()[1]).toMatchObject({ correction_state: 'CURRENT', supersedes_period_id: ledger()[0].id, native_source_type: 'MEMBERSHIP_TERMINATION', native_source_id: MID, verified_by_user_id: null });
    expect(ymd(ledger()[1].start_date)).toBe('2026-10-08');
    expect(ymd(ledger()[1].end_date)).toBe('2026-12-31');
  });

  it('4. termination after expiry never extends the period beyond the term end', async () => {
    const svc = await activated();
    jest.setSystemTime(new Date('2028-03-01T00:00:00Z'));
    await svc.terminate(MID, 1, 'governance');

    expect(membership().lifecycle_state).toBe('TERMINATED');
    expect(ledger()).toHaveLength(1);
    expect(ledger()[0].correction_state).toBe('CURRENT');
    expect(ymd(ledger()[0].end_date)).toBe('2027-10-08');
  });

  it('5. termination atomicity: a forced ledger failure rolls the lifecycle mutation back', async () => {
    const svc = await activated();
    jest.setSystemTime(new Date('2026-12-31T18:30:00Z'));
    fake.failWhen = (op) => (op.kind === 'insert' && op.table === 'recognized_service_periods' ? new Error('forced ledger failure') : null);
    await expect(svc.terminate(MID, 1, 'governance')).rejects.toThrow('forced ledger failure');

    expect(membership()).toMatchObject({ lifecycle_state: 'ACTIVE', terminated_at: null });
    expect(ledger()).toHaveLength(1);
    expect(ledger()[0].correction_state).toBe('CURRENT');
  });

  it('5b. termination commits lifecycle state and ledger closure together', async () => {
    const svc = await activated();
    jest.setSystemTime(new Date('2026-12-31T18:30:00Z'));
    fake.committed = [];
    await svc.terminate(MID, 1, 'governance');
    const tx = (table: string) => fake.committed.filter((o) => o.table === table && o.kind !== 'select').map((o) => o.txId);
    const ids = new Set([...tx('memberships'), ...tx('recognized_service_periods'), ...tx('membership_audit_log')]);
    expect(ids.size).toBe(1);
    expect([...ids][0]).not.toBeNull();
  });

  it('6b. idempotency: repeated termination is refused and adds no ledger row', async () => {
    const svc = await activated();
    jest.setSystemTime(new Date('2026-12-31T18:30:00Z'));
    await svc.terminate(MID, 1, 'governance');
    const count = ledger().length;
    await expect(svc.terminate(MID, 1, 'again')).rejects.toBeInstanceOf(ConflictException);
    expect(ledger()).toHaveLength(count);
  });
});
