// Behavioural HTTP tests: HTTP-originated financial actions in Business
// Modules carry full request provenance into financial_audit_log.
//
// Real controllers, real MembershipLifecycleService / ApplicationWorkflowService
// / MerchandiseOrderService, real FinancialContributionService +
// FinancialAuditService, real AccessTokenGuard/RbacGuard, production Fastify
// options. Only the DB (recording fake) and non-financial collaborators
// (numbering, entitlements, notifications, storage) are stubbed.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('kysely', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const expr = { sql: strings.join('?'), values, as: (alias: string) => ({ ...expr, alias }) };
    return expr;
  };
  return { sql };
});
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));
jest.mock('../../shared/communication/communication.service', () => ({
  CommunicationService: class {
    dispatch = jest.fn().mockResolvedValue(undefined);
  },
}));
jest.mock('../../membership/numbering/membership-numbering.service', () => ({
  MembershipNumberingService: class {},
}));
jest.mock('../../membership/entitlements/entitlement.service', () => ({
  EntitlementService: class {
    getClassConfigValue = jest.fn().mockResolvedValue('1000');
    getGroupTypeConfigValue = jest.fn().mockResolvedValue(null);
  },
}));

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { db } from '../../../database/db';
import { whereValue, type FakeDb, type FakeOp } from '../../../test-support/fake-db';
import { fastifyServerOptions, registerRequestIdResponseHeader } from '../../../http/fastify-options';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RbacService } from '../../identity/rbac/rbac.service';
import { R2Service } from '../../shared/storage/r2.service';
import { CommunicationService } from '../../shared/communication/communication.service';
import { MembershipNumberingService } from '../../membership/numbering/membership-numbering.service';
import { EntitlementService } from '../../membership/entitlements/entitlement.service';
import { MembershipController } from '../../membership/membership.controller';
import { MembershipLifecycleService } from '../../membership/lifecycle/membership-lifecycle.service';
import { ApplicationWorkflowService } from '../../membership/application/application-workflow.service';
import { HubMembershipController } from '../../membership/hub/hub-membership.controller';
import { MembershipRenewalService } from '../../membership/renewal/membership-renewal.service';
import { HubMembershipService } from '../../membership/hub/hub-membership.service';
import { MembershipAdminController } from '../../membership/admin/membership-admin.controller';
import { MembershipAdminService } from '../../membership/admin/membership-admin.service';
import { MerchandiseController } from '../../merchandise/merchandise.controller';
import { MerchandiseOrderService } from '../../merchandise/merchandise-order.service';
import { MerchandiseCatalogService } from '../../merchandise/merchandise-catalog.service';
import { MERCHANDISE_BUSINESS_MODULE } from '../../merchandise/merchandise.types';
import { FinancialContributionService } from '../financial-contribution.service';
import { FinancialEventBus } from '../financial-event-bus.service';
import { SETTLEMENT_PROVIDER } from '../settlement-provider.interface';
import { FinancialAuditService } from './financial-audit.service';
import type { AuditContext } from './financial-audit.types';

const fake = db as unknown as FakeDb;
process.env.JWT_ACCESS_SECRET = 'business-provenance-secret';

const MEMBER = 2;
const ADMIN = 1;
const MEMBER_SID = '33333333-4444-4555-8666-777777777777';
const ADMIN_SID = '44444444-5555-4666-8777-888888888888';
const CLIENT_IP = '203.0.113.9';
const UA = 'Mozilla/5.0 (provenance-test)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ── Stateful fake DB script ──────────────────────────────────────────────

interface World {
  membership?: Record<string, unknown>;
  contribution?: Record<string, unknown> & { id: number; state: string };
  succeededTxn?: Record<string, unknown>;
  order?: Record<string, unknown>;
}

function script(world: World) {
  fake.responder = (op: FakeOp) => {
    const col = (name: string) => op.wheres.some(([c]) => c === name);

    if (op.table === 'financial_contributions') {
      if (op.kind === 'insert') {
        world.contribution = { ...(op.values as Record<string, unknown>), id: 501, state: 'CREATED' };
        return { insertId: 501n };
      }
      if (op.kind === 'update') {
        if (world.contribution && whereValue(op, 'id') === world.contribution.id) Object.assign(world.contribution, op.set);
        return undefined;
      }
      if (op.kind === 'select') {
        if (col('idempotency_key')) return [];
        return world.contribution ? [{ ...world.contribution }] : [];
      }
    }
    if (op.table === 'merchandise_orders') {
      if (op.kind === 'insert') {
        world.order = { ...(op.values as Record<string, unknown>), id: 71 };
        return { insertId: 71n };
      }
      if (op.kind === 'update' && world.order) Object.assign(world.order, op.set);
      if (op.kind === 'select') {
        return world.order ? [{ ...world.order, created_at: '2026-09-27T10:00:00Z', updated_at: '2026-09-27T10:00:00Z' }] : [];
      }
    }
    if (op.kind !== 'select') return undefined;

    switch (op.table) {
      case 'membership_classes':
        return [{ id: 3, name: 'Individual', code: 'INDIVIDUAL', is_closed: 0, activation_mode: 'PAYMENT_REQUIRED', type: 'OPERATIONAL' }];
      case 'memberships':
        return col('id') && world.membership ? [world.membership] : [];
      case 'merchandise_products':
        return [{ id: 10, price_paise: 5000, active: 1, name: 'Mug', sku: 'MUG' }];
      case 'financial_transactions':
        return world.succeededTxn ? [world.succeededTxn] : [];
      case 'users':
        return [{ id: MEMBER, full_name: 'Test Member' }];
      default:
        return [];
    }
  };
}

function auditOps(eventType: string): FakeOp[] {
  return fake.writes('financial_audit_log', 'insert').filter((op) => op.values!.event_type === eventType);
}

// ── App ──────────────────────────────────────────────────────────────────

describe('HTTP-originated Business Module financial actions carry full provenance', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  const hubService = { submitApplication: jest.fn().mockResolvedValue({ success: true }) };
  const renewalService = { requestRenewal: jest.fn().mockResolvedValue({}) };
  const adminService = { grantComplimentaryMembership: jest.fn().mockResolvedValue({ membershipNumber: 'x', expiresAt: 'y' }) };
  const permissions = new Map<number, Set<string>>([
    [ADMIN, new Set(['membership.application.reject', 'membership.application.create_for_others', 'membership.lifecycle.activate'])],
  ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MembershipController, HubMembershipController, MembershipAdminController, MerchandiseController],
      providers: [
        JwtService,
        AccessTokenGuard,
        RbacGuard,
        { provide: RbacService, useValue: { getActivePermissionKeys: async (id: number) => permissions.get(id) ?? new Set() } },
        MembershipLifecycleService,
        ApplicationWorkflowService,
        MerchandiseOrderService,
        FinancialContributionService,
        FinancialAuditService,
        { provide: FinancialEventBus, useValue: { emit: jest.fn() } },
        { provide: SETTLEMENT_PROVIDER, useValue: { providerName: 'RAZORPAY', refund: jest.fn() } },
        MembershipNumberingService,
        EntitlementService,
        CommunicationService,
        R2Service,
        { provide: HubMembershipService, useValue: hubService },
        { provide: MembershipRenewalService, useValue: renewalService },
        { provide: MembershipAdminService, useValue: adminService },
        { provide: MerchandiseCatalogService, useValue: {} },
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
  beforeEach(() => { fake.reset(); jest.clearAllMocks(); });

  async function send(userId: number, sid: string, method: 'POST', url: string, payload: unknown) {
    const token = await jwt.signAsync(
      { sub: userId, uuid: `u-${userId}`, status: 'ACTIVE', sid },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
    return app.inject({
      method,
      url,
      payload: payload as never,
      remoteAddress: '127.0.0.1',
      headers: {
        authorization: `Bearer ${token}`,
        'user-agent': UA,
        // Nginx (real_ip from CF-Connecting-IP) sets this to $remote_addr; a
        // client-forged left entry must never reach the audit row.
        'x-forwarded-for': `6.6.6.6, ${CLIENT_IP}`,
        'x-request-id': 'client-chosen',
        cookie: 'rt=secret-cookie',
      },
    });
  }

  function expectHttpProvenance(values: Record<string, unknown>, requestId: string, actorUserId: number, sid: string, route: string) {
    expect(values.request_id).toBe(requestId);
    expect(values.request_id).toMatch(UUID_RE);
    expect(values).toMatchObject({
      actor_user_id: actorUserId,
      session_id: sid,
      client_ip: CLIENT_IP,
      user_agent: UA,
      http_route: route,
    });
    expect(JSON.stringify(values)).not.toMatch(/Bearer|secret-cookie|client-chosen|6\.6\.6\.6/);
  }

  // ── 1. Contribution creation ───────────────────────────────────────────

  it('membership application: CONTRIBUTION_CREATED carries member request/session provenance', async () => {
    script({});
    const res = await send(MEMBER, MEMBER_SID, 'POST', '/api/v1/membership/applications', { membershipClassId: 3 });
    expect(res.statusCode).toBe(201);

    const [created] = auditOps('CONTRIBUTION_CREATED');
    expect(created.values).toMatchObject({ actor_type: 'MEMBER', contribution_id: 501, resulting_state: 'CREATED' });
    expectHttpProvenance(created.values!, String(res.headers['x-request-id']), MEMBER, MEMBER_SID, '/api/v1/membership/applications');

    const contributionInsert = fake.writes('financial_contributions', 'insert')[0];
    expect(contributionInsert.values).toMatchObject({ business_module: 'MEMBERSHIP', payer_user_id: MEMBER, amount_paise: 100000 });
    expect(created.txId).toBe(contributionInsert.txId);
  });

  it('application on behalf: the audit actor is the staff member, the payer is the member', async () => {
    script({});
    const res = await send(ADMIN, ADMIN_SID, 'POST', '/api/v1/membership/applications/on-behalf', {
      userId: MEMBER, membershipClassId: 3,
    });
    expect(res.statusCode).toBe(201);
    const [created] = auditOps('CONTRIBUTION_CREATED');
    expect(created.values!.actor_type).toBe('ADMIN');
    expectHttpProvenance(created.values!, String(res.headers['x-request-id']), ADMIN, ADMIN_SID, '/api/v1/membership/applications/on-behalf');
    expect(fake.writes('financial_contributions', 'insert')[0].values!.payer_user_id).toBe(MEMBER);
  });

  // The Hub form DTO requires a full consent submission, so these call the
  // controller method directly with a request object; the downstream
  // createApplicationContribution() -> CONTRIBUTION_CREATED path is the one
  // exercised end-to-end by the membership application test above.
  it.each([
    ['application', 'submitApplication', 'submitApplication'],
    ['renewal', 'requestRenewal', 'requestRenewal'],
  ] as const)('Hub %s route forwards member provenance to the membership service', async (path, method, serviceMethod) => {
    const controller = app.get(HubMembershipController);
    const service = (path === 'renewal' ? renewalService : hubService) as Record<string, jest.Mock>;
    const req = {
      id: 'hub-request-id', ip: CLIENT_IP, headers: { 'user-agent': UA, authorization: 'Bearer x' },
      routeOptions: { url: `/api/v1/hub/membership/${path}` },
    };
    await (controller[method] as (...a: unknown[]) => Promise<unknown>)(
      { sub: MEMBER, uuid: 'u', status: 'ACTIVE', sid: MEMBER_SID }, { acceptTerms: true, termsVersion: 'renewal-v1.0' }, req,
    );
    const context = service[serviceMethod].mock.calls.at(-1)![4] as AuditContext;
    expect(context).toEqual({
      actorType: 'MEMBER',
      provenance: {
        requestId: 'hub-request-id', actorUserId: MEMBER, sessionId: MEMBER_SID, ipAddress: CLIENT_IP,
        userAgent: UA, route: `/api/v1/hub/membership/${path}`,
      },
    });
  });

  // Release 1: the renewal path no longer creates an application
  // Contribution (it inserted a new membership row); renewal obligations are
  // created by MembershipRenewalService, which receives the context above.
  it('Hub service forwards the context into createApplicationContribution() on the application path', () => {
    // Complements the controller test above: the service body is gated by a
    // full consent form, so its one-line forwarding is asserted on source.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../membership/hub/hub-membership.service.ts'), 'utf8',
    ) as string;
    const calls = src.match(/createApplicationContribution\([^)]*\)/g) ?? [];
    expect(calls).toHaveLength(1);
    for (const call of calls) expect(call).toContain('auditContext');
  });

  it('merchandise order: CONTRIBUTION_CREATED carries member request/session provenance', async () => {
    script({});
    const res = await send(MEMBER, MEMBER_SID, 'POST', '/api/v1/merchandise/orders', {
      items: [{ productId: 10, quantity: 1 }],
    });
    expect(res.statusCode).toBe(201);

    const [created] = auditOps('CONTRIBUTION_CREATED');
    expect(created.values).toMatchObject({ actor_type: 'MEMBER', contribution_id: 501 });
    expectHttpProvenance(created.values!, String(res.headers['x-request-id']), MEMBER, MEMBER_SID, '/api/v1/merchandise/orders');
    expect(fake.writes('financial_contributions', 'insert')[0].values!.business_module).toBe(MERCHANDISE_BUSINESS_MODULE);
  });

  // ── 2. Refunds ─────────────────────────────────────────────────────────

  it('membership rejection refund: REFUND_REQUESTED carries admin provenance, atomic with the refund row', async () => {
    script({
      membership: { id: 88, lifecycle_state: 'PENDING', owner_type: 'INDIVIDUAL', user_id: MEMBER, membership_class_id: 3, group_entity_id: null },
      contribution: { id: 501, state: 'COMPLETED', amount_paise: 100000, currency: 'INR', business_module: 'MEMBERSHIP', business_reference_id: 88 },
      succeededTxn: { provider: 'MANUAL', provider_reference: 'UTR123' },
    });

    const res = await send(ADMIN, ADMIN_SID, 'POST', '/api/v1/membership/88/reject', { reason: 'Incomplete KYC documents' });
    expect(res.statusCode).toBe(200);

    const [refund] = auditOps('REFUND_REQUESTED');
    expect(refund).toBeDefined();
    expect(refund.values).toMatchObject({ actor_type: 'ADMIN', contribution_id: 501 });
    expectHttpProvenance(refund.values!, String(res.headers['x-request-id']), ADMIN, ADMIN_SID, '/api/v1/membership/:id/reject');

    const refundInsert = fake.writes('financial_refunds', 'insert')[0];
    expect(refund.txId).toBe(refundInsert.txId);
    expect(refund.values!.refund_id).toBe(Number((refundInsert.result as { insertId: bigint }).insertId));
    // Refund semantics unchanged: manual settlement stays REQUESTED, contribution stays COMPLETED.
    expect(refundInsert.values).toMatchObject({ status: 'REQUESTED', requested_by_type: 'HUMAN', requested_by_user_id: ADMIN });
  });

  it('system refund (settlement completed after rejection) legitimately has no HTTP provenance', async () => {
    const world: World = {
      membership: { id: 88, lifecycle_state: 'REJECTED', owner_type: 'INDIVIDUAL', user_id: MEMBER, membership_class_id: 3, group_entity_id: null },
      contribution: { id: 501, state: 'COMPLETED', amount_paise: 100000, currency: 'INR', business_module: 'MEMBERSHIP', business_reference_id: 88 },
      succeededTxn: { provider: 'MANUAL', provider_reference: 'UTR123' },
    };
    script(world);
    await app.get(MembershipLifecycleService).recordPaymentReceived(88);
    const [refund] = auditOps('REFUND_REQUESTED');
    expect(refund.values).toMatchObject({
      actor_type: 'SYSTEM', actor_user_id: null, request_id: null, session_id: null, client_ip: null, user_agent: null,
    });
  });

  it('complimentary grant route forwards admin provenance', async () => {
    const res = await send(ADMIN, ADMIN_SID, 'POST', '/api/v1/membership/88/grant-complimentary', {
      months: 6, reason: 'Gateway not collecting payments',
    });
    expect(res.statusCode).toBe(200);
    const context = adminService.grantComplimentaryMembership.mock.calls[0][4] as AuditContext;
    expect(context.actorType).toBe('ADMIN');
    expect(context.provenance).toMatchObject({
      requestId: res.headers['x-request-id'], actorUserId: ADMIN, sessionId: ADMIN_SID, ipAddress: CLIENT_IP, userAgent: UA,
      route: '/api/v1/membership/:id/grant-complimentary',
    });
  });
});
