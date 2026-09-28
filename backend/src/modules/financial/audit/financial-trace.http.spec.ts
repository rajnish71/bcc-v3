// Behavioural HTTP tests for the forensic trace API (OBS-09/OBS-10). Boots
// FinancialController in a Nest Fastify app with the production Fastify
// options, the real AccessTokenGuard/RbacGuard, and the real
// FinancialTraceService over a recording fake of db.ts.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));
// kysely is ESM-only at runtime under this Jest config; the only runtime
// value used on this path is the `sql` tag, which the fake records verbatim.
jest.mock('kysely', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const expr = { sql: strings.join('?'), values, as: (alias: string) => ({ ...expr, alias }) };
    return expr;
  };
  return { sql };
});

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { fastifyServerOptions, registerRequestIdResponseHeader } from '../../../http/fastify-options';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RbacService } from '../../identity/rbac/rbac.service';
import { FinancialController } from '../financial.controller';
import { FinancialContributionService } from '../financial-contribution.service';
import { SettlementEvidenceService } from '../settlement-evidence.service';
import { SETTLEMENT_PROVIDER } from '../settlement-provider.interface';
import { FinancialTraceService } from './financial-trace.service';

const fake = db as unknown as FakeDb;
process.env.JWT_ACCESS_SECRET = 'trace-test-secret';

const AUDITOR = 1;
const MEMBER = 2;
const REQUEST_ID = '9b2f6c1e-1f1a-4b8a-9c3d-0a1b2c3d4e5f';

const CONTRIBUTION = {
  id: 77, uuid: 'c-77', payer_user_id: MEMBER, business_module: 'MEMBERSHIP', business_reference_id: 9,
  purpose: 'Membership', amount_paise: 5000, currency: 'INR', state: 'COMPLETED',
  active_settlement_reference: null, created_at: '2026-09-20', updated_at: '2026-09-20',
};

const AUDIT_ROW = {
  id: 1, uuid: 'a-1', event_type: 'SETTLEMENT_OUTCOME_RECORDED', contribution_id: 77, transaction_id: 900,
  refund_id: null, settlement_evidence_id: null, webhook_inbox_id: 555, actor_type: 'WEBHOOK', actor_user_id: null,
  request_id: REQUEST_ID, session_id: null, client_ip: null, user_agent: null, http_route: '/api/v1/financial/webhooks/razorpay',
  provider_order_ref: 'order_abc', provider_payment_ref: 'pay_1', provider_receipt_ref: null,
  previous_state: 'SETTLEMENT_IN_PROGRESS', resulting_state: 'COMPLETED', metadata_json: null, created_at: '2026-09-27',
};

const INBOX_ROW = {
  id: 555, provider: 'RAZORPAY', provider_event_id: 'evt_1', event_type: 'payment.captured', status: 'PROCESSED',
  processing_error: null, received_at: '2026-09-27', processed_at: '2026-09-27',
  derived_order_ref: 'order_abc', derived_payment_ref: 'pay_1',
  // Present in the table; must never reach the response.
  payload: { secret_field: 'FULL-WEBHOOK-PAYLOAD' },
  contribution_id: 77,
};

// withAudit=false simulates a pre-remediation contribution (no audit rows).
function script(withAudit: boolean) {
  fake.responder = (op: FakeOp) => {
    if (op.kind !== 'select') return undefined;
    switch (op.table) {
      case 'financial_contributions': return [CONTRIBUTION];
      case 'financial_audit_log': return withAudit ? [AUDIT_ROW] : [];
      case 'settlement_webhook_inbox': return [INBOX_ROW];
      case 'financial_transactions':
        return [{ id: 900, contribution_id: 77, uuid: 't', provider: 'RAZORPAY', provider_reference: 'pay_1', amount_paise: 5000, currency: 'INR', outcome: 'SUCCEEDED', failure_reason: null, created_at: 'x' }];
      default: return [];
    }
  };
}

describe('GET /api/v1/financial/admin/trace', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  const permissions = new Map<number, Set<string>>([
    [AUDITOR, new Set(['financial.audit.view'])],
    [MEMBER, new Set(['financial.settlement.verify'])],
  ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinancialController],
      providers: [
        JwtService,
        AccessTokenGuard,
        RbacGuard,
        FinancialTraceService,
        { provide: RbacService, useValue: { getActivePermissionKeys: async (id: number) => permissions.get(id) ?? new Set() } },
        { provide: FinancialContributionService, useValue: {} },
        { provide: SettlementEvidenceService, useValue: {} },
        { provide: SETTLEMENT_PROVIDER, useValue: { providerName: 'RAZORPAY' } },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(fastifyServerOptions));
    registerRequestIdResponseHeader(app.getHttpAdapter().getInstance());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { fake.reset(); script(true); });

  async function get(userId: number | null, query: string) {
    const headers: Record<string, string> = {};
    if (userId !== null) {
      const token = await jwt.signAsync(
        { sub: userId, uuid: `u-${userId}`, status: 'ACTIVE', sid: 'sess' },
        { secret: process.env.JWT_ACCESS_SECRET },
      );
      headers.authorization = `Bearer ${token}`;
    }
    return app.inject({ method: 'GET', url: `/api/v1/financial/admin/trace${query}`, headers });
  }

  it('401 without a token', async () => {
    expect((await get(null, '?contributionId=77')).statusCode).toBe(401);
  });

  it('403 for an authenticated user lacking financial.audit.view (even a settlement verifier)', async () => {
    const res = await get(MEMBER, '?contributionId=77');
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('order_abc');
  });

  it('400 when no lookup criterion is supplied', async () => {
    expect((await get(AUDITOR, '')).statusCode).toBe(400);
  });

  it('lookup by contributionId returns the reconstructed chain as RETAINED', async () => {
    const res = await get(AUDITOR, '?contributionId=77');
    expect(res.statusCode).toBe(200);
    const [trace] = res.json().contributions;
    expect(trace.provenance).toBe('RETAINED');
    expect(trace.auditEvents[0]).toMatchObject({
      eventType: 'SETTLEMENT_OUTCOME_RECORDED', transactionId: 900, webhookInboxId: 555, providerOrderRef: 'order_abc',
    });
    expect(trace.providerReferences).toEqual(
      expect.arrayContaining([
        { kind: 'ORDER', value: 'order_abc', source: 'RETAINED' },
        { kind: 'PAYMENT', value: 'pay_1', source: 'RETAINED' },
      ]),
    );
  });

  it('never returns the full webhook payload', async () => {
    const res = await get(AUDITOR, '?contributionId=77');
    expect(res.body).not.toContain('FULL-WEBHOOK-PAYLOAD');
    expect(res.json().contributions[0].webhookInbox[0]).not.toHaveProperty('payload');
  });

  it('lookup by requestId resolves through the audit log', async () => {
    const res = await get(AUDITOR, `?requestId=${REQUEST_ID}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().resolvedVia).toContain('RETAINED');
    expect(res.json().contributions[0].contributionId).toBe(77);
    const lookup = fake.selects.find((op) => op.table === 'financial_audit_log' && op.wheres.some(([c]) => c === 'request_id'));
    expect(lookup!.wheres).toContainEqual(['request_id', '=', REQUEST_ID]);
  });

  it('lookup by provider order and payment reference works', async () => {
    expect((await get(AUDITOR, '?orderRef=order_abc')).json().contributions[0].contributionId).toBe(77);
    expect((await get(AUDITOR, '?paymentRef=pay_1')).json().contributions[0].contributionId).toBe(77);
  });

  it('a pre-remediation contribution is NOT_RETAINED and its webhook-derived order id is labelled DERIVED', async () => {
    script(false);
    const res = await get(AUDITOR, '?orderRef=order_abc');
    const body = res.json();
    expect(body.resolvedVia).toEqual(expect.arrayContaining(['DERIVED']));
    expect(body.resolvedVia).not.toContain('RETAINED');
    const [trace] = body.contributions;
    expect(trace.provenance).toBe('NOT_RETAINED');
    expect(trace.auditEvents).toEqual([]);
    expect(trace.providerReferences).toEqual(
      expect.arrayContaining([
        { kind: 'ORDER', value: 'order_abc', source: 'DERIVED' },
        { kind: 'PAYMENT', value: 'pay_1', source: 'CANONICAL' },
      ]),
    );
  });

  it('rejects an unknown query parameter and a non-UUID requestId', async () => {
    expect((await get(AUDITOR, '?contributionId=77&debug=1')).statusCode).toBe(400);
    expect((await get(AUDITOR, '?requestId=not-a-uuid')).statusCode).toBe(400);
  });

  it('performs no writes', async () => {
    await get(AUDITOR, '?contributionId=77');
    expect(fake.committed).toHaveLength(0);
  });
});
