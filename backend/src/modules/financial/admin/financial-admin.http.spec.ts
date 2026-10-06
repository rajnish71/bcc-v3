// Track 4 -- Admin Financial Visibility: behavioural HTTP tests.
//
// Boots FinancialAdminController (and the existing FinancialController, to
// prove the member-owner route is unaffected) in a Nest Fastify app with
// the production Fastify options, the real AccessTokenGuard/RbacGuard and
// the real FinancialAdminService over the recording fake of db.ts.
//
// Role -> permission sets are derived from the actual migration 0114 grant
// (see roleGrants()), plus each role's pre-existing financial grants, so the
// RBAC boundary under test is the one the migration ships.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));
jest.mock('kysely', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const expr = { sql: strings.join('?'), values, as: (alias: string) => ({ ...expr, alias }) };
    return expr;
  };
  return { sql };
});

import * as fs from 'fs';
import * as path from 'path';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { fastifyServerOptions } from '../../../http/fastify-options';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RbacService } from '../../identity/rbac/rbac.service';
import { FinancialController } from '../financial.controller';
import { FinancialContributionService } from '../financial-contribution.service';
import { SettlementEvidenceService } from '../settlement-evidence.service';
import { SETTLEMENT_PROVIDER } from '../settlement-provider.interface';
import { FinancialTraceService } from '../audit/financial-trace.service';
import { FinancialAdminController } from './financial-admin.controller';
import { FinancialAdminService } from './financial-admin.service';
import { MAX_PAGE_SIZE, NO_RECEIPT_LABEL } from './financial-admin.mappers';
import { SEARCH_FIELDS, buildSearchTerms } from './financial-admin-search';

const fake = db as unknown as FakeDb;
process.env.JWT_ACCESS_SECRET = 'financial-admin-test-secret';

const REPO = path.resolve(__dirname, '../../../../..');
const MIGRATION_0114 = path.join(REPO, 'database/migrations/0114_add_financial_read_permission_and_financial_authority_role.sql');

// Parses the role list granted financial.read by migration 0114.
function roleGrants(): string[] {
  const src = fs.readFileSync(MIGRATION_0114, 'utf8');
  const m = src.match(/WHERE r\.name IN \(([^)]*)\)\s*AND p\.permission_key = 'financial\.read'/);
  if (!m) throw new Error('0114 grant clause not found');
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
}

const GRANTED = new Set(roleGrants());
// Pre-existing financial grants (0089/0101) -- never imply financial.read.
const PRIOR: Record<string, string[]> = {
  'Super Admin': ['financial.settlement.verify', 'financial.audit.view'],
  'Platform Admin': ['financial.settlement.verify', 'financial.audit.view'],
};
function permsFor(role: string | null): Set<string> {
  if (!role) return new Set();
  const keys = new Set(PRIOR[role] ?? []);
  if (GRANTED.has(role)) keys.add('financial.read');
  return keys;
}

const USERS: Record<string, { id: number; role: string | null }> = {
  superAdmin: { id: 1, role: 'Super Admin' },
  financialAuthority: { id: 2, role: 'Financial Authority' },
  coordinator: { id: 3, role: 'Coordinator' },
  volunteer: { id: 4, role: null }, // volunteers are event assignments, not an RBAC role
  member: { id: 5, role: null },
  contentEditor: { id: 6, role: 'Content Editor' },
  moderator: { id: 7, role: 'Moderator' },
  platformAdmin: { id: 8, role: 'Platform Admin' },
  financeManager: { id: 9, role: 'Finance Manager' },
};
const PAYER = 5;

const CONTRIB_UUID = '3f1c2b8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

// Rows deliberately carry columns that must never reach a response, to
// prove the mapper -- not the SELECT list alone -- is the exposure boundary.
const CONTRIB_ROW = {
  id: 77, payer_user_id: PAYER, business_reference_id: 9, idempotency_key: 'idem-secret',
  active_settlement_url: 'https://rzp.io/i/secret', active_settlement_reference: 'order_secret',
  uuid: CONTRIB_UUID, business_module: 'EVENT_REGISTRATION', purpose: 'Event 11', state: 'COMPLETED',
  amount_paise: 1000, currency: 'INR', expires_at: null, created_at: '2026-09-30T10:00:00Z', updated_at: '2026-09-30T10:05:00Z',
  contributor_name: 'Asha Rao', contributor_username: 'asha', membership_number: 'BCC20191100021',
  receipt_number: 'BCC-RCP-202609-000077', receipt_issued_at: '2026-09-30T10:05:00Z', refund_status: null,
  latest_provider: 'RAZORPAY', latest_outcome: 'SUCCEEDED', evidence_status: null,
};
const ZERO_ROW = {
  ...CONTRIB_ROW, amount_paise: 0, state: 'COMPLETED', receipt_number: null, receipt_issued_at: null,
  latest_provider: null, latest_outcome: null, membership_number: 'BCCTemp00012',
};

type Script = Partial<Record<string, unknown>>;
function script(tables: Script) {
  fake.responder = (op: FakeOp) => (op.kind === 'select' ? tables[op.table] : undefined);
}

const DETAIL_TABLES: Script = {
  'financial_contributions as fc': [CONTRIB_ROW],
  financial_contributions: [{ id: 77 }],
  financial_transactions: [{
    id: 900, contribution_id: 77, uuid: 't-uuid', provider: 'RAZORPAY', provider_reference: 'pay_1',
    amount_paise: 1000, currency: 'INR', outcome: 'SUCCEEDED', failure_reason: null, created_at: '2026-09-30T10:05:00Z',
  }],
  financial_refunds: undefined,
  financial_settlement_evidence: [{
    id: 31, financial_contribution_id: 77, submitted_by_user_id: PAYER, reviewed_by_user_id: 1,
    proof_object_key: 'evidence/77/proof.jpg', reference_identifier: 'UTR123', review_note: 'internal',
    uuid: 'e-uuid', claimed_amount_paise: 1000, payment_date: '2026-09-29', submitted_at: '2026-09-29T09:00:00Z',
    review_status: 'APPROVED', reviewed_at: '2026-09-30T10:05:00Z',
  }],
  financial_audit_log: [{
    id: 1, actor_user_id: 1, request_id: 'req-secret', session_id: 'sess-secret', client_ip: '203.0.113.9',
    user_agent: 'UA-secret', http_route: '/api/v1/x', event_type: 'SETTLEMENT_OUTCOME_RECORDED',
    previous_state: 'SETTLEMENT_IN_PROGRESS', resulting_state: 'COMPLETED', actor_type: 'WEBHOOK', created_at: '2026-09-30T10:05:00Z',
  }],
  receipts: [{ id: 5, contribution_id: 77, uuid: 'r-uuid', receipt_number: 'BCC-RCP-202609-000077', amount_paise: 1000, currency: 'INR', issued_at: '2026-09-30T10:05:00Z' }],
};

const FORBIDDEN_STRINGS = [
  'payer_user_id', 'payerUserId', 'business_reference_id', 'businessReferenceId', 'idem-secret',
  'rzp.io', 'order_secret', 'proof_object_key', 'proofObjectKey', 'evidence/77/proof.jpg', 'UTR123',
  'req-secret', 'sess-secret', '203.0.113.9', 'UA-secret', 'requestId', 'sessionId', 'clientIp', 'userAgent',
  'actorUserId', 'BCCTemp', '"id"',
];

describe('Track 4 admin financial API (api/v1/financial/admin)', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  const ownerService = { getContribution: jest.fn() };

  beforeAll(async () => {
    const byId = new Map(Object.values(USERS).map((u) => [u.id, permsFor(u.role)]));
    const moduleRef = await Test.createTestingModule({
      controllers: [FinancialAdminController, FinancialController],
      providers: [
        JwtService,
        AccessTokenGuard,
        RbacGuard,
        FinancialAdminService,
        { provide: RbacService, useValue: { getActivePermissionKeys: async (id: number) => byId.get(id) ?? new Set() } },
        { provide: FinancialContributionService, useValue: ownerService },
        { provide: SettlementEvidenceService, useValue: {} },
        { provide: FinancialTraceService, useValue: {} },
        { provide: SETTLEMENT_PROVIDER, useValue: { providerName: 'RAZORPAY' } },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(fastifyServerOptions));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { fake.reset(); script({ 'financial_contributions as fc': [CONTRIB_ROW] }); ownerService.getContribution.mockReset(); });

  async function call(userId: number | null, url: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET') {
    const headers: Record<string, string> = {};
    if (userId !== null) {
      const token = await jwt.signAsync(
        { sub: userId, uuid: `u-${userId}`, status: 'ACTIVE', sid: 'sess' },
        { secret: process.env.JWT_ACCESS_SECRET },
      );
      headers.authorization = `Bearer ${token}`;
    }
    return app.inject({ method, url, headers });
  }

  const ROUTES = [
    '/api/v1/financial/admin/overview',
    '/api/v1/financial/admin/contributions',
    `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`,
    '/api/v1/financial/admin/refunds',
    '/api/v1/financial/admin/receipts',
    '/api/v1/financial/admin/exceptions',
    '/api/v1/financial/admin/search?q=asha',
  ];

  // ── RBAC boundary ────────────────────────────────────────────────────────

  it('migration 0114 grants financial.read to Super Admin and Financial Authority only', () => {
    expect([...GRANTED].sort()).toEqual(['Financial Authority', 'Super Admin']);
  });

  it('no other migration or seed grants financial.read', () => {
    const dirs = ['database/migrations', 'database/seeds'].map((d) => path.join(REPO, d));
    const offenders = dirs
      .flatMap((d) => fs.readdirSync(d).map((f) => path.join(d, f)))
      .filter((f) => f.endsWith('.sql') && f !== MIGRATION_0114)
      .filter((f) => fs.readFileSync(f, 'utf8').includes("'financial.read'"));
    expect(offenders).toEqual([]);
  });

  it('migration 0114 creates Financial Authority as a SYSTEM role and does not grant verify/audit permissions', () => {
    const src = fs.readFileSync(MIGRATION_0114, 'utf8');
    expect(src).toContain("VALUES ('Financial Authority', 'SYSTEM')");
    expect(src).not.toContain('financial.settlement.verify\'');
    expect(src).not.toMatch(/permission_key = 'financial\.(settlement\.verify|audit\.view)'/);
    expect(src).not.toMatch(/INSERT[^;]*user_roles/i);
  });

  it.each(ROUTES)('Super Admin can read %s', async (url) => {
    script(DETAIL_TABLES);
    expect((await call(USERS.superAdmin.id, url)).statusCode).toBe(200);
  });

  it.each(ROUTES)('Financial Authority can read %s', async (url) => {
    script(DETAIL_TABLES);
    expect((await call(USERS.financialAuthority.id, url)).statusCode).toBe(200);
  });

  const DENIED = ['coordinator', 'volunteer', 'member', 'contentEditor', 'moderator', 'platformAdmin', 'financeManager'] as const;
  for (const who of DENIED) {
    it.each(ROUTES)(`${who} is denied (403) on %s even by direct URL`, async (url) => {
      const res = await call(USERS[who].id, url);
      expect(res.statusCode).toBe(403);
      expect(res.body).not.toContain('Asha');
      expect(fake.selects).toHaveLength(0);
    });
  }

  it.each(ROUTES)('401 without a token on %s', async (url) => {
    expect((await call(null, url)).statusCode).toBe(401);
  });

  // ── GET-only / no mutation ───────────────────────────────────────────────

  it('controller declares GET handlers only', () => {
    const proto = FinancialAdminController.prototype as unknown as Record<string, unknown>;
    const methods = Object.getOwnPropertyNames(proto)
      .filter((k) => k !== 'constructor')
      .map((k) => Reflect.getMetadata(METHOD_METADATA, proto[k] as object));
    expect(methods.length).toBe(7);
    expect(methods.every((m) => m === RequestMethod.GET)).toBe(true);
  });

  it.each(['POST', 'PATCH', 'DELETE'] as const)('%s on admin financial routes is not routable', async (method) => {
    for (const url of ['/api/v1/financial/admin/refunds', `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`]) {
      expect((await call(USERS.superAdmin.id, url, method)).statusCode).toBe(404);
    }
  });

  it('a request never writes (insert/update/delete) to any table', async () => {
    script(DETAIL_TABLES);
    for (const url of ROUTES) await call(USERS.superAdmin.id, url);
    expect(fake.committed).toEqual([]);
  });

  it('the admin service has no mutation, provider or refund-execution path', () => {
    const src = fs.readFileSync(path.join(__dirname, 'financial-admin.service.ts'), 'utf8');
    expect(src).not.toMatch(/\.(insertInto|updateTable|deleteFrom|transaction)\(/);
    const imports = src.split(/\r?\n/).filter((l) => l.startsWith('import') || l.includes(" from '")).join('\n');
    expect(imports).not.toMatch(/SETTLEMENT_PROVIDER|FinancialContributionService|SettlementEvidenceService|razorpay/i);
  });

  // ── Data exposure ────────────────────────────────────────────────────────

  it('contribution detail exposes no numeric ids, payer_user_id, forensic metadata, proof storage or BCCTemp', async () => {
    script(DETAIL_TABLES);
    const res = await call(USERS.financialAuthority.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`);
    expect(res.statusCode).toBe(200);
    for (const s of FORBIDDEN_STRINGS) expect(res.body).not.toContain(s);
    const body = res.json();
    expect(body.reference).toBe(CONTRIB_UUID);
    expect(body.contributor).toEqual({ name: 'Asha Rao', username: 'asha', membershipNumber: 'BCC20191100021' });
    expect(body.auditTrail).toEqual([{
      eventType: 'SETTLEMENT_OUTCOME_RECORDED', previousState: 'SETTLEMENT_IN_PROGRESS',
      resultingState: 'COMPLETED', actorType: 'WEBHOOK', occurredAt: '2026-09-30T10:05:00.000Z',
    }]);
    expect(Object.keys(body.settlementEvidence[0]).sort()).toEqual(
      ['claimedAmountPaise', 'paymentDate', 'reference', 'reviewStatus', 'reviewedAt', 'submittedAt'],
    );
  });

  it('list responses expose no numeric ids, payer_user_id or BCCTemp', async () => {
    script({ 'financial_contributions as fc': [ZERO_ROW] });
    const res = await call(USERS.superAdmin.id, '/api/v1/financial/admin/contributions');
    for (const s of FORBIDDEN_STRINGS) expect(res.body).not.toContain(s);
    expect(res.json().items[0].contributor.membershipNumber).toBeNull();
  });

  it('admin detail does not invoke member-owner semantics', async () => {
    script(DETAIL_TABLES);
    await call(USERS.financialAuthority.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`);
    expect(ownerService.getContribution).not.toHaveBeenCalled();
    const lookup = fake.selects.find((op) => op.table === 'financial_contributions as fc');
    expect(lookup?.wheres).toContainEqual(['fc.uuid', '=', CONTRIB_UUID]);
  });

  it('admin detail rejects a numeric id (UUID reference only)', async () => {
    expect((await call(USERS.superAdmin.id, '/api/v1/financial/admin/contributions/77')).statusCode).toBe(400);
  });

  it('404 for an unknown contribution reference', async () => {
    script({ 'financial_contributions as fc': [] });
    expect((await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`)).statusCode).toBe(404);
  });

  // ── Member-owner route unchanged ─────────────────────────────────────────

  it('existing member route still enforces ownership -- financial.read does not bypass it', async () => {
    ownerService.getContribution.mockResolvedValue({ payer_user_id: PAYER, state: 'COMPLETED', amount_paise: 1000, currency: 'INR' });
    expect((await call(USERS.financialAuthority.id, '/api/v1/financial/contributions/77')).statusCode).toBe(403);
    const own = await call(PAYER, '/api/v1/financial/contributions/77');
    expect(own.statusCode).toBe(200);
    expect(own.json()).toEqual({ contributionId: 77, state: 'COMPLETED', amountPaise: 1000, currency: 'INR' });
  });

  // ── Receipts / transactions: nothing fabricated ──────────────────────────

  it('zero-value contribution with no receipt maps to receipt: null and no transaction', async () => {
    script({ ...DETAIL_TABLES, 'financial_contributions as fc': [ZERO_ROW], receipts: undefined, financial_transactions: [] });
    const body = (await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`)).json();
    expect(body.amountPaise).toBe(0);
    expect(body.receipt).toBeNull();
    expect(body.transactions).toEqual([]);
    expect(body.latestTransaction).toBeNull();
  });

  it('frontend renders "No receipt issued" for a missing receipt', () => {
    const lib = fs.readFileSync(path.join(REPO, 'frontend/src/lib/financial-admin.ts'), 'utf8');
    expect(lib).toContain(NO_RECEIPT_LABEL);
  });

  // ── Refunds ──────────────────────────────────────────────────────────────

  it('refund list reads financial_refunds as stored', async () => {
    script({
      'financial_refunds as fr': [{
        id: 3, contribution_id: 77, requested_by_user_id: 1, uuid: 'rf-uuid', amount_paise: 1000, currency: 'INR',
        provider: 'RAZORPAY', provider_reference: 'rfnd_1', status: 'PROCESSING', reason: 'r', failure_reason: null,
        requested_by_type: 'HUMAN', requested_at: '2026-10-01T00:00:00Z', resolved_at: null,
        contribution_uuid: CONTRIB_UUID, business_module: 'MERCHANDISE_ORDER', contribution_state: 'COMPLETED',
        contributor_name: 'Asha Rao', contributor_username: 'asha',
      }],
    });
    const res = await call(USERS.financialAuthority.id, '/api/v1/financial/admin/refunds?status=PROCESSING');
    expect(res.statusCode).toBe(200);
    expect(fake.selects.map((op) => op.table)).toEqual(expect.arrayContaining(['financial_refunds as fr']));
    expect(fake.selects[0].wheres).toContainEqual(['fr.status', '=', 'PROCESSING']);
    const item = res.json().items[0];
    expect(item.reference).toBe('rf-uuid');
    expect(item.contribution.businessModule).toBe('MERCHANDISE_ORDER');
    expect(res.body).not.toContain('requestedByUserId');
  });

  // ── Pagination ───────────────────────────────────────────────────────────

  it('pageSize above the maximum is clamped server-side', async () => {
    const res = await call(USERS.superAdmin.id, '/api/v1/financial/admin/contributions?pageSize=5000&page=3');
    expect(res.json().pageSize).toBe(MAX_PAGE_SIZE);
    expect(res.json().page).toBe(3);
    const op = fake.selects.find((o) => o.limit !== undefined);
    expect(op?.limit).toBe(MAX_PAGE_SIZE);
    expect(op?.offset).toBe(2 * MAX_PAGE_SIZE);
  });

  it.each(['/api/v1/financial/admin/receipts', '/api/v1/financial/admin/refunds', '/api/v1/financial/admin/exceptions'])(
    'list %s is paginated with a bounded limit', async (url) => {
      await call(USERS.superAdmin.id, url);
      const limits = fake.selects.map((o) => o.limit).filter((l) => l !== undefined) as number[];
      expect(limits.length).toBeGreaterThan(0);
      expect(Math.max(...limits)).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    },
  );

  it('unknown query parameters are rejected', async () => {
    expect((await call(USERS.superAdmin.id, '/api/v1/financial/admin/contributions?payerUserId=5')).statusCode).toBe(400);
  });

  // ── Exceptions ───────────────────────────────────────────────────────────

  it('AWAITING_SETTLEMENT overdue is exactly state = AWAITING_SETTLEMENT and expires_at < now', async () => {
    const before = Date.now();
    await call(USERS.superAdmin.id, '/api/v1/financial/admin/exceptions?category=AWAITING_SETTLEMENT_OVERDUE');
    const op = fake.selects.find((o) => o.limit !== undefined)!;
    expect(op.wheres).toContainEqual(['fc.state', '=', 'AWAITING_SETTLEMENT']);
    expect(op.wheres).toContainEqual(['fc.expires_at', 'is not', null]);
    const exp = op.wheres.find(([c, o]) => c === 'fc.expires_at' && o === '<');
    expect(exp?.[2]).toBeInstanceOf(Date);
    expect((exp![2] as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it.each([
    ['SETTLEMENT_IN_PROGRESS', ['fc.state', '=', 'SETTLEMENT_IN_PROGRESS']],
    ['FAILED', ['fc.state', '=', 'FAILED']],
    ['ABANDONED', ['fc.state', '=', 'ABANDONED']],
    ['REFUND_PROCESSING', ['fr.status', '=', 'PROCESSING']],
    ['REFUND_FAILED', ['fr.status', '=', 'FAILED']],
  ])('exception category %s uses the canonical state predicate only', async (category, predicate) => {
    await call(USERS.superAdmin.id, `/api/v1/financial/admin/exceptions?category=${category}`);
    const op = fake.selects.find((o) => o.limit !== undefined)!;
    expect(op.wheres).toEqual([predicate]);
  });

  it('EVIDENCE_PENDING_REVIEW filters by canonical review_status via subquery', async () => {
    await call(USERS.superAdmin.id, '/api/v1/financial/admin/exceptions?category=EVIDENCE_PENDING_REVIEW');
    const op = fake.selects.find((o) => o.limit !== undefined)!;
    expect(op.wheres).toHaveLength(1);
    expect(op.wheres[0][0]).toBe('fc.id');
    expect(op.wheres[0][1]).toBe('in');
  });

  it('rejects an invented exception category', async () => {
    expect((await call(USERS.superAdmin.id, '/api/v1/financial/admin/exceptions?category=STUCK_2_HOURS')).statusCode).toBe(400);
  });

  // ── Generic business_module ─────────────────────────────────────────────

  it.each(['MEMBERSHIP', 'EVENT_REGISTRATION', 'MERCHANDISE_ORDER', 'SOME_FUTURE_MODULE'])(
    'business_module filter %s is passed through generically', async (mod) => {
      const res = await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions?businessModule=${mod}`);
      expect(res.statusCode).toBe(200);
      expect(fake.selects[0].wheres).toContainEqual(['fc.business_module', '=', mod]);
    },
  );

  it('rejects an invalid contribution state filter', async () => {
    expect((await call(USERS.superAdmin.id, '/api/v1/financial/admin/contributions?state=PAID')).statusCode).toBe(400);
  });

  // ── Search ───────────────────────────────────────────────────────────────

  // Recording ExpressionBuilder: captures every (column, operator, value)
  // the search predicate builds, including inside subqueries.
  function recordingEb() {
    const preds: Array<[unknown, unknown, unknown]> = [];
    const tables: string[] = [];
    const eb = ((a: unknown, b: unknown, c: unknown) => { preds.push([a, b, c]); return { a, b, c }; }) as unknown as Record<string, unknown> & ((...x: unknown[]) => unknown);
    eb.or = (xs: unknown[]) => ({ or: xs });
    eb.selectFrom = (t: string) => {
      tables.push(t);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.where = (a: unknown, b: unknown, c: unknown) => { preds.push([a, b, c]); return chain; };
      return chain;
    };
    return { eb, preds, tables };
  }

  async function searchPredicates(q: string) {
    fake.reset();
    script({ 'financial_contributions as fc': [] });
    const res = await call(USERS.superAdmin.id, `/api/v1/financial/admin/search?q=${encodeURIComponent(q)}`);
    const op = fake.selects.find((o) => o.limit !== undefined)!;
    const fn = op.wheres[0][0] as (eb: unknown) => unknown;
    const rec = recordingEb();
    fn(rec.eb);
    return { res, ...rec };
  }

  const ALLOWED_SEARCH_COLUMNS = new Set([
    'fc.uuid', 'r.receipt_number', 'fc.active_settlement_reference', 'fr.provider_reference', 'fc.id',
    'st.provider_reference', 'u.full_name', 'u.username', 'fc.payer_user_id', 'sm.membership_number', 'sm.user_id',
  ]);

  it('search uses a fixed field set', () => {
    expect([...SEARCH_FIELDS]).toEqual([
      'CONTRIBUTION_REFERENCE', 'RECEIPT_NUMBER', 'PROVIDER_REFERENCE', 'CONTRIBUTOR_NAME', 'CONTRIBUTOR_USERNAME', 'MEMBERSHIP_NUMBER',
    ]);
  });

  it.each(['asha', 'BCC20191100021', CONTRIB_UUID, 'pay_1', "x' OR 1=1 --"])(
    'search %p only touches approved columns with bound values', async (q) => {
      const { res, preds, tables } = await searchPredicates(q);
      expect(res.statusCode).toBe(200);
      for (const [col] of preds) expect(ALLOWED_SEARCH_COLUMNS.has(String(col))).toBe(true);
      for (const t of tables) expect(['financial_transactions as st', 'memberships as sm']).toContain(t);
      const values = preds.map(([, , v]) => v).filter((v) => typeof v === 'string') as string[];
      const norm = (x: string) => x.replace(/[%_\\]/g, '').toLowerCase();
      for (const v of values) expect(norm(v)).toContain(norm(q.trim()));
    },
  );

  it('search escapes LIKE wildcards', () => {
    const terms = buildSearchTerms('50%_off');
    expect(terms.find((t) => t.field === 'CONTRIBUTOR_NAME')?.value).toBe('%50\\%\\_off%');
  });

  it('search never queries temp identifiers or numeric ids', async () => {
    const { tables, preds } = await searchPredicates('asha');
    expect(tables).not.toContain('membership_temp_identifiers');
    expect(preds.map(([c]) => c)).not.toContain('fc.payer_user_id');
  });

  it.each(['BCCTemp00012', 'bcctemp', 'BCC Temp 1'])('BCCTemp search %p is rejected', async (q) => {
    const res = await call(USERS.superAdmin.id, `/api/v1/financial/admin/search?q=${encodeURIComponent(q)}`);
    expect(res.statusCode).toBe(400);
    expect(fake.selects).toHaveLength(0);
  });

  it('search requires 2..64 characters', async () => {
    expect((await call(USERS.superAdmin.id, '/api/v1/financial/admin/search?q=a')).statusCode).toBe(400);
    expect((await call(USERS.superAdmin.id, `/api/v1/financial/admin/search?q=${'a'.repeat(65)}`)).statusCode).toBe(400);
  });

  it('membership-number search applies only to a permanent MEM-007 number', () => {
    expect(buildSearchTerms('BCC20191100021').some((t) => t.field === 'MEMBERSHIP_NUMBER')).toBe(true);
    expect(buildSearchTerms('BCC2019').some((t) => t.field === 'MEMBERSHIP_NUMBER')).toBe(false);
  });

  // ── Overview ─────────────────────────────────────────────────────────────

  it('overview returns canonical metrics only (no accounting concepts)', async () => {
    script({
      financial_contributions: [{ key: 'COMPLETED', count: 3, currency: 'INR', amount: 3000 }],
      financial_refunds: [{ key: 'COMPLETED', currency: 'INR', count: 1, amount: 1000 }],
      receipts: [{ count: 3 }],
      'financial_contributions as fc': [{ total: 0 }],
    });
    const res = await call(USERS.financialAuthority.id, '/api/v1/financial/admin/overview');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual([
      'completedContributions', 'contributionsByBusinessModule', 'contributionsByState', 'exceptions',
      'receiptsIssued', 'refundAmounts', 'refundsByStatus',
    ]);
    expect(Object.keys(body.contributionsByState)).toHaveLength(10);
    expect(res.body).not.toMatch(/revenue|profit|netCollected|outstanding/i);
  });
});
