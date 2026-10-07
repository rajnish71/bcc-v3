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
  (sql as unknown as { ref: (r: string) => unknown }).ref = (r: string) => ({ ref: r });
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

  // Fail closed: any future migration, seed or bootstrap/seed script that
  // mentions financial.read breaks this test until the grant is reviewed.
  it('no other migration, seed or bootstrap script grants financial.read', () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' || e.name === '__pycache__' ? [] : walk(p);
        return [p];
      });
    const offenders = ['database', 'scripts']
      .flatMap((d) => walk(path.join(REPO, d)))
      .filter((f) => /\.(sql|js|ts|py|ps1|bat|json)$/.test(f) && f !== MIGRATION_0114)
      .filter((f) => fs.readFileSync(f, 'utf8').includes('financial.read'));
    expect(offenders).toEqual([]);
  });

  // ── Navigation gating (supplementary to server-side authorization) ──────

  it('Hub shows the Financial group only when /users/me reports financialRead === true', () => {
    const layout = fs.readFileSync(path.join(REPO, 'frontend/src/layouts/HubLayout.astro'), 'utf8');
    const sidebar = fs.readFileSync(path.join(REPO, 'frontend/src/components/hub/HubSidebar.astro'), 'utf8');
    expect(layout).toContain('financialRead = user.ui?.financialRead === true;');
    expect(layout).toContain("frame.setAttribute('data-hub-financial', financialRead ? 'true' : 'false')");
    expect(sidebar).toMatch(/<div class="hub-rail__group hub-rail__elevated" data-financial-group hidden>/);
    const reveals = sidebar.match(/renderGroup\(FINANCIAL_CONFIG, 'financial'\)/g) ?? [];
    expect(reveals).toHaveLength(2);
    for (const line of sidebar.split(/\r?\n/).filter((l) => l.includes("renderGroup(FINANCIAL_CONFIG, 'financial')"))) {
      expect(line).toContain("getAttribute('data-hub-financial') === 'true'");
    }
    // Not tied to portal role: Coordinator (portal ADMIN) gets no Financial items.
    const elevated = sidebar.slice(sidebar.indexOf('const ELEVATED_CONFIG'), sidebar.indexOf('function isRouteActive'));
    expect(elevated).toContain("label: 'ADMINISTRATION'");
    expect(elevated).not.toContain('/hub/admin/financial/');
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

  // One row per contribution, as contributionMetricRows() selects it.
  const METRIC_ROWS = [
    { state: 'COMPLETED', currency: 'INR', amount_paise: 250000, classified: 1, refund_status: null, refund_amount_paise: null, refund_currency: null, receipt_amount_paise: 250000, succeeded_count: 1 },
    { state: 'REFUNDED', currency: 'INR', amount_paise: 50000, classified: 1, refund_status: 'COMPLETED', refund_amount_paise: 50000, refund_currency: 'INR', receipt_amount_paise: 50000, succeeded_count: 1 },
    { state: 'COMPLETED', currency: 'INR', amount_paise: 120000, classified: 0, refund_status: null, refund_amount_paise: null, refund_currency: null, receipt_amount_paise: 120000, succeeded_count: 1 },
    { state: 'REFUNDED', currency: 'INR', amount_paise: 1000, classified: 0, refund_status: 'COMPLETED', refund_amount_paise: 1000, refund_currency: 'INR', receipt_amount_paise: 1000, succeeded_count: 1 },
    { state: 'CANCELLED', currency: 'INR', amount_paise: 50000, classified: 0, refund_status: null, refund_amount_paise: null, refund_currency: null, receipt_amount_paise: null, succeeded_count: 0 },
  ];

  it('overview exposes the approved money and operational blocks only (no accounting concepts)', async () => {
    script({
      financial_contributions: [{ key: 'COMPLETED', count: 3 }],
      financial_refunds: [{ key: 'COMPLETED', count: 1 }],
      receipts: [{ count: 3 }],
      'financial_contributions as fc': METRIC_ROWS,
    });
    const res = await call(USERS.financialAuthority.id, '/api/v1/financial/admin/overview');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual([
      'contributionsByBusinessModule', 'contributionsByState', 'exceptions', 'money', 'operational',
      'receiptsIssued', 'refundsByStatus',
    ]);
    expect(Object.keys(body.contributionsByState)).toHaveLength(10);
    expect(body.money).toEqual([{
      currency: 'INR',
      grossCompletedExclTestModePaise: 121000,
      completedRefundsExclTestModePaise: 1000,
      netCompletedExclTestModePaise: 120000,
      testMode: { settledCount: 2, settledPaise: 300000, refundCount: 1, refundPaise: 50000 },
    }]);
    expect(body.operational).toEqual({
      refundsInProgress: [], failedRefundsCount: 0, settledPendingCompletion: [],
      cancelledCount: 1, zeroValueCompletedCount: 0, reviewCount: 0,
    });
    expect(Object.keys(body.money[0].testMode).sort()).toEqual(['refundCount', 'refundPaise', 'settledCount', 'settledPaise']);
    expect(res.body).not.toMatch(/revenue|profit|netCollected|outstanding|completedContributions|refundAmounts/i);
  });

  it('overview metric query reads one row per contribution and never joins the audit log', async () => {
    script({ 'financial_contributions as fc': METRIC_ROWS });
    await call(USERS.superAdmin.id, '/api/v1/financial/admin/overview');
    const tables = fake.selects.map((op) => op.table);
    expect(tables).not.toContain('financial_audit_log as fa');
    expect(tables.filter((t) => t.startsWith('financial_audit_log'))).toEqual([]);
  });

  // ── Classification filters (C2) ─────────────────────────────────────────

  function whereSql(op: FakeOp | undefined): string[] {
    return (op?.wheres ?? []).map(([a]) => (a && typeof a === 'object' && 'sql' in (a as object) ? String((a as { sql: string }).sql) : String(a)));
  }

  it.each([
    ['TEST_MODE', 'EXISTS (SELECT 1 FROM financial_audit_log AS fa'],
    ['UNCLASSIFIED', 'NOT ?'],
  ])('8. contributions classification=%s applies the stored-annotation predicate', async (value, prefix) => {
    const res = await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions?classification=${value}&state=COMPLETED&businessModule=MEMBERSHIP`);
    expect(res.statusCode).toBe(200);
    const op = fake.selects.find((o) => o.limit !== undefined);
    expect(op?.wheres).toContainEqual(['fc.state', '=', 'COMPLETED']);
    expect(op?.wheres).toContainEqual(['fc.business_module', '=', 'MEMBERSHIP']);
    expect(whereSql(op).some((s) => s.startsWith(prefix))).toBe(true);
  });

  it('contributions without a classification filter add no classification predicate', async () => {
    await call(USERS.superAdmin.id, '/api/v1/financial/admin/contributions');
    const op = fake.selects.find((o) => o.limit !== undefined);
    expect(whereSql(op).some((s) => s.includes('financial_audit_log'))).toBe(false);
  });

  it.each([
    '/api/v1/financial/admin/contributions?classification=GENUINE',
    '/api/v1/financial/admin/contributions?classification=TEST_MODE_NON_GENUINE_SETTLEMENT',
    '/api/v1/financial/admin/receipts?classification=genuine',
    '/api/v1/financial/admin/receipts?state=CANCELLED',
    '/api/v1/financial/admin/receipts?state=COMPLETED&state=BOGUS',
    '/api/v1/financial/admin/receipts?sort=status',
    '/api/v1/financial/admin/receipts?sort=state',
    '/api/v1/financial/admin/receipts?sort=r.id',
    '/api/v1/financial/admin/receipts?order=sideways',
    '/api/v1/financial/admin/receipts?issuedFrom=05-10-2026',
    '/api/v1/financial/admin/receipts?issuedFrom=2026-02-30',
    '/api/v1/financial/admin/receipts?issuedFrom=2026-10-06&issuedTo=2026-10-05',
    '/api/v1/financial/admin/receipts?receiptNumber=BCC%25',
    '/api/v1/financial/admin/receipts?q=BCCTemp00012',
    '/api/v1/financial/admin/receipts?q=a',
    '/api/v1/financial/admin/receipts?provider=RAZORPAY',
    '/api/v1/financial/admin/receipts?amountFrom=1',
  ])('9/11. rejects unknown or disallowed filter/sort: %s', async (url) => {
    const res = await call(USERS.superAdmin.id, url);
    expect(res.statusCode).toBe(400);
  });

  // ── Receipts (C2) ────────────────────────────────────────────────────────

  const RECEIPT_ROW = {
    uuid: 'r-uuid-9', receipt_number: 'BCC-RCP-202609-000009', amount_paise: 50000, currency: 'INR', issued_at: '2026-09-18T08:39:37Z',
    contribution_uuid: CONTRIB_UUID, business_module: 'MEMBERSHIP', contribution_state: 'REFUNDED', contribution_amount_paise: 50000,
    refund_status: 'COMPLETED', refund_amount_paise: 50000, refund_resolved_at: '2026-09-18T10:03:21Z',
    contributor_name: 'Jaysh', contributor_username: 'jaysh', membership_number: 'BCC20260900062',
    succeeded_count: 2, classified: 1,
    // must never surface
    id: 9, payer_user_id: 77, contribution_id: 9,
  };

  it('receipt rows: canonical state, supplemental refund, review flags and classification', async () => {
    script({ 'receipts as r': [RECEIPT_ROW] });
    const res = await call(USERS.financialAuthority.id, '/api/v1/financial/admin/receipts');
    expect(res.statusCode).toBe(200);
    const item = res.json().items[0];
    expect(item).toMatchObject({
      receiptNumber: 'BCC-RCP-202609-000009',
      contributionState: 'REFUNDED',
      contribution: { reference: CONTRIB_UUID, businessModule: 'MEMBERSHIP', state: 'REFUNDED' },
      refund: { status: 'COMPLETED', amountPaise: 50000, resolvedAt: '2026-09-18T10:03:21.000Z' },
      settlementClassification: 'TEST_MODE_NON_GENUINE_SETTLEMENT',
      // edge 3: classified AND flagged -- the flag remains
      reviewFlags: ['MULTIPLE_SUCCEEDED_TRANSACTIONS'],
    });
    for (const s of ['"id"', 'payer_user_id', 'payerUserId', 'contribution_id', 'BCCTemp']) expect(res.body).not.toContain(s);
  });

  it('an unclassified receipt carries settlementClassification: null', async () => {
    script({ 'receipts as r': [{ ...RECEIPT_ROW, classified: 0, succeeded_count: 1 }] });
    const item = (await call(USERS.superAdmin.id, '/api/v1/financial/admin/receipts')).json().items[0];
    expect(item.settlementClassification).toBeNull();
    expect(item.reviewFlags).toEqual([]);
  });

  it('8/14. receipts: every filter applies, combined, with identical filters on the total', async () => {
    const res = await call(
      USERS.superAdmin.id,
      '/api/v1/financial/admin/receipts?state=COMPLETED&state=REVIEW&businessModule=EVENT_REGISTRATION&classification=TEST_MODE'
        + '&issuedFrom=2026-10-01&issuedTo=2026-10-05&receiptNumber=BCC-RCP-2026&q=Asha&sort=amount_paise&order=desc&page=2&pageSize=10',
    );
    expect(res.statusCode).toBe(200);
    const op = fake.selects.find((o) => o.table === 'receipts as r')!;
    const texts = whereSql(op);
    expect(op.wheres).toContainEqual(['fc.business_module', '=', 'EVENT_REGISTRATION']);
    expect(op.wheres).toContainEqual(['r.receipt_number', 'like', 'BCC-RCP-2026%']);
    expect(texts.some((s) => s.startsWith('EXISTS (SELECT 1 FROM financial_audit_log AS fa'))).toBe(true);
    const from = op.wheres.find(([c, o]) => String((c as { sql?: string }).sql) === 'UNIX_TIMESTAMP(r.issued_at)' && o === '>=');
    const to = op.wheres.find(([c, o]) => String((c as { sql?: string }).sql) === 'UNIX_TIMESTAMP(r.issued_at)' && o === '<');
    expect(from?.[2]).toBe(Date.UTC(2026, 8, 30, 18, 30) / 1000);
    expect(to?.[2]).toBe(Date.UTC(2026, 9, 5, 18, 30) / 1000);
    // state OR REVIEW and contributor q are callback predicates (bound values only)
    expect(op.wheres.filter(([c]) => typeof c === 'function')).toHaveLength(2);
    expect(op.limit).toBe(10);
    expect(op.offset).toBe(10);
    // the list and the total share one filtered base
    expect(fake.selects.filter((o) => o.table === 'receipts as r')).toHaveLength(2);
    expect(fake.selects.filter((o) => o.table === 'receipts as r').every((o) => o === op)).toBe(true);
  });

  it('receipts: receiptNumber is a literal prefix (LIKE wildcards escaped)', async () => {
    await call(USERS.superAdmin.id, '/api/v1/financial/admin/receipts?receiptNumber=BCC-RCP');
    const op = fake.selects.find((o) => o.table === 'receipts as r')!;
    expect(op.wheres).toContainEqual(['r.receipt_number', 'like', 'BCC-RCP%']);
  });

  it.each([
    ['issued_at', 'asc'], ['issued_at', 'desc'],
    ['receipt_number', 'asc'], ['receipt_number', 'desc'],
    ['amount_paise', 'asc'], ['amount_paise', 'desc'],
    ['contributor', 'asc'], ['contributor', 'desc'],
  ])('10. sort=%s order=%s uses the fixed column map and receipt_number ASC tie-breaker', async (sort, order) => {
    const res = await call(USERS.superAdmin.id, `/api/v1/financial/admin/receipts?sort=${sort}&order=${order}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sort, order });
    const orderBys = fake.selects.find((o) => o.table === 'receipts as r')!.orderBys!;
    const column: Record<string, string> = { issued_at: 'r.issued_at', receipt_number: 'r.receipt_number', amount_paise: 'r.amount_paise' };
    if (sort === 'contributor') {
      expect((orderBys[0][0] as { sql: string }).sql).toBe('u.full_name IS NULL');
      expect(orderBys[0][1]).toBe('asc'); // NULLS LAST in both directions
      expect(orderBys[1]).toEqual(['u.full_name', order]);
    } else {
      expect(orderBys[0]).toEqual([column[sort], order]);
    }
    if (sort !== 'receipt_number') expect(orderBys[orderBys.length - 1]).toEqual(['r.receipt_number', 'asc']);
  });

  it('default receipt order is issued_at DESC then receipt_number ASC', async () => {
    await call(USERS.superAdmin.id, '/api/v1/financial/admin/receipts');
    expect(fake.selects.find((o) => o.table === 'receipts as r')!.orderBys).toEqual([
      ['r.issued_at', 'desc'], ['r.receipt_number', 'asc'],
    ]);
  });

  it('12. receipts pageSize above 100 is clamped (existing Track 4 contract)', async () => {
    const res = await call(USERS.superAdmin.id, '/api/v1/financial/admin/receipts?pageSize=500');
    expect(res.json().pageSize).toBe(MAX_PAGE_SIZE);
    expect(fake.selects.find((o) => o.table === 'receipts as r')!.limit).toBe(MAX_PAGE_SIZE);
  });

  // ── Contribution detail classification (C3) ─────────────────────────────

  const C23_UUID = '9e1d15b6-a676-495c-897c-c84ac6142645';
  const ANNOTATION_17 = {
    event_type: 'SETTLEMENT_RECONCILIATION_ANNOTATED',
    metadata_json: '{"settlementClassification":"TEST_MODE_NON_GENUINE_SETTLEMENT","providerAccountId":"acc_DJkWMSsLHLxU4a","correctionContributionId":23,"reconciliationReason":"HA-approved genuine live corrective payment"}',
    actor_type: 'ADMIN', created_at: '2026-10-05T08:50:21Z', actor_name: 'Rajnish Khare',
    // must never surface
    id: 17, actor_user_id: 1, request_id: 'req-secret', session_id: 'sess-secret', client_ip: '203.0.113.9', user_agent: 'UA-secret',
    webhook_inbox_id: 8, provider_payment_ref: 'pay_Td1Zs77xOJPVno', provider_order_ref: 'order_Td1ZT3Jyl4em4f',
  };

  function detailWorld(annotations: unknown[], correctionTarget: unknown[] = [{ uuid: C23_UUID }]) {
    fake.responder = (op: FakeOp) => {
      if (op.kind !== 'select') return undefined;
      if (op.table === 'financial_contributions') {
        if (op.wheres.some(([c]) => c === 'uuid')) return [{ id: 8 }];
        if (op.wheres.some(([c, , v]) => c === 'id' && v === 23)) return correctionTarget;
        return [];
      }
      if (op.table === 'financial_audit_log as fa') return annotations;
      return DETAIL_TABLES[op.table];
    };
  }

  it('13. contribution 8: classification panel with the correction resolved to contribution 23 UUID', async () => {
    detailWorld([ANNOTATION_17]);
    const res = await call(USERS.financialAuthority.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`);
    expect(res.statusCode).toBe(200);
    const { classification } = res.json();
    expect(classification).toEqual({
      marker: 'TEST_MODE_NON_GENUINE_SETTLEMENT',
      actorType: 'ADMIN',
      actorDisplayName: 'Rajnish Khare',
      annotatedAt: '2026-10-05T08:50:21.000Z',
      reason: 'HA-approved genuine live corrective payment',
      correctionContributionReference: C23_UUID,
    });
    const lookup = fake.selects.find((o) => o.table === 'financial_contributions' && o.wheres.some(([c]) => c === 'id'));
    expect(lookup?.wheres).toContainEqual(['id', '=', 23]);
  });

  it('15. classification panel exposes nothing outside its allow-list', async () => {
    detailWorld([ANNOTATION_17]);
    const res = await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`);
    const body = res.body;
    for (const s of [
      'acc_DJkWMSsLHLxU4a', 'providerAccountId', 'pay_Td1Zs77xOJPVno', 'order_Td1ZT3Jyl4em4f', 'webhook', 'Inbox',
      'actor_user_id', 'actorUserId', '203.0.113.9', 'UA-secret', 'req-secret', 'sess-secret', 'metadata',
      'correctionContributionId', 'BCCTemp',
    ]) expect(body).not.toContain(s);
    expect(Object.keys(res.json().classification).sort()).toEqual([
      'actorDisplayName', 'actorType', 'annotatedAt', 'correctionContributionReference', 'marker', 'reason',
    ]);
    expect(JSON.stringify(res.json().classification)).not.toMatch(/:\s*23\b/);
  });

  it('14. a missing correction target resolves to null (never the numeric id)', async () => {
    detailWorld([ANNOTATION_17], []);
    const { classification } = (await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`)).json();
    expect(classification.correctionContributionReference).toBeNull();
  });

  it('historical form (no correction): reference is null and no target lookup happens', async () => {
    detailWorld([{ ...ANNOTATION_17, metadata_json: '{"settlementClassification":"TEST_MODE_NON_GENUINE_SETTLEMENT","providerAccountId":"acc_DJkWMSsLHLxU4a","reconciliationReason":"Historical Razorpay test-mode settlement."}' }]);
    const { classification } = (await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`)).json();
    expect(classification).toMatchObject({ marker: 'TEST_MODE_NON_GENUINE_SETTLEMENT', reason: 'Historical Razorpay test-mode settlement.', correctionContributionReference: null });
    expect(fake.selects.some((o) => o.table === 'financial_contributions' && o.wheres.some(([c]) => c === 'id'))).toBe(false);
  });

  // The write path admits at most one annotation per contribution; these
  // rows exercise only the defensive skipping of unrecognised metadata.
  it('3. malformed / non-matching metadata rows are skipped; the recognised annotation is returned', async () => {
    detailWorld([
      { ...ANNOTATION_17, metadata_json: '{bad json' },
      { ...ANNOTATION_17, metadata_json: '{"note":"TEST_MODE_NON_GENUINE_SETTLEMENT"}' },
      ANNOTATION_17,
    ]);
    const res = await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().classification.reason).toBe('HA-approved genuine live corrective payment');
  });

  it('3. only malformed metadata: classification is null and the detail still loads', async () => {
    detailWorld([{ ...ANNOTATION_17, metadata_json: '{bad json' }]);
    const res = await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().classification).toBeNull();
  });

  it('an unclassified contribution has classification: null', async () => {
    detailWorld([]);
    const res = await call(USERS.superAdmin.id, `/api/v1/financial/admin/contributions/${CONTRIB_UUID}`);
    expect(res.json().classification).toBeNull();
    const fa = fake.selects.find((o) => o.table === 'financial_audit_log as fa');
    expect(fa?.wheres).toContainEqual(['fa.event_type', '=', 'SETTLEMENT_RECONCILIATION_ANNOTATED']);
  });

  // ── Unified search (C4) ─────────────────────────────────────────────────

  it('17. search results carry settlementClassification', async () => {
    script({ 'financial_contributions as fc': [{ ...CONTRIB_ROW, classified: 1 }] });
    const res = await call(USERS.superAdmin.id, '/api/v1/financial/admin/search?q=asha');
    expect(res.json().items[0].settlementClassification).toBe('TEST_MODE_NON_GENUINE_SETTLEMENT');
  });

  it('17. the classification name is not a search term', async () => {
    const { tables, preds } = await searchPredicates('TEST_MODE_NON_GENUINE_SETTLEMENT');
    expect(tables).not.toContain('financial_audit_log');
    for (const [col] of preds) expect(String(col)).not.toMatch(/audit|metadata|classif/i);
    expect(SEARCH_FIELDS as readonly string[]).not.toContain('CLASSIFICATION');
  });

  it('exceptions rows carry settlementClassification without changing detection', async () => {
    script({ 'financial_contributions as fc': [{ ...CONTRIB_ROW, classified: 1 }] });
    const res = await call(USERS.superAdmin.id, '/api/v1/financial/admin/exceptions?category=FAILED');
    expect(res.json().items[0].settlementClassification).toBe('TEST_MODE_NON_GENUINE_SETTLEMENT');
    const op = fake.selects.find((o) => o.limit !== undefined)!;
    expect(op.wheres).toEqual([['fc.state', '=', 'FAILED']]);
  });

  it('18. RBAC: denied users never reach a financial read on the new filters', async () => {
    for (const who of ['platformAdmin', 'member', 'coordinator'] as const) {
      const res = await call(USERS[who].id, '/api/v1/financial/admin/receipts?classification=TEST_MODE&sort=contributor');
      expect(res.statusCode).toBe(403);
    }
    expect((await call(null, '/api/v1/financial/admin/overview')).statusCode).toBe(401);
    expect(fake.selects).toHaveLength(0);
  });
});
