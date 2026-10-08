// Behavioural HTTP tests for Duplicate Identity Reconciliation
// (POST /api/v1/identity/admin/reconcile-duplicate-identity, IDENTITY-ARCH-001
// reconciliation amendment). Boots IdentityController in a Nest Fastify app
// with the production Fastify options + ValidationPipe, the real
// AccessTokenGuard/RbacGuard, and the real IdentityService over the
// recording FakeDb. Ids mirror the audited cases; UUIDs are synthetic.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
// kysely is ESM-only at runtime under this Jest config; the service only uses
// its `sql` tag (DATABASE()), which the FakeDb ignores.
jest.mock('kysely', () => ({ sql: () => ({}) }));
jest.mock('../../shared/communication/communication.service', () => ({ CommunicationService: class {} }));
jest.mock('../../shared/communication/email.service', () => ({ EmailService: class {} }));

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { db } from '../../../database/db';
import { whereValue, type FakeDb, type FakeOp } from '../../../test-support/fake-db';
import { fastifyServerOptions } from '../../../http/fastify-options';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RbacService } from '../rbac/rbac.service';
import { REQUIRED_PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { CommunicationService } from '../../shared/communication/communication.service';
import { EmailService } from '../../shared/communication/email.service';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

const fake = db as unknown as FakeDb;
process.env.JWT_ACCESS_SECRET = 'reconcile-test-secret';

const SUPER_ADMIN = 1;
const MEMBERSHIP_ADMIN = 3; // holds membership.application.approve, not identity.reconcile
const MEMBER = 22;
const GOOGLE_SUB = 'google-sub-never-leaves-the-db';
const ATTESTATION = 'Member confirmed in writing to Human Authority that this Google account is theirs';

interface UserRow {
  id: number; uuid: string; email: string | null; username: string | null;
  identity_status: 'IDENTITY_PENDING' | 'IDENTITY_COMPLETE'; created_at: string;
}
interface Case {
  canonical: UserRow; duplicate: UserRow; authIdentityId: number; finalEmail?: string;
}

const SANJAY: Case = {
  canonical: { id: 27, uuid: '00000000-0000-4000-8000-000000000027', email: 'sanjaykumarshukla@bcc.bhopal.info', username: 'sanjaykumarshukla', identity_status: 'IDENTITY_COMPLETE', created_at: '2026-07-06T04:19:09.000Z' },
  duplicate: { id: 120, uuid: '00000000-0000-4000-8000-000000000120', email: 'sanjayshukla.ifs@gmail.com', username: null, identity_status: 'IDENTITY_PENDING', created_at: '2026-10-06T05:52:16.000Z' },
  authIdentityId: 40,
  finalEmail: 'sanjayshukla.ifs@gmail.com',
};
const ANIMESH: Case = {
  canonical: { id: 29, uuid: '00000000-0000-4000-8000-000000000029', email: 'dranimeshsaxena@gmail.com', username: 'animeshsaxena', identity_status: 'IDENTITY_COMPLETE', created_at: '2026-07-06T04:19:09.000Z' },
  duplicate: { id: 119, uuid: '00000000-0000-4000-8000-000000000119', email: 'animesh7891@gmail.com', username: null, identity_status: 'IDENTITY_PENDING', created_at: '2026-10-06T05:38:04.000Z' },
  authIdentityId: 38,
};
const VIKAS: Case = {
  canonical: { id: 45, uuid: '00000000-0000-4000-8000-000000000045', email: 'vikas.gangpari@gmail.com', username: 'gangparivikas', identity_status: 'IDENTITY_COMPLETE', created_at: '2026-07-15T00:38:24.000Z' },
  duplicate: { id: 118, uuid: '00000000-0000-4000-8000-000000000118', email: 'vickygvikas@gmail.com', username: null, identity_status: 'IDENTITY_PENDING', created_at: '2026-10-06T05:32:35.000Z' },
  authIdentityId: 37,
};

// Representative subset of the live users.id FK topology (0125 pre-check C).
const BASE_FKS: Array<{ table_name: string; column_name: string; delete_rule: string }> = [
  { table_name: 'auth_identities', column_name: 'user_id', delete_rule: 'CASCADE' },
  { table_name: 'refresh_tokens', column_name: 'user_id', delete_rule: 'CASCADE' },
  { table_name: 'identity_audit_log', column_name: 'target_user_id', delete_rule: 'CASCADE' },
  { table_name: 'identity_audit_log', column_name: 'actor_id', delete_rule: 'SET NULL' },
  { table_name: 'login_history', column_name: 'user_id', delete_rule: 'SET NULL' },
  { table_name: 'memberships', column_name: 'user_id', delete_rule: 'RESTRICT' },
  { table_name: 'financial_contributions', column_name: 'payer_user_id', delete_rule: 'RESTRICT' },
  { table_name: 'photos', column_name: 'owner_user_id', delete_rule: 'NO ACTION' },
  { table_name: 'user_roles', column_name: 'user_id', delete_rule: 'CASCADE' },
  { table_name: 'notification_preferences', column_name: 'user_id', delete_rule: 'CASCADE' },
  { table_name: 'users', column_name: 'created_by', delete_rule: 'SET NULL' },
];

interface Scenario {
  c: Case;
  canonicalOverrides?: Partial<UserRow>;
  duplicateOverrides?: Partial<UserRow>;
  auth?: { id: number; user_id: number; provider: string; provider_user_id: string } | null;
  fks?: typeof BASE_FKS;
  counts?: Record<string, number>; // "table.column" -> rows for the duplicate
  ownActorAuditRows?: number;
  relinkRows?: bigint;
  deleteRows?: bigint;
  emailRows?: bigint;
}

function script(s: Scenario) {
  const canonical = { ...s.c.canonical, ...s.canonicalOverrides };
  const duplicate = { ...s.c.duplicate, ...s.duplicateOverrides };
  const auth = s.auth === undefined
    ? { id: s.c.authIdentityId, user_id: s.c.duplicate.id, provider: 'GOOGLE', provider_user_id: GOOGLE_SUB }
    : s.auth;
  const counts: Record<string, number> = {
    'auth_identities.user_id': 1, 'refresh_tokens.user_id': 2,
    'identity_audit_log.target_user_id': 1, 'login_history.user_id': 1,
    ...s.counts,
  };
  fake.responder = (op: FakeOp) => {
    if (op.kind === 'select') {
      if (op.table === 'users' && Array.isArray(whereValue(op, 'id'))) {
        const ids = whereValue(op, 'id') as number[];
        return [canonical, duplicate].filter((u) => ids.includes(u.id));
      }
      if (op.table === 'auth_identities' && whereValue(op, 'id') !== undefined) {
        return auth && whereValue(op, 'id') === auth.id ? [auth] : [];
      }
      if (op.table.startsWith('information_schema.')) return s.fks ?? BASE_FKS;
      // Dependency counts: one where (column = duplicate id), plus the
      // own-actor probe on identity_audit_log.
      const col = op.wheres[0][0] as string;
      if (op.table === 'identity_audit_log' && col === 'actor_id' && op.wheres.length === 2) {
        return [{ n: s.ownActorAuditRows ?? 0 }];
      }
      return [{ n: counts[`${op.table}.${col}`] ?? 0 }];
    }
    if (op.kind === 'update' && op.table === 'auth_identities' && s.relinkRows !== undefined) return { numUpdatedRows: s.relinkRows };
    if (op.kind === 'delete' && op.table === 'users' && s.deleteRows !== undefined) return { numDeletedRows: s.deleteRows };
    if (op.kind === 'update' && op.table === 'users' && s.emailRows !== undefined) return { numUpdatedRows: s.emailRows };
    return undefined;
  };
}

function body(c: Case, overrides: Record<string, unknown> = {}) {
  return {
    canonicalUserId: c.canonical.id,
    duplicateUserId: c.duplicate.id,
    duplicateUuid: c.duplicate.uuid,
    duplicateEmail: c.duplicate.email,
    authIdentityId: c.authIdentityId,
    reason: 'Duplicate identity created by second Google account (audit 2026-10-07)',
    providerOwnershipAttestation: ATTESTATION,
    expectedCanonicalUsername: c.canonical.username,
    expectedCanonicalEmail: c.canonical.email,
    ...(c.finalEmail ? { finalEmail: c.finalEmail } : {}),
    dryRun: false,
    ...overrides,
  };
}

const writes = (ops: FakeOp[]) => ops.filter((op) => op.kind !== 'select');
const committedWrites = () => writes(fake.committed);
const auditRow = () => fake.writes('identity_audit_log', 'insert')[0]?.values;

describe('POST /api/v1/identity/admin/reconcile-duplicate-identity', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  const permissions = new Map<number, Set<string>>([
    [SUPER_ADMIN, new Set(['identity.reconcile', 'membership.application.approve'])],
    [MEMBERSHIP_ADMIN, new Set(['membership.application.approve', 'membership.record.view'])],
    [MEMBER, new Set()],
  ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [
        JwtService,
        AccessTokenGuard,
        RbacGuard,
        IdentityService,
        { provide: CommunicationService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: RbacService, useValue: { getActivePermissionKeys: async (id: number) => permissions.get(id) ?? new Set() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(fastifyServerOptions));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { fake.reset(); script({ c: SANJAY }); });

  async function post(userId: number | null, payload: Record<string, unknown>) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (userId !== null) {
      const token = await jwt.signAsync(
        { sub: userId, uuid: `u-${userId}`, status: 'ACTIVE', sid: 'sess' },
        { secret: process.env.JWT_ACCESS_SECRET },
      );
      headers.authorization = `Bearer ${token}`;
    }
    return app.inject({
      method: 'POST',
      url: '/api/v1/identity/admin/reconcile-duplicate-identity',
      headers,
      payload: JSON.stringify(payload),
    });
  }

  // ── Authorization ──────────────────────────────────────────────────────

  it('401 without a token; nothing touched', async () => {
    expect((await post(null, body(SANJAY))).statusCode).toBe(401);
    expect(fake.committed).toHaveLength(0);
    expect(fake.selects).toHaveLength(0);
  });

  it('403 for an ordinary member', async () => {
    expect((await post(MEMBER, body(SANJAY))).statusCode).toBe(403);
    expect(fake.selects).toHaveLength(0);
  });

  it('generic membership permission (membership.application.approve) cannot authorize reconciliation', async () => {
    const res = await post(MEMBERSHIP_ADMIN, body(SANJAY));
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('identity.reconcile');
    expect(fake.selects).toHaveLength(0);
    expect(fake.committed).toHaveLength(0);
  });

  it('identity.reconcile is the required permission on the route', () => {
    const handler = IdentityController.prototype.reconcileDuplicateIdentity;
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual(['identity.reconcile']);
  });

  it('actor comes from the JWT; an actor field in the body is rejected', async () => {
    expect((await post(SUPER_ADMIN, body(SANJAY, { actorUserId: 99 }))).statusCode).toBe(400);
    expect((await post(SUPER_ADMIN, body(SANJAY, { actor_user_id: 99 }))).statusCode).toBe(400);
    expect(fake.selects).toHaveLength(0);

    expect((await post(SUPER_ADMIN, body(SANJAY))).statusCode).toBe(200);
    expect(auditRow()).toMatchObject({ actor_id: SUPER_ADMIN });
    expect(JSON.parse(auditRow()!.new_value as string).actor_user_id).toBe(SUPER_ADMIN);
  });

  // ── DTO / structural validation ────────────────────────────────────────

  it('400 when dryRun is omitted, reason is missing, or ids are malformed', async () => {
    const { dryRun: _d, ...noDryRun } = body(SANJAY);
    const { reason: _r, ...noReason } = body(SANJAY);
    expect((await post(SUPER_ADMIN, noDryRun)).statusCode).toBe(400);
    expect((await post(SUPER_ADMIN, noReason)).statusCode).toBe(400);
    expect((await post(SUPER_ADMIN, body(SANJAY, { reason: '   ' }))).statusCode).toBe(400);
    expect((await post(SUPER_ADMIN, body(SANJAY, { duplicateUuid: 'not-a-uuid' }))).statusCode).toBe(400);
    expect((await post(SUPER_ADMIN, body(SANJAY, { duplicateUserId: SANJAY.canonical.id }))).statusCode).toBe(400);
    expect(fake.committed).toHaveLength(0);
  });

  it('finalEmail different from the duplicate email is refused (not a general email-change API)', async () => {
    const res = await post(SUPER_ADMIN, body(SANJAY, { finalEmail: 'someone.else@example.com' }));
    expect(res.statusCode).toBe(400);
    expect(fake.selects).toHaveLength(0);
    expect(fake.committed).toHaveLength(0);
  });

  // ── Provider ownership attestation ─────────────────────────────────────

  it('400 when providerOwnershipAttestation is missing', async () => {
    const { providerOwnershipAttestation: _a, ...noAttestation } = body(SANJAY);
    expect((await post(SUPER_ADMIN, noAttestation)).statusCode).toBe(400);
    expect(fake.selects).toHaveLength(0);
    expect(fake.committed).toHaveLength(0);
  });

  it('400 when providerOwnershipAttestation is whitespace-only or over 500 characters', async () => {
    expect((await post(SUPER_ADMIN, body(SANJAY, { providerOwnershipAttestation: '   \t ' }))).statusCode).toBe(400);
    expect((await post(SUPER_ADMIN, body(SANJAY, { providerOwnershipAttestation: 'x'.repeat(501) }))).statusCode).toBe(400);
    expect(fake.selects).toHaveLength(0);
    expect(fake.committed).toHaveLength(0);
  });

  it('attestation is persisted in the IDENTITY_DUPLICATE_RECONCILED payload, distinct from reason, in the same transaction', async () => {
    expect((await post(SUPER_ADMIN, body(SANJAY))).statusCode).toBe(200);
    const audit = fake.writes('identity_audit_log', 'insert')[0];
    const payload = JSON.parse(audit.values!.new_value as string);
    expect(payload.provider_ownership_attestation).toBe(ATTESTATION);
    expect(audit.values!.reason).toBe(body(SANJAY).reason);
    expect(payload.provider_ownership_attestation).not.toBe(audit.values!.reason);
    expect(new Set(committedWrites().map((op) => op.txId))).toEqual(new Set([audit.txId]));
  });

  it('dry run carries the attestation in its proposed audit payload but writes nothing', async () => {
    const res = await post(SUPER_ADMIN, body(SANJAY, { dryRun: true }));
    expect(res.statusCode).toBe(200);
    expect(res.json().audit.payload.provider_ownership_attestation).toBe(ATTESTATION);
    expect(fake.committed).toHaveLength(0);
    expect(writes(fake.rolledBack)).toHaveLength(0);
  });

  // ── Canonical state drift (operator-reviewed state A vs live state B) ──

  it('400 when expectedCanonicalUsername or expectedCanonicalEmail is omitted (even without finalEmail)', async () => {
    const { expectedCanonicalUsername: _u, ...noUsername } = body(ANIMESH);
    const { expectedCanonicalEmail: _e, ...noEmail } = body(ANIMESH);
    expect((await post(SUPER_ADMIN, noUsername)).statusCode).toBe(400);
    expect((await post(SUPER_ADMIN, noEmail)).statusCode).toBe(400);
    expect(fake.selects).toHaveLength(0);
  });

  it.each<[string, Case, Partial<UserRow>]>([
    ['canonical username changed after review', SANJAY, { username: 'sanjayshukla_new' }],
    ['canonical email changed after review (finalEmail supplied)', SANJAY, { email: 'other@bcc.bhopal.info' }],
    ['canonical email changed after review (no finalEmail)', VIKAS, { email: 'other@gmail.com' }],
  ])('409 and no write on drift: %s', async (_label, c, drift) => {
    script({ c, canonicalOverrides: drift });
    expect((await post(SUPER_ADMIN, body(c))).statusCode).toBe(409);
    expect(fake.committed).toHaveLength(0);
    expect(writes(fake.rolledBack)).toHaveLength(0);
  });

  it.each<[string, Record<string, unknown>]>([
    ['expectedCanonicalUsername mismatch', { expectedCanonicalUsername: 'someone_else' }],
    ['expectedCanonicalEmail mismatch', { expectedCanonicalEmail: 'not.the.canonical@gmail.com' }],
  ])('409 and no write: %s', async (_label, override) => {
    expect((await post(SUPER_ADMIN, body(SANJAY, override))).statusCode).toBe(409);
    expect(fake.committed).toHaveLength(0);
    expect(writes(fake.rolledBack)).toHaveLength(0);
  });

  // ── Fail-closed state validation under lock ────────────────────────────

  const refusals: Array<[string, Scenario]> = [
    ['canonical user must be COMPLETE', { c: SANJAY, canonicalOverrides: { identity_status: 'IDENTITY_PENDING' } }],
    ['duplicate must be PENDING', { c: SANJAY, duplicateOverrides: { identity_status: 'IDENTITY_COMPLETE' } }],
    ['duplicate must have NULL username', { c: SANJAY, duplicateOverrides: { username: 'sanjayshukla' } }],
    ['duplicate UUID mismatch', { c: SANJAY, duplicateOverrides: { uuid: '00000000-0000-4000-8000-000000000999' } }],
    ['duplicate email mismatch', { c: SANJAY, duplicateOverrides: { email: 'changed@gmail.com' } }],
    ['auth identity belongs to another user', { c: SANJAY, auth: { id: 40, user_id: 27, provider: 'GOOGLE', provider_user_id: GOOGLE_SUB } }],
    ['non-Google provider', { c: SANJAY, auth: { id: 40, user_id: 120, provider: 'FACEBOOK', provider_user_id: GOOGLE_SUB } }],
    ['unexpected business dependency (membership)', { c: SANJAY, counts: { 'memberships.user_id': 1 } }],
    ['unexpected business dependency (financial)', { c: SANJAY, counts: { 'financial_contributions.payer_user_id': 1 } }],
    ['unexpected business dependency (photos)', { c: SANJAY, counts: { 'photos.owner_user_id': 3 } }],
    ['unexpected CASCADE dependency outside the approved set', { c: SANJAY, counts: { 'notification_preferences.user_id': 1 } }],
    ['unconstrained (non-FK) reference', { c: SANJAY, counts: { 'photo_comments.user_id': 1 } }],
    ['additional provider identity on the duplicate', { c: SANJAY, counts: { 'auth_identities.user_id': 2 } }],
    ['duplicate acted on other identities in the audit log', { c: SANJAY, counts: { 'identity_audit_log.actor_id': 2 }, ownActorAuditRows: 1 }],
    ['FK delete rule changed from the approved topology', {
      c: SANJAY,
      fks: BASE_FKS.map((fk) => (fk.table_name === 'identity_audit_log' && fk.column_name === 'target_user_id' ? { ...fk, delete_rule: 'SET NULL' } : fk)),
    }],
    ['approved FK missing from metadata', { c: SANJAY, fks: BASE_FKS.filter((fk) => fk.table_name !== 'refresh_tokens') }],
  ];

  it.each(refusals)('refuses (409) and writes nothing: %s', async (_label, scenario) => {
    script(scenario);
    const res = await post(SUPER_ADMIN, body(SANJAY));
    expect(res.statusCode).toBe(409);
    expect(fake.committed).toHaveLength(0);
    expect(writes(fake.rolledBack)).toHaveLength(0);
  });

  it('404 when the auth identity does not exist', async () => {
    script({ c: SANJAY, auth: null });
    expect((await post(SUPER_ADMIN, body(SANJAY))).statusCode).toBe(404);
    expect(fake.committed).toHaveLength(0);
  });

  it('locks both users rows and the auth identity before validating', async () => {
    await post(SUPER_ADMIN, body(SANJAY));
    const [users, auth] = fake.selects;
    expect(users.table).toBe('users');
    expect(whereValue(users, 'id')).toEqual([27, 120]);
    expect(auth.table).toBe('auth_identities');
    expect(users.inTransaction && auth.inTransaction).toBe(true);
  });

  // ── Successful reconciliation ──────────────────────────────────────────

  it('Sanjay: audit -> re-link -> delete -> email, in ONE transaction, in that order', async () => {
    const res = await post(SUPER_ADMIN, body(SANJAY));
    expect(res.statusCode).toBe(200);
    const ops = committedWrites();
    expect(new Set(ops.map((op) => op.txId)).size).toBe(1);
    expect(ops.map((op) => `${op.kind}:${op.table}`)).toEqual([
      'insert:identity_audit_log',
      'update:auth_identities',
      'delete:users',
      'update:users',
    ]);
  });

  it('auth identity is re-linked: user_id only, pinned to the locked provider subject', async () => {
    await post(SUPER_ADMIN, body(SANJAY));
    const [relink] = fake.writes('auth_identities', 'update');
    expect(relink.set).toEqual({ user_id: 27 });
    expect(whereValue(relink, 'id')).toBe(40);
    expect(whereValue(relink, 'user_id')).toBe(120);
    expect(whereValue(relink, 'provider')).toBe('GOOGLE');
    expect(whereValue(relink, 'provider_user_id')).toBe(GOOGLE_SUB);
  });

  it('a duplicate provider mapping cannot be created: no auth_identities insert, provider fields never written', async () => {
    await post(SUPER_ADMIN, body(SANJAY));
    expect(fake.writes('auth_identities', 'insert')).toHaveLength(0);
    for (const op of fake.writes('auth_identities')) {
      expect(Object.keys(op.set ?? {})).toEqual(['user_id']);
    }
  });

  it('duplicate user is removed with defensive predicates', async () => {
    await post(SUPER_ADMIN, body(SANJAY));
    const [del] = fake.writes('users', 'delete');
    expect(whereValue(del, 'id')).toBe(120);
    expect(whereValue(del, 'uuid')).toBe(SANJAY.duplicate.uuid);
    expect(whereValue(del, 'identity_status')).toBe('IDENTITY_PENDING');
    expect(del.wheres).toContainEqual(['username', 'is', null]);
  });

  it('Sanjay email changes to the freed address with an expected-old-email predicate', async () => {
    const res = await post(SUPER_ADMIN, body(SANJAY));
    const [upd] = fake.writes('users', 'update');
    expect(upd.set).toEqual({ email: 'sanjayshukla.ifs@gmail.com' });
    expect(whereValue(upd, 'id')).toBe(27);
    expect(whereValue(upd, 'email')).toBe('sanjaykumarshukla@bcc.bhopal.info');
    expect(res.json().canonical).toMatchObject({
      emailBefore: 'sanjaykumarshukla@bcc.bhopal.info',
      emailAfter: 'sanjayshukla.ifs@gmail.com',
      emailChanged: true,
    });
  });

  it.each([['Animesh', ANIMESH], ['Vikas', VIKAS]])('%s: email remains unchanged', async (_n, c) => {
    script({ c });
    const res = await post(SUPER_ADMIN, body(c));
    expect(res.statusCode).toBe(200);
    expect(fake.writes('users', 'update')).toHaveLength(0);
    expect(committedWrites().map((op) => `${op.kind}:${op.table}`)).toEqual([
      'insert:identity_audit_log', 'update:auth_identities', 'delete:users',
    ]);
    expect(res.json().canonical).toMatchObject({ emailBefore: c.canonical.email, emailAfter: c.canonical.email, emailChanged: false });
    expect(fake.writes('auth_identities', 'update')[0].set).toEqual({ user_id: c.canonical.id });
  });

  it('force_password_reset, username, membership, recognition, RBAC and content are never written', async () => {
    await post(SUPER_ADMIN, body(SANJAY));
    for (const op of fake.writes('users', 'update')) {
      expect(op.set).not.toHaveProperty('force_password_reset');
      expect(op.set).not.toHaveProperty('username');
      expect(op.set).not.toHaveProperty('email_verified_at');
    }
    const forbidden = ['memberships', 'member_recognitions', 'membership_number_log', 'user_roles', 'photos', 'financial_contributions'];
    expect(committedWrites().filter((op) => forbidden.includes(op.table))).toHaveLength(0);
  });

  it('reconciliation audit event targets the CANONICAL user with the required metadata and no secrets', async () => {
    const res = await post(SUPER_ADMIN, body(SANJAY));
    const row = auditRow()!;
    expect(row).toMatchObject({
      actor_id: SUPER_ADMIN,
      target_user_id: 27,
      action_type: 'IDENTITY_DUPLICATE_RECONCILED',
      reason: body(SANJAY).reason,
    });
    expect(JSON.parse(row.new_value as string)).toMatchObject({
      actor_user_id: SUPER_ADMIN,
      duplicate_user_id: 120,
      duplicate_uuid: SANJAY.duplicate.uuid,
      duplicate_email: 'sanjayshukla.ifs@gmail.com',
      duplicate_created_at: '2026-10-06T05:52:16.000Z',
      provider: 'GOOGLE',
      auth_identity_id: 40,
      refresh_tokens_revoked: 2,
      duplicate_audit_rows_discarded: 1,
      canonical_email_before: 'sanjaykumarshukla@bcc.bhopal.info',
      canonical_email_after: 'sanjayshukla.ifs@gmail.com',
    });
    expect(JSON.stringify(row)).not.toContain(GOOGLE_SUB);
    expect(res.body).not.toContain(GOOGLE_SUB);
  });

  // ── Rollback ───────────────────────────────────────────────────────────

  it('a failure after the audit/re-link rolls the whole pair back', async () => {
    fake.failWhen = (op) => (op.kind === 'delete' && op.table === 'users' ? new Error('deadlock') : null);
    expect((await post(SUPER_ADMIN, body(SANJAY))).statusCode).toBe(500);
    expect(fake.committed).toHaveLength(0);
    expect(writes(fake.rolledBack).map((op) => op.table)).toEqual(['identity_audit_log', 'auth_identities']);
  });

  it('an audit-write failure rolls back before anything else is written', async () => {
    fake.failWhen = (op) => (op.table === 'identity_audit_log' ? new Error('audit down') : null);
    expect((await post(SUPER_ADMIN, body(SANJAY))).statusCode).toBe(500);
    expect(fake.committed).toHaveLength(0);
  });

  it.each<[string, Partial<Scenario>]>([
    ['re-link affects 0 rows', { relinkRows: 0n }],
    ['re-link affects 2 rows', { relinkRows: 2n }],
    ['delete affects 0 rows', { deleteRows: 0n }],
    ['delete affects 2 rows', { deleteRows: 2n }],
    ['email update affects 0 rows', { emailRows: 0n }],
  ])('row-count assertion: %s -> 409 and full rollback', async (_label, extra) => {
    script({ c: SANJAY, ...extra });
    expect((await post(SUPER_ADMIN, body(SANJAY))).statusCode).toBe(409);
    expect(fake.committed).toHaveLength(0);
    expect(writes(fake.rolledBack).length).toBeGreaterThan(0);
  });

  // ── Dry run ────────────────────────────────────────────────────────────

  it('dryRun validates under lock, reports the plan, and issues no write', async () => {
    const res = await post(SUPER_ADMIN, body(SANJAY, { dryRun: true }));
    expect(res.statusCode).toBe(200);
    expect(fake.committed).toHaveLength(0);
    expect(writes(fake.rolledBack)).toHaveLength(0);
    expect(fake.selects.some((op) => op.table === 'users' && op.inTransaction)).toBe(true);
    expect(res.json()).toMatchObject({
      dryRun: true,
      committed: false,
      canonical: { userId: 27, username: 'sanjaykumarshukla', emailChanged: true, emailAfter: 'sanjayshukla.ifs@gmail.com' },
      duplicate: { userId: 120, uuid: SANJAY.duplicate.uuid },
      authIdentity: { id: 40, provider: 'GOOGLE', fromUserId: 120, toUserId: 27 },
      dependencies: { authIdentities: 1, refreshTokensRevoked: 2, duplicateAuditRowsDiscarded: 1, loginHistoryRowsDetached: 1 },
      audit: { actionType: 'IDENTITY_DUPLICATE_RECONCILED', actorUserId: SUPER_ADMIN, targetUserId: 27 },
    });
    expect(res.body).not.toContain(GOOGLE_SUB);
  });

  it('dryRun still fails closed on an unsafe duplicate', async () => {
    script({ c: SANJAY, counts: { 'memberships.user_id': 1 } });
    expect((await post(SUPER_ADMIN, body(SANJAY, { dryRun: true }))).statusCode).toBe(409);
    expect(fake.committed).toHaveLength(0);
  });
});
