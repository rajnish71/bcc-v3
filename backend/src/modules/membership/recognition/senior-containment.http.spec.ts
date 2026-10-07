// WP0 -- Senior/Tenure containment (TENURE-ARCH-001 v1.1 §19/§20).
//
// Proves every legacy Senior write/evaluation path is closed with an explicit
// 409 SENIOR_LEGACY_PATHWAY_CONTAINED, that blocked calls write nothing and
// send nothing, and that the containment is narrow: Honorary recognitions
// still assign/revoke normally.
//
// Boots RecognitionController + MembershipAdminController in a Nest Fastify
// app with the real AccessTokenGuard/RbacGuard and the real RecognitionService
// / MembershipAdminService over the recording fake of db.ts.

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
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { fastifyServerOptions } from '../../../http/fastify-options';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RbacService } from '../../identity/rbac/rbac.service';
import { CommunicationService } from '../../shared/communication/communication.service';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import { MembershipRenewalService } from '../renewal/membership-renewal.service';
import { MembershipAdminController } from '../admin/membership-admin.controller';
import { MembershipAdminService } from '../admin/membership-admin.service';
import { RecognitionController } from './recognition.controller';
import { RecognitionService } from './recognition.service';
import { SENIOR_CONTAINMENT_CODE } from './senior-containment';

const fake = db as unknown as FakeDb;
process.env.JWT_ACCESS_SECRET = 'senior-containment-test-secret';

const ADMIN = 1;
const ALL_PERMS = new Set([
  'membership.recognition.view',
  'membership.recognition.assign',
  'membership.recognition.revoke',
  'membership.recognition.manage',
  'membership.recognition.criteria.manage',
]);

const ACTIVE_MEMBERSHIP = { id: 12, user_id: 17, lifecycle_state: 'ACTIVE' };
const MANUAL_SENIOR_ROW = {
  id: 501, membership_id: 12, recognition_code: 'SENIOR_MEMBER', track: 'MANUAL', status: 'ACTIVE',
  reason: 'owner-authorised exception', assigned_by_user_id: 1, start_date: '2026-10-01', end_date: null,
};
const AUTO_SENIOR_ROW = { ...MANUAL_SENIOR_ROW, id: 502, track: 'AUTO' };
const HONORARY_ROW = { ...MANUAL_SENIOR_ROW, id: 503, recognition_code: 'HONORARY_MEMBER' };

function script(tables: Record<string, unknown>) {
  fake.responder = (op: FakeOp) => (op.kind === 'select' ? tables[op.table] : undefined);
}

function recognitionWrites(): FakeOp[] {
  return [...fake.committed, ...fake.rolledBack].filter(
    (op) => op.kind !== 'select' && (op.table === 'member_recognitions' || op.table === 'recognition_criteria'),
  );
}

describe('WP0 Senior containment', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  let recognitionService: RecognitionService;
  const comms = { dispatch: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RecognitionController, MembershipAdminController],
      providers: [
        JwtService,
        AccessTokenGuard,
        RbacGuard,
        RecognitionService,
        MembershipAdminService,
        { provide: RbacService, useValue: { getActivePermissionKeys: async (id: number) => (id === ADMIN ? ALL_PERMS : new Set()) } },
        { provide: CommunicationService, useValue: comms },
        { provide: FinancialContributionService, useValue: {} },
        { provide: EntitlementService, useValue: {} },
        { provide: MembershipLifecycleService, useValue: {} },
        { provide: MembershipRenewalService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(fastifyServerOptions));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwt = moduleRef.get(JwtService);
    recognitionService = moduleRef.get(RecognitionService);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    fake.reset();
    comms.dispatch.mockReset();
    script({ memberships: [ACTIVE_MEMBERSHIP], member_recognitions: [MANUAL_SENIOR_ROW] });
  });

  async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
    const token = await jwt.signAsync(
      { sub: ADMIN, uuid: 'u-1', status: 'ACTIVE', sid: 'sess' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
    return app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}` } });
  }

  function expectContained(res: { statusCode: number; json: () => { code?: string; message?: string } }) {
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe(SENIOR_CONTAINMENT_CODE);
    expect(res.json().message).toMatch(/temporarily disabled/);
    expect(recognitionWrites()).toEqual([]);
    expect(comms.dispatch).not.toHaveBeenCalled();
  }

  // ── A. Admin automatic evaluation ─────────────────────────────────────────

  it('POST admin/senior-status/evaluate cannot award Senior', async () => {
    expectContained(await call('POST', '/api/v1/membership/admin/senior-status/evaluate'));
    expect(fake.committed).toEqual([]); // not even the SENIOR_STATUS_BATCH audit row
  });

  it('GET admin/senior-status/eligible is disabled explicitly, not an empty list', async () => {
    const res = await call('GET', '/api/v1/membership/admin/senior-status/eligible');
    expectContained(res);
    expect(fake.selects.find((op) => op.table === 'recognition_criteria')).toBeUndefined();
  });

  it('GET recognitions/:id/auto-eligibility (legacy AUTO evaluator) is disabled', async () => {
    expectContained(await call('GET', '/api/v1/membership/recognitions/12/auto-eligibility'));
  });

  // ── B. Manual / AUTO assignment ───────────────────────────────────────────

  it.each(['MANUAL', 'AUTO'])('POST recognitions/:id/assign rejects SENIOR_MEMBER (%s)', async (track) => {
    script({ memberships: [ACTIVE_MEMBERSHIP], member_recognitions: [] });
    expectContained(
      await call('POST', '/api/v1/membership/recognitions/12/assign', {
        recognitionCode: 'SENIOR_MEMBER', track, reason: 'attempted legacy Senior award',
      }),
    );
  });

  it('RecognitionService.assign() rejects SENIOR_MEMBER on direct internal invocation', async () => {
    await expect(recognitionService.assign(12, 'SENIOR_MEMBER', 'MANUAL', 'internal', ADMIN)).rejects.toMatchObject({
      response: { code: SENIOR_CONTAINMENT_CODE },
    });
    expect(recognitionWrites()).toEqual([]);
  });

  it('grantInTransaction() rejects SENIOR_MEMBER and writes nothing', async () => {
    await expect(
      db.transaction().execute((trx) =>
        recognitionService.grantInTransaction(trx as never, {
          membershipId: 12, recognitionCode: 'SENIOR_MEMBER', track: 'MANUAL', reason: 'batch', actorUserId: ADMIN,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: SENIOR_CONTAINMENT_CODE } });
    expect(recognitionWrites()).toEqual([]);
  });

  it.each([AUTO_SENIOR_ROW, MANUAL_SENIOR_ROW])(
    'a governance grant never supersedes an existing Senior row (track %#)',
    async (seniorRow) => {
      script({ memberships: [ACTIVE_MEMBERSHIP], member_recognitions: [seniorRow] });
      await expect(
        db.transaction().execute((trx) =>
          recognitionService.grantInTransaction(trx as never, {
            membershipId: 12, recognitionCode: 'HONORARY_MEMBER', track: 'MANUAL', reason: 'honorary', actorUserId: ADMIN,
          }),
        ),
      ).rejects.toMatchObject({ response: { code: SENIOR_CONTAINMENT_CODE } });
      expect(recognitionWrites()).toEqual([]); // no HISTORICAL flip, no insert
    },
  );

  it('notifyGrant() never sends a legacy Senior achievement notice', async () => {
    await expect(recognitionService.notifyGrant(17, 'SENIOR_MEMBER')).rejects.toMatchObject({
      response: { code: SENIOR_CONTAINMENT_CODE },
    });
    expect(comms.dispatch).not.toHaveBeenCalled();
  });

  // ── C. Revoke ─────────────────────────────────────────────────────────────

  it('POST recognitions/:id/revoke cannot revoke an existing Senior record', async () => {
    expectContained(
      await call('POST', '/api/v1/membership/recognitions/12/revoke', { reason: 'attempted legacy Senior revoke' }),
    );
  });

  // ── D. Criteria ───────────────────────────────────────────────────────────

  it('POST recognitions/criteria cannot modify SENIOR_MEMBER criteria', async () => {
    expectContained(
      await call('POST', '/api/v1/membership/recognitions/criteria', {
        recognitionCode: 'SENIOR_MEMBER', criteriaKey: 'min_tenure_years', criteriaValue: '5',
      }),
    );
  });

  // ── Containment is narrow: Honorary paths are unaffected ──────────────────

  it('Honorary assignment still works', async () => {
    script({ memberships: [ACTIVE_MEMBERSHIP], member_recognitions: [], users: [{ full_name: 'X' }] });
    const res = await call('POST', '/api/v1/membership/recognitions/12/assign', {
      recognitionCode: 'HONORARY_MEMBER', track: 'MANUAL', reason: 'honorary award',
    });
    expect(res.statusCode).toBe(201);
    expect(fake.writes('member_recognitions', 'insert')[0].values).toMatchObject({ recognition_code: 'HONORARY_MEMBER' });
  });

  it('Honorary revoke still works', async () => {
    script({ memberships: [ACTIVE_MEMBERSHIP], member_recognitions: [HONORARY_ROW] });
    const res = await call('POST', '/api/v1/membership/recognitions/12/revoke', { reason: 'governance revoke' });
    expect(res.statusCode).toBe(200);
    expect(fake.writes('member_recognitions', 'update')).toHaveLength(1);
  });
});

// ── No uncontained write path exists in backend source ──────────────────────
//
// Every runtime write to member_recognitions / recognition_criteria must live
// in recognition.service.ts, whose write methods are guarded above. A new
// writer elsewhere would bypass WP0 and fails this test.

describe('WP0: legacy Senior tables have no other runtime writers', () => {
  const SRC_ROOT = path.resolve(__dirname, '../../..');
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
    });
  }

  it('only recognition.service.ts writes member_recognitions / recognition_criteria', () => {
    const writers = walk(SRC_ROOT).filter((f) =>
      /(insertInto|updateTable|deleteFrom)\(\s*'(member_recognitions|recognition_criteria)'/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(writers.map((f) => path.relative(SRC_ROOT, f).replace(/\\/g, '/'))).toEqual([
      'modules/membership/recognition/recognition.service.ts',
    ]);
  });

  it('the obsolete admin bulk evaluator and batch assigner open with the containment assertion', () => {
    const admin = fs.readFileSync(path.join(SRC_ROOT, 'modules/membership/admin/membership-admin.service.ts'), 'utf8');
    expect(admin).toMatch(/async listSeniorStatusEligible\(\) \{\s*assertLegacySeniorPathwayContained\(\);/);
    expect(admin).toMatch(
      /async assignSeniorStatusToEligible\(actorUserId: number\): Promise<\{ assigned: number \}> \{\s*assertLegacySeniorPathwayContained\(\);/,
    );
  });
});
