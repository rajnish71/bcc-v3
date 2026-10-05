// Behavioural HTTP tests for Super Admin Hard Delete of a Canonical Photo
// (DELETE /api/v1/gallery/admin/photos/:id, PHOTO-ARCH-002 Principle 13).
// Boots GalleryController in a Nest Fastify app with the production Fastify
// options, the real AccessTokenGuard/RbacGuard, and the real
// PhotoHardDeleteService over the recording FakeDb and a fake R2Service.

jest.mock('../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../shared/storage/r2.service', () => ({ R2Service: class {} }));
// GalleryService pulls in kysely (ESM-only under this Jest config); the
// hard-delete route never touches it.
jest.mock('./gallery.service', () => ({ GalleryService: class {} }));
// kysely is ESM-only at runtime under this Jest config; RbacService imports
// its `sql` tag, which this path never executes (RbacService is faked).
jest.mock('kysely', () => ({ sql: () => ({}) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { db } from '../../database/db';
import { whereValue, type FakeDb, type FakeOp } from '../../test-support/fake-db';
import { fastifyServerOptions } from '../../http/fastify-options';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RbacService } from '../identity/rbac/rbac.service';
import { R2Service } from '../shared/storage/r2.service';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { PhotoHardDeleteService } from './photo-hard-delete.service';

const fake = db as unknown as FakeDb;
process.env.JWT_ACCESS_SECRET = 'hard-delete-test-secret';

const SUPER_ADMIN = 1;
const COORDINATOR = 3; // holds other admin permissions, not hard delete
const MEMBER = 22;
const PHOTO_ID = 1558;
const PHOTO = {
  id: PHOTO_ID,
  uuid: '56e13291-ab33-49a6-bc52-a8e583314e4a',
  owner_user_id: MEMBER,
  r2_key: 'photos/22/2026/09/56e13291-ab33-49a6-bc52-a8e583314e4a.jpg',
  title: 'Striped Hyena',
  status: 'ACTIVE',
  visibility: 'PUBLIC',
};

const r2 = { deleteObject: jest.fn<Promise<void>, [string]>() };

function script(opts: { photoExists?: boolean; sharedTable?: string } = {}) {
  const { photoExists = true, sharedTable } = opts;
  fake.responder = (op: FakeOp) => {
    if (op.kind !== 'select') return undefined;
    if (op.table === 'photos') {
      // The shared-key probe filters on r2_key; the lookups filter on id.
      if (whereValue(op, 'r2_key') !== undefined) return sharedTable === 'photos' ? [{ id: 9 }] : [];
      return photoExists ? [PHOTO] : [];
    }
    return op.table === sharedTable ? [{ id: 5 }] : [];
  };
}

const committedTables = () => fake.committed.map((op) => `${op.kind}:${op.table}`);
const auditRows = () => fake.writes('identity_audit_log', 'insert').map((op) => op.values!);

describe('DELETE /api/v1/gallery/admin/photos/:id (Super Admin Hard Delete)', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  const permissions = new Map<number, Set<string>>([
    [SUPER_ADMIN, new Set(['gallery.photo.hard_delete', 'gallery.spotlight.set'])],
    [COORDINATOR, new Set(['gallery.spotlight.set', 'membership.application.review'])],
    [MEMBER, new Set()],
  ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GalleryController],
      providers: [
        JwtService,
        AccessTokenGuard,
        RbacGuard,
        PhotoHardDeleteService,
        { provide: GalleryService, useValue: {} },
        { provide: R2Service, useValue: r2 },
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
  beforeEach(() => {
    fake.reset();
    script();
    r2.deleteObject.mockReset();
    r2.deleteObject.mockResolvedValue(undefined);
  });

  async function del(userId: number | null, id: string | number = PHOTO_ID) {
    const headers: Record<string, string> = {};
    if (userId !== null) {
      const token = await jwt.signAsync(
        { sub: userId, uuid: `u-${userId}`, status: 'ACTIVE', sid: 'sess' },
        { secret: process.env.JWT_ACCESS_SECRET },
      );
      headers.authorization = `Bearer ${token}`;
    }
    return app.inject({ method: 'DELETE', url: `/api/v1/gallery/admin/photos/${id}`, headers });
  }

  // ── Authorization ──────────────────────────────────────────────────────

  it('401 without a token, and nothing is touched', async () => {
    expect((await del(null)).statusCode).toBe(401);
    expect(fake.committed).toHaveLength(0);
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  it('403 for an ordinary member — even the photo owner', async () => {
    expect((await del(MEMBER)).statusCode).toBe(403);
    expect(fake.committed).toHaveLength(0);
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  it('403 for another admin role lacking gallery.photo.hard_delete', async () => {
    expect((await del(COORDINATOR)).statusCode).toBe(403);
    expect(fake.committed).toHaveLength(0);
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  // ── Validation / not found / conflict ──────────────────────────────────

  it('400 for a non-numeric photo id', async () => {
    expect((await del(SUPER_ADMIN, 'abc')).statusCode).toBe(400);
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  it('404 for a photo that does not exist', async () => {
    script({ photoExists: false });
    const res = await del(SUPER_ADMIN, 999999);
    expect(res.statusCode).toBe(404);
    expect(fake.committed).toHaveLength(0);
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  it.each(['photos', 'events', 'journal_posts', 'user_cover_photos', 'user_avatars'])(
    '409 when the Master Asset is also referenced by %s — nothing deleted',
    async (table) => {
      script({ sharedTable: table });
      expect((await del(SUPER_ADMIN)).statusCode).toBe(409);
      expect(fake.committed).toHaveLength(0);
      expect(r2.deleteObject).not.toHaveBeenCalled();
    },
  );

  // ── Successful delete ──────────────────────────────────────────────────

  it('Super Admin deletes the photo: clean response, no storage identifiers leaked', async () => {
    const res = await del(SUPER_ADMIN);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: true, photo_id: PHOTO_ID, master_asset_deleted: true });
    expect(res.body).not.toContain(PHOTO.r2_key);
    expect(res.body).not.toContain('photos/22/');
  });

  it('removes owned records and the photo row in ONE transaction, together with the audit row', async () => {
    await del(SUPER_ADMIN);
    const trxOps = fake.committed.filter((op) => op.inTransaction);
    const txIds = new Set(trxOps.map((op) => op.txId));
    expect(txIds.size).toBe(1);
    expect(trxOps.map((op) => `${op.kind}:${op.table}`)).toEqual([
      'update:photo_albums',
      'delete:photo_album_items',
      'delete:photo_tag_assignments',
      'delete:photo_comments',
      'delete:photo_reactions',
      'delete:hero_assignments',
      'delete:gallery_spotlight',
      'delete:photos',
      'insert:identity_audit_log',
    ]);
    for (const op of trxOps.filter((o) => o.table !== 'identity_audit_log')) {
      const key = whereValue(op, 'photo_id') ?? whereValue(op, 'cover_photo_id') ?? whereValue(op, 'id') ?? whereValue(op, 'photo_uuid');
      expect([PHOTO_ID, PHOTO.uuid]).toContain(key);
    }
  });

  it('containers keep existing: album cover cleared via UPDATE, albums never deleted', async () => {
    await del(SUPER_ADMIN);
    const cover = fake.writes('photo_albums', 'update')[0];
    expect(cover.set).toEqual({ cover_photo_id: null });
    expect(fake.writes('photo_albums', 'delete')).toHaveLength(0);
    expect(committedTables()).not.toContain('delete:events');
    expect(committedTables()).not.toContain('delete:journal_posts');
  });

  it('photographer/member identity is untouched', async () => {
    await del(SUPER_ADMIN);
    const identityTables = ['users', 'memberships', 'user_roles', 'user_avatars', 'user_cover_photos'];
    expect(fake.committed.filter((op) => identityTables.includes(op.table))).toHaveLength(0);
  });

  it('deletes the Master Asset through R2Service, only AFTER the DB transaction commits', async () => {
    let committedAtStorageCall: string[] = [];
    r2.deleteObject.mockImplementation(async () => { committedAtStorageCall = committedTables(); });
    await del(SUPER_ADMIN);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledWith(PHOTO.r2_key);
    expect(committedAtStorageCall).toContain('delete:photos');
  });

  it('audits actor, target, operation, storage identifier and outcome', async () => {
    await del(SUPER_ADMIN);
    const [deleted, storage] = auditRows();
    expect(deleted).toMatchObject({ actor_id: SUPER_ADMIN, target_user_id: MEMBER, action_type: 'GALLERY_PHOTO_HARD_DELETED' });
    expect(JSON.parse(deleted.old_value as string)).toMatchObject({ photo_id: PHOTO_ID, uuid: PHOTO.uuid, r2_key: PHOTO.r2_key });
    expect(storage).toMatchObject({ actor_id: SUPER_ADMIN, target_user_id: MEMBER, action_type: 'GALLERY_PHOTO_MASTER_ASSET_DELETED' });
  });

  // ── Failure handling ───────────────────────────────────────────────────

  it('a DB failure mid-transaction rolls back every write and never deletes the Master Asset', async () => {
    fake.failWhen = (op) => (op.kind === 'delete' && op.table === 'photos' ? new Error('deadlock') : null);
    const res = await del(SUPER_ADMIN);
    expect(res.statusCode).toBe(500);
    expect(fake.committed).toHaveLength(0);
    expect(fake.rolledBack.map((op) => op.table)).toEqual(
      expect.arrayContaining(['photo_album_items', 'photo_comments', 'photo_reactions']),
    );
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  it('an audit-write failure inside the transaction rolls the deletion back', async () => {
    fake.failWhen = (op) => (op.table === 'identity_audit_log' ? new Error('audit down') : null);
    expect((await del(SUPER_ADMIN)).statusCode).toBe(500);
    expect(fake.committed).toHaveLength(0);
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  it('an R2 failure after commit reports master_asset_deleted:false and audits the key for purge', async () => {
    r2.deleteObject.mockRejectedValue(new Error('R2 503'));
    const res = await del(SUPER_ADMIN);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: true, photo_id: PHOTO_ID, master_asset_deleted: false });
    const failed = auditRows().find((r) => r.action_type === 'GALLERY_PHOTO_MASTER_ASSET_DELETE_FAILED');
    expect(failed).toBeDefined();
    expect(JSON.parse(failed!.old_value as string).r2_key).toBe(PHOTO.r2_key);
  });
});

// ── Frontend wiring (static) ─────────────────────────────────────────────

describe('Showcase moderation panel', () => {
  const PAGE = readFileSync(join(__dirname, '../../../../frontend/src/pages/showcase/[id].astro'), 'utf8');
  const fn = PAGE.slice(PAGE.indexOf('async function adminDelete()'), PAGE.indexOf('window.adminDelete'));

  it('no longer contains the deletion stub', () => {
    expect(PAGE).not.toContain('Photo deletion (stub');
  });

  it('calls the hard-delete endpoint with DELETE and the bearer token after explicit confirmation', () => {
    expect(fn).toContain('/gallery/admin/photos/');
    expect(fn).toContain("method: 'DELETE'");
    expect(fn).toContain('Authorization');
    expect(fn.indexOf('confirm(')).toBeLessThan(fn.indexOf('fetch('));
    expect(fn).toContain("!== 'DELETE'");
  });

  it('redirects away from the deleted photo on success', () => {
    expect(fn).toContain("window.location.href = '/showcase/'");
  });
});
