// backend/src/modules/membership/lifecycle/membership-settlement-correction.spec.ts
//
// Settlement correction (HA rulings 1/2, 2026-10-01; Option I; D1/D2/D3).
//
// The REAL MembershipLifecycleService, FinancialContributionService,
// FinancialAuditService, RazorpayWebhookService, FinancialEventBus and
// MembershipFinancialListener run against the recording FakeDb
// (test-support/fake-db.ts) backed by a small in-memory table store, so
// state actually moves between calls. Numbering/communication/entitlements
// are inert stubs -- the correction path must never reach them.
//
// Proves: one ordinary genuine-payment Contribution per original (same
// payer/amount/currency, deterministic key, AWAITING_SETTLEMENT); every
// precondition; exactly one append-only SETTLEMENT_RECONCILIATION_ANNOTATED
// row on the original (COMPLETED -> COMPLETED, TEST_MODE_NON_GENUINE_SETTLEMENT,
// real providerAccountId); the original contribution, transaction, receipt,
// webhook row and refund table are never written; the membership row,
// number and validity are never written; the correction pays through the
// existing payment-link + payment_link.paid flow into its own transaction
// and receipt; and the listener records correction success/failure
// record-only while leaving the normal PENDING path unchanged.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/communication/communication.service', () => ({ CommunicationService: class {} }));
jest.mock('../numbering/membership-numbering.service', () => ({ MembershipNumberingService: class {} }));
jest.mock('../entitlements/entitlement.service', () => ({ EntitlementService: class {} }));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { FinancialAuditService } from '../../financial/audit/financial-audit.service';
import type { AuditContext } from '../../financial/audit/financial-audit.types';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import { FinancialEventBus } from '../../financial/financial-event-bus.service';
import { FINANCIAL_EVENT_TYPES } from '../../financial/financial.events';
import { RazorpayWebhookService } from '../../financial/razorpay-webhook.service';
import type { SettlementProvider } from '../../financial/settlement-provider.interface';
import type { CommunicationService } from '../../shared/communication/communication.service';
import { SettlementCorrectionDto } from '../dto/settlement-correction.dto';
import type { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipFinancialListener } from '../financial/membership-financial.listener';
import { MembershipRenewalService } from '../renewal/membership-renewal.service';
import type { R2Service } from '../../shared/storage/r2.service';
import type { MembershipNumberingService } from '../numbering/membership-numbering.service';
import {
  MembershipLifecycleService,
  parseSettlementCorrectionKey,
  settlementCorrectionContributionKey,
} from './membership-lifecycle.service';

const fake = db as unknown as FakeDb;
const WEBHOOK_SECRET = 'whsec_test_only';
const ORIGINAL_ENV = process.env;

const MEMBERSHIP_ID = 99;
const PAYER = 95;
const ORIGINAL_ID = 8;
const FEE = 120000;
const TEST_ACCOUNT = 'acc_DJkWMSsLHLxU4a';
const REASON = 'HA ruling approved genuine live corrective payment for original Razorpay test-mode settlement';
const ADMIN: AuditContext = { actorType: 'ADMIN', provenance: { actorUserId: 1, requestId: 'req-admin' } };

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

// ── In-memory table store behind FakeDb ─────────────────────────────────────

function matches(row: Row, op: FakeOp): boolean {
  return op.wheres.every(([col, cmp, val]) => {
    const v = row[String(col)];
    if (cmp === '=') return v === val;
    if (cmp === '!=') return v !== val;
    if (cmp === 'is') return v === val || (val === null && v === undefined);
    if (cmp === 'in') return (val as unknown[]).includes(v);
    return true;
  });
}

function installStore(tables: Tables) {
  const nextId: Record<string, number> = {};
  const defaults: Record<string, Row> = {
    financial_contributions: { state: 'CREATED', active_settlement_reference: null, active_settlement_url: null, expires_at: null },
    settlement_webhook_inbox: { status: 'RECEIVED', contribution_id: null, processing_error: null },
  };
  fake.responder = (op: FakeOp) => {
    const rows = (tables[op.table] ??= []);
    if (op.kind === 'select') return rows.filter((r) => matches(r, op)).map((r) => ({ ...r }));
    if (op.kind === 'insert') {
      nextId[op.table] ??= 5000;
      const id = (op.values!.id as number | undefined) ?? nextId[op.table]++;
      rows.push({ ...(defaults[op.table] ?? {}), ...op.values, id });
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

function capturedPayload(accountId = TEST_ACCOUNT, paymentId = 'pay_Td1Zs77xOJPVno') {
  return {
    event: 'payment.captured',
    account_id: accountId,
    payload: { payment: { entity: { id: paymentId, order_id: 'order_Td1ZT3Jyl4em4f', amount: FEE, currency: 'INR', vpa: 'success@razorpay' } } },
  };
}

interface WorldOpts {
  membership?: Row;
  original?: Row;
  transactions?: Row[];
  refunds?: Row[];
  inbox?: Row[];
}

function world(o: WorldOpts = {}): Tables {
  const tables: Tables = {
    memberships: [{
      id: MEMBERSHIP_ID, owner_type: 'INDIVIDUAL', user_id: PAYER, parent_membership_id: null,
      membership_class_id: 7, lifecycle_state: 'ACTIVE', membership_number: 'BCC20260900066',
      activated_at: '2026-09-18 05:50:39', expires_at: '2027-09-18 05:50:39', ...o.membership,
    }],
    financial_contributions: [{
      id: ORIGINAL_ID, uuid: 'c-8', payer_user_id: PAYER, business_module: 'MEMBERSHIP',
      business_reference_id: MEMBERSHIP_ID, purpose: 'Membership fee', amount_paise: FEE, currency: 'INR',
      state: 'COMPLETED', idempotency_key: `MEMBERSHIP-${MEMBERSHIP_ID}-CONTRIBUTION`,
      active_settlement_reference: null, active_settlement_url: null, expires_at: null, ...o.original,
    }],
    financial_transactions: o.transactions ?? [{
      id: 6, contribution_id: ORIGINAL_ID, provider: 'RAZORPAY', provider_reference: 'pay_Td1Zs77xOJPVno',
      amount_paise: FEE, currency: 'INR', outcome: 'SUCCEEDED',
    }],
    receipts: [{ id: 4, contribution_id: ORIGINAL_ID, receipt_number: 'BCC-RCP-202609-000008', amount_paise: FEE }],
    financial_refunds: o.refunds ?? [],
    settlement_webhook_inbox: o.inbox ?? [{
      id: 8, provider: 'RAZORPAY', provider_event_id: 'Td1Zu2jzUUvuGe', event_type: 'payment.captured',
      payload: capturedPayload(), contribution_id: ORIGINAL_ID, status: 'PROCESSED',
    }],
    financial_audit_log: [],
    membership_audit_log: [],
  };
  installStore(tables);
  return tables;
}

function linkProvider(): jest.Mocked<Required<SettlementProvider>> {
  return {
    providerName: 'RAZORPAY',
    createOrder: jest.fn(),
    refund: jest.fn(),
    createPaymentLink: jest.fn().mockImplementation(async (input) => ({
      providerLinkReference: 'plink_live_1', hostedUrl: 'https://rzp.io/i/live1', amountPaise: input.amountPaise, currency: input.currency,
    })),
    cancelPaymentLink: jest.fn(),
    getPublicKeyId: jest.fn(),
  } as unknown as jest.Mocked<Required<SettlementProvider>>;
}

function services() {
  const bus = new FinancialEventBus();
  const provider = linkProvider();
  const financial = new FinancialContributionService(bus, provider, new FinancialAuditService());
  const numbering = { assignPermanentNumber: jest.fn() };
  const communication = { dispatch: jest.fn() };
  const entitlements = { getClassConfigValue: jest.fn(), getGroupTypeConfigValue: jest.fn() };
  const lifecycle = new MembershipLifecycleService(
    numbering as unknown as MembershipNumberingService,
    communication as unknown as CommunicationService,
    entitlements as unknown as EntitlementService,
    financial,
  );
  return { bus, provider, financial, lifecycle, numbering, communication, entitlements };
}

function renewalFor(s: ReturnType<typeof services>): MembershipRenewalService {
  return new MembershipRenewalService(
    s.financial,
    s.entitlements as unknown as EntitlementService,
    s.lifecycle,
    s.communication as unknown as CommunicationService,
    {} as R2Service,
  );
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

function writesTo(table: string, kind?: FakeOp['kind']): FakeOp[] {
  return [...fake.committed, ...fake.rolledBack].filter((op) => op.table === table && (!kind || op.kind === kind));
}

function originalWrites(): FakeOp[] {
  const touchesOriginal = (op: FakeOp) =>
    op.wheres.some(([c, , v]) => (c === 'id' || c === 'contribution_id') && v === ORIGINAL_ID);
  return [
    ...writesTo('financial_contributions', 'update').filter(touchesOriginal),
    ...writesTo('financial_contributions', 'delete'),
    ...writesTo('financial_transactions', 'update'),
    ...writesTo('financial_transactions', 'delete'),
    ...writesTo('receipts', 'update'),
    ...writesTo('receipts', 'delete'),
    ...writesTo('settlement_webhook_inbox', 'update').filter((op) => op.wheres.some(([c, , v]) => c === 'id' && v === 8)),
    ...writesTo('settlement_webhook_inbox', 'delete'),
    ...writesTo('financial_refunds'),
  ];
}

function membershipRowWrites(): FakeOp[] {
  return [...writesTo('memberships'), ...writesTo('membership_number_log')];
}

function correction(tables: Tables): Row | undefined {
  return tables.financial_contributions.find(
    (c) => c.idempotency_key === settlementCorrectionContributionKey(MEMBERSHIP_ID, ORIGINAL_ID),
  );
}

function annotations(tables: Tables): Row[] {
  return tables.financial_audit_log.filter((r) => r.event_type === 'SETTLEMENT_RECONCILIATION_ANNOTATED');
}

beforeEach(() => {
  fake.reset();
  process.env = { ...ORIGINAL_ENV, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// ═══════════════════════════════════════════════════════════════════════════

describe('settlement-correction key family', () => {
  it('is deterministic per (membership, original contribution)', () => {
    expect(settlementCorrectionContributionKey(99, 8)).toBe('MEMBERSHIP-99-CORRECTION-8');
    expect(settlementCorrectionContributionKey(106, 12)).toBe('MEMBERSHIP-106-CORRECTION-12');
    expect(settlementCorrectionContributionKey(99, 8)).toBe(settlementCorrectionContributionKey(99, 8));
  });

  it('parses only correction keys -- never application, complimentary, renewal or group keys', () => {
    expect(parseSettlementCorrectionKey('MEMBERSHIP-99-CORRECTION-8')).toEqual({ membershipId: 99, originalContributionId: 8 });
    expect(parseSettlementCorrectionKey('MEMBERSHIP-99-CONTRIBUTION')).toBeNull();
    expect(parseSettlementCorrectionKey('MEMBERSHIP-104-COMPLIMENTARY-CONTRIBUTION')).toBeNull();
    expect(parseSettlementCorrectionKey('MEMBERSHIP-9-RENEWAL-20280922')).toBeNull();
    expect(parseSettlementCorrectionKey('EVENT-11-USER-1-REG-1')).toBeNull();
  });
});

describe('createSettlementCorrectionContribution() — happy path', () => {
  it('creates ONE ordinary MEMBERSHIP contribution: same payer/amount/currency, deterministic key, AWAITING_SETTLEMENT', async () => {
    const tables = world();
    const { lifecycle } = services();

    const result = await lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN);

    const row = correction(tables)!;
    expect(row).toMatchObject({
      payer_user_id: PAYER,
      business_module: 'MEMBERSHIP',
      business_reference_id: MEMBERSHIP_ID,
      amount_paise: FEE,
      currency: 'INR',
      state: 'AWAITING_SETTLEMENT',
      idempotency_key: 'MEMBERSHIP-99-CORRECTION-8',
      purpose: 'Membership fee — genuine payment replacing a gateway test-mode transaction (ref FC-8)',
    });
    expect(String(row.purpose)).not.toMatch(/renew|arrear|late|penalt|new membership/i);
    expect(result).toEqual({
      correctionContributionId: row.id,
      originalContributionId: ORIGINAL_ID,
      state: 'AWAITING_SETTLEMENT',
      amountPaise: FEE,
      currency: 'INR',
    });
  });

  it('writes exactly one append-only annotation on the original with the approved classification and evidence', async () => {
    const tables = world();
    const { lifecycle } = services();

    await lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, `  ${REASON}  `, 1, ADMIN);

    const rows = annotations(tables);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      contribution_id: ORIGINAL_ID,
      transaction_id: 6,
      webhook_inbox_id: 8,
      actor_type: 'ADMIN',
      actor_user_id: 1,
      provider_payment_ref: 'pay_Td1Zs77xOJPVno',
      provider_order_ref: 'order_Td1ZT3Jyl4em4f',
      previous_state: 'COMPLETED',
      resulting_state: 'COMPLETED',
    });
    expect(JSON.parse(String(rows[0].metadata_json))).toEqual({
      settlementClassification: 'TEST_MODE_NON_GENUINE_SETTLEMENT',
      providerAccountId: TEST_ACCOUNT,
      correctionContributionId: correction(tables)!.id,
      reconciliationReason: REASON,
    });
  });

  it('reads providerAccountId from a string (unparsed) JSON payload as well', async () => {
    const tables = world({
      inbox: [{
        id: 8, event_type: 'payment.captured', payload: JSON.stringify(capturedPayload()), contribution_id: ORIGINAL_ID, status: 'PROCESSED',
      }],
    });
    await services().lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN);
    expect(JSON.parse(String(annotations(tables)[0].metadata_json)).providerAccountId).toBe(TEST_ACCOUNT);
  });

  it('records SETTLEMENT_CORRECTION_AUTHORIZED on the membership with the reason and original evidence', async () => {
    const tables = world();
    await services().lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN);

    const auth = tables.membership_audit_log.filter((r) => r.event_type === 'SETTLEMENT_CORRECTION_AUTHORIZED');
    expect(auth).toHaveLength(1);
    expect(auth[0]).toMatchObject({ membership_id: MEMBERSHIP_ID, actor_type: 'ADMIN', actor_user_id: 1, notes: REASON });
    expect(JSON.parse(String(auth[0].new_value))).toEqual({
      correctionContributionId: correction(tables)!.id,
      originalContributionId: ORIGINAL_ID,
      originalTransactionId: 6,
      originalProviderPaymentRef: 'pay_Td1Zs77xOJPVno',
      providerAccountId: TEST_ACCOUNT,
      settlementClassification: 'TEST_MODE_NON_GENUINE_SETTLEMENT',
    });
  });

  it('records CONTRIBUTION_CREATED for the new contribution under the admin actor (normal Financial Engine audit)', async () => {
    const tables = world();
    await services().lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN);
    const created = tables.financial_audit_log.filter((r) => r.event_type === 'CONTRIBUTION_CREATED');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ contribution_id: correction(tables)!.id, actor_type: 'ADMIN', actor_user_id: 1 });
  });
});

describe('createSettlementCorrectionContribution() — integrity', () => {
  it('never writes the membership row, its number, or its validity (no activate/renew/numbering)', async () => {
    const tables = world();
    const { lifecycle, numbering, communication, entitlements } = services();
    const before = { ...tables.memberships[0] };

    await lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN);

    expect(membershipRowWrites()).toHaveLength(0);
    expect(tables.memberships).toHaveLength(1);
    expect(tables.memberships[0]).toEqual(before);
    expect(tables.memberships[0]).toMatchObject({
      lifecycle_state: 'ACTIVE', membership_number: 'BCC20260900066', expires_at: '2027-09-18 05:50:39',
    });
    expect(numbering.assignPermanentNumber).not.toHaveBeenCalled();
    expect(communication.dispatch).not.toHaveBeenCalled();
    expect(entitlements.getClassConfigValue).not.toHaveBeenCalled();
  });

  it('never writes the original contribution, transaction, receipt, webhook row, or any refund', async () => {
    const tables = world();
    const { lifecycle, provider } = services();
    const snapshot = JSON.stringify({
      c: tables.financial_contributions[0], t: tables.financial_transactions, r: tables.receipts, i: tables.settlement_webhook_inbox,
    });

    await lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN);

    expect(originalWrites()).toHaveLength(0);
    expect(provider.refund).not.toHaveBeenCalled();
    expect(tables.financial_refunds).toHaveLength(0);
    expect(tables.financial_contributions[0].state).toBe('COMPLETED');
    expect(JSON.stringify({
      c: tables.financial_contributions[0], t: tables.financial_transactions, r: tables.receipts, i: tables.settlement_webhook_inbox,
    })).toBe(snapshot);
  });
});

describe('createSettlementCorrectionContribution() — idempotency', () => {
  it('a repeated request returns the SAME contribution; no second contribution, annotation or authorization', async () => {
    const tables = world();
    const { lifecycle } = services();

    const first = await lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN);
    const second = await lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN);

    expect(second.correctionContributionId).toBe(first.correctionContributionId);
    expect(tables.financial_contributions.filter((c) => String(c.idempotency_key).includes('CORRECTION'))).toHaveLength(1);
    expect(annotations(tables)).toHaveLength(1);
    expect(tables.membership_audit_log.filter((r) => r.event_type === 'SETTLEMENT_CORRECTION_AUTHORIZED')).toHaveLength(1);
    expect(tables.financial_audit_log.filter((r) => r.event_type === 'CONTRIBUTION_CREATED')).toHaveLength(1);
  });

  it('a replay after a partial failure completes the missing annotation without duplicating the contribution', async () => {
    const tables = world();
    const { lifecycle } = services();
    fake.failWhen = (op) =>
      op.table === 'financial_audit_log' && op.kind === 'insert' && op.values!.event_type === 'SETTLEMENT_RECONCILIATION_ANNOTATED'
        ? new Error('audit down')
        : null;

    await expect(
      lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN),
    ).rejects.toThrow('audit down');
    expect(annotations(tables)).toHaveLength(0);

    fake.failWhen = () => null;
    await lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN);

    expect(tables.financial_contributions.filter((c) => String(c.idempotency_key).includes('CORRECTION'))).toHaveLength(1);
    expect(correction(tables)!.state).toBe('AWAITING_SETTLEMENT');
    expect(annotations(tables)).toHaveLength(1);
  });

  it('annotateSettlementReconciliation() itself writes nothing when the original is already annotated', async () => {
    const tables = world();
    const { financial } = services();
    tables.financial_audit_log.push({ id: 1, contribution_id: ORIGINAL_ID, event_type: 'SETTLEMENT_RECONCILIATION_ANNOTATED' });
    tables.financial_contributions.push({ id: 900, state: 'AWAITING_SETTLEMENT' });

    const result = await financial.annotateSettlementReconciliation(
      ORIGINAL_ID,
      { classification: 'TEST_MODE_NON_GENUINE_SETTLEMENT', reason: REASON, correctionContributionId: 900 },
      ADMIN,
    );

    expect(result).toEqual({ annotated: false });
    expect(writesTo('financial_audit_log', 'insert')).toHaveLength(0);
  });
});

describe('createSettlementCorrectionContribution() — preconditions', () => {
  async function rejects(opts: WorldOpts, error: unknown, args: { membershipId?: number; originalId?: number; reason?: string } = {}) {
    const tables = world(opts);
    const { lifecycle } = services();
    await expect(
      lifecycle.createSettlementCorrectionContribution(
        args.membershipId ?? MEMBERSHIP_ID, args.originalId ?? ORIGINAL_ID, args.reason ?? REASON, 1, ADMIN,
      ),
    ).rejects.toBeInstanceOf(error);
    expect(correction(tables)).toBeUndefined();
    expect(tables.financial_contributions).toHaveLength(1);
    expect(annotations(tables)).toHaveLength(0);
    expect(tables.membership_audit_log).toHaveLength(0);
    expect(originalWrites()).toHaveLength(0);
    expect(membershipRowWrites()).toHaveLength(0);
  }

  it('rejects an empty or blank reason', async () => {
    await rejects({}, BadRequestException, { reason: '' });
    fake.reset();
    await rejects({}, BadRequestException, { reason: '   ' });
  });

  it('rejects a GROUP (non-Individual) membership', async () => {
    await rejects({ membership: { owner_type: 'GROUP', user_id: null } }, BadRequestException);
  });

  it('rejects a child (Family/Corporate member) membership', async () => {
    await rejects({ membership: { parent_membership_id: 55 } }, BadRequestException);
  });

  it.each(['PENDING', 'APPROVED', 'SUSPENDED', 'EXPIRED', 'TERMINATED', 'REJECTED'])('rejects a %s membership', async (state) => {
    await rejects({ membership: { lifecycle_state: state } }, ConflictException);
  });

  it('rejects a membership that does not exist', async () => {
    const tables = world();
    tables.memberships.length = 0;
    await expect(
      services().lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN),
    ).rejects.toThrow();
    expect(correction(tables)).toBeUndefined();
  });

  it('rejects an original contribution belonging to another membership', async () => {
    await rejects({ original: { business_reference_id: 106 } }, BadRequestException);
  });

  it('rejects an original contribution from another business module', async () => {
    await rejects({ original: { business_module: 'EVENT_REGISTRATION' } }, BadRequestException);
  });

  it('rejects an original that is not the membership application fee (complimentary / correction / renewal)', async () => {
    await rejects({ original: { idempotency_key: `MEMBERSHIP-${MEMBERSHIP_ID}-COMPLIMENTARY-CONTRIBUTION` } }, BadRequestException);
    fake.reset();
    await rejects({ original: { idempotency_key: `MEMBERSHIP-${MEMBERSHIP_ID}-CORRECTION-3` } }, BadRequestException);
  });

  it('rejects an unknown original contribution id', async () => {
    const tables = world();
    await expect(
      services().lifecycle.createSettlementCorrectionContribution(MEMBERSHIP_ID, 4242, REASON, 1, ADMIN),
    ).rejects.toThrow();
    expect(correction(tables)).toBeUndefined();
  });

  it.each(['AWAITING_SETTLEMENT', 'SETTLEMENT_IN_PROGRESS', 'FAILED', 'ABANDONED', 'REFUNDED', 'CANCELLED'])(
    'rejects an original in state %s (must be COMPLETED)',
    async (state) => {
      await rejects({ original: { state } }, ConflictException);
    },
  );

  it('rejects an original whose successful transaction is not RAZORPAY', async () => {
    await rejects({
      transactions: [{ id: 6, contribution_id: ORIGINAL_ID, provider: 'BCC_BANK_TRANSFER', provider_reference: 'UTR1', outcome: 'SUCCEEDED' }],
    }, ConflictException);
  });

  it('rejects an original with no SUCCEEDED transaction', async () => {
    await rejects({
      transactions: [{ id: 6, contribution_id: ORIGINAL_ID, provider: 'RAZORPAY', provider_reference: 'pay_Td1Zs77xOJPVno', outcome: 'FAILED' }],
    }, ConflictException);
  });

  it('rejects an original that already has a refund record', async () => {
    await rejects({ refunds: [{ id: 1, contribution_id: ORIGINAL_ID, status: 'COMPLETED' }] }, ConflictException);
  });

  it('rejects an original with no processed payment.captured delivery for its payment', async () => {
    await rejects({ inbox: [] }, ConflictException);
    fake.reset();
    await rejects({
      inbox: [{ id: 8, event_type: 'payment.captured', payload: capturedPayload(TEST_ACCOUNT, 'pay_other'), contribution_id: ORIGINAL_ID, status: 'PROCESSED' }],
    }, ConflictException);
    fake.reset();
    await rejects({
      inbox: [{ id: 8, event_type: 'payment.captured', payload: capturedPayload(), contribution_id: ORIGINAL_ID, status: 'FAILED' }],
    }, ConflictException);
  });
});

describe('admin request DTO', () => {
  const opts = { whitelist: true, forbidNonWhitelisted: true };

  it('accepts exactly { originalContributionId, reason }', async () => {
    const dto = plainToInstance(SettlementCorrectionDto, { originalContributionId: 8, reason: REASON });
    expect(await validate(dto, opts)).toHaveLength(0);
  });

  it('rejects a client-supplied amount or currency (amount always comes from the original)', async () => {
    const dto = plainToInstance(SettlementCorrectionDto, { originalContributionId: 8, reason: REASON, amountPaise: 1, currency: 'USD' });
    const errors = await validate(dto, opts);
    expect(errors.map((e) => e.property).sort()).toEqual(['amountPaise', 'currency']);
  });

  it('rejects a missing/empty reason and a non-positive or non-integer original id', async () => {
    expect(await validate(plainToInstance(SettlementCorrectionDto, { originalContributionId: 8, reason: '' }), opts)).not.toHaveLength(0);
    expect(await validate(plainToInstance(SettlementCorrectionDto, { originalContributionId: 8 }), opts)).not.toHaveLength(0);
    expect(await validate(plainToInstance(SettlementCorrectionDto, { originalContributionId: 0, reason: REASON }), opts)).not.toHaveLength(0);
    expect(await validate(plainToInstance(SettlementCorrectionDto, { originalContributionId: 8.5, reason: REASON }), opts)).not.toHaveLength(0);
  });
});

describe('admin route (D3)', () => {
  const CONTROLLER_SRC = readFileSync(join(__dirname, '../membership.controller.ts'), 'utf8').replace(/\r\n/g, '\n');
  const route = CONTROLLER_SRC.slice(
    CONTROLLER_SRC.indexOf("@Post(':id/settlement-correction')"),
    CONTROLLER_SRC.indexOf('async createSettlementCorrection('),
  );

  it('is POST api/v1/membership/:id/settlement-correction behind AccessTokenGuard + RbacGuard', () => {
    expect(CONTROLLER_SRC).toContain("@Controller('api/v1/membership')");
    expect(route).toContain('@UseGuards(AccessTokenGuard, RbacGuard)');
  });

  it('requires BOTH membership.lifecycle.renew AND financial.settlement.verify (no new permission)', () => {
    expect(route).toContain("@RequirePermissions('membership.lifecycle.renew', 'financial.settlement.verify')");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Payment through the EXISTING payment-link + webhook flow, then the listener
// ═══════════════════════════════════════════════════════════════════════════

function linkPaid(linkId: string, amount: number) {
  return {
    event: 'payment_link.paid',
    account_id: 'acc_TB6rt1Y9pstHJK',
    payload: {
      payment_link: { entity: { id: linkId, amount, currency: 'INR', status: 'paid' } },
      payment: { entity: { id: 'pay_live_1', order_id: 'order_of_link', amount, currency: 'INR', status: 'captured' } },
    },
  };
}

function signed(eventId: string, body: Record<string, unknown>) {
  const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
  return {
    rawBody,
    signature: createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex'),
    eventId,
    requestId: 'req-webhook',
    route: '/api/v1/financial/webhooks/razorpay',
  };
}

describe('correction payment — existing payment-link flow, own transaction and receipt', () => {
  async function paidCorrection() {
    const tables = world();
    const s = services();
    const listener = new MembershipFinancialListener(s.bus, s.lifecycle, renewalFor(s));
    listener.onModuleInit();
    const emitted: string[] = [];
    const origEmit = s.bus.emit.bind(s.bus);
    jest.spyOn(s.bus, 'emit').mockImplementation((type, payload) => {
      emitted.push(type);
      return origEmit(type, payload);
    });

    const { correctionContributionId } = await s.lifecycle.createSettlementCorrectionContribution(
      MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN,
    );
    const link = await s.financial.initiateProviderPaymentLink(correctionContributionId, ADMIN);
    await new RazorpayWebhookService(s.financial).handle(signed('evt_live_1', linkPaid(link.providerLinkReference, FEE)));
    await flush();
    return { tables, s, correctionContributionId, link, emitted };
  }

  it('the payment link is raised by the unchanged endpoint logic for the correction amount', async () => {
    const { s, link, correctionContributionId } = await paidCorrection();
    expect(link).toMatchObject({ contributionId: correctionContributionId, amountPaise: FEE, currency: 'INR', reused: false });
    expect(s.provider.createPaymentLink.mock.calls[0][0]).toMatchObject({
      contributionId: correctionContributionId,
      amountPaise: FEE,
      currency: 'INR',
      description: 'Membership fee — genuine payment replacing a gateway test-mode transaction (ref FC-8)',
      metadata: { businessModule: 'MEMBERSHIP', businessReferenceId: MEMBERSHIP_ID, contributionId: correctionContributionId },
    });
  });

  it('payment_link.paid settles the correction: its own SUCCEEDED transaction, its own receipt, COMPLETED', async () => {
    const { tables, correctionContributionId, emitted } = await paidCorrection();

    const txns = tables.financial_transactions.filter((t) => t.contribution_id === correctionContributionId);
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ provider: 'RAZORPAY', provider_reference: 'pay_live_1', amount_paise: FEE, outcome: 'SUCCEEDED' });
    expect(tables.receipts.filter((r) => r.contribution_id === correctionContributionId)).toHaveLength(1);
    expect(correction(tables)!.state).toBe('COMPLETED');
    expect(emitted).toEqual(expect.arrayContaining([
      FINANCIAL_EVENT_TYPES.SETTLEMENT_COMPLETED,
      FINANCIAL_EVENT_TYPES.RECEIPT_GENERATED,
      FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
    ]));
  });

  it('the original test-mode records are untouched after the genuine payment', async () => {
    const { tables } = await paidCorrection();
    expect(originalWrites()).toHaveLength(0);
    expect(tables.financial_contributions[0].state).toBe('COMPLETED');
    expect(tables.financial_transactions.filter((t) => t.contribution_id === ORIGINAL_ID)).toEqual([
      expect.objectContaining({ id: 6, provider_reference: 'pay_Td1Zs77xOJPVno', outcome: 'SUCCEEDED' }),
    ]);
    expect(tables.receipts.filter((r) => r.contribution_id === ORIGINAL_ID)).toEqual([
      expect.objectContaining({ receipt_number: 'BCC-RCP-202609-000008' }),
    ]);
    expect(tables.financial_refunds).toHaveLength(0);
    expect(annotations(tables)).toHaveLength(1);
  });

  it('the listener resolves the correction from the event contributionId and records it ONLY', async () => {
    const { tables, s, correctionContributionId } = await paidCorrection();

    const received = tables.membership_audit_log.filter((r) => r.event_type === 'SETTLEMENT_CORRECTION_PAYMENT_RECEIVED');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ membership_id: MEMBERSHIP_ID, actor_type: 'SYSTEM' });
    expect(JSON.parse(String(received[0].new_value))).toEqual({
      correctionContributionId, originalContributionId: ORIGINAL_ID, contributionState: 'COMPLETED',
    });
    expect(tables.membership_audit_log.some((r) => r.event_type === 'PAYMENT_RECEIVED')).toBe(false);
    expect(membershipRowWrites()).toHaveLength(0);
    expect(tables.memberships[0]).toMatchObject({
      lifecycle_state: 'ACTIVE', membership_number: 'BCC20260900066',
      activated_at: '2026-09-18 05:50:39', expires_at: '2027-09-18 05:50:39',
    });
    expect(s.numbering.assignPermanentNumber).not.toHaveBeenCalled();
    expect(s.communication.dispatch).not.toHaveBeenCalled();
  });
});

describe('correction payment failure', () => {
  it('SETTLEMENT_FAILED for a correction is recorded only: membership and originals unchanged, no throw', async () => {
    const tables = world();
    const s = services();
    const listener = new MembershipFinancialListener(s.bus, s.lifecycle, renewalFor(s));
    listener.onModuleInit();
    const { correctionContributionId } = await s.lifecycle.createSettlementCorrectionContribution(
      MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN,
    );
    correction(tables)!.state = 'FAILED';

    s.bus.emit(FINANCIAL_EVENT_TYPES.SETTLEMENT_FAILED, {
      eventType: FINANCIAL_EVENT_TYPES.SETTLEMENT_FAILED, contributionId: correctionContributionId,
      businessModule: 'MEMBERSHIP', businessReferenceId: MEMBERSHIP_ID, amountPaise: FEE, currency: 'INR',
      contributionState: 'FAILED', occurredAt: new Date(),
    });
    await flush();

    const failed = tables.membership_audit_log.filter((r) => r.event_type === 'SETTLEMENT_CORRECTION_PAYMENT_FAILED');
    expect(failed).toHaveLength(1);
    expect(JSON.parse(String(failed[0].new_value))).toMatchObject({ correctionContributionId, originalContributionId: ORIGINAL_ID });
    expect(tables.membership_audit_log.some((r) => r.event_type === 'PAYMENT_FAILED')).toBe(false);
    expect(membershipRowWrites()).toHaveLength(0);
    expect(originalWrites()).toHaveLength(0);
    expect(s.communication.dispatch).not.toHaveBeenCalled();
  });

  it('recordPaymentFailure() for a correction contribution resolves without touching the membership', async () => {
    const tables = world();
    const s = services();
    const { correctionContributionId } = await s.lifecycle.createSettlementCorrectionContribution(
      MEMBERSHIP_ID, ORIGINAL_ID, REASON, 1, ADMIN,
    );
    await expect(s.lifecycle.recordPaymentFailure(MEMBERSHIP_ID, FEE, undefined, correctionContributionId)).resolves.toBeUndefined();
    expect(membershipRowWrites()).toHaveLength(0);
    expect(tables.memberships[0].lifecycle_state).toBe('ACTIVE');
  });
});

describe('non-correction payments keep the existing behaviour', () => {
  it('the application contribution of a PENDING membership still runs the normal PAYMENT_RECEIVED path', async () => {
    const tables = world({ membership: { lifecycle_state: 'PENDING', membership_number: null } });
    const s = services();
    await s.lifecycle.recordPaymentReceived(MEMBERSHIP_ID, ORIGINAL_ID);

    expect(tables.membership_audit_log.map((r) => r.event_type)).toEqual(['PAYMENT_RECEIVED']);
    expect(s.communication.dispatch).toHaveBeenCalled();
  });

  it('no contributionId (admin payment-failure route) keeps the PENDING-only failure path', async () => {
    const tables = world({ membership: { lifecycle_state: 'PENDING', membership_number: null } });
    await services().lifecycle.recordPaymentFailure(MEMBERSHIP_ID);
    expect(tables.membership_audit_log.map((r) => r.event_type)).toEqual(['PAYMENT_FAILED']);
    expect(tables.memberships[0].last_payment_status).toBe('FAILED');
  });

  it('a non-correction contribution against an ACTIVE individual is still refused (branch is not broadened)', async () => {
    const tables = world();
    await expect(services().lifecycle.recordPaymentReceived(MEMBERSHIP_ID, ORIGINAL_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(tables.membership_audit_log).toHaveLength(0);
  });

  it("another membership's correction contribution is not treated as this membership's correction", async () => {
    const tables = world();
    tables.financial_contributions.push({
      id: 777, business_module: 'MEMBERSHIP', business_reference_id: 106, state: 'COMPLETED',
      idempotency_key: 'MEMBERSHIP-106-CORRECTION-12',
    });
    await expect(services().lifecycle.recordPaymentReceived(MEMBERSHIP_ID, 777)).rejects.toBeInstanceOf(ConflictException);
    expect(tables.membership_audit_log).toHaveLength(0);
  });
});
