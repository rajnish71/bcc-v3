// backend/src/modules/membership/renewal/membership-renewal.release1.spec.ts
//
// Release 1 -- Individual Membership Renewal (frozen HA governance) §23.
//
// The REAL MembershipRenewalService, MembershipLifecycleService,
// FinancialContributionService, FinancialAuditService, FinancialEventBus and
// MembershipFinancialListener run against the recording FakeDb backed by an
// in-memory table store with the production UNIQUE keys that matter here
// (uq_fc_idempotency_key, uq_renewal_op_term, uq_renewal_op_open). Numbering
// is a spy that must NEVER be called; communication/entitlements/R2 are stubs.
// Time is controlled with Jest's system clock.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/communication/communication.service', () => ({ CommunicationService: class {} }));
jest.mock('../numbering/membership-numbering.service', () => ({ MembershipNumberingService: class {} }));
jest.mock('../entitlements/entitlement.service', () => ({ EntitlementService: class {} }));
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { FinancialAuditService } from '../../financial/audit/financial-audit.service';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import { FinancialEventBus } from '../../financial/financial-event-bus.service';
import { FINANCIAL_EVENT_TYPES } from '../../financial/financial.events';
import type { SettlementProvider } from '../../financial/settlement-provider.interface';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import type { CommunicationService } from '../../shared/communication/communication.service';
import type { R2Service } from '../../shared/storage/r2.service';
import type { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipFinancialListener } from '../financial/membership-financial.listener';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import type { MembershipNumberingService } from '../numbering/membership-numbering.service';
import { MembershipRenewalService } from './membership-renewal.service';
import {
  assertNoBlockingIndividualMembership,
  evaluateRenewalWindow,
  renewalContributionKey,
} from './renewal-policy';

const fake = db as unknown as FakeDb;
const DAY = 24 * 60 * 60 * 1000;

// Membership 98 / 104 shape: complimentary validity ending 18 Nov 2026.
const TERM_END = new Date(2026, 10, 18, 10, 16, 7);
const TERM_END_SQL = toMysqlDatetime(TERM_END);
const MID = 98;
const UID = 94;
const NUMBER = 'BCC20260900073';

const CLASSES: Record<number, { code: string; name: string; renewable: boolean; lifetime: boolean; fee: string; term: string | null }> = {
  5: { code: 'BASIC_MEMBER', name: 'Basic Member', renewable: true, lifetime: false, fee: '0', term: '12' },
  6: { code: 'STUDENT_MEMBER', name: 'Student Member', renewable: true, lifetime: false, fee: '500', term: '12' },
  7: { code: 'INDIVIDUAL_MEMBER', name: 'Individual Member', renewable: true, lifetime: false, fee: '1200', term: '12' },
  8: { code: 'LEGACY_MEMBER', name: 'Legacy Member', renewable: false, lifetime: false, fee: '0', term: null },
  9: { code: 'INDIVIDUAL_BIENNIAL', name: 'Individual Member (Biennial)', renewable: true, lifetime: false, fee: '2500', term: '24' },
};

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function dupError(): Error {
  return Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY', errno: 1062 });
}

function col(name: unknown): string {
  const s = String(name);
  return s.includes('.') ? s.slice(s.indexOf('.') + 1) : s;
}

function cmpValue(v: unknown): number | unknown {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)) return new Date(v).getTime();
  return v;
}

function matches(row: Row, op: FakeOp): boolean {
  return op.wheres.every(([c, cmp, val]) => {
    const v = row[col(c)];
    if (cmp === '=') return v === val || (typeof v === 'boolean' && v === !!val);
    if (cmp === '!=') return v !== val;
    if (cmp === 'is') return v === val || (val === null && v === undefined);
    if (cmp === 'is not') return v !== val && !(val === null && v === undefined);
    if (cmp === 'in') return (val as unknown[]).includes(v);
    const a = cmpValue(v) as number;
    const b = cmpValue(val) as number;
    if (cmp === '<') return a < b;
    if (cmp === '<=') return a <= b;
    if (cmp === '>') return a > b;
    if (cmp === '>=') return a >= b;
    return true;
  });
}

const OPEN = ['REQUESTED', 'PROOF_REQUIRED', 'AWAITING_PAYMENT'];

function installStore(tables: Tables) {
  let nextId = 7000;
  const defaults: Record<string, () => Row> = {
    financial_contributions: () => ({ state: 'CREATED', active_settlement_reference: null, active_settlement_url: null, expires_at: null }),
    membership_renewal_operations: () => ({ contribution_id: null, funded_amount_paise: null, new_term_start: null, new_term_end: null, decision_note: null }),
    membership_application_documents: () => ({ upload_status: 'AWAITING_UPLOAD', review_status: 'PENDING_REVIEW', renewal_operation_id: null }),
  };
  const augment = (table: string, r: Row): Row => {
    if (table === 'memberships') {
      const cls = CLASSES[Number(r.membership_class_id)];
      return { ...r, class_code: cls?.code ?? null, class_name: cls?.name ?? null };
    }
    return r;
  };
  fake.responder = (op: FakeOp) => {
    const table = op.table.split(' ')[0];
    const rows = (tables[table] ??= []);
    if (op.kind === 'select') {
      return rows
        .filter((r) => matches(augment(table, r), op))
        .map((r) => augment(table, { ...r }))
        .sort((a, b) => Number(b.id) - Number(a.id));
    }
    if (op.kind === 'insert') {
      const values = op.values!;
      if (table === 'financial_contributions' && rows.some((r) => r.idempotency_key === values.idempotency_key)) throw dupError();
      if (table === 'membership_renewal_operations') {
        if (values.term_key != null && rows.some((r) => r.term_key === values.term_key)) throw dupError();
        if (OPEN.includes(String(values.status)) &&
            rows.some((r) => r.membership_id === values.membership_id && OPEN.includes(String(r.status)))) throw dupError();
      }
      const id = (values.id as number | undefined) ?? nextId++;
      rows.push({ ...(defaults[table]?.() ?? {}), created_at: toMysqlDatetime(new Date()), ...values, id });
      return { insertId: BigInt(id) };
    }
    if (op.kind === 'update') {
      const hit = rows.filter((r) => matches(augment(table, r), op));
      hit.forEach((r) => Object.assign(r, op.set, { updated_at: toMysqlDatetime(new Date()) }));
      return { numUpdatedRows: BigInt(hit.length) };
    }
    return undefined;
  };
}

interface World {
  classId?: number;
  lifecycle_state?: string;
  expires_at?: string | null;
  extraMemberships?: Row[];
}

function world(o: World = {}): Tables {
  const tables: Tables = {
    users: [{ id: UID, full_name: 'Test Member', email: 't@example.test' }],
    membership_classes: Object.entries(CLASSES).map(([id, c]) => ({
      id: Number(id), code: c.code, name: c.name, is_renewable: c.renewable, is_lifetime: c.lifetime,
      is_closed: c.code === 'LEGACY_MEMBER', activation_mode: 'PAYMENT_REQUIRED', voting_eligible: false,
    })),
    memberships: [
      {
        id: MID, uuid: 'm-98', owner_type: 'INDIVIDUAL', user_id: UID, group_entity_id: null, parent_membership_id: null,
        membership_class_id: o.classId ?? 7, group_membership_type_id: null, lifecycle_state: o.lifecycle_state ?? 'ACTIVE',
        membership_number: NUMBER, number_serial: 73, activated_at: '2026-09-18 10:16:07',
        expires_at: o.expires_at === undefined ? TERM_END_SQL : o.expires_at,
      },
      ...(o.extraMemberships ?? []),
    ],
    // MembershipAdminService.grantComplimentaryMembership() marker -- must never be touched.
    individual_overrides: [{ id: 1, membership_id: MID, entitlement_key: 'complimentary_period', expires_at: TERM_END_SQL }],
  };
  installStore(tables);
  return tables;
}

function services(config: Record<string, string> = {}) {
  const bus = new FinancialEventBus();
  const provider = {
    providerName: 'RAZORPAY',
    refund: jest.fn().mockResolvedValue({ status: 'PROCESSING', providerRefundReference: 'rfnd_1' }),
  } as unknown as SettlementProvider;
  const financial = new FinancialContributionService(bus, provider, new FinancialAuditService());
  const numbering = { assignPermanentNumber: jest.fn() };
  const communication = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const entitlements = {
    getClassConfigValue: jest.fn(async (classId: number, key: string) => {
      const k = `${classId}:${key}`;
      if (k in config) return config[k];
      const cls = CLASSES[classId];
      if (key === 'fee_inr') return cls?.fee ?? null;
      if (key === 'renewal_term_months') return cls?.term ?? null;
      if (key === 'grace_period_days') return '60';
      if (key === 'renewal_window_days') return ['STUDENT_MEMBER', 'INDIVIDUAL_MEMBER', 'INDIVIDUAL_BIENNIAL'].includes(cls?.code) ? '45' : null;
      return null;
    }),
    getGroupTypeConfigValue: jest.fn(),
  };
  const lifecycle = new MembershipLifecycleService(
    numbering as unknown as MembershipNumberingService,
    communication as unknown as CommunicationService,
    entitlements as unknown as EntitlementService,
    financial,
  );
  const r2 = { presignUpload: jest.fn().mockResolvedValue('https://upload.example.test') };
  const renewal = new MembershipRenewalService(
    financial,
    entitlements as unknown as EntitlementService,
    lifecycle,
    communication as unknown as CommunicationService,
    r2 as unknown as R2Service,
  );
  new MembershipFinancialListener(bus, lifecycle, renewal).onModuleInit();
  return { bus, provider, financial, lifecycle, renewal, numbering, communication, entitlements };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

function at(date: Date) {
  jest.setSystemTime(date);
}

let payRef = 0;
async function pay(s: ReturnType<typeof services>, contributionId: number, result: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED') {
  const c = await s.financial.getContribution(contributionId);
  if (c.state === 'AWAITING_SETTLEMENT') await s.financial.startSettlement(contributionId);
  const ref = `pay_${++payRef}`;
  await s.financial.recordSettlementOutcome(contributionId, {
    provider: 'RAZORPAY', providerReference: ref, result, amountPaise: Number(c.amount_paise),
    failureReason: result === 'FAILED' ? 'declined' : null,
  });
  await flush();
  return ref;
}

const membership = (t: Tables) => t.memberships.find((m) => m.id === MID)!;
const ops = (t: Tables) => t.membership_renewal_operations ?? [];
const contributions = (t: Tables) => t.financial_contributions ?? [];
const membershipInserts = () => fake.committed.filter((op) => op.table.startsWith('memberships') && op.kind === 'insert');
const membershipNumberWrites = () =>
  fake.committed.filter((op) => op.table.startsWith('memberships') && op.kind === 'update' &&
    op.set && ('membership_number' in op.set || 'number_serial' in op.set || 'membership_class_id' in op.set));
const dispatched = (s: ReturnType<typeof services>, key: string) =>
  s.communication.dispatch.mock.calls.filter((c: unknown[]) => c[0] === key);

beforeEach(() => {
  fake.reset();
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask', 'setTimeout', 'setInterval'] });
  at(new Date(TERM_END.getTime() - 10 * DAY));
});
afterEach(() => jest.useRealTimers());

function assertNumberingUntouched(s: ReturnType<typeof services>, t: Tables) {
  expect(s.numbering.assignPermanentNumber).not.toHaveBeenCalled();
  expect(membershipInserts()).toHaveLength(0);
  expect(membershipNumberWrites()).toHaveLength(0);
  expect(t.memberships.filter((m) => m.user_id === UID)).toHaveLength(1);
  expect(membership(t).membership_number).toBe(NUMBER);
}

// ── Window boundaries (pure + server) ──────────────────────────────────────

describe('renewal window (45 days, configured)', () => {
  it.each([
    [46 * DAY, 'NOT_YET_OPEN'],
    [45 * DAY, 'OPEN'],
    [1, 'OPEN'],
    [0, 'CLOSED'],
    [-DAY, 'CLOSED'],
  ])('%d ms before term end -> %s', (before, expected) => {
    expect(evaluateRenewalWindow(TERM_END, 45, new Date(TERM_END.getTime() - before))).toBe(expected);
  });

  it('server rejects 46 days before expiry and creates nothing', async () => {
    const t = world();
    const s = services();
    at(new Date(TERM_END.getTime() - 46 * DAY));
    await expect(s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null)).rejects.toThrow(/Renewal opens on/);
    expect(ops(t)).toHaveLength(0);
    expect(contributions(t)).toHaveLength(0);
  });

  it('server allows exactly 45 days before expiry', async () => {
    const t = world();
    const s = services();
    at(new Date(TERM_END.getTime() - 45 * DAY));
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    expect(ops(t)).toHaveLength(1);
    expect(contributions(t)).toHaveLength(1);
  });

  it('exactly at term end the renewal window is closed', async () => {
    const t = world();
    const s = services();
    at(TERM_END);
    await expect(s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null)).rejects.toThrow(/window has closed/);
    expect(ops(t)).toHaveLength(0);
  });

  it('after expiry self-service renewal is closed; status offers reinstatement only', async () => {
    const t = world({ lifecycle_state: 'EXPIRED' });
    const s = services();
    at(new Date(TERM_END.getTime() + 2 * DAY));
    await expect(s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null)).rejects.toThrow(ConflictException);
    const status = await s.renewal.getStatus(UID);
    expect(status.mode).toBe('REINSTATEMENT');
    expect(ops(t)).toHaveLength(0);
  });

  it('a window that is not configured is a loud configuration error, never a hard-coded default', async () => {
    world();
    const s = services({ '7:renewal_window_days': '' });
    await expect(s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null)).rejects.toThrow(/renewal_window_days/);
  });

  it('excluded plans (Basic, Legacy) are refused by the server', async () => {
    world({ classId: 5 });
    const s = services();
    await expect(s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null)).rejects.toThrow(ForbiddenException);
    fake.reset();
    world({ classId: 8 });
    const s2 = services();
    await expect(s2.renewal.requestRenewal(UID, 'renewal-v1.0', null, null)).rejects.toThrow(ForbiddenException);
  });
});

// ── Normal renewal: Annual, Biennial, Student ──────────────────────────────

describe.each([
  [7, 120000, new Date(2027, 10, 18, 10, 16, 7)],
  [9, 250000, new Date(2028, 10, 18, 10, 16, 7)],
  [6, 50000, new Date(2027, 10, 18, 10, 16, 7)],
])('normal renewal (class %d)', (classId, feePaise, expectedEnd) => {
  it('one operation, one frozen-fee obligation, term continues from previous end; same row and number', async () => {
    const t = world({ classId });
    const s = services();
    const status = await s.renewal.requestRenewal(UID, 'renewal-v1.0', '1.2.3.4', 'ua');

    expect(ops(t)).toHaveLength(1);
    const op = ops(t)[0];
    expect(op).toMatchObject({ operation_type: 'RENEWAL', status: 'AWAITING_PAYMENT', membership_id: MID, previous_term_end: TERM_END_SQL });
    expect(contributions(t)).toHaveLength(1);
    const c = contributions(t)[0];
    expect(c).toMatchObject({
      idempotency_key: renewalContributionKey(MID, Number(op.id)),
      business_module: 'MEMBERSHIP', business_reference_id: MID, amount_paise: feePaise, state: 'AWAITING_SETTLEMENT',
      payer_user_id: UID, expires_at: TERM_END_SQL,
    });
    expect(t.membership_consent_log).toHaveLength(1);
    expect(t.membership_consent_log[0]).toMatchObject({ consent_type: 'RENEWAL', terms_version: 'renewal-v1.0' });
    expect(status.operation?.contribution?.id).toBe(c.id);

    // Payment completes one day BEFORE expiry: new term still starts at the previous end.
    at(new Date(TERM_END.getTime() - DAY));
    await pay(s, Number(c.id));

    expect(membership(t)).toMatchObject({ lifecycle_state: 'ACTIVE', expires_at: toMysqlDatetime(expectedEnd), membership_class_id: classId });
    expect(ops(t)[0]).toMatchObject({ status: 'APPLIED', new_term_start: TERM_END_SQL, new_term_end: toMysqlDatetime(expectedEnd), funded_amount_paise: feePaise });
    expect(dispatched(s, 'MEMBERSHIP_RENEWED')).toHaveLength(1);
    assertNumberingUntouched(s, t);
    // Never rewrites identity/profile/application data.
    expect(fake.committed.filter((op) => op.table === 'users' && op.kind === 'update')).toHaveLength(0);
  });
});

// ── Financial edge cases ───────────────────────────────────────────────────

describe('financial', () => {
  it('duplicate member request returns the same operation and obligation (deterministic idempotency)', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    expect(ops(t)).toHaveLength(1);
    expect(contributions(t)).toHaveLength(1);
  });

  it('two simultaneous requests -> one operation, one obligation, one term application', async () => {
    const t = world();
    const s = services();
    await Promise.all([
      s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null),
      s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null),
    ]);
    expect(ops(t)).toHaveLength(1);
    expect(contributions(t)).toHaveLength(1);
    await pay(s, Number(contributions(t)[0].id));
    expect(membership(t).expires_at).toBe(toMysqlDatetime(new Date(2027, 10, 18, 10, 16, 7)));
    expect(dispatched(s, 'MEMBERSHIP_RENEWED')).toHaveLength(1);
    assertNumberingUntouched(s, t);
  });

  it('duplicate webhook / redelivered completion applies the renewal only once', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    const c = contributions(t)[0];
    const ref = await pay(s, Number(c.id));
    // Same provider reference again (webhook redelivery) -> PAY-001 short-circuit.
    await s.financial.recordSettlementOutcome(Number(c.id), { provider: 'RAZORPAY', providerReference: ref, result: 'SUCCEEDED', amountPaise: Number(c.amount_paise) });
    // And a raw re-emission of CONTRIBUTION_COMPLETED.
    s.bus.emit(FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED, {
      eventType: FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED, contributionId: Number(c.id), businessModule: 'MEMBERSHIP',
      businessReferenceId: MID, amountPaise: Number(c.amount_paise), currency: 'INR', contributionState: 'COMPLETED', occurredAt: new Date(),
    });
    await flush();
    await s.renewal.getStatus(UID); // self-heal path is idempotent too
    expect(membership(t).expires_at).toBe(toMysqlDatetime(new Date(2027, 10, 18, 10, 16, 7)));
    expect(dispatched(s, 'MEMBERSHIP_RENEWED')).toHaveLength(1);
    expect((t.financial_transactions ?? []).filter((x) => x.outcome === 'SUCCEEDED')).toHaveLength(1);
    // A redelivery must never re-classify an applied renewal or refund it.
    expect(ops(t)[0].status).toBe('APPLIED');
    expect(t.financial_refunds ?? []).toHaveLength(0);
    expect((t.membership_audit_log ?? []).filter((a) => a.event_type === 'MEMBERSHIP_RENEWED')).toHaveLength(1);
  });

  it('failed payment: membership untouched, obligation stays retryable, retry then succeeds', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    const cid = Number(contributions(t)[0].id);
    await pay(s, cid, 'FAILED');
    expect(contributions(t)[0].state).toBe('FAILED');
    expect(ops(t)[0].status).toBe('AWAITING_PAYMENT');
    expect(membership(t)).toMatchObject({ lifecycle_state: 'ACTIVE', expires_at: TERM_END_SQL });
    expect((t.membership_audit_log ?? []).some((a) => a.event_type === 'PAYMENT_FAILED')).toBe(true);

    await s.financial.transitionContribution(cid, 'AWAITING_SETTLEMENT'); // PAY-001 retry
    await pay(s, cid);
    expect(ops(t)[0].status).toBe('APPLIED');
    expect(contributions(t)).toHaveLength(1);
  });

  it('AWAITING_SETTLEMENT obligation expires when the window closes (markExpired)', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    at(new Date(TERM_END.getTime() + 60 * 1000));
    await s.lifecycle.markExpired(MID, { type: 'SYSTEM' });
    expect(contributions(t)[0].state).toBe('EXPIRED');
    expect(ops(t)[0].status).toBe('EXPIRED');
    expect(membership(t).lifecycle_state).toBe('EXPIRED');
  });

  it('SETTLEMENT_IN_PROGRESS does not expire; late genuine settlement applies automatically (R1-02): EXPIRED -> ACTIVE, start = previous end', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    const cid = Number(contributions(t)[0].id);
    await s.financial.startSettlement(cid);

    at(new Date(TERM_END.getTime() + DAY));
    await s.lifecycle.markExpired(MID, { type: 'SYSTEM' });
    expect(contributions(t)[0].state).toBe('SETTLEMENT_IN_PROGRESS');
    expect(ops(t)[0].status).toBe('AWAITING_PAYMENT');
    expect(membership(t).lifecycle_state).toBe('EXPIRED');

    at(new Date(TERM_END.getTime() + 2 * DAY)); // payment completes 20 Nov
    await pay(s, cid);
    expect(membership(t)).toMatchObject({ lifecycle_state: 'ACTIVE', expires_at: toMysqlDatetime(new Date(2027, 10, 18, 10, 16, 7)) });
    expect(ops(t)[0]).toMatchObject({ status: 'APPLIED', new_term_start: TERM_END_SQL });
    assertNumberingUntouched(s, t);
  });

  it('a suspension blocks late application: not applied, not activated, routed to PAY-001 refund', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    const cid = Number(contributions(t)[0].id);
    await s.financial.startSettlement(cid);
    await s.lifecycle.suspend(MID, 1, 'conduct review');
    await pay(s, cid);
    expect(membership(t)).toMatchObject({ lifecycle_state: 'SUSPENDED', expires_at: TERM_END_SQL });
    expect(ops(t)[0].status).toBe('BLOCKED');
    expect(t.financial_refunds).toHaveLength(1);
    expect(t.financial_refunds[0]).toMatchObject({ contribution_id: cid, requested_by_type: 'SYSTEM' });
    expect(dispatched(s, 'MEMBERSHIP_RENEWED')).toHaveLength(0);
  });

  it('a competing term operation already applied: no second extension, payment routed to PAY-001 refund', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    const cid = Number(contributions(t)[0].id);
    await s.financial.startSettlement(cid);
    const competingEnd = toMysqlDatetime(new Date(2027, 5, 1));
    membership(t).expires_at = competingEnd; // e.g. an administrative class change re-based the term
    await pay(s, cid);
    expect(membership(t).expires_at).toBe(competingEnd);
    expect(ops(t)[0].status).toBe('BLOCKED');
    expect(t.financial_refunds).toHaveLength(1);
  });

  it('price is frozen at obligation creation: a later fee change never reprices it', async () => {
    const t = world();
    const config: Record<string, string> = {};
    const s = services(config);
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    config['7:fee_inr'] = '1500';
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    await s.renewal.getStatus(UID);
    expect(contributions(t)).toHaveLength(1);
    expect(contributions(t)[0].amount_paise).toBe(120000);
  });
});

// ── Payment boundary: eligibility vs obligation vs initiation vs settlement ─

describe('renewal payment boundary (Cases A / B / C)', () => {
  const FIN_SRC = readFileSync(join(__dirname, '../../financial/financial-contribution.service.ts'), 'utf8');

  it('Case A: obligation created and payment started before term end, settles after -> applies (R1-02)', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    const cid = Number(contributions(t)[0].id);
    at(new Date(TERM_END.getTime() - 60 * 1000));
    await s.financial.startSettlement(cid); // attempt begins inside the window
    at(new Date(TERM_END.getTime() + 3 * DAY));
    // Continuing the SAME attempt after term end is idempotent, not a new attempt.
    await expect(s.financial.startSettlement(cid)).resolves.toEqual({ contributionState: 'SETTLEMENT_IN_PROGRESS' });
    await pay(s, cid);
    expect(ops(t)[0]).toMatchObject({ status: 'APPLIED', new_term_start: TERM_END_SQL });
  });

  it('Case B: obligation exists but no attempt started; after term end a new attempt is refused and the obligation expires', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    const cid = Number(contributions(t)[0].id);
    at(TERM_END); // exactly at term end the window is closed
    await expect(s.financial.startSettlement(cid)).rejects.toThrow(/can no longer be started/);
    expect(contributions(t)[0].state).toBe('AWAITING_SETTLEMENT');
    expect(membership(t)).toMatchObject({ lifecycle_state: 'ACTIVE', expires_at: TERM_END_SQL });
    const status = await s.renewal.getStatus(UID); // lazy expiry
    expect(contributions(t)[0].state).toBe('EXPIRED');
    expect(ops(t)[0].status).toBe('EXPIRED');
    expect(status.mode).toBe('REINSTATEMENT');
    expect(dispatched(s, 'MEMBERSHIP_RENEWED')).toHaveLength(0);
  });

  it('Case B (retry): an attempt that FAILED inside the window cannot be re-attempted after term end', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    const cid = Number(contributions(t)[0].id);
    await pay(s, cid, 'FAILED');
    at(new Date(TERM_END.getTime() + DAY));
    await s.financial.transitionContribution(cid, 'AWAITING_SETTLEMENT'); // PAY-001 retry reopen
    await expect(s.financial.startSettlement(cid)).rejects.toThrow(/can no longer be started/);
    expect(membership(t).expires_at).toBe(TERM_END_SQL);
  });

  it('Case C: no renewal obligation and the window closed -> no obligation can be created; reinstatement only', async () => {
    const t = world();
    const s = services();
    at(new Date(TERM_END.getTime() + DAY));
    await expect(s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null)).rejects.toThrow(/window has closed/);
    expect(contributions(t)).toHaveLength(0);
    expect(ops(t)).toHaveLength(0);
    expect((await s.renewal.getStatus(UID)).mode).toBe('REINSTATEMENT');
  });

  it('every provider payment entry point funnels through startSettlement()', () => {
    for (const fn of ['async initiateProviderSettlement(', 'async initiateProviderPaymentLink(']) {
      const body = FIN_SRC.slice(FIN_SRC.indexOf(fn), FIN_SRC.indexOf('\n  }\n', FIN_SRC.indexOf(fn)));
      expect(body).toContain('await this.startSettlement(contributionId, auditContext)');
    }
  });
});

// ── Complimentary validity (memberships 98 / 104 shape) ────────────────────

describe('complimentary validity', () => {
  it('renewal during a complimentary period starts at the complimentary end and never shortens it', async () => {
    const t = world();
    const s = services();
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    // Renewal requested AND paid well before the complimentary end.
    at(new Date(TERM_END.getTime() - 30 * DAY));
    await pay(s, Number(contributions(t)[0].id));
    expect(ops(t)[0].new_term_start).toBe(TERM_END_SQL);
    expect(new Date(String(membership(t).expires_at)).getTime()).toBeGreaterThan(TERM_END.getTime());
    expect(fake.committed.filter((op) => op.table === 'individual_overrides')).toHaveLength(0);
  });
});

// ── Student proof ──────────────────────────────────────────────────────────

describe('Student eligibility proof (configured, not hard-coded)', () => {
  it('when configured, no obligation exists until the proof is ACCEPTED', async () => {
    const t = world({ classId: 6 });
    const s = services({ '6:renewal_required_document_types': 'STUDENT_ID' });

    let status = await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    expect(status.proofRequired).toBe(true);
    expect(ops(t)[0].status).toBe('PROOF_REQUIRED');
    expect(contributions(t)).toHaveLength(0);

    const { documentUuid } = await s.renewal.requestProofUpload(UID, {
      documentType: 'STUDENT_ID', originalFilename: 'id.pdf', mimeType: 'application/pdf', sizeBytes: 1000,
    });
    const doc = t.membership_application_documents.find((d) => d.uuid === documentUuid)!;
    expect(doc).toMatchObject({ membership_id: MID, renewal_operation_id: ops(t)[0].id });

    // Uploaded but rejected -> still no obligation, no payment, no refund.
    Object.assign(doc, { upload_status: 'UPLOADED', review_status: 'REJECTED' });
    await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    expect(contributions(t)).toHaveLength(0);

    Object.assign(doc, { review_status: 'ACCEPTED' });
    status = await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    expect(ops(t)[0].status).toBe('AWAITING_PAYMENT');
    expect(contributions(t)).toHaveLength(1);
    expect(contributions(t)[0].amount_paise).toBe(50000);
  });

  it('when not configured (current production state), Student renewal needs no proof', async () => {
    const t = world({ classId: 6 });
    const s = services();
    const status = await s.renewal.requestRenewal(UID, 'renewal-v1.0', null, null);
    expect(status.proofRequired).toBe(false);
    expect(contributions(t)).toHaveLength(1);
  });
});

// ── Reinstatement ──────────────────────────────────────────────────────────

describe('reinstatement after expiry', () => {
  it('reject -> no obligation; approve -> obligation; payment -> same row ACTIVE, same number/plan, starts at completion', async () => {
    const t = world({ lifecycle_state: 'EXPIRED' });
    const s = services();
    at(new Date(TERM_END.getTime() + 20 * DAY));

    await s.renewal.requestReinstatement(UID, 'renewal-v1.0', null, null);
    expect(ops(t)).toHaveLength(1);
    expect(ops(t)[0]).toMatchObject({ operation_type: 'REINSTATEMENT', status: 'REQUESTED' });
    expect(contributions(t)).toHaveLength(0);

    await s.renewal.decideReinstatement(Number(ops(t)[0].id), 1, 'REJECTED', 'not eligible');
    expect(ops(t)[0].status).toBe('REJECTED');
    expect(contributions(t)).toHaveLength(0);
    expect(t.financial_refunds ?? []).toHaveLength(0);

    await s.renewal.requestReinstatement(UID, 'renewal-v1.0', null, null);
    const second = ops(t).find((o) => o.status === 'REQUESTED')!;
    await s.renewal.decideReinstatement(Number(second.id), 1, 'APPROVED', null);
    expect(contributions(t)).toHaveLength(1);
    expect(contributions(t)[0]).toMatchObject({ amount_paise: 120000, state: 'AWAITING_SETTLEMENT', expires_at: null });

    const paidAt = new Date(TERM_END.getTime() + 25 * DAY);
    at(paidAt);
    await pay(s, Number(contributions(t)[0].id));
    const expectedEnd = new Date(paidAt);
    expectedEnd.setMonth(expectedEnd.getMonth() + 12);
    expect(membership(t)).toMatchObject({ lifecycle_state: 'ACTIVE', membership_class_id: 7, expires_at: toMysqlDatetime(expectedEnd) });
    expect(second.status).toBe('APPLIED');
    expect(second.new_term_start).toBe(toMysqlDatetime(paidAt));
    expect(dispatched(s, 'MEMBERSHIP_REINSTATED')).toHaveLength(1);
    assertNumberingUntouched(s, t);
  });

  it('admin renewFromExpired() can no longer bypass PAY-001 for Release 1 plans', async () => {
    const t = world({ lifecycle_state: 'EXPIRED' });
    const s = services();
    at(new Date(TERM_END.getTime() + DAY));
    await expect(s.lifecycle.renewFromExpired(MID, 1, 'ADMIN')).rejects.toThrow(/reinstatement/);
    expect(membership(t).lifecycle_state).toBe('EXPIRED');
  });

  it('reinstatement is not offered while the membership is still current', async () => {
    world();
    const s = services();
    await expect(s.renewal.requestReinstatement(UID, 'renewal-v1.0', null, null)).rejects.toThrow(ConflictException);
  });
});

// ── Application duplicate guard (§20) ──────────────────────────────────────

describe('new-application duplicate guard', () => {
  it.each([
    ['ACTIVE', 7, /active membership/],
    ['PENDING', 7, /pending membership application/],
    ['SUSPENDED', 7, /suspended/],
    ['EXPIRED', 7, /reinstatement/],
    ['EXPIRED', 6, /reinstatement/],
    ['EXPIRED', 9, /reinstatement/],
  ])('%s class %d -> refused', async (state, classId, message) => {
    world({ lifecycle_state: state, classId });
    await expect(assertNoBlockingIndividualMembership(db as never, UID)).rejects.toThrow(message);
  });

  it('EXPIRED Basic keeps the existing behaviour (no new re-admission policy invented)', async () => {
    world({ lifecycle_state: 'EXPIRED', classId: 5 });
    await expect(assertNoBlockingIndividualMembership(db as never, UID)).resolves.toBeUndefined();
  });

  it('lifecycle.apply() re-checks under a lock inside its insert transaction', async () => {
    world({ lifecycle_state: 'EXPIRED', classId: 7 });
    const s = services();
    await expect(s.lifecycle.apply({ ownerType: 'INDIVIDUAL', userId: UID, membershipClassId: 7 })).rejects.toThrow(/reinstatement/);
    expect(membershipInserts()).toHaveLength(0);
  });
});

// ── Source-level guarantees ────────────────────────────────────────────────

describe('source guarantees', () => {
  const RENEWAL_SRC = readFileSync(join(__dirname, 'membership-renewal.service.ts'), 'utf8');
  const ADMIN_SRC = readFileSync(join(__dirname, '../admin/membership-admin.service.ts'), 'utf8');
  const code = RENEWAL_SRC.replace(/^\s*\/\/.*$/gm, '');

  it('renewal never inserts memberships, never activates, never numbers, never calls Razorpay', () => {
    expect(code).not.toMatch(/insertInto\('memberships'\)/);
    expect(code).not.toMatch(/\.activate\(/);
    expect(code).not.toMatch(/assignPermanentNumber|MembershipNumberingService|number_serial/);
    for (const write of code.match(/\.set\(\{[\s\S]*?\}\)/g) ?? []) {
      expect(write).not.toMatch(/membership_number|membership_class_id/);
    }
    expect(code).not.toMatch(/razorpay/i);
  });

  it('member-facing renewal policy text matches Release 1 (no 60-day / post-expiry renewal wording)', () => {
    const FRONTEND = join(__dirname, '../../../../../frontend/src');
    for (const file of ['components/hub/MembershipApplicationFlow.astro', 'pages/hub/membership/renew.astro', 'pages/hub/index.astro']) {
      const src = readFileSync(join(FRONTEND, file), 'utf8');
      expect(src).not.toMatch(/60-day|30 days after expiry/);
    }
    // The pre-existing 60-day informational notice survives ONLY for plans
    // outside Release 1 (Basic scope preserved); Release 1 plans follow the server.
    const hub = readFileSync(join(FRONTEND, 'pages/hub/index.astro'), 'utf8');
    const legacyBranch = hub.slice(hub.indexOf("rs.reason === 'CLASS_NOT_SELF_RENEWABLE'"), hub.indexOf('const pendingPayment'));
    expect(hub.match(/daysLeft <= 60/g)).toHaveLength(1);
    expect(legacyBranch).toContain('daysLeft <= 60');
  });

  it('renewal reminders exclude non-renewable plans (Legacy)', () => {
    expect(ADMIN_SRC).toContain(".where('mc.is_renewable', '=', true)");
  });
});
