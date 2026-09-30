// backend/src/modules/financial/razorpay-payment-link.spec.ts
//
// Razorpay Payment Link settlement — behavioural coverage.
//
// The REAL RazorpaySettlementProvider (SDK mocked), FinancialContributionService,
// FinancialAuditService and RazorpayWebhookService run against the recording
// FakeDb (test-support/fake-db.ts), with a small in-memory model of the
// financial_contributions / financial_transactions / settlement_webhook_inbox
// rows so state actually moves between calls. No network, no MySQL.
//
// Proves: amount/currency come only from the Contribution; the link id + URL
// are persisted for the live attempt and reused (never a second link); a
// link attempt and an Orders attempt never coexist; webhook reconciliation
// goes exclusively through recordSettlementOutcome(); duplicates never
// double-settle; failure/expiry are retryable on the SAME Contribution; and
// nothing here ever touches a Membership table.

jest.mock('../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../test-support/fake-db');
  return { db: new FakeDb() };
});

const paymentLinkCreate = jest.fn();
const paymentLinkCancel = jest.fn();
jest.mock('razorpay', () =>
  jest.fn().mockImplementation(() => ({
    orders: { create: jest.fn() },
    paymentLink: { create: paymentLinkCreate, cancel: paymentLinkCancel },
  })),
);

import { ConflictException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { db } from '../../database/db';
import { whereValue, type FakeDb, type FakeOp } from '../../test-support/fake-db';
import { FinancialContributionService } from './financial-contribution.service';
import { FinancialAuditService } from './audit/financial-audit.service';
import type { FinancialEventBus } from './financial-event-bus.service';
import { FINANCIAL_EVENT_TYPES } from './financial.events';
import { RazorpaySettlementProvider } from './razorpay-settlement.provider';
import { RazorpayWebhookService } from './razorpay-webhook.service';
import type { SettlementProvider } from './settlement-provider.interface';

const fake = db as unknown as FakeDb;
const WEBHOOK_SECRET = 'whsec_test_only';
const ORIGINAL_ENV = process.env;

// Family Membership fee per MEM-008 config (group_type_entitlements.fee_inr
// = 6000) -- supplied here as the Contribution's own amount, exactly as the
// Business Module would have created it.
const FAMILY_FEE_PAISE = 600000;

// ── In-memory world ─────────────────────────────────────────────────────────

interface ContributionRow {
  id: number;
  uuid: string;
  payer_user_id: number;
  business_module: string;
  business_reference_id: number;
  purpose: string;
  amount_paise: number;
  currency: string;
  state: string;
  expires_at: string | null;
  active_settlement_reference: string | null;
  active_settlement_url: string | null;
}

interface World {
  contribution: ContributionRow;
  transactions: Array<Record<string, unknown>>;
  inbox: Map<number, Record<string, unknown>>;
}

let world: World;

function setupWorld(overrides: Partial<ContributionRow> = {}): World {
  const contribution: ContributionRow = {
    id: 77,
    uuid: 'c-77',
    payer_user_id: 42,
    business_module: 'MEMBERSHIP',
    business_reference_id: 9,
    purpose: 'Family Membership fee',
    amount_paise: FAMILY_FEE_PAISE,
    currency: 'INR',
    state: 'AWAITING_SETTLEMENT',
    expires_at: null,
    active_settlement_reference: null,
    active_settlement_url: null,
    ...overrides,
  };
  const w: World = { contribution, transactions: [], inbox: new Map() };
  let nextInboxId = 500;

  fake.failWhen = (op) =>
    op.table === 'settlement_webhook_inbox' &&
    op.kind === 'insert' &&
    [...w.inbox.values()].some((r) => r.provider_event_id === op.values!.provider_event_id)
      ? new Error("ER_DUP_ENTRY: Duplicate entry for key 'uq_provider_event'")
      : null;

  fake.responder = (op: FakeOp) => {
    if (op.table === 'financial_contributions') {
      const row = w.contribution;
      if (op.kind === 'select') {
        const id = whereValue(op, 'id');
        const ref = whereValue(op, 'active_settlement_reference');
        const state = whereValue(op, 'state');
        if (id !== undefined && id !== row.id) return [];
        if (ref !== undefined && ref !== row.active_settlement_reference) return [];
        if (state !== undefined && state !== row.state) return [];
        return [{ ...row }];
      }
      if (op.kind === 'update') {
        const stateCond = whereValue(op, 'state');
        const refIsNull = op.wheres.some(([c, o]) => c === 'active_settlement_reference' && o === 'is');
        if (stateCond !== undefined && stateCond !== row.state) return { numUpdatedRows: 0n };
        if (refIsNull && row.active_settlement_reference !== null) return { numUpdatedRows: 0n };
        Object.assign(row, op.set);
        return undefined;
      }
    }
    if (op.table === 'financial_transactions') {
      if (op.kind === 'select') {
        const ref = whereValue(op, 'provider_reference');
        return w.transactions.filter((t) => t.provider_reference === ref);
      }
      if (op.kind === 'insert') {
        w.transactions.push({ ...op.values });
        return undefined;
      }
    }
    if (op.table === 'settlement_webhook_inbox') {
      if (op.kind === 'insert') {
        const id = nextInboxId++;
        w.inbox.set(id, { id, status: 'RECEIVED', contribution_id: null, ...op.values });
        return { insertId: BigInt(id) };
      }
      if (op.kind === 'select') {
        const id = whereValue(op, 'id');
        const eventId = whereValue(op, 'provider_event_id');
        const rows = [...w.inbox.values()].filter(
          (r) => (id === undefined || r.id === id) && (eventId === undefined || r.provider_event_id === eventId),
        );
        return rows.map((r) => ({ ...r }));
      }
      if (op.kind === 'update') {
        const row = w.inbox.get(whereValue(op, 'id') as number);
        if (row) Object.assign(row, op.set);
        return undefined;
      }
    }
    return op.kind === 'select' ? [] : undefined;
  };
  return w;
}

function makeEngine(provider: SettlementProvider) {
  const bus = { emit: jest.fn() };
  const service = new FinancialContributionService(
    bus as unknown as FinancialEventBus,
    provider,
    new FinancialAuditService(),
  );
  return { service, bus };
}

// Required<>: the optional link methods are always present as mocks here
// (except where a test deliberately overrides one to undefined).
function makeLinkProvider(overrides: Partial<SettlementProvider> = {}): jest.Mocked<Required<SettlementProvider>> {
  return {
    providerName: 'RAZORPAY',
    createOrder: jest.fn().mockResolvedValue({ providerOrderReference: 'order_new', amountPaise: FAMILY_FEE_PAISE, currency: 'INR' }),
    refund: jest.fn(),
    createPaymentLink: jest.fn().mockImplementation(async (input) => ({
      providerLinkReference: 'plink_new',
      hostedUrl: 'https://rzp.io/i/abc123',
      amountPaise: input.amountPaise,
      currency: input.currency,
    })),
    cancelPaymentLink: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<Required<SettlementProvider>>;
}

function auditRows(): Array<Record<string, unknown>> {
  return fake.writes('financial_audit_log', 'insert').map((op) => op.values!);
}

function membershipTouched(): boolean {
  return [...fake.committed, ...fake.rolledBack, ...fake.selects].some((op) => op.table.startsWith('membership'));
}

beforeEach(() => {
  fake.reset();
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET };
  world = setupWorld();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Provider adapter
// ═══════════════════════════════════════════════════════════════════════════

describe('RazorpaySettlementProvider.createPaymentLink()', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_value';
    paymentLinkCreate.mockResolvedValue({ id: 'plink_1', short_url: 'https://rzp.io/i/xyz', status: 'created' });
  });

  it('sends the given amount/currency verbatim, full-payment only, provider notifications off', async () => {
    const expiresAt = new Date('2030-01-01T00:00:00Z');
    const result = await new RazorpaySettlementProvider().createPaymentLink({
      contributionId: 77,
      amountPaise: FAMILY_FEE_PAISE,
      currency: 'INR',
      referenceId: 'FC-77-deadbeef',
      description: 'Family Membership fee',
      expiresAt,
      metadata: { contributionId: 77 },
    });

    expect(paymentLinkCreate).toHaveBeenCalledWith({
      amount: FAMILY_FEE_PAISE,
      currency: 'INR',
      accept_partial: false,
      reference_id: 'FC-77-deadbeef',
      description: 'Family Membership fee',
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { contributionId: 77 },
      expire_by: Math.floor(expiresAt.getTime() / 1000),
    });
    expect(result).toEqual({
      providerLinkReference: 'plink_1',
      hostedUrl: 'https://rzp.io/i/xyz',
      amountPaise: FAMILY_FEE_PAISE,
      currency: 'INR',
    });
  });

  it('omits expire_by when the Contribution has no expiry policy, and never sends customer PII', async () => {
    await new RazorpaySettlementProvider().createPaymentLink({
      contributionId: 77, amountPaise: 500000, currency: 'INR', referenceId: 'FC-77-1', description: 'Corporate Membership fee',
    });
    const params = paymentLinkCreate.mock.calls[0][0];
    expect(params).not.toHaveProperty('expire_by');
    expect(params).not.toHaveProperty('customer');
  });

  it('returns nothing secret', async () => {
    const result = await new RazorpaySettlementProvider().createPaymentLink({
      contributionId: 77, amountPaise: 1, currency: 'INR', referenceId: 'r', description: 'd',
    });
    expect(JSON.stringify(result)).not.toContain('rzp_test_secret_value');
  });

  it('fails closed with ServiceUnavailableException when Razorpay is not configured', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    await expect(
      new RazorpaySettlementProvider().createPaymentLink({
        contributionId: 77, amountPaise: 1, currency: 'INR', referenceId: 'r', description: 'd',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(paymentLinkCreate).not.toHaveBeenCalled();
  });

  it('cancelPaymentLink() cancels by link id', async () => {
    await new RazorpaySettlementProvider().cancelPaymentLink('plink_9');
    expect(paymentLinkCancel).toHaveBeenCalledWith('plink_9');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Financial Engine — initiateProviderPaymentLink()
// ═══════════════════════════════════════════════════════════════════════════

describe('FinancialContributionService.initiateProviderPaymentLink()', () => {
  it('creates a link for the Contribution amount/currency and persists reference + URL together', async () => {
    const provider = makeLinkProvider();
    const { service } = makeEngine(provider);

    const result = await service.initiateProviderPaymentLink(77);

    expect(result).toMatchObject({
      contributionId: 77,
      contributionState: 'SETTLEMENT_IN_PROGRESS',
      providerLinkReference: 'plink_new',
      hostedUrl: 'https://rzp.io/i/abc123',
      amountPaise: FAMILY_FEE_PAISE,
      currency: 'INR',
      reused: false,
    });
    const input = provider.createPaymentLink!.mock.calls[0][0];
    expect(input).toMatchObject({ contributionId: 77, amountPaise: FAMILY_FEE_PAISE, currency: 'INR', description: 'Family Membership fee' });
    expect(input.referenceId).toMatch(/^FC-77-[0-9a-f]{8}$/);
    expect(input.metadata).toMatchObject({ businessModule: 'MEMBERSHIP', businessReferenceId: 9, contributionId: 77 });

    const persist = fake
      .writes('financial_contributions', 'update')
      .find((op) => op.set!.active_settlement_reference === 'plink_new')!;
    expect(persist.set).toEqual({ active_settlement_reference: 'plink_new', active_settlement_url: 'https://rzp.io/i/abc123' });
    expect(world.contribution).toMatchObject({
      state: 'SETTLEMENT_IN_PROGRESS',
      active_settlement_reference: 'plink_new',
      active_settlement_url: 'https://rzp.io/i/abc123',
    });

    const created = auditRows().find((r) => r.event_type === 'PROVIDER_ORDER_CREATED')!;
    expect(JSON.parse(String(created.metadata_json))).toEqual({ providerOrderOutcome: 'CREATED', settlementChannel: 'PAYMENT_LINK' });
    expect(created.provider_order_ref).toBe('plink_new');
  });

  it('link creation is never an outcome: no Financial Transaction, Receipt, SETTLED or COMPLETED', async () => {
    const { service } = makeEngine(makeLinkProvider());
    await service.initiateProviderPaymentLink(77);
    expect(fake.writes('financial_transactions')).toHaveLength(0);
    expect(fake.writes('receipts')).toHaveLength(0);
    expect(world.contribution.state).toBe('SETTLEMENT_IN_PROGRESS');
    expect(membershipTouched()).toBe(false);
  });

  it('a repeat call for the live attempt returns the SAME link and never calls the provider again', async () => {
    world = setupWorld({
      state: 'SETTLEMENT_IN_PROGRESS', active_settlement_reference: 'plink_live', active_settlement_url: 'https://rzp.io/i/live',
    });
    const provider = makeLinkProvider();
    const { service } = makeEngine(provider);

    const result = await service.initiateProviderPaymentLink(77);

    expect(result).toMatchObject({ providerLinkReference: 'plink_live', hostedUrl: 'https://rzp.io/i/live', reused: true });
    expect(provider.createPaymentLink).not.toHaveBeenCalled();
    expect(JSON.parse(String(auditRows()[0].metadata_json))).toEqual({ providerOrderOutcome: 'REUSED', settlementChannel: 'PAYMENT_LINK' });
  });

  it('refuses while an embedded-Checkout order is the live attempt (no parallel payable attempt)', async () => {
    world = setupWorld({ state: 'SETTLEMENT_IN_PROGRESS', active_settlement_reference: 'order_live' });
    const provider = makeLinkProvider();
    const { service } = makeEngine(provider);

    await expect(service.initiateProviderPaymentLink(77)).rejects.toThrow(ConflictException);
    expect(provider.createPaymentLink).not.toHaveBeenCalled();
  });

  it('the Orders path refuses while a payment link is the live attempt', async () => {
    world = setupWorld({
      state: 'SETTLEMENT_IN_PROGRESS', active_settlement_reference: 'plink_live', active_settlement_url: 'https://rzp.io/i/live',
    });
    const provider = makeLinkProvider();
    const { service } = makeEngine(provider);

    await expect(service.initiateProviderSettlement(77)).rejects.toThrow(/active payment link/);
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it('unknown contribution -> NotFoundException, provider never called', async () => {
    const provider = makeLinkProvider();
    const { service } = makeEngine(provider);
    await expect(service.initiateProviderPaymentLink(999)).rejects.toThrow(NotFoundException);
    expect(provider.createPaymentLink).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'FAILED', 'ABANDONED'])(
    'a %s contribution is not payable via a new link (no state write, no provider call)',
    async (state) => {
      world = setupWorld({ state });
      const provider = makeLinkProvider();
      const { service } = makeEngine(provider);
      await expect(service.initiateProviderPaymentLink(77)).rejects.toThrow(ConflictException);
      expect(provider.createPaymentLink).not.toHaveBeenCalled();
      expect(world.contribution.state).toBe(state);
    },
  );

  it('zero-value contributions never reach a payment link', async () => {
    world = setupWorld({ amount_paise: 0 });
    const provider = makeLinkProvider();
    const { service } = makeEngine(provider);
    await expect(service.initiateProviderPaymentLink(77)).rejects.toThrow(ConflictException);
    expect(provider.createPaymentLink).not.toHaveBeenCalled();
    expect(world.contribution.state).toBe('AWAITING_SETTLEMENT');
  });

  it('an invalid currency is refused before any state write', async () => {
    world = setupWorld({ currency: 'rupees' });
    const { service } = makeEngine(makeLinkProvider());
    await expect(service.initiateProviderPaymentLink(77)).rejects.toThrow(/invalid currency/);
    expect(world.contribution.state).toBe('AWAITING_SETTLEMENT');
  });

  it('passes the Business Module expiry through, and refuses a link the Contribution would outlive by minutes', async () => {
    const far = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    world = setupWorld({ expires_at: far.toISOString() });
    const provider = makeLinkProvider();
    await makeEngine(provider).service.initiateProviderPaymentLink(77);
    expect(provider.createPaymentLink!.mock.calls[0][0].expiresAt!.getTime()).toBe(far.getTime());

    world = setupWorld({ expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    const provider2 = makeLinkProvider();
    await expect(makeEngine(provider2).service.initiateProviderPaymentLink(77)).rejects.toThrow(/too close to expiry/);
    expect(provider2.createPaymentLink).not.toHaveBeenCalled();
  });

  it('a provider without payment-link support is refused cleanly', async () => {
    const provider = makeLinkProvider({ createPaymentLink: undefined });
    await expect(makeEngine(provider).service.initiateProviderPaymentLink(77)).rejects.toThrow(/does not support payment links/);
    expect(world.contribution.state).toBe('AWAITING_SETTLEMENT');
  });

  it('provider failure moves the attempt to FAILED (retryable) and rethrows', async () => {
    const provider = makeLinkProvider({ createPaymentLink: jest.fn().mockRejectedValue(new Error('razorpay down')) });
    await expect(makeEngine(provider).service.initiateProviderPaymentLink(77)).rejects.toThrow('razorpay down');
    expect(world.contribution.state).toBe('FAILED');
    const failed = auditRows().find((r) => r.event_type === 'PROVIDER_ORDER_FAILED')!;
    expect(JSON.parse(String(failed.metadata_json))).toEqual({ settlementChannel: 'PAYMENT_LINK' });
  });

  it('a lost race withdraws (cancels) our orphan link and returns the winning link', async () => {
    const provider = makeLinkProvider();
    const { service } = makeEngine(provider);
    // Winner lands between our provider call and our persist.
    provider.createPaymentLink!.mockImplementation(async (input) => {
      world.contribution.active_settlement_reference = 'plink_winner';
      world.contribution.active_settlement_url = 'https://rzp.io/i/winner';
      return { providerLinkReference: 'plink_mine', hostedUrl: 'https://rzp.io/i/mine', amountPaise: input.amountPaise, currency: input.currency };
    });

    const result = await service.initiateProviderPaymentLink(77);

    expect(result).toMatchObject({ providerLinkReference: 'plink_winner', hostedUrl: 'https://rzp.io/i/winner', reused: true });
    expect(provider.cancelPaymentLink).toHaveBeenCalledWith('plink_mine');
  });

  it('retry after FAILED reopens the SAME Contribution and issues a fresh link (no new Contribution)', async () => {
    world = setupWorld({ state: 'FAILED' });
    const provider = makeLinkProvider();
    const { service } = makeEngine(provider);

    await service.retrySettlement(77);
    const result = await service.initiateProviderPaymentLink(77);

    expect(result.contributionId).toBe(77);
    expect(result.reused).toBe(false);
    expect(fake.writes('financial_contributions', 'insert')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Webhook reconciliation
// ═══════════════════════════════════════════════════════════════════════════

function signedDelivery(eventId: string, body: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
  return {
    rawBody,
    signature: createHmac('sha256', secret).update(rawBody).digest('hex'),
    eventId,
    requestId: 'req-1',
    route: '/api/v1/financial/webhooks/razorpay',
  };
}

function linkPaid(overrides: { linkId?: string; paymentId?: string; amount?: number; currency?: string } = {}) {
  return {
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { id: overrides.linkId ?? 'plink_live', amount: FAMILY_FEE_PAISE, currency: 'INR', status: 'paid' } },
      order: { entity: { id: 'order_internal_of_link' } },
      payment: {
        entity: {
          id: overrides.paymentId ?? 'pay_1',
          order_id: 'order_internal_of_link',
          amount: overrides.amount ?? FAMILY_FEE_PAISE,
          currency: overrides.currency ?? 'INR',
          status: 'captured',
        },
      },
    },
  };
}

function linkEnded(event: 'payment_link.expired' | 'payment_link.cancelled', linkId = 'plink_live') {
  return {
    event,
    payload: { payment_link: { entity: { id: linkId, amount: FAMILY_FEE_PAISE, currency: 'INR', status: event.split('.')[1] } } },
  };
}

function liveLinkWorld(overrides: Partial<ContributionRow> = {}) {
  world = setupWorld({
    state: 'SETTLEMENT_IN_PROGRESS',
    active_settlement_reference: 'plink_live',
    active_settlement_url: 'https://rzp.io/i/live',
    ...overrides,
  });
}

function makeWebhook() {
  const engine = makeEngine(makeLinkProvider());
  return { ...engine, webhook: new RazorpayWebhookService(engine.service) };
}

function inboxStatuses(): Array<{ status: unknown; error: unknown }> {
  return [...world.inbox.values()].map((r) => ({ status: r.status, error: r.processing_error }));
}

describe('RazorpayWebhookService — payment_link events', () => {
  it('payment_link.paid settles through recordSettlementOutcome(): one SUCCEEDED transaction, receipt, COMPLETED', async () => {
    liveLinkWorld();
    const { webhook, bus } = makeWebhook();

    await webhook.handle(signedDelivery('evt_1', linkPaid()));

    expect(world.transactions).toHaveLength(1);
    expect(world.transactions[0]).toMatchObject({
      contribution_id: 77, provider: 'RAZORPAY', provider_reference: 'pay_1', amount_paise: FAMILY_FEE_PAISE, currency: 'INR', outcome: 'SUCCEEDED',
    });
    expect(fake.writes('receipts', 'insert')).toHaveLength(1);
    expect(world.contribution).toMatchObject({ state: 'COMPLETED', active_settlement_reference: null, active_settlement_url: null });
    expect(inboxStatuses()).toEqual([{ status: 'PROCESSED', error: null }]);
    expect(bus.emit.mock.calls.map((c) => c[0])).toEqual([
      FINANCIAL_EVENT_TYPES.SETTLEMENT_COMPLETED,
      FINANCIAL_EVENT_TYPES.RECEIPT_GENERATED,
      FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
    ]);
  });

  it('payment success is a financial state only: the webhook never reads or writes any Membership table', async () => {
    liveLinkWorld();
    const { webhook } = makeWebhook();
    await webhook.handle(signedDelivery('evt_1', linkPaid()));
    expect(membershipTouched()).toBe(false);
  });

  it('a duplicate delivery (same event id) is a no-op: no second transaction or receipt', async () => {
    liveLinkWorld();
    const { webhook, bus } = makeWebhook();
    await webhook.handle(signedDelivery('evt_1', linkPaid()));
    bus.emit.mockClear();

    await webhook.handle(signedDelivery('evt_1', linkPaid()));

    expect(world.transactions).toHaveLength(1);
    expect(fake.writes('receipts', 'insert')).toHaveLength(1);
    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('the same payment redelivered under a NEW event id cannot settle twice', async () => {
    liveLinkWorld();
    const { webhook } = makeWebhook();
    await webhook.handle(signedDelivery('evt_1', linkPaid()));
    await webhook.handle(signedDelivery('evt_2', linkPaid()));

    expect(world.transactions).toHaveLength(1);
    expect(fake.writes('receipts', 'insert')).toHaveLength(1);
    expect(world.inbox.get(501)).toMatchObject({ status: 'FAILED' });
  });

  it('a crash-recovered inbox row whose payment was already recorded returns the existing transaction', async () => {
    liveLinkWorld();
    world.transactions.push({ contribution_id: 77, provider_reference: 'pay_1', id: 900, outcome: 'SUCCEEDED' });
    const { webhook } = makeWebhook();

    await webhook.handle(signedDelivery('evt_1', linkPaid()));

    expect(world.transactions).toHaveLength(1);
    expect(fake.writes('receipts', 'insert')).toHaveLength(0);
  });

  it('an already-settled contribution is never matched again', async () => {
    liveLinkWorld({ state: 'COMPLETED', active_settlement_reference: null, active_settlement_url: null });
    const { webhook } = makeWebhook();
    await webhook.handle(signedDelivery('evt_9', linkPaid()));

    expect(world.transactions).toHaveLength(0);
    expect(inboxStatuses()[0].status).toBe('FAILED');
    expect(String(inboxStatuses()[0].error)).toContain("payment link 'plink_live'");
  });

  it('an unknown payment link is recorded as unmatched, with no financial write', async () => {
    liveLinkWorld();
    const { webhook } = makeWebhook();
    await webhook.handle(signedDelivery('evt_1', linkPaid({ linkId: 'plink_someone_else' })));

    expect(world.transactions).toHaveLength(0);
    expect(world.contribution.state).toBe('SETTLEMENT_IN_PROGRESS');
    expect(inboxStatuses()[0]).toEqual({
      status: 'FAILED',
      error: "No SETTLEMENT_IN_PROGRESS contribution matches payment link 'plink_someone_else'.",
    });
  });

  it('an amount mismatch is refused -- never settled, contribution untouched', async () => {
    liveLinkWorld();
    const { webhook } = makeWebhook();
    await webhook.handle(signedDelivery('evt_1', linkPaid({ amount: FAMILY_FEE_PAISE - 100 })));

    expect(world.transactions).toHaveLength(0);
    expect(world.contribution.state).toBe('SETTLEMENT_IN_PROGRESS');
    expect(String(inboxStatuses()[0].error)).toMatch(/^Amount mismatch/);
  });

  it('a currency mismatch is refused -- never converted', async () => {
    liveLinkWorld();
    const { webhook } = makeWebhook();
    await webhook.handle(signedDelivery('evt_1', linkPaid({ currency: 'USD' })));

    expect(world.transactions).toHaveLength(0);
    expect(String(inboxStatuses()[0].error)).toMatch(/^Currency mismatch/);
  });

  it('an invalid signature is rejected before any DB write', async () => {
    liveLinkWorld();
    const { webhook } = makeWebhook();
    await expect(webhook.handle(signedDelivery('evt_1', linkPaid(), 'wrong_secret'))).rejects.toThrow(UnauthorizedException);
    expect(fake.committed).toHaveLength(0);
    expect(world.inbox.size).toBe(0);
  });

  it('an unconfigured webhook secret fails closed', async () => {
    liveLinkWorld();
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const { webhook } = makeWebhook();
    await expect(webhook.handle(signedDelivery('evt_1', linkPaid()))).rejects.toThrow(UnauthorizedException);
    expect(fake.committed).toHaveLength(0);
  });

  it.each(['payment_link.expired', 'payment_link.cancelled'] as const)(
    '%s ends the attempt as ABANDONED (not FAILED, not EXPIRED) and the SAME contribution is retryable',
    async (event) => {
      liveLinkWorld();
      const { webhook, service, bus } = makeWebhook();

      await webhook.handle(signedDelivery('evt_end', linkEnded(event)));

      expect(world.transactions).toEqual([
        expect.objectContaining({ provider_reference: 'plink_live', outcome: 'ABANDONED', amount_paise: FAMILY_FEE_PAISE }),
      ]);
      expect(world.contribution).toMatchObject({ state: 'ABANDONED', active_settlement_reference: null, active_settlement_url: null });
      expect(fake.writes('receipts')).toHaveLength(0);
      expect(bus.emit.mock.calls.map((c) => c[0])).toEqual([FINANCIAL_EVENT_TYPES.SETTLEMENT_ABANDONED]);

      await service.retrySettlement(77);
      const next = await service.initiateProviderPaymentLink(77);
      expect(next).toMatchObject({ contributionId: 77, providerLinkReference: 'plink_new', reused: false });
      expect(fake.writes('financial_contributions', 'insert')).toHaveLength(0);
    },
  );

  it('a failed payment try on a live link does NOT fail the contribution (the link stays payable)', async () => {
    liveLinkWorld();
    const { webhook } = makeWebhook();
    await webhook.handle(
      signedDelivery('evt_f', {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: { id: 'pay_f', order_id: 'order_internal_of_link', amount: FAMILY_FEE_PAISE, currency: 'INR', error_code: 'BAD_REQUEST_ERROR' },
          },
        },
      }),
    );

    expect(world.transactions).toHaveLength(0);
    expect(world.contribution).toMatchObject({ state: 'SETTLEMENT_IN_PROGRESS', active_settlement_reference: 'plink_live' });

    // ...and the later successful payment on the same link still settles.
    await webhook.handle(signedDelivery('evt_ok', linkPaid({ paymentId: 'pay_ok' })));
    expect(world.contribution.state).toBe('COMPLETED');
    expect(world.transactions).toEqual([expect.objectContaining({ provider_reference: 'pay_ok', outcome: 'SUCCEEDED' })]);
  });

  it('a link event can never resolve an Orders attempt, and an order payment never a link attempt', async () => {
    world = setupWorld({ state: 'SETTLEMENT_IN_PROGRESS', active_settlement_reference: 'order_live' });
    const { webhook } = makeWebhook();
    await webhook.handle(signedDelivery('evt_x', linkEnded('payment_link.expired', 'plink_other')));
    expect(world.contribution.state).toBe('SETTLEMENT_IN_PROGRESS');
    expect(world.transactions).toHaveLength(0);
  });

  it('a malformed link payload is recorded as FAILED in the inbox, never settled', async () => {
    liveLinkWorld();
    const { webhook } = makeWebhook();
    await webhook.handle(signedDelivery('evt_m', { event: 'payment_link.paid', payload: { payment_link: { entity: {} } } }));
    expect(world.transactions).toHaveLength(0);
    expect(inboxStatuses()[0].error).toBe("Event 'payment_link.paid' payload missing payment_link id.");
  });
});
