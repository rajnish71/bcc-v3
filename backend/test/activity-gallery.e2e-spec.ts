// Module 04 Stage 2 -- Activity Gallery e2e (real AppModule + real DB).
//
// Guards are stubbed only to pick the acting user / admin bit from headers;
// every service, query and DB write is real. The test creates its own rows and
// removes them in afterAll. Presign/confirm need R2, so photo rows are inserted
// directly; the R2-free PATCH path exercises the same source_event_id linkage.

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { db } from './../src/database/db';
import { AccessTokenGuard } from './../src/modules/identity/auth/access-token.guard';
import { RbacGuard } from './../src/modules/identity/rbac/rbac.guard';
import { R2Service } from './../src/modules/shared/storage/r2.service';

const TAG = `S2TEST-${Date.now()}`;

describe('Activity Gallery (Module 04 Stage 2)', () => {
  let app: INestApplication;
  let ownerId: number;
  let otherId: number;
  const eventIds: number[] = [];
  const photoUuids: string[] = [];
  const ADMIN = { 'x-uid': '', 'x-admin': '1' };

  const ev: Record<string, number> = {};
  const ph: Record<string, string> = {};

  async function makeEvent(key: string, body: any, publish: boolean) {
    const c = await request(app.getHttpServer()).post('/api/v1/events').set(ADMIN).send(body);
    expect(c.status).toBe(201);
    eventIds.push(c.body.id);
    ev[key] = c.body.id;
    if (publish) {
      const p = await request(app.getHttpServer()).post(`/api/v1/events/${c.body.id}/publish`).set(ADMIN);
      expect(p.status).toBe(200);
    }
    return c.body;
  }

  async function makePhoto(key: string, o: { event?: number | null; visibility?: string; status?: string; portfolio?: boolean; owner?: number }) {
    const uuid = randomUUID();
    const now: any = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await db.insertInto('photos').values({
      uuid,
      owner_user_id: o.owner ?? ownerId,
      r2_key: `test/${TAG}/${uuid}.jpg`,
      original_filename: `${TAG}.jpg`,
      mime_type: 'image/jpeg',
      file_format: 'JPEG',
      file_size_bytes: 1000,
      status: (o.status ?? 'ACTIVE') as any,
      visibility: (o.visibility ?? 'PUBLIC') as any,
      show_in_portfolio: (o.portfolio ?? true) as any,
      source_event_id: o.event ?? null,
      created_at: now,
      updated_at: now,
    } as any).execute();
    photoUuids.push(uuid);
    ph[key] = uuid;
  }

  const gallery = (id: number, headers: Record<string, string> = {}) =>
    request(app.getHttpServer()).get(`/api/v1/gallery/events/${id}/photos`).set(headers);
  const uuids = (res: request.Response) => res.body.photos.map((p: any) => p.uuid);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          const uid = Number(req.headers['x-uid']);
          if (!uid) return false;
          req.user = { sub: uid };
          return true;
        },
      })
      .overrideProvider(R2Service)
      .useValue({ headObject: async () => ({ exists: true, sizeBytes: 1000 }) })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: (ctx: any) => ctx.switchToHttp().getRequest().headers['x-admin'] === '1' })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    const users = await db.selectFrom('users').select('id').orderBy('id', 'desc').limit(2).execute();
    ownerId = Number(users[0].id);
    otherId = Number(users[1].id);
    ADMIN['x-uid'] = String(ownerId);

    const future = new Date(Date.now() + 30 * 86400_000).toISOString();
    await makeEvent('published', { title: `${TAG} published`, event_type: 'PHOTOWALK', starts_at: future }, true);
    await makeEvent('hist', {
      title: `${TAG} historical`, event_type: 'WORKSHOP', is_historical: true,
      historical_year: 2012, historical_month: 10, historical_source_note: 'Club records',
    }, true);
    await makeEvent('empty', { title: `${TAG} empty`, event_type: 'MEETUP', starts_at: future }, true);
    await makeEvent('draft', { title: `${TAG} draft`, event_type: 'MEETUP', starts_at: future }, false);
  });

  afterAll(async () => {
    if (photoUuids.length) await db.deleteFrom('photos').where('uuid', 'in', photoUuids).execute();
    if (eventIds.length) await db.deleteFrom('events').where('id', 'in', eventIds).execute();
    await app.close();
  });

  // ---- A. Activity Gallery API ------------------------------------------
  describe('GET /gallery/events/:id/photos', () => {
    beforeAll(async () => {
      await makePhoto('pub1', { event: ev.published });
      await makePhoto('pub2', { event: ev.published });
      await makePhoto('histPhoto', { event: ev.hist });
      await makePhoto('private', { event: ev.published, visibility: 'PRIVATE' });
      await makePhoto('unlisted', { event: ev.published, visibility: 'UNLISTED' });
      await makePhoto('members', { event: ev.published, visibility: 'MEMBERS_ONLY' });
      await makePhoto('deleted', { event: ev.published, status: 'DELETED' });
      await makePhoto('processing', { event: ev.published, status: 'PROCESSING' });
      await makePhoto('draftLinked', { event: ev.draft });
    });

    it('PUBLISHED Activity with multiple photos returns only active PUBLIC ones', async () => {
      const res = await gallery(ev.published);
      expect(res.status).toBe(200);
      expect(uuids(res).sort()).toEqual([ph.pub1, ph.pub2].sort());
      expect(res.body.total).toBe(2);
    });

    it('COMPLETED (historical) Activity returns its photos', async () => {
      const res = await gallery(ev.hist);
      expect(res.status).toBe(200);
      expect(uuids(res)).toEqual([ph.histPhoto]);
    });

    it('published Activity with zero photos returns an empty list, not an error', async () => {
      const res = await gallery(ev.empty);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ photos: [], total: 0 });
    });

    it('DRAFT Activity is not exposed (404) even though a photo is linked', async () => {
      expect((await gallery(ev.draft)).status).toBe(404);
    });

    it('unknown Activity is 404', async () => {
      expect((await gallery(2_000_000_000)).status).toBe(404);
    });

    it('DELETED / PROCESSING / PRIVATE / UNLISTED / MEMBERS_ONLY photos are hidden from the public', async () => {
      const got = uuids(await gallery(ev.published));
      for (const k of ['deleted', 'processing', 'private', 'unlisted', 'members']) {
        expect(got).not.toContain(ph[k]);
      }
    });

    it('the route is unguarded (req.user unset), so a caller-supplied identity never widens visibility', async () => {
      const got = uuids(await gallery(ev.published, { 'x-uid': String(ownerId) }));
      expect(got).not.toContain(ph.private);
    });
  });

  // ---- C + D. Linkage and Portfolio independence ------------------------
  describe('source_event_id linkage vs show_in_portfolio', () => {
    const patch = (uuid: string, body: any, uid = ownerId) =>
      request(app.getHttpServer()).patch(`/api/v1/gallery/photos/${uuid}`).set({ 'x-uid': String(uid) }).send(body);
    const row = (uuid: string) =>
      db.selectFrom('photos').where('uuid', '=', uuid).select(['source_event_id', 'show_in_portfolio']).executeTakeFirstOrThrow();
    const inActivity = async (key: string) => uuids(await gallery(ev.empty)).includes(ph[key]);
    const inPortfolio = async (key: string) => {
      const res = await request(app.getHttpServer()).get(`/api/v1/gallery/photographer/${ownerId}?limit=100`);
      return uuids(res).includes(ph[key]);
    };

    beforeAll(async () => {
      await makePhoto('indep', { event: null });
    });

    it('independent photo is unlinked (NULL) and not in any Activity Gallery', async () => {
      expect((await row(ph.indep)).source_event_id).toBeNull();
      expect(await inActivity('indep')).toBe(false);
    });

    it('link -> persisted as photos.source_event_id and returned by the Activity Gallery', async () => {
      const res = await patch(ph.indep, { source_event_id: ev.empty });
      expect(res.status).toBe(200);
      expect(Number((await row(ph.indep)).source_event_id)).toBe(ev.empty);
      expect(await inActivity('indep')).toBe(true);
    });

    it('linked + portfolio visible', async () => {
      expect(Boolean((await row(ph.indep)).show_in_portfolio)).toBe(true);
      expect(await inActivity('indep')).toBe(true);
      expect(await inPortfolio('indep')).toBe(true);
    });

    it('linked + portfolio hidden', async () => {
      expect((await patch(ph.indep, { show_in_portfolio: false })).status).toBe(200);
      expect(Number((await row(ph.indep)).source_event_id)).toBe(ev.empty); // link untouched
      expect(await inActivity('indep')).toBe(true);
      expect(await inPortfolio('indep')).toBe(false);
    });

    it('unlinked + portfolio hidden -> gone from the Activity Gallery, link cleared', async () => {
      expect((await patch(ph.indep, { source_event_id: null })).status).toBe(200);
      const r = await row(ph.indep);
      expect(r.source_event_id).toBeNull();
      expect(Boolean(r.show_in_portfolio)).toBe(false); // portfolio untouched
      expect(await inActivity('indep')).toBe(false);
      expect(await inPortfolio('indep')).toBe(false);
    });

    it('unlinked + portfolio visible', async () => {
      expect((await patch(ph.indep, { show_in_portfolio: true })).status).toBe(200);
      expect(await inActivity('indep')).toBe(false);
      expect(await inPortfolio('indep')).toBe(true);
    });

    it('cannot link to a DRAFT or non-existent Activity', async () => {
      expect((await patch(ph.indep, { source_event_id: ev.draft })).status).toBe(404);
      expect((await patch(ph.indep, { source_event_id: 2_000_000_000 })).status).toBe(404);
      expect((await row(ph.indep)).source_event_id).toBeNull();
    });

    it("another user cannot link/unlink someone else's photo", async () => {
      expect((await patch(ph.indep, { source_event_id: ev.empty }, otherId)).status).toBe(404);
      expect((await row(ph.indep)).source_event_id).toBeNull();
    });

    it('a patch that omits source_event_id leaves the link alone', async () => {
      await patch(ph.indep, { source_event_id: ev.empty });
      await patch(ph.indep, { title: 'renamed' });
      expect(Number((await row(ph.indep)).source_event_id)).toBe(ev.empty);
    });
  });

  // ---- C (confirm path). Only R2 is stubbed; validation + DB write are real. ----
  describe('POST /photos/:uuid/confirm linkage', () => {
    const confirm = (uuid: string, body: any, uid = ownerId) =>
      request(app.getHttpServer()).post(`/api/v1/gallery/photos/${uuid}/confirm`).set({ 'x-uid': String(uid) }).send(body);
    const link = (uuid: string) =>
      db.selectFrom('photos').where('uuid', '=', uuid).select(['source_event_id', 'show_in_portfolio', 'status']).executeTakeFirstOrThrow();

    it('A. persists a valid PUBLISHED Activity id, independent of show_in_portfolio, and the Gallery returns it', async () => {
      await makePhoto('c1', { event: null, status: 'PROCESSING' });
      const res = await confirm(ph.c1, { visibility: 'PUBLIC', show_in_portfolio: false, source_event_id: ev.published });
      expect(res.status).toBe(200);
      const r = await link(ph.c1);
      expect(Number(r.source_event_id)).toBe(ev.published);
      expect(Boolean(r.show_in_portfolio)).toBe(false);
      expect(r.status).toBe('ACTIVE');
      expect(uuids(await gallery(ev.published))).toContain(ph.c1);
    });

    it('accepts a COMPLETED (historical) Activity', async () => {
      await makePhoto('c2', { event: null, status: 'PROCESSING' });
      expect((await confirm(ph.c2, { visibility: 'PUBLIC', source_event_id: ev.hist })).status).toBe(200);
      expect(Number((await link(ph.c2)).source_event_id)).toBe(ev.hist);
    });

    it('B. rejects an unknown Activity; C. rejects a DRAFT Activity; photo stays PROCESSING/unlinked', async () => {
      await makePhoto('c3', { event: null, status: 'PROCESSING' });
      expect((await confirm(ph.c3, { source_event_id: 2_000_000_000 })).status).toBe(404);
      expect((await confirm(ph.c3, { source_event_id: ev.draft })).status).toBe(404);
      const r = await link(ph.c3);
      expect(r.source_event_id).toBeNull();
      expect(r.status).toBe('PROCESSING');
    });

    it('D. null clears an existing (presign-time) link', async () => {
      await makePhoto('c4', { event: ev.published, status: 'PROCESSING' });
      expect((await confirm(ph.c4, { visibility: 'PUBLIC', source_event_id: null })).status).toBe(200);
      expect((await link(ph.c4)).source_event_id).toBeNull();
    });

    it('E. omitted source_event_id keeps the existing link', async () => {
      await makePhoto('c5', { event: ev.published, status: 'PROCESSING' });
      expect((await confirm(ph.c5, { visibility: 'PUBLIC' })).status).toBe(200);
      expect(Number((await link(ph.c5)).source_event_id)).toBe(ev.published);
    });

    it("F. another user cannot confirm/link/unlink someone else's photo", async () => {
      await makePhoto('c6', { event: ev.hist, status: 'PROCESSING' });
      expect((await confirm(ph.c6, { source_event_id: ev.published }, otherId)).status).toBe(404);
      expect((await confirm(ph.c6, { source_event_id: null }, otherId)).status).toBe(404);
      const r = await link(ph.c6);
      expect(Number(r.source_event_id)).toBe(ev.hist);
      expect(r.status).toBe('PROCESSING');
    });
  });

  // ---- B + E. Historical dates, admin permissions, public visibility ------
  describe('Activities administration', () => {
    const pub = (id: number) => request(app.getHttpServer()).get(`/api/v1/events/${id}`);

    it('historical Activity exposes only the recorded precision (no fabricated day)', async () => {
      const res = await pub(ev.hist);
      expect(res.status).toBe(200);
      expect(res.body.starts_at).toBeNull();
      expect(res.body.historical_year).toBe(2012);
      expect(res.body.historical_month).toBe(10);
      expect(res.body.state).toBe('COMPLETED');
    });

    it('historical metadata can be edited by an admin', async () => {
      const res = await request(app.getHttpServer()).patch(`/api/v1/events/${ev.hist}`).set(ADMIN)
        .send({ historical_date_note: 'Autumn workshop', historical_source_note: 'Updated source' });
      expect(res.status).toBe(200);
      expect(res.body.historical_date_note).toBe('Autumn workshop');
      expect(res.body.historical_source_note).toBe('Updated source');
      expect(res.body.historical_year).toBe(2012);
    });

    it('year-only and unknown-date historical Activities are accepted without inventing a date', async () => {
      const y = await makeEvent('yearOnly', { title: `${TAG} year`, event_type: 'OTHER', is_historical: true, historical_year: 2015 }, true);
      expect(y.starts_at).toBeNull();
      expect(y.historical_month).toBeNull();
      const u = await makeEvent('unknown', { title: `${TAG} unknown`, event_type: 'OTHER', is_historical: true }, true);
      expect(u.starts_at).toBeNull();
      expect(u.historical_year).toBeNull();
    });

    it('a non-admin cannot create/edit/publish an Activity', async () => {
      const h = { 'x-uid': String(otherId) }; // no x-admin
      const s = request(app.getHttpServer());
      expect((await s.post('/api/v1/events').set(h).send({ title: 'x', event_type: 'OTHER' })).status).toBe(403);
      expect((await s.patch(`/api/v1/events/${ev.empty}`).set(h).send({ title: 'x' })).status).toBe(403);
      expect((await s.post(`/api/v1/events/${ev.draft}/publish`).set(h)).status).toBe(403);
    });

    it('unauthenticated users cannot use admin routes', async () => {
      expect((await request(app.getHttpServer()).get('/api/v1/events/admin/all')).status).toBe(403);
    });

    it('public API never exposes a DRAFT Activity, in list or detail', async () => {
      expect((await pub(ev.draft)).status).toBe(404);
      const list = await request(app.getHttpServer()).get('/api/v1/events?limit=100');
      expect(list.body.items.map((i: any) => i.id)).not.toContain(ev.draft);
    });
  });
});
