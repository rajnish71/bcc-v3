// Photographic Distinctions Phase 2A -- behavioural HTTP tests.
//
// Boots PhotographicDistinctionsController in a Nest Fastify app with the
// production Fastify options, the global ValidationPipe, the real
// AccessTokenGuard/RbacGuard and the real service over the recording FakeDb.
//
// Role -> permission sets are parsed from migration 0117 itself, so the RBAC
// boundary under test is exactly the one the migration ships (no bypass:
// a role holds a key only if 0117 grants it).

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
// RbacService (imported as the DI token) pulls kysely's ESM `sql` at load;
// same stand-in as financial-admin.http.spec.ts. Never executed here.
jest.mock('kysely', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('?'), values });
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
import { AccessTokenGuard } from '../auth/access-token.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RbacService } from '../rbac/rbac.service';
import { PhotographicDistinctionsController } from './photographic-distinctions.controller';
import { PhotographicDistinctionsService } from './photographic-distinctions.service';

const fake = db as unknown as FakeDb;
process.env.JWT_ACCESS_SECRET = 'distinctions-test-secret';

const REPO = path.resolve(__dirname, '../../../../..');
const MIGRATION_0117 = path.join(REPO, 'database/migrations/0117_add_identity_distinction_permissions.sql');

function grantsFromMigration(): Map<string, Set<string>> {
  const sql = fs.readFileSync(MIGRATION_0117, 'utf8').replace(/--.*$/gm, '');
  const byRole = new Map<string, Set<string>>();
  const re = /WHERE r\.name (?:IN \(([^)]*)\)|= '([^']+)')\s+AND p\.permission_key = '([a-z.]+)'/g;
  for (const m of sql.matchAll(re)) {
    const roles = (m[1] ?? `'${m[2]}'`).split(',').map((s) => s.trim().replace(/'/g, ''));
    for (const r of roles) {
      if (!byRole.has(r)) byRole.set(r, new Set());
      byRole.get(r)!.add(m[3]);
    }
  }
  return byRole;
}

const GRANTS = grantsFromMigration();
const USERS = {
  superAdmin: { id: 1, role: 'Super Admin' },
  platformAdmin: { id: 2, role: 'Platform Admin' },
  coordinator: { id: 3, role: 'Coordinator' },
  membershipManager: { id: 4, role: 'Membership Manager' },
  member: { id: 27, role: null as string | null },
  otherMember: { id: 16, role: null as string | null },
};
const permsFor = (id: number) => {
  const u = Object.values(USERS).find((x) => x.id === id);
  return u?.role ? GRANTS.get(u.role) ?? new Set<string>() : new Set<string>();
};

const AFIP = 1;
const activeDistinction = { id: AFIP, code: 'AFIP', is_active: 1, institution_code: 'FIP', institution_is_active: 1 };

type Tables = Record<string, unknown>;
function script(tables: Tables) {
  fake.responder = (op: FakeOp) => (op.kind === 'select' ? tables[op.table] : undefined);
}
const audits = () => fake.writes('identity_audit_log', 'insert').map((o) => o.values!);

describe('Photographic Distinctions API (api/v1/identity/distinctions)', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PhotographicDistinctionsController],
      providers: [
        JwtService,
        AccessTokenGuard,
        RbacGuard,
        PhotographicDistinctionsService,
        { provide: RbacService, useValue: { getActivePermissionKeys: async (id: number) => permsFor(id) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(fastifyServerOptions));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { fake.reset(); });

  async function call(
    userId: number | null,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) {
    const headers: Record<string, string> = {};
    if (userId !== null) {
      const token = await jwt.signAsync(
        { sub: userId, uuid: `u-${userId}`, status: 'ACTIVE', sid: 'sess' },
        { secret: process.env.JWT_ACCESS_SECRET },
      );
      headers.authorization = `Bearer ${token}`;
    }
    return app.inject({ method, url: `/api/v1/identity/distinctions${url}`, headers, payload: payload as never });
  }

  it('0117 grants exactly the frozen role sets (parsed, not assumed)', () => {
    expect([...(GRANTS.get('Super Admin') ?? [])].sort()).toEqual([
      'identity.distinction.catalogue.manage', 'identity.distinction.remove', 'identity.distinction.view',
    ]);
    expect([...(GRANTS.get('Platform Admin') ?? [])].sort()).toEqual(['identity.distinction.remove', 'identity.distinction.view']);
    expect([...(GRANTS.get('Coordinator') ?? [])]).toEqual(['identity.distinction.view']);
    expect(GRANTS.has('Membership Manager')).toBe(false);
  });

  // ── Holder ───────────────────────────────────────────────────────────────

  describe('holder', () => {
    it('unauthenticated -> 401', async () => {
      expect((await call(null, 'GET', '/me')).statusCode).toBe(401);
      expect((await call(null, 'POST', `/me/${AFIP}/declare`)).statusCode).toBe(401);
    });

    it('declares a valid distinction for the token subject only', async () => {
      script({ 'photographic_distinctions as d': [activeDistinction] });
      const res = await call(USERS.member.id, 'POST', `/me/${AFIP}/declare`);
      expect(res.statusCode).toBe(200);
      const [ins] = fake.writes('user_photographic_distinctions', 'insert');
      expect(ins.values).toMatchObject({ user_id: USERS.member.id, distinction_id: AFIP, state: 'DECLARED' });
      expect(audits()[0]).toMatchObject({ actor_id: USERS.member.id, target_user_id: USERS.member.id, action_type: 'PHOTOGRAPHIC_DISTINCTION_DECLARED' });
    });

    it('declaring an inactive distinction -> 400, nothing written', async () => {
      script({ 'photographic_distinctions as d': [{ ...activeDistinction, is_active: 0 }] });
      expect((await call(USERS.member.id, 'POST', `/me/${AFIP}/declare`)).statusCode).toBe(400);
      expect(fake.committed).toHaveLength(0);
    });

    it('declaring under an inactive institution -> 400', async () => {
      script({ 'photographic_distinctions as d': [{ ...activeDistinction, institution_is_active: 0 }] });
      expect((await call(USERS.member.id, 'POST', `/me/${AFIP}/declare`)).statusCode).toBe(400);
    });

    it('duplicate declaration -> 409 (not idempotent), nothing written', async () => {
      script({
        'photographic_distinctions as d': [activeDistinction],
        user_photographic_distinctions: [{ id: 9, state: 'DECLARED', pre_removal_state: null }],
      });
      expect((await call(USERS.member.id, 'POST', `/me/${AFIP}/declare`)).statusCode).toBe(409);
      expect(fake.committed).toHaveLength(0);
    });

    it('withdraws a declared distinction', async () => {
      script({
        'photographic_distinctions as d': [activeDistinction],
        user_photographic_distinctions: [{ id: 9, state: 'DECLARED', pre_removal_state: null }],
      });
      expect((await call(USERS.member.id, 'POST', `/me/${AFIP}/withdraw`)).statusCode).toBe(200);
      expect(fake.writes('user_photographic_distinctions', 'update')[0].set).toMatchObject({ state: 'WITHDRAWN' });
    });

    it('withdrawing a distinction the holder never declared -> 404', async () => {
      script({ 'photographic_distinctions as d': [activeDistinction] });
      expect((await call(USERS.member.id, 'POST', `/me/${AFIP}/withdraw`)).statusCode).toBe(404);
    });

    it('withdraw only ever addresses the token subject\'s own row (no cross-user path)', async () => {
      script({
        'photographic_distinctions as d': [activeDistinction],
        user_photographic_distinctions: [{ id: 9, state: 'DECLARED', pre_removal_state: null }],
      });
      await call(USERS.otherMember.id, 'POST', `/me/${AFIP}/withdraw`);
      const lookup = fake.selects.find((s) => s.table === 'user_photographic_distinctions')!;
      expect(lookup.wheres).toContainEqual(['user_id', '=', USERS.otherMember.id]);
      expect(audits()[0]).toMatchObject({ target_user_id: USERS.otherMember.id });
    });

    it('re-declares a withdrawn distinction', async () => {
      script({
        'photographic_distinctions as d': [activeDistinction],
        user_photographic_distinctions: [{ id: 9, state: 'WITHDRAWN', pre_removal_state: null }],
      });
      expect((await call(USERS.member.id, 'POST', `/me/${AFIP}/declare`)).statusCode).toBe(200);
      expect(audits()[0]).toMatchObject({ action_type: 'PHOTOGRAPHIC_DISTINCTION_REDECLARED' });
    });

    it('a REMOVED distinction cannot be re-declared by the holder -> 403', async () => {
      script({
        'photographic_distinctions as d': [activeDistinction],
        user_photographic_distinctions: [{ id: 9, state: 'REMOVED', pre_removal_state: 'DECLARED' }],
      });
      const res = await call(USERS.member.id, 'POST', `/me/${AFIP}/declare`);
      expect(res.statusCode).toBe(403);
      expect(fake.committed).toHaveLength(0);
    });

    it('non-numeric distinction id -> 400', async () => {
      expect((await call(USERS.member.id, 'POST', '/me/abc/declare')).statusCode).toBe(400);
    });

    it('GET /me returns only active catalogue entries plus the holder\'s own rows', async () => {
      script({
        photographic_institutions: [{ id: 1, code: 'FIP', name: 'Federation of Indian Photography', is_active: 1, sort_order: 10 }],
        photographic_distinctions: [{ id: AFIP, institution_id: 1, code: 'AFIP', name: 'AFIP', badge_eligible: 1, is_active: 1, sort_order: 10 }],
        'user_photographic_distinctions as upd': [],
      });
      const res = await call(USERS.member.id, 'GET', '/me');
      expect(res.statusCode).toBe(200);
      expect(res.json().catalogue[0].distinctions[0]).toMatchObject({ code: 'AFIP', badgeEligible: true });
      const catalogueSelects = fake.selects.filter((s) => s.table === 'photographic_distinctions' || s.table === 'photographic_institutions');
      for (const s of catalogueSelects) expect(s.wheres).toContainEqual(['is_active', '=', true]);
      const own = fake.selects.find((s) => s.table === 'user_photographic_distinctions as upd')!;
      expect(own.wheres).toContainEqual(['upd.user_id', '=', USERS.member.id]);
    });
  });

  // ── Admin remove / restore ───────────────────────────────────────────────

  describe('admin remove / restore', () => {
    const declared = { id: 9, state: 'DECLARED', pre_removal_state: null };
    const removedFromWithdrawn = { id: 9, state: 'REMOVED', pre_removal_state: 'WITHDRAWN' };

    it.each([['superAdmin'], ['platformAdmin']] as const)('%s may REMOVE; audit targets the holder with the reason', async (who) => {
      script({ 'photographic_distinctions as d': [activeDistinction], user_photographic_distinctions: [declared] });
      const res = await call(USERS[who].id, 'POST', `/admin/declarations/${USERS.member.id}/${AFIP}/remove`, { reason: 'Complaint; evidence not provided' });
      expect(res.statusCode).toBe(200);
      expect(fake.writes('user_photographic_distinctions', 'update')[0].set).toMatchObject({
        state: 'REMOVED', pre_removal_state: 'DECLARED', state_changed_by_user_id: USERS[who].id,
      });
      expect(audits()).toEqual([expect.objectContaining({
        actor_id: USERS[who].id, target_user_id: USERS.member.id,
        action_type: 'PHOTOGRAPHIC_DISTINCTION_REMOVED', reason: 'Complaint; evidence not provided',
      })]);
    });

    it.each([['coordinator'], ['membershipManager'], ['member']] as const)('%s may NOT remove or restore (403)', async (who) => {
      script({ 'photographic_distinctions as d': [activeDistinction], user_photographic_distinctions: [declared] });
      expect((await call(USERS[who].id, 'POST', `/admin/declarations/${USERS.member.id}/${AFIP}/remove`, { reason: 'x' })).statusCode).toBe(403);
      expect((await call(USERS[who].id, 'POST', `/admin/declarations/${USERS.member.id}/${AFIP}/restore`, { reason: 'x' })).statusCode).toBe(403);
      expect(fake.committed).toHaveLength(0);
    });

    it('REMOVE and RESTORE require a non-empty reason (400)', async () => {
      script({ 'photographic_distinctions as d': [activeDistinction], user_photographic_distinctions: [declared] });
      for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
        expect((await call(USERS.superAdmin.id, 'POST', `/admin/declarations/${USERS.member.id}/${AFIP}/remove`, body)).statusCode).toBe(400);
        expect((await call(USERS.superAdmin.id, 'POST', `/admin/declarations/${USERS.member.id}/${AFIP}/restore`, body)).statusCode).toBe(400);
      }
      expect(fake.committed).toHaveLength(0);
    });

    it('RESTORE returns the prior state (WITHDRAWN, not blindly DECLARED) and audits the reason', async () => {
      script({ 'photographic_distinctions as d': [activeDistinction], user_photographic_distinctions: [removedFromWithdrawn] });
      const res = await call(USERS.platformAdmin.id, 'POST', `/admin/declarations/${USERS.member.id}/${AFIP}/restore`, { reason: 'Evidence supplied' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ state: 'WITHDRAWN', pre_removal_state: null });
      expect(audits()[0]).toMatchObject({ target_user_id: USERS.member.id, action_type: 'PHOTOGRAPHIC_DISTINCTION_RESTORED', reason: 'Evidence supplied' });
    });

    it('a failed transaction writes no audit row', async () => {
      script({ 'photographic_distinctions as d': [activeDistinction], user_photographic_distinctions: [declared] });
      fake.failWhen = (op) => (op.kind === 'update' && op.table === 'user_photographic_distinctions' ? new Error('db down') : null);
      expect((await call(USERS.superAdmin.id, 'POST', `/admin/declarations/${USERS.member.id}/${AFIP}/remove`, { reason: 'r' })).statusCode).toBe(500);
      expect(fake.writes('identity_audit_log')).toHaveLength(0);
    });

    it('view permission gates the declaration register; Coordinator may view', async () => {
      script({ 'user_photographic_distinctions as upd': [] });
      expect((await call(USERS.coordinator.id, 'GET', '/admin/declarations?state=REMOVED')).statusCode).toBe(200);
      expect((await call(USERS.member.id, 'GET', '/admin/declarations')).statusCode).toBe(403);
      expect((await call(USERS.coordinator.id, 'GET', '/admin/declarations?state=BOGUS')).statusCode).toBe(400);
    });
  });

  // ── Catalogue ────────────────────────────────────────────────────────────

  describe('catalogue management', () => {
    const newInstitution = { code: 'APS', name: 'Example Photographic Society', sortOrder: 60 };

    it('Super Admin can create and update; events carry a NULL target', async () => {
      script({ photographic_institutions: [{ id: 6, code: 'APS', name: 'Old', is_active: 1, sort_order: 60 }] });
      expect((await call(USERS.superAdmin.id, 'POST', '/admin/catalogue/institutions', newInstitution)).statusCode).toBe(201);
      expect((await call(USERS.superAdmin.id, 'PATCH', '/admin/catalogue/institutions/6', { name: 'New', isActive: false })).statusCode).toBe(200);
      const a = audits();
      expect(a.map((e) => e.action_type)).toEqual([
        'PHOTOGRAPHIC_INSTITUTION_CREATED', 'PHOTOGRAPHIC_INSTITUTION_UPDATED', 'PHOTOGRAPHIC_INSTITUTION_DEACTIVATED',
      ]);
      expect(a.every((e) => e.target_user_id === null && e.actor_id === USERS.superAdmin.id)).toBe(true);
    });

    it.each([['platformAdmin'], ['coordinator'], ['member']] as const)('%s cannot mutate the catalogue (403)', async (who) => {
      const id = USERS[who].id;
      const codes = await Promise.all([
        call(id, 'POST', '/admin/catalogue/institutions', newInstitution),
        call(id, 'PATCH', '/admin/catalogue/institutions/1', { isActive: false }),
        call(id, 'DELETE', '/admin/catalogue/institutions/1'),
        call(id, 'POST', '/admin/catalogue/distinctions', { institutionId: 1, code: 'MFIP', name: 'MFIP', badgeEligible: true }),
        call(id, 'PATCH', '/admin/catalogue/distinctions/1', { badgeEligible: false }),
        call(id, 'DELETE', '/admin/catalogue/distinctions/1'),
      ]);
      expect(codes.map((r) => r.statusCode)).toEqual([403, 403, 403, 403, 403, 403]);
      expect(fake.committed).toHaveLength(0);
    });

    it('an OTHER institution is rejected', async () => {
      expect((await call(USERS.superAdmin.id, 'POST', '/admin/catalogue/institutions', { code: 'OTHER', name: 'Other' })).statusCode).toBe(400);
      expect(fake.committed).toHaveLength(0);
    });

    it('legacy free-text codes are not valid catalogue codes', async () => {
      for (const code of ['GPU-CR3', 'GPU VIP-3', 'afip', 'X']) {
        const res = await call(USERS.superAdmin.id, 'POST', '/admin/catalogue/distinctions', { institutionId: 5, code, name: 'n', badgeEligible: true });
        expect(res.statusCode).toBe(400);
      }
      expect(fake.committed).toHaveLength(0);
    });

    it('unknown request fields are rejected (whitelist)', async () => {
      const res = await call(USERS.superAdmin.id, 'POST', '/admin/catalogue/distinctions', {
        institutionId: 1, code: 'MFIP', name: 'MFIP', badgeEligible: true, verified: true,
      });
      expect(res.statusCode).toBe(400);
    });

    it('a distinction with holder relationships cannot be deleted (409)', async () => {
      script({
        photographic_distinctions: [{ id: AFIP, institution_id: 1, code: 'AFIP', name: 'AFIP', badge_eligible: 1, is_active: 1, sort_order: 10 }],
        user_photographic_distinctions: [{ id: 9 }],
      });
      expect((await call(USERS.superAdmin.id, 'DELETE', `/admin/catalogue/distinctions/${AFIP}`)).statusCode).toBe(409);
      expect(fake.writes('photographic_distinctions', 'delete')).toHaveLength(0);
      expect(fake.writes('identity_audit_log')).toHaveLength(0);
    });

    it('an institution with distinctions cannot be deleted (409)', async () => {
      script({
        photographic_institutions: [{ id: 1, code: 'FIP', name: 'Federation of Indian Photography', is_active: 1, sort_order: 10 }],
        photographic_distinctions: [{ id: AFIP }],
      });
      expect((await call(USERS.superAdmin.id, 'DELETE', '/admin/catalogue/institutions/1')).statusCode).toBe(409);
      expect(fake.writes('photographic_institutions', 'delete')).toHaveLength(0);
    });

    it('an unreferenced distinction can be deleted, audited with a NULL target', async () => {
      script({ photographic_distinctions: [{ id: 7, institution_id: 1, code: 'MFIP', name: 'MFIP', badge_eligible: 0, is_active: 1, sort_order: 30 }] });
      expect((await call(USERS.superAdmin.id, 'DELETE', '/admin/catalogue/distinctions/7')).statusCode).toBe(200);
      expect(audits()).toEqual([expect.objectContaining({ target_user_id: null, action_type: 'PHOTOGRAPHIC_DISTINCTION_CATALOGUE_DELETED' })]);
    });

    it('badge_eligible change is its own NULL-target audit event', async () => {
      script({ photographic_distinctions: [{ id: AFIP, code: 'AFIP', name: 'AFIP', badge_eligible: 1, is_active: 1, sort_order: 10 }] });
      expect((await call(USERS.superAdmin.id, 'PATCH', `/admin/catalogue/distinctions/${AFIP}`, { badgeEligible: false })).statusCode).toBe(200);
      expect(audits()).toEqual([expect.objectContaining({ target_user_id: null, action_type: 'PHOTOGRAPHIC_DISTINCTION_BADGE_ELIGIBILITY_CHANGED' })]);
    });
  });

  it('no route verifies, evidences or awards a badge', () => {
    const src = fs.readFileSync(path.join(__dirname, 'photographic-distinctions.controller.ts'), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/verify|evidence|badge|award/i);
  });
});
