// Behavioural tests for the financial audit/provenance layer (OBS-02, 05, 06,
// 07, 11, and the Section 6/13 whitelist). The real FinancialContributionService,
// SettlementEvidenceService and FinancialAuditService run against a
// recording fake of db.ts with genuine commit/rollback semantics.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));

import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { FinancialContributionService } from '../financial-contribution.service';
import { SettlementEvidenceService } from '../settlement-evidence.service';
import type { FinancialEventBus } from '../financial-event-bus.service';
import type { SettlementProvider } from '../settlement-provider.interface';
import type { R2Service } from '../../shared/storage/r2.service';
import { FinancialAuditService } from './financial-audit.service';
import { buildRequestProvenance } from './request-provenance.util';
import type { AuditContext, FinancialAuditMetadata } from './financial-audit.types';

const fake = db as unknown as FakeDb;

const PROVENANCE = {
  requestId: '9b2f6c1e-1f1a-4b8a-9c3d-0a1b2c3d4e5f',
  actorUserId: 42,
  sessionId: '11111111-2222-4333-8444-555555555555',
  ipAddress: '203.0.113.9',
  userAgent: 'Mozilla/5.0 test',
  route: '/api/v1/financial/contributions/:id/settlement/razorpay-order',
};
const MEMBER: AuditContext = { actorType: 'MEMBER', provenance: PROVENANCE };

function makeProvider(overrides: Partial<SettlementProvider> = {}): jest.Mocked<SettlementProvider> {
  return {
    providerName: 'RAZORPAY',
    createOrder: jest.fn().mockResolvedValue({ providerOrderReference: 'order_new', amountPaise: 5000, currency: 'INR' }),
    refund: jest.fn(),
    getPublicKeyId: jest.fn().mockReturnValue('rzp_test_key'),
    ...overrides,
  } as jest.Mocked<SettlementProvider>;
}

function makeService(provider = makeProvider()) {
  const bus = { emit: jest.fn() } as unknown as FinancialEventBus;
  return { service: new FinancialContributionService(bus, provider, new FinancialAuditService()), provider };
}

interface ContributionScript {
  state: string;
  ref?: string | null;
  loseRaceTo?: string;
}

// A single mutable contribution row the fake serves and updates.
function scriptContribution(s: ContributionScript) {
  const row = {
    id: 77, uuid: 'c-77', payer_user_id: 42, business_module: 'MEMBERSHIP', business_reference_id: 9,
    purpose: 'Membership', amount_paise: 5000, currency: 'INR', state: s.state,
    active_settlement_reference: s.ref ?? null,
  };
  fake.responder = (op) => {
    if (op.table === 'financial_contributions') {
      if (op.kind === 'select') return [{ ...row }];
      if (op.kind === 'update' && op.set) {
        const settingRef = 'active_settlement_reference' in op.set && op.set.active_settlement_reference !== null;
        if (settingRef && s.loseRaceTo) {
          row.active_settlement_reference = s.loseRaceTo;
          return { numUpdatedRows: 0n };
        }
        Object.assign(row, op.set);
      }
      return undefined;
    }
    if (op.kind === 'select') return [];
    return undefined;
  };
  return row;
}

function auditRows(): Array<Record<string, unknown>> {
  return fake.writes('financial_audit_log', 'insert').map((op) => op.values!);
}

function auditOps(): FakeOp[] {
  return fake.writes('financial_audit_log', 'insert');
}

beforeEach(() => fake.reset());

// ── 3. Audit atomicity ─────────────────────────────────────────────────────

describe('audit atomicity (OBS-11)', () => {
  const obligation = {
    payerUserId: 42, businessModule: 'MERCHANDISE', businessReferenceId: 3, purpose: 'Order',
    amountPaise: 5000, idempotencyKey: 'merch-3',
  };

  it('commits the contribution and its CONTRIBUTION_CREATED audit row in one transaction', async () => {
    const { service } = makeService();
    const { id } = await service.createContribution(obligation, MEMBER);

    const [contributionInsert] = fake.writes('financial_contributions', 'insert');
    const [audit] = auditOps();
    expect(audit.txId).not.toBeNull();
    expect(audit.txId).toBe(contributionInsert.txId);
    expect(audit.values).toMatchObject({
      event_type: 'CONTRIBUTION_CREATED', contribution_id: id, actor_type: 'MEMBER', actor_user_id: 42,
      request_id: PROVENANCE.requestId, session_id: PROVENANCE.sessionId, client_ip: PROVENANCE.ipAddress,
      resulting_state: 'CREATED',
    });
  });

  it('a failed audit insert rolls back the business write and fails the call (fail closed)', async () => {
    const { service } = makeService();
    fake.failWhen = (op) => (op.table === 'financial_audit_log' ? new Error('audit insert failed') : null);

    await expect(service.createContribution(obligation, MEMBER)).rejects.toThrow('audit insert failed');
    expect(fake.writes('financial_contributions')).toHaveLength(0);
    expect(fake.writes('financial_event_outbox')).toHaveLength(0);
    expect(fake.rolledBack.map((op) => op.table)).toEqual(
      expect.arrayContaining(['financial_contributions', 'financial_event_outbox']),
    );
  });

  it('a failed audit insert rolls back a settlement start (state stays unchanged)', async () => {
    const { service } = makeService();
    scriptContribution({ state: 'AWAITING_SETTLEMENT' });
    fake.failWhen = (op) => (op.table === 'financial_audit_log' ? new Error('audit down') : null);

    await expect(service.startSettlement(77, MEMBER)).rejects.toThrow('audit down');
    expect(fake.writes('financial_contributions', 'update')).toHaveLength(0);
  });

  it('existing callers without provenance are recorded as SYSTEM with nothing fabricated', async () => {
    const { service } = makeService();
    await service.createContribution(obligation);
    expect(auditRows()[0]).toMatchObject({
      actor_type: 'SYSTEM', actor_user_id: null, request_id: null, session_id: null, client_ip: null, user_agent: null,
    });
  });
});

// ── 4. Provider order audit (OBS-06) ───────────────────────────────────────

describe('provider order audit (OBS-06)', () => {
  function metadataOf(row: Record<string, unknown>): FinancialAuditMetadata {
    return JSON.parse(String(row.metadata_json));
  }

  it('CREATED: the persisted reference and its audit row commit together', async () => {
    const { service, provider } = makeService();
    scriptContribution({ state: 'AWAITING_SETTLEMENT' });

    const result = await service.initiateProviderSettlement(77, MEMBER);
    expect(result.providerOrderReference).toBe('order_new');

    const created = auditOps().find((op) => op.values!.event_type === 'PROVIDER_ORDER_CREATED')!;
    expect(metadataOf(created.values!)).toEqual({ providerOrderOutcome: 'CREATED' });
    expect(created.values).toMatchObject({ provider_order_ref: 'order_new', contribution_id: 77 });
    expect(String(created.values!.provider_receipt_ref)).toMatch(/^FC-77-[0-9a-f]{8}$/);

    const persist = fake
      .writes('financial_contributions', 'update')
      .find((op) => op.set!.active_settlement_reference === 'order_new')!;
    expect(created.txId).toBe(persist.txId);

    expect(auditRows().map((r) => r.event_type)).toEqual(['SETTLEMENT_START_REQUESTED', 'PROVIDER_ORDER_CREATED']);
    // Section 9: correlation ids go into Razorpay order notes.
    expect(provider.createOrder.mock.calls[0][0].metadata).toMatchObject({
      contributionId: 77, bccRequestId: PROVENANCE.requestId,
    });
  });

  it('REUSED: an existing active reference is audited and the provider is not called again', async () => {
    const { service, provider } = makeService();
    scriptContribution({ state: 'SETTLEMENT_IN_PROGRESS', ref: 'order_existing' });

    const result = await service.initiateProviderSettlement(77, MEMBER);
    expect(result.providerOrderReference).toBe('order_existing');
    expect(provider.createOrder).not.toHaveBeenCalled();

    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'PROVIDER_ORDER_CREATED', provider_order_ref: 'order_existing' });
    expect(metadataOf(rows[0])).toEqual({ providerOrderOutcome: 'REUSED' });
  });

  it('DISCARDED_LOST_RACE: the orphan order id is retained alongside the winning one', async () => {
    const { service } = makeService(
      makeProvider({ createOrder: jest.fn().mockResolvedValue({ providerOrderReference: 'order_mine', amountPaise: 5000, currency: 'INR' }) }),
    );
    scriptContribution({ state: 'AWAITING_SETTLEMENT', loseRaceTo: 'order_winner' });

    const result = await service.initiateProviderSettlement(77, MEMBER);
    expect(result.providerOrderReference).toBe('order_winner');

    const discarded = auditRows().find((r) => r.event_type === 'PROVIDER_ORDER_CREATED')!;
    expect(discarded.provider_order_ref).toBe('order_winner');
    expect(metadataOf(discarded)).toEqual({
      providerOrderOutcome: 'DISCARDED_LOST_RACE',
      discardedProviderOrderReference: 'order_mine',
    });
  });

  it('PROVIDER_ORDER_FAILED on createOrder() failure, committed with the FAILED transition', async () => {
    const { service } = makeService(makeProvider({ createOrder: jest.fn().mockRejectedValue(new Error('gateway down')) }));
    scriptContribution({ state: 'AWAITING_SETTLEMENT' });

    await expect(service.initiateProviderSettlement(77, MEMBER)).rejects.toThrow('gateway down');

    const failed = auditOps().find((op) => op.values!.event_type === 'PROVIDER_ORDER_FAILED')!;
    expect(failed.values).toMatchObject({ provider_order_ref: null, previous_state: 'SETTLEMENT_IN_PROGRESS', resulting_state: 'FAILED' });
    const toFailed = fake.writes('financial_contributions', 'update').find((op) => op.set!.state === 'FAILED')!;
    expect(failed.txId).toBe(toFailed.txId);
  });

  it('PROVIDER_ORDER_FAILED retains the created order id when it could not be persisted', async () => {
    const { service } = makeService();
    scriptContribution({ state: 'AWAITING_SETTLEMENT' });
    fake.failWhen = (op) =>
      op.table === 'financial_contributions' && op.kind === 'update' && op.set?.active_settlement_reference === 'order_new'
        ? new Error('db write failed')
        : null;

    await expect(service.initiateProviderSettlement(77, MEMBER)).rejects.toThrow('db write failed');
    const failed = auditRows().find((r) => r.event_type === 'PROVIDER_ORDER_FAILED')!;
    expect(failed.provider_order_ref).toBe('order_new');
  });

  it('the order id survives active_settlement_reference being cleared by the outcome', async () => {
    const { service } = makeService();
    const row = scriptContribution({ state: 'AWAITING_SETTLEMENT' });
    await service.initiateProviderSettlement(77, MEMBER);
    await service.recordSettlementOutcome(77, {
      provider: 'RAZORPAY', providerReference: 'pay_1', result: 'SUCCEEDED', amountPaise: 5000,
    });
    expect(row.active_settlement_reference).toBeNull();
    expect(auditRows().some((r) => r.provider_order_ref === 'order_new')).toBe(true);
  });
});

// ── 5. Settlement outcome linking (OBS-07) ─────────────────────────────────

describe('settlement outcome linking (OBS-07)', () => {
  it('links contribution, order, payment, transaction, webhook and final state in the outcome transaction', async () => {
    const { service } = makeService();
    scriptContribution({ state: 'SETTLEMENT_IN_PROGRESS', ref: 'order_abc' });

    await service.recordSettlementOutcome(
      77,
      { provider: 'RAZORPAY', providerReference: 'pay_1', result: 'SUCCEEDED', amountPaise: 5000 },
      { actorType: 'WEBHOOK', webhookInboxId: 555, provenance: { requestId: PROVENANCE.requestId } },
    );

    const txnInsert = fake.writes('financial_transactions', 'insert')[0];
    const transactionId = Number((txnInsert.result as { insertId: bigint }).insertId);
    const outcome = auditOps().find((op) => op.values!.event_type === 'SETTLEMENT_OUTCOME_RECORDED')!;

    expect(outcome.values).toMatchObject({
      contribution_id: 77,
      transaction_id: transactionId,
      webhook_inbox_id: 555,
      provider_order_ref: 'order_abc',
      provider_payment_ref: 'pay_1',
      actor_type: 'WEBHOOK',
      actor_user_id: null,
      session_id: null,
      request_id: PROVENANCE.requestId,
      previous_state: 'SETTLEMENT_IN_PROGRESS',
      resulting_state: 'COMPLETED',
    });
    expect(outcome.txId).toBe(txnInsert.txId);
  });

  it('an idempotent replay writes no second audit row', async () => {
    const { service } = makeService();
    scriptContribution({ state: 'COMPLETED' });
    const base = fake.responder;
    fake.responder = (op) =>
      op.table === 'financial_transactions' && op.kind === 'select' ? [{ id: 900 }] : base(op);

    const result = await service.recordSettlementOutcome(77, {
      provider: 'RAZORPAY', providerReference: 'pay_1', result: 'SUCCEEDED', amountPaise: 5000,
    });
    expect(result.transactionId).toBe(900);
    expect(auditRows()).toHaveLength(0);
  });
});

// ── Evidence + refund + retry events ───────────────────────────────────────

describe('evidence, retry and refund events', () => {
  it('evidence submit/approve/reject each commit their write with their audit row', async () => {
    const { service } = makeService();
    const evidenceService = new SettlementEvidenceService(service, {} as R2Service, new FinancialAuditService());
    const contribution = scriptContribution({ state: 'SETTLEMENT_IN_PROGRESS', ref: null });
    const base = fake.responder;
    fake.responder = (op) =>
      op.table === 'financial_settlement_evidence' && op.kind === 'select'
        ? [{ id: 31, financial_contribution_id: 77, review_status: 'PENDING_REVIEW', claimed_amount_paise: 5000, reference_identifier: 'UTR123' }]
        : base(op);

    await evidenceService.submit(
      { financialContributionId: 77, referenceIdentifier: 'UTR123', paymentDate: new Date('2026-09-20'), claimedAmountPaise: 5000, submittedByUserId: 42 },
      MEMBER,
    );
    await evidenceService.approve(31, 1, 'MANUAL', 'ok', { actorType: 'ADMIN', provenance: { actorUserId: 1 } });

    const submitInsert = fake.writes('financial_settlement_evidence', 'insert')[0];
    const submitted = auditOps().find((op) => op.values!.event_type === 'SETTLEMENT_EVIDENCE_SUBMITTED')!;
    expect(submitted.txId).toBe(submitInsert.txId);
    expect(submitted.values).toMatchObject({ settlement_evidence_id: Number((submitInsert.result as { insertId: bigint }).insertId), actor_type: 'MEMBER' });

    const reviewUpdate = fake.writes('financial_settlement_evidence', 'update')[0];
    const approved = auditOps().find((op) => op.values!.event_type === 'SETTLEMENT_EVIDENCE_APPROVED')!;
    expect(approved.txId).toBe(reviewUpdate.txId);
    expect(approved.values).toMatchObject({ settlement_evidence_id: 31, actor_type: 'ADMIN', actor_user_id: 1 });

    expect(auditRows().map((r) => r.event_type)).toEqual([
      'SETTLEMENT_EVIDENCE_SUBMITTED', 'SETTLEMENT_EVIDENCE_APPROVED', 'SETTLEMENT_OUTCOME_RECORDED',
    ]);
    expect(contribution.state).toBe('COMPLETED');
  });

  it('SETTLEMENT_RETRY_REQUESTED on reopening a FAILED contribution', async () => {
    const { service } = makeService();
    scriptContribution({ state: 'FAILED' });
    await service.retrySettlement(77, MEMBER);
    expect(auditRows()[0]).toMatchObject({
      event_type: 'SETTLEMENT_RETRY_REQUESTED', previous_state: 'FAILED', resulting_state: 'AWAITING_SETTLEMENT',
    });
  });

  it('REFUND_REQUESTED commits with the refund row', async () => {
    const { service } = makeService();
    scriptContribution({ state: 'COMPLETED' });
    await service.requestRefund(77, 'Application rejected', { actorType: 'HUMAN', actorUserId: 1 });
    const refundInsert = fake.writes('financial_refunds', 'insert')[0];
    const refund = auditOps().find((op) => op.values!.event_type === 'REFUND_REQUESTED')!;
    expect(refund.txId).toBe(refundInsert.txId);
    expect(refund.values).toMatchObject({
      refund_id: Number((refundInsert.result as { insertId: bigint }).insertId), actor_type: 'ADMIN', actor_user_id: 1,
    });
  });
});

// ── 6. Whitelist ───────────────────────────────────────────────────────────

describe('metadata / provenance whitelist', () => {
  it('only whitelisted metadata keys are ever serialized', async () => {
    const audit = new FinancialAuditService();
    const smuggled = {
      providerOrderOutcome: 'CREATED',
      authorization: 'Bearer eyJhbGciOi.secret',
      cookie: 'refresh=abc',
      headers: { 'x-api-key': 'k' },
      body: { password: 'p' },
    } as unknown as FinancialAuditMetadata;

    await audit.record(db, { eventType: 'PROVIDER_ORDER_CREATED', actorType: 'MEMBER', metadata: smuggled });
    const row = auditRows()[0];
    expect(Object.keys(JSON.parse(String(row.metadata_json)))).toEqual(['providerOrderOutcome']);
    expect(JSON.stringify(row)).not.toMatch(/Bearer|refresh=|x-api-key|password/);
  });

  it('extra provenance fields cannot reach any column', async () => {
    const audit = new FinancialAuditService();
    const provenance = { ...PROVENANCE, authorization: 'Bearer secret', cookie: 'rt=1' } as never;
    await audit.record(db, { eventType: 'CONTRIBUTION_CREATED', actorType: 'MEMBER', provenance });
    expect(JSON.stringify(auditRows()[0])).not.toMatch(/Bearer|rt=1/);
  });

  it('User-Agent is capped at 500 characters (OBS-05)', async () => {
    const audit = new FinancialAuditService();
    await audit.record(db, {
      eventType: 'CONTRIBUTION_CREATED', actorType: 'MEMBER', provenance: { userAgent: 'x'.repeat(2000) },
    });
    expect(String(auditRows()[0].user_agent)).toHaveLength(500);
  });

  it('buildRequestProvenance reads only id/ip/user-agent/route and the JWT sub/sid', () => {
    const provenance = buildRequestProvenance(
      {
        id: PROVENANCE.requestId,
        ip: '203.0.113.9',
        headers: {
          'user-agent': 'UA',
          authorization: 'Bearer token',
          cookie: 'rt=secret',
          'x-forwarded-for': '6.6.6.6',
          'x-request-id': 'client-chosen',
        },
        routeOptions: { url: '/api/v1/financial/contributions/:id/settlement/start' },
      },
      { sub: 42, sid: PROVENANCE.sessionId },
    );
    expect(provenance).toEqual({
      requestId: PROVENANCE.requestId,
      actorUserId: 42,
      sessionId: PROVENANCE.sessionId,
      ipAddress: '203.0.113.9',
      userAgent: 'UA',
      route: '/api/v1/financial/contributions/:id/settlement/start',
    });
  });
});
