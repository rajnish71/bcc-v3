// backend/src/modules/membership/renewal/membership-renewal.http.spec.ts
//
// Release 1 -- HTTP smoke of the renewal / reinstatement surface through the
// REAL Fastify adapter, controllers, AccessTokenGuard, RbacGuard and the
// production ValidationPipe options (whitelist + forbidNonWhitelisted).
// MembershipRenewalService is mocked at the boundary: its behaviour is
// covered by membership-renewal.release1.spec.ts. Proves routing, auth,
// permission gating and that the request body can carry ONLY the T&C
// acceptance (no profile, plan or class fields reach the service).

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('kysely', () => ({ sql: () => ({}) }));
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));
jest.mock('../../shared/communication/communication.service', () => ({ CommunicationService: class {} }));
jest.mock('../numbering/membership-numbering.service', () => ({ MembershipNumberingService: class {} }));
jest.mock('../entitlements/entitlement.service', () => ({ EntitlementService: class {} }));

import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { fastifyServerOptions } from '../../../http/fastify-options';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RbacService } from '../../identity/rbac/rbac.service';
import { MembershipAdminController } from '../admin/membership-admin.controller';
import { MembershipAdminService } from '../admin/membership-admin.service';
import { HubMembershipController } from '../hub/hub-membership.controller';
import { HubMembershipService } from '../hub/hub-membership.service';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import { MembershipRenewalService } from './membership-renewal.service';

process.env.JWT_ACCESS_SECRET = 'renewal-http-secret';
const MEMBER = 21;
const ADMIN = 1;

describe('Release 1 renewal HTTP surface', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  const renewal = {
    getStatus: jest.fn().mockResolvedValue({ hasMembership: true, mode: 'RENEWAL' }),
    requestRenewal: jest.fn().mockResolvedValue({ hasMembership: true, mode: 'RENEWAL' }),
    requestReinstatement: jest.fn().mockResolvedValue({ hasMembership: true, mode: 'REINSTATEMENT' }),
    requestProofUpload: jest.fn().mockResolvedValue({ documentUuid: 'd', uploadUrl: 'u' }),
    listOperations: jest.fn().mockResolvedValue([]),
    decideReinstatement: jest.fn().mockResolvedValue({ id: 5, status: 'REJECTED' }),
  };
  const permissions = new Map<number, Set<string>>([
    [ADMIN, new Set(['membership.record.view', 'membership.lifecycle.renew'])],
  ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HubMembershipController, MembershipAdminController],
      providers: [
        JwtService,
        AccessTokenGuard,
        RbacGuard,
        { provide: RbacService, useValue: { getActivePermissionKeys: async (id: number) => permissions.get(id) ?? new Set() } },
        { provide: HubMembershipService, useValue: {} },
        { provide: MembershipAdminService, useValue: {} },
        { provide: MembershipLifecycleService, useValue: {} },
        { provide: MembershipRenewalService, useValue: renewal },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(fastifyServerOptions));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwt = moduleRef.get(JwtService);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  async function send(userId: number | null, method: 'GET' | 'POST', url: string, payload?: unknown) {
    const headers: Record<string, string> = { 'user-agent': 'renewal-http-test' };
    if (userId != null) {
      headers.authorization = `Bearer ${await jwt.signAsync(
        { sub: userId, uuid: `u-${userId}`, status: 'ACTIVE', sid: 's' },
        { secret: process.env.JWT_ACCESS_SECRET },
      )}`;
    }
    return app.inject({ method, url, headers, payload: payload as never });
  }

  const TERMS = { acceptTerms: true, termsVersion: 'renewal-v1.0' };

  it('renewal status and request require authentication', async () => {
    expect((await send(null, 'GET', '/api/v1/hub/membership/renewal')).statusCode).toBe(401);
    expect((await send(null, 'POST', '/api/v1/hub/membership/renewal', TERMS)).statusCode).toBe(401);
    expect(renewal.getStatus).not.toHaveBeenCalled();
  });

  it('GET renewal is server-authoritative status for the token subject', async () => {
    const res = await send(MEMBER, 'GET', '/api/v1/hub/membership/renewal');
    expect(res.statusCode).toBe(200);
    expect(renewal.getStatus).toHaveBeenCalledWith(MEMBER);
  });

  it('POST renewal forwards only the T&C version (plus request provenance)', async () => {
    const res = await send(MEMBER, 'POST', '/api/v1/hub/membership/renewal', TERMS);
    expect(res.statusCode).toBe(201);
    const [userId, termsVersion, , ua, ctx] = renewal.requestRenewal.mock.calls[0];
    expect([userId, termsVersion, ua]).toEqual([MEMBER, 'renewal-v1.0', 'renewal-http-test']);
    expect(ctx).toMatchObject({ actorType: 'MEMBER' });
  });

  it.each([
    ['terms not accepted', { acceptTerms: false, termsVersion: 'renewal-v1.0' }],
    ['terms missing', { termsVersion: 'renewal-v1.0' }],
    ['plan selection smuggled in', { ...TERMS, membershipClassCode: 'INDIVIDUAL_BIENNIAL' }],
    ['class id smuggled in', { ...TERMS, membershipClassId: 1 }],
    ['profile fields smuggled in', { ...TERMS, phone: '9999999999', city: 'Bhopal', dateOfBirth: '2000-01-01' }],
  ])('POST renewal rejects %s (400, service never called)', async (_label, payload) => {
    const res = await send(MEMBER, 'POST', '/api/v1/hub/membership/renewal', payload);
    expect(res.statusCode).toBe(400);
    expect(renewal.requestRenewal).not.toHaveBeenCalled();
  });

  it('POST reinstatement uses the same T&C-only body', async () => {
    expect((await send(MEMBER, 'POST', '/api/v1/hub/membership/reinstatement', { ...TERMS, membershipClassCode: 'BASIC_MEMBER' })).statusCode).toBe(400);
    const res = await send(MEMBER, 'POST', '/api/v1/hub/membership/reinstatement', TERMS);
    expect(res.statusCode).toBe(201);
    expect(renewal.requestReinstatement).toHaveBeenCalledWith(MEMBER, 'renewal-v1.0', expect.anything(), 'renewal-http-test');
  });

  it('admin renewal-operations list and decision are permission-gated', async () => {
    expect((await send(MEMBER, 'GET', '/api/v1/membership/admin/renewal-operations')).statusCode).toBe(403);
    expect((await send(MEMBER, 'POST', '/api/v1/membership/admin/renewal-operations/5/decision', { decision: 'APPROVED' })).statusCode).toBe(403);
    expect(renewal.decideReinstatement).not.toHaveBeenCalled();

    expect((await send(ADMIN, 'GET', '/api/v1/membership/admin/renewal-operations?status=REQUESTED')).statusCode).toBe(200);
    expect(renewal.listOperations).toHaveBeenCalledWith('REQUESTED');
    await send(ADMIN, 'GET', '/api/v1/membership/admin/renewal-operations?status=BOGUS');
    expect(renewal.listOperations).toHaveBeenLastCalledWith(undefined);

    const res = await send(ADMIN, 'POST', '/api/v1/membership/admin/renewal-operations/5/decision', { decision: 'REJECTED', note: '  not eligible ' });
    expect(res.statusCode).toBe(200);
    expect(renewal.decideReinstatement).toHaveBeenCalledWith(5, ADMIN, 'REJECTED', 'not eligible', expect.objectContaining({ actorType: 'ADMIN' }));
    expect((await send(ADMIN, 'POST', '/api/v1/membership/admin/renewal-operations/5/decision', { decision: 'MAYBE' })).statusCode).toBe(400);
  });
});
