// backend/src/modules/financial/provider-reconciliation-refund.spec.ts
//
// Provider-verified settlement reconciliation, unified refund completion
// (webhook + provider re-check + synchronous answer) and the merchandise
// admin refund route.
//
// The REAL FinancialContributionService, FinancialAuditService,
// RazorpayWebhookService, FinancialEventBus, MerchandiseOrderService and
// MerchandiseFinancialListener run against the recording FakeDb
// (test-support/fake-db.ts) backed by an in-memory table store, so state
// actually moves between calls. Only the Settlement Provider is mocked.
//
// FakeDb has no row locking, so true concurrent races are not simulated
// here; concurrency safety comes from reusing recordSettlementOutcome()'s
// FOR UPDATE + (contribution_id, provider_reference) short-circuit, which
// is asserted statically below, plus sequential duplicate-request tests.

jest.mock('../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../test-support/fake-db');
  return { db: new FakeDb() };
});

import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../../database/db';
import type { FakeDb, FakeOp } from '../../test-support/fake-db';
import { FinancialAuditService } from './audit/financial-audit.service';
import type { AuditContext } from './audit/financial-audit.types';
import { FinancialContributionService, providerPaymentMismatch } from './financial-contribution.service';
import { FinancialEventBus } from './financial-event-bus.service';
import { FINANCIAL_EVENT_TYPES } from './financial.events';
import { RazorpayWebhookService, resolveRefundEvent } from './razorpay-webhook.service';
import type { ProviderPaymentSnapshot, SettlementProvider } from './settlement-provider.interface';
import { ReconcileProviderSettlementDto } from './dto/reconcile-provider-settlement.dto';
import { MerchandiseOrderService } from '../merchandise/merchandise-order.service';
import { MerchandiseFinancialListener } from '../merchandise/financial/merchandise-financial.listener';
import { RefundOrderDto } from '../merchandise/dto/refund-order.dto';

const fake = db as unknown as FakeDb;
const WEBHOOK_SECRET = 'whsec_test_only';
const ORIGINAL_ENV = process.env;

const ADMIN: AuditContext = { actorType: 'ADMIN', provenance: { actorUserId: 1, requestId: 'req-admin', route: '/test' } };
const REASON = 'Captured at Razorpay; settlement webhook never received (live webhook not yet configured)';

const C15 = 15;
const ORDER_REF = 'order_TfXLc0jngBp5Ov';
const PAY = 'pay_TfXMUcGMyRqRQh';
const C19 = 19;
const PAY19 = 'pay_TgztvPbwfCKYep';
const RFND = 'rfnd_TiE7huCUUcJfWa';

type Row = Record<string, unknown>;
const TS = { created_at: '2026-09-23 16:01:32', updated_at: '2026-09-23 16:01:32' };
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
  fake.responder = (op: FakeOp) => {
    const rows = (tables[op.table] ??= []);
    if (op.kind === 'select') return rows.filter((r) => matches(r, op)).map((r) => ({ ...r }));
    if (op.kind === 'insert') {
      nextId[op.table] ??= 5000;
      const id = (op.values!.id as number | undefined) ?? nextId[op.table]++;
      rows.push({ ...op.values, id });
      return { insertId: BigInt(id) };
    }
    if (op.kind === 'update') {
      const hit = rows.filter((r) => matches(r, op));
      if (typeof op.set === 'object') hit.forEach((r) => Object.assign(r, op.set));
      return { numUpdatedRows: BigInt(hit.length) };
    }
    return undefined;
  };
}

interface WorldOpts {
  c15?: Row;
  c19?: Row;
  transactions?: Row[];
  refunds?: Row[];
  orders?: Row[];
}

function world(o: WorldOpts = {}): Tables {
  const tables: Tables = {
    financial_contributions: [
      {
        id: C15, uuid: 'c-15', payer_user_id: 1, business_module: 'MERCHANDISE_ORDER', business_reference_id: 2,
        purpose: 'BCC Merchandise Order #2', amount_paise: 1000, currency: 'INR', state: 'SETTLEMENT_IN_PROGRESS',
        idempotency_key: 'merch-order-2', active_settlement_reference: ORDER_REF, active_settlement_url: null, ...o.c15,
      },
      {
        id: C19, uuid: 'c-19', payer_user_id: 1, business_module: 'MERCHANDISE_ORDER', business_reference_id: 6,
        purpose: 'BCC Merchandise Order #6', amount_paise: 1000, currency: 'INR', state: 'COMPLETED',
        idempotency_key: 'merch-order-6', active_settlement_reference: null, active_settlement_url: null, ...o.c19,
      },
    ],
    financial_transactions: o.transactions ?? [{
      id: 10, contribution_id: C19, provider: 'RAZORPAY', provider_reference: PAY19,
      amount_paise: 1000, currency: 'INR', outcome: 'SUCCEEDED',
    }],
    receipts: [{ id: 8, contribution_id: C19, receipt_number: 'BCC-RCP-202609-000019', amount_paise: 1000 }],
    financial_refunds: o.refunds ?? [],
    settlement_webhook_inbox: [],
    financial_audit_log: [],
    financial_event_outbox: [],
    merchandise_orders: o.orders ?? [
      { id: 2, user_id: 1, status: 'PENDING_PAYMENT', fulfilment_status: 'PENDING', financial_contribution_id: C15, coupon_id: 1, total_paise: 1000, ...TS },
      { id: 6, user_id: 1, status: 'PAID', fulfilment_status: 'PENDING', financial_contribution_id: C19, coupon_id: 4, total_paise: 1000, ...TS },
    ],
    merchandise_order_items: [],
    merchandise_products: [{ id: 1, stock_quantity: null }],
    merchandise_coupon_redemptions: [
      { id: 2, coupon_id: 1, order_id: 2, user_id: 1, status: 'PENDING' },
      { id: 6, coupon_id: 4, order_id: 6, user_id: 1, status: 'CONFIRMED' },
    ],
  };
  installStore(tables);
  return tables;
}

function capturedPayment(overrides: Partial<ProviderPaymentSnapshot> = {}): ProviderPaymentSnapshot {
  return {
    id: PAY, orderId: ORDER_REF, status: 'captured', amountPaise: 1000, currency: 'INR', method: 'upi',
    captured: true, errorCode: null, createdAt: 1790179320, amountRefundedPaise: 0, refundStatus: null,
    ...overrides,
  };
}

function mockProvider(): jest.Mocked<Required<SettlementProvider>> {
  return {
    providerName: 'RAZORPAY',
    createOrder: jest.fn(),
    refund: jest.fn().mockResolvedValue({ providerRefundReference: 'rfnd_NEW00000000001', status: 'PROCESSING' }),
    createPaymentLink: jest.fn(),
    cancelPaymentLink: jest.fn(),
    getPublicKeyId: jest.fn(),
    fetchOrder: jest.fn(),
    fetchPayment: jest.fn().mockResolvedValue(capturedPayment()),
    fetchRefund: jest.fn(),
  } as unknown as jest.Mocked<Required<SettlementProvider>>;
}

function services() {
  const bus = new FinancialEventBus();
  const provider = mockProvider();
  const financial = new FinancialContributionService(bus, provider, new FinancialAuditService());
  const webhook = new RazorpayWebhookService(financial);
  const orders = new MerchandiseOrderService(financial);
  new MerchandiseFinancialListener(bus, orders).onModuleInit();
  const emitted: string[] = [];
  for (const type of Object.values(FINANCIAL_EVENT_TYPES)) bus.on(type, () => emitted.push(type));
  return { bus, provider, financial, webhook, orders, emitted };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

function writesTo(table: string, kind?: FakeOp['kind']): FakeOp[] {
  return [...fake.committed, ...fake.rolledBack].filter((op) => op.table === table && (!kind || op.kind === kind));
}

function audits(tables: Tables, eventType: string): Row[] {
  return tables.financial_audit_log.filter((r) => r.event_type === eventType);
}

function contribution(tables: Tables, id: number): Row {
  return tables.financial_contributions.find((c) => c.id === id)!;
}

function sign(raw: Buffer): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
}

async function deliver(webhook: RazorpayWebhookService, eventId: string, event: Record<string, unknown>) {
  const rawBody = Buffer.from(JSON.stringify(event));
  await webhook.handle({ rawBody, signature: sign(rawBody), eventId });
}

function refundEvent(type: string, entity: Record<string, unknown>) {
  return {
    event: type,
    account_id: 'acc_TB6rt1Y9pstHJK',
    payload: { refund: { entity: { id: RFND, payment_id: PAY19, amount: 1000, currency: 'INR', status: 'processed', ...entity } } },
  };
}

function processingRefund(overrides: Row = {}): Row {
  return {
    id: 2, contribution_id: C19, amount_paise: 1000, currency: 'INR', provider: 'RAZORPAY',
    provider_reference: RFND, status: 'PROCESSING', reason: 'test', failure_reason: null,
    requested_by_user_id: 1, requested_by_type: 'HUMAN', resolved_at: null, ...overrides,
  };
}

beforeEach(() => {
  fake.reset();
  process.env = { ...ORIGINAL_ENV, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Provider-verified settlement reconciliation
// ═══════════════════════════════════════════════════════════════════════════

describe('reconcileProviderSettlement() — captured payment', () => {
  it('records ONE RAZORPAY SUCCEEDED transaction, a receipt and COMPLETED through recordSettlementOutcome()', async () => {
    const tables = world();
    const { financial, provider, emitted } = services();

    const result = await financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN);
    await flush();

    expect(provider.fetchPayment).toHaveBeenCalledWith(PAY);
    const txns = tables.financial_transactions.filter((t) => t.contribution_id === C15);
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ provider: 'RAZORPAY', provider_reference: PAY, amount_paise: 1000, outcome: 'SUCCEEDED' });
    expect(tables.receipts.filter((r) => r.contribution_id === C15)).toHaveLength(1);
    expect(contribution(tables, C15)).toMatchObject({ state: 'COMPLETED', active_settlement_reference: null });
    expect(result).toMatchObject({
      contributionId: C15, contributionState: 'COMPLETED', alreadyRecorded: false,
      provider: { paymentId: PAY, orderId: ORDER_REF, status: 'captured', amountPaise: 1000, method: 'upi' },
    });
    expect(result.receiptNumber).toMatch(/^BCC-RCP-\d{6}-000015$/);
    expect(emitted).toEqual(expect.arrayContaining([
      FINANCIAL_EVENT_TYPES.SETTLEMENT_COMPLETED, FINANCIAL_EVENT_TYPES.RECEIPT_GENERATED, FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
    ]));
  });

  it('writes one ADMIN SETTLEMENT_OUTCOME_RECORDED audit row with reconciliation metadata and provider refs', async () => {
    const tables = world();
    const { financial } = services();

    await financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN);

    const rows = audits(tables, 'SETTLEMENT_OUTCOME_RECORDED');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      contribution_id: C15, actor_type: 'ADMIN', actor_user_id: 1, request_id: 'req-admin',
      provider_order_ref: ORDER_REF, provider_payment_ref: PAY,
      previous_state: 'SETTLEMENT_IN_PROGRESS', resulting_state: 'COMPLETED',
    });
    expect(JSON.parse(String(rows[0].metadata_json))).toMatchObject({
      settlementSource: 'PROVIDER_RECONCILIATION', reconciliationReason: REASON,
    });
  });

  it('the merchandise order becomes PAID and its coupon use CONFIRMED via the existing listener', async () => {
    const tables = world();
    const { financial } = services();

    await financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN);
    await flush();

    expect(tables.merchandise_orders.find((o) => o.id === 2)!.status).toBe('PAID');
    expect(tables.merchandise_coupon_redemptions.find((r) => r.id === 2)!.status).toBe('CONFIRMED');
  });

  it('never touches order 6 / c19, its transaction or its receipt', async () => {
    const tables = world();
    const { financial } = services();
    const before = JSON.stringify([contribution(tables, C19), tables.financial_transactions[0], tables.receipts[0]]);

    await financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN);

    expect(JSON.stringify([contribution(tables, C19), tables.financial_transactions[0], tables.receipts[0]])).toBe(before);
    expect(writesTo('financial_transactions', 'update')).toHaveLength(0);
    expect(writesTo('receipts', 'update')).toHaveLength(0);
  });
});

describe('reconcileProviderSettlement() — refusals (no write before every check passes)', () => {
  const cases: Array<[string, Partial<ProviderPaymentSnapshot>, RegExp]> = [
    ['wrong payment id returned', { id: 'pay_AAAAAAAAAAAAAA' }, /provider returned payment/],
    ['wrong Razorpay order', { orderId: 'order_OTHER0000000000' }, /belongs to order/],
    ['wrong amount', { amountPaise: 999 }, /amount 999 paise/],
    ['wrong currency', { currency: 'USD' }, /currency 'USD'/],
    ['authorized only', { status: 'authorized', captured: false }, /not captured/],
    ['failed payment', { status: 'failed', captured: false }, /not captured/],
    ['captured=false', { captured: false }, /not captured/],
    ['provider-side refund already present', { amountRefundedPaise: 1000, refundStatus: 'full' }, /provider-side refund/],
    ['provider status refunded', { status: 'refunded' }, /provider-side refund/],
  ];

  it.each(cases)('%s → 409, contribution unchanged, nothing written', async (_label, override, message) => {
    const tables = world();
    const { financial, provider } = services();
    provider.fetchPayment.mockResolvedValue(capturedPayment(override));

    await expect(financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN)).rejects.toThrow(message);

    expect(contribution(tables, C15).state).toBe('SETTLEMENT_IN_PROGRESS');
    expect(writesTo('financial_transactions')).toHaveLength(0);
    expect(writesTo('receipts')).toHaveLength(0);
    expect(writesTo('financial_audit_log')).toHaveLength(0);
  });

  it('provider does not know the payment → 404, nothing written', async () => {
    world();
    const { financial, provider } = services();
    provider.fetchPayment.mockRejectedValue(Object.assign(new Error('The id provided does not exist'), { statusCode: 400 }));

    await expect(financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN)).rejects.toThrow(NotFoundException);
    expect(writesTo('financial_transactions')).toHaveLength(0);
  });

  it('provider failure → 502, contribution still SETTLEMENT_IN_PROGRESS, no audit row', async () => {
    const tables = world();
    const { financial, provider } = services();
    provider.fetchPayment.mockRejectedValue(Object.assign(new Error('ETIMEDOUT'), { statusCode: 503 }));

    await expect(financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN)).rejects.toThrow(BadGatewayException);
    expect(contribution(tables, C15).state).toBe('SETTLEMENT_IN_PROGRESS');
    expect(writesTo('financial_audit_log')).toHaveLength(0);
  });

  it('unknown contribution → 404 without a provider call', async () => {
    world();
    const { financial, provider } = services();
    await expect(financial.reconcileProviderSettlement(999, PAY, REASON, ADMIN)).rejects.toThrow(NotFoundException);
    expect(provider.fetchPayment).not.toHaveBeenCalled();
  });

  it('payment-link attempt (plink_ reference) is rejected without a provider call', async () => {
    world({ c15: { active_settlement_reference: 'plink_TkATVrTdc6azAL' } });
    const { financial, provider } = services();
    await expect(financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN)).rejects.toThrow(/not a provider order/);
    expect(provider.fetchPayment).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'FAILED', 'AWAITING_SETTLEMENT', 'CANCELLED'])(
    'contribution in %s (with a different payment) → 409 without a provider call',
    async (state) => {
      world({ c15: { state } });
      const { financial, provider } = services();
      await expect(financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN)).rejects.toThrow(ConflictException);
      expect(provider.fetchPayment).not.toHaveBeenCalled();
    },
  );

  it('a contradictory SUCCEEDED transaction already on the contribution → 409', async () => {
    world({ transactions: [{ id: 77, contribution_id: C15, provider: 'RAZORPAY', provider_reference: 'pay_OTHER000000000', outcome: 'SUCCEEDED' }] });
    const { financial, provider } = services();
    await expect(financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN)).rejects.toThrow(/already has a SUCCEEDED/);
    expect(provider.fetchPayment).not.toHaveBeenCalled();
  });

  it('blank reason → 400', async () => {
    world();
    const { financial } = services();
    await expect(financial.reconcileProviderSettlement(C15, PAY, '   ', ADMIN)).rejects.toThrow(BadRequestException);
  });
});

describe('reconcileProviderSettlement() — idempotency', () => {
  it('a duplicate request for the same payment returns alreadyRecorded without contacting the provider', async () => {
    const tables = world();
    const { financial, provider } = services();

    await financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN);
    provider.fetchPayment.mockClear();
    const again = await financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN);

    expect(again).toMatchObject({ alreadyRecorded: true, contributionState: 'COMPLETED', provider: null });
    expect(provider.fetchPayment).not.toHaveBeenCalled();
    expect(tables.financial_transactions.filter((t) => t.contribution_id === C15)).toHaveLength(1);
    expect(tables.receipts.filter((r) => r.contribution_id === C15)).toHaveLength(1);
    expect(audits(tables, 'SETTLEMENT_OUTCOME_RECORDED')).toHaveLength(1);
  });

  it('a payment already recorded as FAILED on this contribution → 409', async () => {
    world({ transactions: [{ id: 78, contribution_id: C15, provider: 'RAZORPAY', provider_reference: PAY, outcome: 'FAILED' }] });
    const { financial } = services();
    await expect(financial.reconcileProviderSettlement(C15, PAY, REASON, ADMIN)).rejects.toThrow(/as 'FAILED'/);
  });
});

describe('providerPaymentMismatch() (pure)', () => {
  const expected = { paymentReference: PAY, orderReference: ORDER_REF, amountPaise: 1000, currency: 'INR' };
  it('accepts the exact captured, unrefunded, full-amount payment of the order', () => {
    expect(providerPaymentMismatch(capturedPayment(), expected)).toBeNull();
  });
  it('accepts lower-case currency from the provider', () => {
    expect(providerPaymentMismatch(capturedPayment({ currency: 'inr' }), expected)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. recordRefundOutcome() — the single terminal refund path
// ═══════════════════════════════════════════════════════════════════════════

describe('recordRefundOutcome()', () => {
  it('PROCESSING → COMPLETED: refund COMPLETED, contribution REFUNDED, one CONTRIBUTION_REFUNDED, one audit row', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial, emitted } = services();

    const r = await financial.recordRefundOutcome(2, { result: 'COMPLETED', providerRefundReference: RFND }, { ...ADMIN, metadata: { refundOutcomeSource: 'PROVIDER_RECHECK' } });
    await flush();

    expect(r).toMatchObject({ refundStatus: 'COMPLETED', contributionState: 'REFUNDED', changed: true });
    expect(tables.financial_refunds[0]).toMatchObject({ status: 'COMPLETED', provider_reference: RFND });
    expect(tables.financial_refunds[0].resolved_at).toBeTruthy();
    expect(contribution(tables, C19).state).toBe('REFUNDED');
    expect(emitted.filter((e) => e === FINANCIAL_EVENT_TYPES.CONTRIBUTION_REFUNDED)).toHaveLength(1);
    const rows = audits(tables, 'REFUND_OUTCOME_RECORDED');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ refund_id: 2, contribution_id: C19, actor_type: 'ADMIN', previous_state: 'COMPLETED', resulting_state: 'REFUNDED' });
    expect(JSON.parse(String(rows[0].metadata_json)).refundOutcomeSource).toBe('PROVIDER_RECHECK');
  });

  it('the original Financial Transaction and receipt are never modified', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial } = services();
    const before = JSON.stringify([tables.financial_transactions, tables.receipts]);

    await financial.recordRefundOutcome(2, { result: 'COMPLETED', providerRefundReference: RFND }, ADMIN);

    expect(JSON.stringify([tables.financial_transactions, tables.receipts])).toBe(before);
    expect(writesTo('financial_transactions')).toHaveLength(0);
    expect(writesTo('receipts')).toHaveLength(0);
  });

  it('PROCESSING → FAILED: refund FAILED with reason, contribution stays COMPLETED, no business event', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial, emitted } = services();

    const r = await financial.recordRefundOutcome(2, { result: 'FAILED', providerRefundReference: RFND, failureReason: 'bank rejected' }, ADMIN);
    await flush();

    expect(r).toMatchObject({ refundStatus: 'FAILED', contributionState: 'COMPLETED', changed: true });
    expect(tables.financial_refunds[0]).toMatchObject({ status: 'FAILED', failure_reason: 'bank rejected' });
    expect(tables.financial_refunds[0].resolved_at).toBeTruthy();
    expect(contribution(tables, C19).state).toBe('COMPLETED');
    expect(emitted).not.toContain(FINANCIAL_EVENT_TYPES.CONTRIBUTION_REFUNDED);
    expect(audits(tables, 'REFUND_OUTCOME_RECORDED')).toHaveLength(1);
  });

  it('the same terminal outcome twice is idempotent: no second write, audit or event', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial, emitted } = services();

    await financial.recordRefundOutcome(2, { result: 'COMPLETED', providerRefundReference: RFND }, ADMIN);
    await flush();
    const writesBefore = fake.committed.length;
    const again = await financial.recordRefundOutcome(2, { result: 'COMPLETED', providerRefundReference: RFND }, ADMIN);
    await flush();

    expect(again.changed).toBe(false);
    expect(fake.committed.filter((op) => op.kind !== 'select')).toHaveLength(
      fake.committed.slice(0, writesBefore).filter((op) => op.kind !== 'select').length,
    );
    expect(audits(tables, 'REFUND_OUTCOME_RECORDED')).toHaveLength(1);
    expect(emitted.filter((e) => e === FINANCIAL_EVENT_TYPES.CONTRIBUTION_REFUNDED)).toHaveLength(1);
  });

  it('a contradictory terminal outcome is rejected and changes nothing', async () => {
    const tables = world({ refunds: [processingRefund({ status: 'COMPLETED' })], c19: { state: 'REFUNDED' } });
    const { financial } = services();

    await expect(financial.recordRefundOutcome(2, { result: 'FAILED', providerRefundReference: RFND }, ADMIN))
      .rejects.toThrow(ConflictException);
    expect(tables.financial_refunds[0].status).toBe('COMPLETED');
    expect(writesTo('financial_refunds', 'update')).toHaveLength(0);
  });

  it('a provider refund id different from the recorded one is rejected', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial } = services();

    await expect(financial.recordRefundOutcome(2, { result: 'COMPLETED', providerRefundReference: 'rfnd_DIFFERENT00001' }, ADMIN))
      .rejects.toThrow(/recorded against provider refund/);
    expect(tables.financial_refunds[0].status).toBe('PROCESSING');
    expect(contribution(tables, C19).state).toBe('COMPLETED');
  });

  it('a NULL provider_reference is established by the first verified outcome', async () => {
    const tables = world({ refunds: [processingRefund({ provider_reference: null, provider: null, status: 'REQUESTED' })] });
    const { financial } = services();

    await financial.recordRefundOutcome(2, { result: 'COMPLETED', providerRefundReference: RFND }, ADMIN);

    expect(tables.financial_refunds[0]).toMatchObject({ status: 'COMPLETED', provider: 'RAZORPAY', provider_reference: RFND });
  });
});

describe('requestRefund() — terminal outcomes now go through recordRefundOutcome()', () => {
  it('a synchronous provider "COMPLETED" ends COMPLETED/REFUNDED exactly as before, plus a SYNC_RESPONSE audit row', async () => {
    const tables = world();
    const { financial, provider, emitted } = services();
    provider.refund.mockResolvedValue({ providerRefundReference: 'rfnd_SYNC000000001', status: 'COMPLETED' });

    const r = await financial.requestRefund(C19, 'sync', { actorType: 'HUMAN', actorUserId: 1 }, ADMIN);
    await flush();

    expect(r).toEqual({ refundId: expect.any(Number), status: 'COMPLETED', alreadyRequested: false });
    expect(tables.financial_refunds[0]).toMatchObject({ status: 'COMPLETED', provider: 'RAZORPAY', provider_reference: 'rfnd_SYNC000000001' });
    expect(contribution(tables, C19).state).toBe('REFUNDED');
    expect(emitted.filter((e) => e === FINANCIAL_EVENT_TYPES.CONTRIBUTION_REFUNDED)).toHaveLength(1);
    const outcome = audits(tables, 'REFUND_OUTCOME_RECORDED');
    expect(outcome).toHaveLength(1);
    expect(JSON.parse(String(outcome[0].metadata_json)).refundOutcomeSource).toBe('SYNC_RESPONSE');
  });

  it('a pending provider answer leaves the refund PROCESSING and the contribution COMPLETED (no outcome row)', async () => {
    const tables = world();
    const { financial } = services();

    const r = await financial.requestRefund(C19, 'pending', { actorType: 'HUMAN', actorUserId: 1 }, ADMIN);

    expect(r.status).toBe('PROCESSING');
    expect(tables.financial_refunds[0]).toMatchObject({ status: 'PROCESSING', provider_reference: 'rfnd_NEW00000000001' });
    expect(contribution(tables, C19).state).toBe('COMPLETED');
    expect(audits(tables, 'REFUND_OUTCOME_RECORDED')).toHaveLength(0);
  });

  it('a provider error is recorded FAILED through the same path (no provider reference)', async () => {
    const tables = world();
    const { financial, provider } = services();
    provider.refund.mockRejectedValue(new Error('BAD_REQUEST_ERROR'));

    const r = await financial.requestRefund(C19, 'err', { actorType: 'HUMAN', actorUserId: 1 }, ADMIN);

    expect(r.status).toBe('FAILED');
    expect(tables.financial_refunds[0]).toMatchObject({ status: 'FAILED', failure_reason: 'BAD_REQUEST_ERROR' });
    expect(tables.financial_refunds[0].provider_reference ?? null).toBeNull();
    expect(contribution(tables, C19).state).toBe('COMPLETED');
    expect(audits(tables, 'REFUND_OUTCOME_RECORDED')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Refund webhooks
// ═══════════════════════════════════════════════════════════════════════════

describe('Razorpay refund webhooks', () => {
  it('refund.processed matched by refund id → COMPLETED/REFUNDED; inbox PROCESSED with contribution', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { webhook } = services();

    await deliver(webhook, 'evt_rp_1', refundEvent('refund.processed', {}));

    expect(tables.financial_refunds[0].status).toBe('COMPLETED');
    expect(contribution(tables, C19).state).toBe('REFUNDED');
    expect(tables.settlement_webhook_inbox[0]).toMatchObject({ status: 'PROCESSED', contribution_id: C19 });
    const row = audits(tables, 'REFUND_OUTCOME_RECORDED')[0];
    expect(row).toMatchObject({ actor_type: 'WEBHOOK', webhook_inbox_id: tables.settlement_webhook_inbox[0].id });
    expect(JSON.parse(String(row.metadata_json)).refundOutcomeSource).toBe('WEBHOOK');
  });

  it('refund.failed → FAILED, contribution stays COMPLETED', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { webhook } = services();

    await deliver(webhook, 'evt_rf_1', refundEvent('refund.failed', { status: 'failed' }));

    expect(tables.financial_refunds[0].status).toBe('FAILED');
    expect(contribution(tables, C19).state).toBe('COMPLETED');
  });

  it('webhook before provider_reference is stored: matched via payment id → transaction → refund; reference set', async () => {
    const tables = world({ refunds: [processingRefund({ provider_reference: null, provider: null, status: 'REQUESTED' })] });
    const { webhook } = services();

    await deliver(webhook, 'evt_rp_2', refundEvent('refund.processed', {}));

    expect(tables.financial_refunds[0]).toMatchObject({ status: 'COMPLETED', provider_reference: RFND });
    expect(contribution(tables, C19).state).toBe('REFUNDED');
  });

  it('a duplicate delivery of the same event is a no-op', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { webhook, emitted } = services();

    await deliver(webhook, 'evt_dup', refundEvent('refund.processed', {}));
    await deliver(webhook, 'evt_dup', refundEvent('refund.processed', {}));
    await flush();

    expect(audits(tables, 'REFUND_OUTCOME_RECORDED')).toHaveLength(1);
    expect(emitted.filter((e) => e === FINANCIAL_EVENT_TYPES.CONTRIBUTION_REFUNDED)).toHaveLength(1);
  });

  it('a second, distinct refund.processed for an already-completed refund changes nothing', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { webhook } = services();

    await deliver(webhook, 'evt_a', refundEvent('refund.processed', {}));
    await deliver(webhook, 'evt_b', refundEvent('refund.processed', {}));

    expect(audits(tables, 'REFUND_OUTCOME_RECORDED')).toHaveLength(1);
    expect(tables.settlement_webhook_inbox.map((r) => r.status)).toEqual(['PROCESSED', 'PROCESSED']);
  });

  it('an unknown refund (no platform refund) is recorded FAILED in the inbox and creates nothing', async () => {
    const tables = world();
    const { webhook } = services();

    await deliver(webhook, 'evt_unknown', refundEvent('refund.processed', { id: 'rfnd_DASHBOARD00001', payment_id: 'pay_UNKNOWN0000000' }));

    expect(tables.settlement_webhook_inbox[0].status).toBe('FAILED');
    expect(String(tables.settlement_webhook_inbox[0].processing_error)).toMatch(/not created automatically/);
    expect(writesTo('financial_refunds')).toHaveLength(0);
    expect(contribution(tables, C19).state).toBe('COMPLETED');
  });

  it('amount mismatch → inbox FAILED, no financial change', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { webhook } = services();

    await deliver(webhook, 'evt_amt', refundEvent('refund.processed', { amount: 500 }));

    expect(tables.settlement_webhook_inbox[0].status).toBe('FAILED');
    expect(tables.financial_refunds[0].status).toBe('PROCESSING');
    expect(contribution(tables, C19).state).toBe('COMPLETED');
  });

  it('currency mismatch → inbox FAILED, no financial change', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { webhook } = services();

    await deliver(webhook, 'evt_cur', refundEvent('refund.processed', { currency: 'USD' }));

    expect(tables.settlement_webhook_inbox[0].status).toBe('FAILED');
    expect(tables.financial_refunds[0].status).toBe('PROCESSING');
  });

  it('a contradictory refund.failed after COMPLETED is a recorded diagnostic, not a state change or a retry trigger', async () => {
    const tables = world({ refunds: [processingRefund({ status: 'COMPLETED' })], c19: { state: 'REFUNDED' } });
    const { webhook } = services();

    await expect(deliver(webhook, 'evt_contra', refundEvent('refund.failed', { status: 'failed' }))).resolves.toBeUndefined();

    expect(tables.settlement_webhook_inbox[0].status).toBe('FAILED');
    expect(tables.financial_refunds[0].status).toBe('COMPLETED');
  });

  it('refund.created stays acknowledged and non-terminal', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { webhook } = services();

    await deliver(webhook, 'evt_created', refundEvent('refund.created', {}));

    expect(tables.settlement_webhook_inbox[0]).toMatchObject({ status: 'PROCESSED' });
    expect(tables.financial_refunds[0].status).toBe('PROCESSING');
    expect(audits(tables, 'REFUND_OUTCOME_RECORDED')).toHaveLength(0);
  });

  it('resolveRefundEvent() rejects a payload without a refund id', () => {
    expect(resolveRefundEvent('refund.processed', { payload: {} })).toMatch(/missing refund id/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Refund provider re-check
// ═══════════════════════════════════════════════════════════════════════════

describe('recheckRefund()', () => {
  const snapshot = (status: string) => ({ id: RFND, paymentId: PAY19, amountPaise: 1000, currency: 'INR', status, createdAt: 1 });

  it('processed → COMPLETED/REFUNDED with a PROVIDER_RECHECK audit row', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial, provider } = services();
    provider.fetchRefund.mockResolvedValue(snapshot('processed'));

    const r = await financial.recheckRefund(2, ADMIN);

    expect(provider.fetchRefund).toHaveBeenCalledWith(RFND);
    expect(r).toMatchObject({ refundStatus: 'COMPLETED', contributionState: 'REFUNDED', changed: true, providerStatus: 'processed' });
    const row = audits(tables, 'REFUND_OUTCOME_RECORDED')[0];
    expect(row.actor_type).toBe('ADMIN');
    expect(JSON.parse(String(row.metadata_json)).refundOutcomeSource).toBe('PROVIDER_RECHECK');
  });

  it('failed → FAILED', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial, provider } = services();
    provider.fetchRefund.mockResolvedValue(snapshot('failed'));

    const r = await financial.recheckRefund(2, ADMIN);
    expect(r).toMatchObject({ refundStatus: 'FAILED', contributionState: 'COMPLETED', changed: true });
    expect(tables.financial_refunds[0].status).toBe('FAILED');
  });

  it('pending → nothing changes', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial, provider } = services();
    provider.fetchRefund.mockResolvedValue(snapshot('pending'));

    const r = await financial.recheckRefund(2, ADMIN);
    expect(r).toMatchObject({ refundStatus: 'PROCESSING', changed: false, providerStatus: 'pending' });
    expect(writesTo('financial_refunds', 'update')).toHaveLength(0);
    expect(writesTo('financial_audit_log')).toHaveLength(0);
  });

  it('provider error → 502, nothing changes', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial, provider } = services();
    provider.fetchRefund.mockRejectedValue(new Error('timeout'));

    await expect(financial.recheckRefund(2, ADMIN)).rejects.toThrow(BadGatewayException);
    expect(tables.financial_refunds[0].status).toBe('PROCESSING');
  });

  it.each(['COMPLETED', 'FAILED', 'REQUESTED'])('a %s refund is not re-checkable (409, no provider call)', async (status) => {
    world({ refunds: [processingRefund({ status })] });
    const { financial, provider } = services();
    await expect(financial.recheckRefund(2, ADMIN)).rejects.toThrow(ConflictException);
    expect(provider.fetchRefund).not.toHaveBeenCalled();
  });

  it('unknown refund → 404', async () => {
    world();
    const { financial } = services();
    await expect(financial.recheckRefund(42, ADMIN)).rejects.toThrow(NotFoundException);
  });

  it('a provider amount that differs from the refund row → 409, nothing changes', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial, provider } = services();
    provider.fetchRefund.mockResolvedValue({ ...snapshot('processed'), amountPaise: 500 });
    await expect(financial.recheckRefund(2, ADMIN)).rejects.toThrow(ConflictException);
    expect(tables.financial_refunds[0].status).toBe('PROCESSING');
  });

  it('is idempotent: a re-check after completion is refused (409), the outcome stands', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial, provider } = services();
    provider.fetchRefund.mockResolvedValue(snapshot('processed'));

    await financial.recheckRefund(2, ADMIN);
    await expect(financial.recheckRefund(2, ADMIN)).rejects.toThrow(ConflictException);
    expect(audits(tables, 'REFUND_OUTCOME_RECORDED')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Merchandise admin refund
// ═══════════════════════════════════════════════════════════════════════════

describe('MerchandiseOrderService.requestOrderRefund()', () => {
  it('a PAID order awaiting fulfilment delegates to requestRefund(); the order stays PAID while PROCESSING', async () => {
    const tables = world();
    const { orders, financial, provider } = services();
    const spy = jest.spyOn(financial, 'requestRefund');

    const r = await orders.requestOrderRefund(6, 'Test purchase', 1, ADMIN);

    expect(spy).toHaveBeenCalledWith(C19, 'Merchandise order #6 refunded: Test purchase', { actorType: 'HUMAN', actorUserId: 1 }, ADMIN);
    expect(provider.refund).toHaveBeenCalledWith(expect.objectContaining({ providerPaymentReference: PAY19, amountPaise: 1000 }));
    expect(r).toMatchObject({ refundStatus: 'PROCESSING', alreadyRequested: false });
    expect(tables.merchandise_orders.find((o) => o.id === 6)!.status).toBe('PAID');
    // Merchandise itself never writes a financial table.
    expect(writesTo('financial_transactions')).toHaveLength(0);
  });

  it.each([
    ['PENDING_PAYMENT', 'PENDING'],
    ['CANCELLED', 'PENDING'],
    ['DRAFT', 'PENDING'],
    ['FULFILLED', 'READY_FOR_PICKUP'],
    ['COMPLETED', 'PICKED_UP'],
  ])('a %s order is not refundable here (409, no refund requested)', async (status, fulfilment) => {
    world({ orders: [{ id: 6, user_id: 1, status, fulfilment_status: fulfilment, financial_contribution_id: C19, coupon_id: null, ...TS }] });
    const { orders, provider } = services();
    await expect(orders.requestOrderRefund(6, 'Test purchase', 1, ADMIN)).rejects.toThrow(ConflictException);
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('an already REFUNDED order returns idempotently without a provider call', async () => {
    world({
      orders: [{ id: 6, user_id: 1, status: 'REFUNDED', fulfilment_status: 'PENDING', financial_contribution_id: C19, coupon_id: null, ...TS }],
      refunds: [processingRefund({ status: 'COMPLETED' })],
      c19: { state: 'REFUNDED' },
    });
    const { orders, provider } = services();

    const r = await orders.requestOrderRefund(6, 'Test purchase', 1, ADMIN);
    expect(r).toMatchObject({ refundId: 2, refundStatus: 'COMPLETED', alreadyRequested: true });
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('a duplicate request returns the existing refund without contacting the provider again', async () => {
    world();
    const { orders, provider } = services();

    await orders.requestOrderRefund(6, 'Test purchase', 1, ADMIN);
    const again = await orders.requestOrderRefund(6, 'Test purchase', 1, ADMIN);

    expect(again.alreadyRequested).toBe(true);
    expect(provider.refund).toHaveBeenCalledTimes(1);
  });

  it('a PAID order with no Financial Contribution link → 409', async () => {
    world({ orders: [{ id: 6, user_id: 1, status: 'PAID', fulfilment_status: 'PENDING', financial_contribution_id: null, coupon_id: null, ...TS }] });
    const { orders } = services();
    await expect(orders.requestOrderRefund(6, 'Test purchase', 1, ADMIN)).rejects.toThrow(/no linked Financial Contribution/);
  });

  it('a provider failure surfaces FAILED; the order stays PAID', async () => {
    const tables = world();
    const { orders, provider } = services();
    provider.refund.mockRejectedValue(new Error('gateway down'));

    const r = await orders.requestOrderRefund(6, 'Test purchase', 1, ADMIN);
    expect(r.refundStatus).toBe('FAILED');
    expect(tables.merchandise_orders.find((o) => o.id === 6)!.status).toBe('PAID');
  });

  it('a PROCESSING refund blocks pickup; a FAILED refund does not', async () => {
    world({ refunds: [processingRefund()] });
    const { orders } = services();
    await expect(orders.markReadyForPickup(6)).rejects.toThrow(/PROCESSING refund/);

    world({ refunds: [processingRefund({ status: 'FAILED' })] });
    await expect(orders.markReadyForPickup(6)).resolves.toBeDefined();
  });

  it('CONTRIBUTION_REFUNDED runs the existing handler: order REFUNDED, coupon use REFUNDED', async () => {
    const tables = world({ refunds: [processingRefund()] });
    const { financial } = services();

    await financial.recordRefundOutcome(2, { result: 'COMPLETED', providerRefundReference: RFND }, ADMIN);
    await flush();

    expect(tables.merchandise_orders.find((o) => o.id === 6)!.status).toBe('REFUNDED');
    expect(tables.merchandise_coupon_redemptions.find((r) => r.id === 6)!.status).toBe('REFUNDED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. DTOs, routes, permissions, architecture boundaries (static)
// ═══════════════════════════════════════════════════════════════════════════

const src = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
const ENGINE_SRC = src('financial-contribution.service.ts');
const CONTROLLER_SRC = src('financial.controller.ts');
const WEBHOOK_SRC = src('razorpay-webhook.service.ts');
const MERCH_SERVICE_SRC = src('../merchandise/merchandise-order.service.ts');
const MERCH_ADMIN_SRC = src('../merchandise/merchandise-admin.controller.ts');

function decoratorsBefore(source: string, signature: string): string {
  const at = source.indexOf(signature);
  if (at === -1) throw new Error(`not found: ${signature}`);
  return source.slice(source.lastIndexOf('@Post(', at), at);
}

describe('DTO validation', () => {
  const check = async (cls: new () => object, body: object) => validate(plainToInstance(cls, body));

  it('accepts a 14-character Razorpay payment id and a reason', async () => {
    expect(await check(ReconcileProviderSettlementDto, { providerPaymentReference: PAY, reason: REASON })).toHaveLength(0);
  });

  it.each(['pay_TfXMUcGMyRqRQh1', 'pay_short', 'order_TfXLc0jngBp5Ov', ''])('rejects malformed payment id %p', async (ref) => {
    expect(await check(ReconcileProviderSettlementDto, { providerPaymentReference: ref, reason: REASON })).not.toHaveLength(0);
  });

  it('requires a reconciliation reason', async () => {
    expect(await check(ReconcileProviderSettlementDto, { providerPaymentReference: PAY, reason: '' })).not.toHaveLength(0);
  });

  it('merchandise refund requires a reason of 5–450 characters', async () => {
    expect(await check(RefundOrderDto, { reason: 'Test purchase' })).toHaveLength(0);
    expect(await check(RefundOrderDto, { reason: 'no' })).not.toHaveLength(0);
    expect(await check(RefundOrderDto, { reason: 'x'.repeat(451) })).not.toHaveLength(0);
  });
});

describe('Routes, guards and permissions', () => {
  it('reconcile-provider: AccessTokenGuard + RbacGuard + financial.settlement.verify, ADMIN audit context', () => {
    const d = decoratorsBefore(CONTROLLER_SRC, 'async reconcileProviderSettlement(');
    expect(d).toContain("@Post('contributions/:id/settlement/reconcile-provider')");
    expect(d).toContain('UseGuards(AccessTokenGuard, RbacGuard)');
    expect(d).toContain('RequirePermissions(VERIFY_PERMISSION)');
    expect(CONTROLLER_SRC).toMatch(/reconcileProviderSettlement\([\s\S]*?auditContext\('ADMIN', req, actor\)/);
  });

  it('refund recheck: AccessTokenGuard + RbacGuard + financial.settlement.verify, ADMIN audit context', () => {
    const d = decoratorsBefore(CONTROLLER_SRC, 'async recheckRefund(');
    expect(d).toContain("@Post('refunds/:id/recheck')");
    expect(d).toContain('UseGuards(AccessTokenGuard, RbacGuard)');
    expect(d).toContain('RequirePermissions(VERIFY_PERMISSION)');
    expect(CONTROLLER_SRC).toContain("this.financialService.recheckRefund(id, auditContext('ADMIN', req, actor))");
  });

  it('merchandise refund: order.manage AND financial.settlement.verify, ADMIN audit context', () => {
    const d = decoratorsBefore(MERCH_ADMIN_SRC, 'async refundOrder(');
    expect(d).toContain("@Post('orders/:id/refund')");
    expect(d).toContain('RequirePermissions(ORDER_PERMISSION, FINANCIAL_VERIFY_PERMISSION)');
    expect(MERCH_ADMIN_SRC).toContain("const FINANCIAL_VERIFY_PERMISSION = 'financial.settlement.verify'");
    expect(MERCH_ADMIN_SRC).toMatch(/@UseGuards\(AccessTokenGuard, RbacGuard\)\s*export class MerchandiseAdminController/);
    expect(MERCH_ADMIN_SRC).toContain("requestAuditContext('ADMIN', req, actor)");
  });
});

describe('Architecture boundaries', () => {
  it('reconciliation reaches settlement only through recordSettlementOutcome() (row-locked, idempotent)', () => {
    const body = ENGINE_SRC.slice(ENGINE_SRC.indexOf('async reconcileProviderSettlement('), ENGINE_SRC.indexOf('private async findReceiptNumber('));
    expect(body).toContain('this.recordSettlementOutcome(');
    expect(body).not.toMatch(/insertInto\(|updateTable\(/);
    const record = ENGINE_SRC.slice(ENGINE_SRC.indexOf('async recordSettlementOutcome('));
    expect(record.slice(0, 1500)).toContain('.forUpdate()');
  });

  it('recordRefundOutcome() locks the refund and contribution rows', () => {
    const body = ENGINE_SRC.slice(ENGINE_SRC.indexOf('async recordRefundOutcome('), ENGINE_SRC.indexOf('async recheckRefund('));
    expect((body.match(/\.forUpdate\(\)/g) ?? []).length).toBe(2);
  });

  it('refunds become terminal only inside recordRefundOutcome()', () => {
    const outside = ENGINE_SRC.slice(0, ENGINE_SRC.indexOf('async recordRefundOutcome('))
      + ENGINE_SRC.slice(ENGINE_SRC.indexOf('async recheckRefund('));
    const refundUpdates = outside.match(/updateTable\('financial_refunds'\)[\s\S]{0,300}?\.execute\(\)/g) ?? [];
    expect(refundUpdates).toHaveLength(1);
    expect(refundUpdates[0]).toContain("status: 'PROCESSING'");
    expect(outside).not.toMatch(/transitionContribution\([^)]*'REFUNDED'/);
  });

  it('the webhook writes only its own inbox table and resolves refunds via recordRefundOutcome()', () => {
    const writes = WEBHOOK_SRC.match(/(insertInto|updateTable)\(\s*['"]([a-z_]+)['"]/g) ?? [];
    writes.forEach((w) => expect(w).toContain('settlement_webhook_inbox'));
    expect(WEBHOOK_SRC).toContain('this.financialService.recordRefundOutcome(');
  });

  it('merchandise never calls the provider or writes financial tables', () => {
    expect(MERCH_SERVICE_SRC).not.toMatch(/from ['"][^'"]*razorpay/i);
    expect(MERCH_SERVICE_SRC).not.toMatch(/provider\.refund\(|SETTLEMENT_PROVIDER/);
    expect(MERCH_SERVICE_SRC).not.toMatch(/(insertInto|updateTable)\(\s*['"](financial_[a-z_]+|receipts)['"]/);
    expect(MERCH_SERVICE_SRC).toContain('this.financial.requestRefund(');
  });

  it('no new financial table, state, scheduler or worker', () => {
    for (const s of [ENGINE_SRC, WEBHOOK_SRC, CONTROLLER_SRC]) {
      expect(s).not.toMatch(/@Cron|@Interval|setInterval\(|ScheduleModule/);
    }
  });
});
