// Disappearing portfolio photos (production report, 8-9 Oct 2026).
//
// Evidence: the reported photos exist as status='PROCESSING' rows -- uploaded to
// R2 but never activated by POST /photos/:uuid/confirm -- and the portfolio list
// only returns ACTIVE rows. These tests pin the persistence contract:
//   - presign creates a PROCESSING row owned by the caller (invisible until confirm)
//   - confirm activates only after R2 HEAD succeeds, and only for the owner
//   - confirm is idempotent (a retry never fails a saved photo, never duplicates)
//   - the upload page renews an expired token on every upload-path request
//     (shared single flight), keeps unconfirmed photos on the page, warns on leave
//   - nothing deletes assets as compensation for a failed save

jest.mock('kysely', () => ({ sql: () => ({}) }));
jest.mock('../../database/db', () => ({ db: { selectFrom: jest.fn(), updateTable: jest.fn(), insertInto: jest.fn() } }));
jest.mock('../shared/storage/imagekit.util', () => ({
  ...jest.requireActual('../shared/storage/imagekit.util'),
  ikUrl: () => null,
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { db } from '../../database/db';
import { GalleryService } from './gallery.service';

const FRONTEND = join(__dirname, '../../../../frontend/src');
const UPLOAD_PAGE = readFileSync(join(FRONTEND, 'pages/hub/upload/index.astro'), 'utf8');
const SERVICE_SRC = readFileSync(join(__dirname, 'gallery.service.ts'), 'utf8');

// Chainable fake of the Kysely query builder: every method returns the chain;
// terminal methods resolve the queued result.
function chain(result: unknown) {
  const c: any = {};
  for (const m of ['where', 'selectAll', 'select', 'values', 'set', 'orderBy', 'limit']) c[m] = jest.fn(() => c);
  c.executeTakeFirst = jest.fn(async () => result);
  c.executeTakeFirstOrThrow = jest.fn(async () => result);
  c.execute = jest.fn(async () => []);
  return c;
}

const OWNER = 7;
const row = (over: Record<string, unknown> = {}) => ({
  id: 1, uuid: 'u-1', owner_user_id: OWNER, r2_key: 'k/u-1.jpg', status: 'PROCESSING',
  source_event_id: null, file_size_bytes: 1000, visibility: 'MEMBERS_ONLY', show_in_portfolio: 1,
  created_at: new Date(), updated_at: new Date(), ...over,
});

function service(head: { exists: boolean; sizeBytes?: number }) {
  const r2: any = { headObject: jest.fn(async () => head) };
  const svc = new GalleryService(r2, {} as any);
  return { svc, r2 };
}

describe('confirmUpload() persistence contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('activates a PROCESSING photo only after the R2 object exists (success path)', async () => {
    const select = chain(row());
    const final = chain(row({ status: 'ACTIVE' }));
    const update = chain(undefined);
    (db.selectFrom as jest.Mock).mockReturnValueOnce(select).mockReturnValueOnce(final);
    (db.updateTable as jest.Mock).mockReturnValue(update);
    const { svc, r2 } = service({ exists: true, sizeBytes: 1000 });

    const out: any = await svc.confirmUpload(OWNER, 'u-1', { title: 'T', show_in_portfolio: true } as any);

    expect(r2.headObject).toHaveBeenCalledWith('k/u-1.jpg');
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE', show_in_portfolio: true }));
    expect(out.status).toBe('ACTIVE');
  });

  it('owner association: the lookup is filtered by the caller, so another member gets 404', async () => {
    const select = chain(undefined);
    (db.selectFrom as jest.Mock).mockReturnValueOnce(select);
    const { svc } = service({ exists: true });
    await expect(svc.confirmUpload(999, 'u-1', {} as any)).rejects.toThrow(NotFoundException);
    expect(select.where).toHaveBeenCalledWith('owner_user_id', '=', 999);
  });

  it('failed storage PUT: confirm is refused, the row stays PROCESSING and nothing is written or deleted', async () => {
    (db.selectFrom as jest.Mock).mockReturnValueOnce(chain(row()));
    const { svc } = service({ exists: false });
    await expect(svc.confirmUpload(OWNER, 'u-1', {} as any)).rejects.toThrow(BadRequestException);
    expect(db.updateTable).not.toHaveBeenCalled();
  });

  it('retry after an uncertain reply: an already-ACTIVE photo is returned, not 409, and not rewritten', async () => {
    (db.selectFrom as jest.Mock).mockReturnValueOnce(chain(row({ status: 'ACTIVE' })));
    const { svc, r2 } = service({ exists: true });
    const out: any = await svc.confirmUpload(OWNER, 'u-1', {} as any);
    expect(out.status).toBe('ACTIVE');
    expect(db.updateTable).not.toHaveBeenCalled();
    expect(db.insertInto).not.toHaveBeenCalled(); // no duplicate record
    expect(r2.headObject).not.toHaveBeenCalled();
  });

  it('a DELETED photo can never be re-activated by confirm', async () => {
    (db.selectFrom as jest.Mock).mockReturnValueOnce(chain(row({ status: 'DELETED' })));
    const { svc } = service({ exists: true });
    await expect(svc.confirmUpload(OWNER, 'u-1', {} as any)).rejects.toThrow(ConflictException);
    expect(db.updateTable).not.toHaveBeenCalled();
  });

  it('never deletes R2 assets or rows as compensation for a failed save (PHOTO-ARCH)', () => {
    const body = SERVICE_SRC.slice(SERVICE_SRC.indexOf('async confirmUpload'), SERVICE_SRC.indexOf('async getAllPhotoIds'));
    expect(body).not.toMatch(/deleteObject|deleteFrom|status:\s*'DELETED'/);
  });
});

describe('portfolio reload only shows ACTIVE photos (why unconfirmed uploads are invisible)', () => {
  it('listPhotos filters status = ACTIVE', () => {
    const body = SERVICE_SRC.slice(SERVICE_SRC.indexOf('async listPhotos'), SERVICE_SRC.indexOf('async updatePhoto'));
    expect(body).toContain(".where('status', '=', 'ACTIVE')");
  });
});

// ---------------------------------------------------------------------------
// Upload page: executes the real authed-fetch against a fake server
// ---------------------------------------------------------------------------
const lib = (() => {
  const js = ts.transpileModule(readFileSync(join(FRONTEND, 'lib/authed-fetch.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = { exports: {} as any };
  new Function('module', 'exports', js)(m, m.exports);
  return m.exports as typeof import('../../../../frontend/src/lib/authed-fetch');
})();
const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

function uploadHarness(refreshStatus = 200) {
  const store = { at: 'AT0', rt: 'RT0' };
  let refreshCalls = 0;
  const saved = new Set<string>(); // photo_uuids durably confirmed
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/auth/refresh') {
      refreshCalls++;
      return refreshStatus === 200 ? res(200, { accessToken: 'AT1', refreshToken: `RT${refreshCalls}` }) : res(refreshStatus);
    }
    if ((init!.headers as Record<string, string>).Authorization !== 'Bearer AT1') return res(401);
    const m = /photos\/(.+)\/confirm$/.exec(url);
    if (m) { saved.add(m[1]); return res(200, { status: 'ACTIVE' }); } // idempotent
    return res(201, { photo_uuid: 'x', presign_url: 'https://r2' });
  });
  const authed = lib.createAuthedFetch({
    fetch: fetchImpl as any,
    getToken: () => store.at,
    getRefreshToken: () => store.rt,
    storeTokens: (a, r) => { store.at = a; store.rt = r; },
    clearAuth: () => { store.at = ''; store.rt = ''; },
  });
  return { authed, saved, refreshCalls: () => refreshCalls, store };
}

describe('authentication expiry during an upload batch', () => {
  it('three concurrent presigns on an expired token share ONE refresh and all succeed', async () => {
    const h = uploadHarness();
    const out = await Promise.all([1, 2, 3].map(() => h.authed('/api/v1/gallery/photos/presign', { method: 'POST' })));
    expect(out.map(r => r.status)).toEqual([201, 201, 201]);
    expect(h.refreshCalls()).toBe(1); // no rotated-token reuse => no mass session revoke
  });

  it('a sequential confirm loop renews once, then confirms every photo', async () => {
    const h = uploadHarness();
    for (const id of ['a', 'b', 'c', 'd']) {
      const r = await h.authed(`/api/v1/gallery/photos/${id}/confirm`, { method: 'POST' });
      expect(r.ok).toBe(true);
    }
    expect(h.refreshCalls()).toBe(1);
    expect([...h.saved]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('refresh rejected: raises SessionExpiredError per item (not a silent success) and saves nothing', async () => {
    const h = uploadHarness(401);
    await expect(h.authed('/api/v1/gallery/photos/a/confirm', { method: 'POST' })).rejects.toBeInstanceOf(lib.SessionExpiredError);
    expect(h.saved.size).toBe(0);
  });

  it('retrying a confirm whose reply was lost does not duplicate: same uuid, one saved record', async () => {
    const h = uploadHarness();
    await h.authed('/api/v1/gallery/photos/a/confirm', { method: 'POST' });
    await h.authed('/api/v1/gallery/photos/a/confirm', { method: 'POST' });
    expect(h.saved.size).toBe(1);
  });
});

describe('upload page wiring (real source)', () => {
  it('every authenticated upload-path request goes through the renewing apiFetch', () => {
    expect(UPLOAD_PAGE).toContain("import { createAuthedFetch, SessionExpiredError } from '../../../lib/authed-fetch'");
    expect(UPLOAD_PAGE).toContain("apiFetch('/api/v1/gallery/photos/presign'");
    expect(UPLOAD_PAGE).toContain('apiFetch(`/api/v1/gallery/photos/${item.photoUuid}/confirm`');
    expect(UPLOAD_PAGE).toContain('apiFetch(`/api/v1/gallery/photos/${photoUuid}/tags/');
    // the old unsynchronised refresh (stale refresh token re-presented per item) is gone
    expect(UPLOAD_PAGE).not.toContain('tryRefreshToken');
    expect(UPLOAD_PAGE).not.toMatch(/fetch\(`?'?\/api\/v1\/gallery\/photos[^)]*Authorization/);
  });

  it('a failed confirm keeps the photo selectable (queue + metadata preserved) and reports the error', () => {
    const confirm = UPLOAD_PAGE.slice(UPLOAD_PAGE.indexOf('async function confirmItems'), UPLOAD_PAGE.indexOf('async function handlePublish'));
    // success is recorded only inside the res.ok branch
    const okBranch = confirm.indexOf('if (res.ok) {');
    expect(okBranch).toBeGreaterThan(-1);
    expect(confirm.indexOf("item.confirmedAs = ")).toBeGreaterThan(okBranch);
    expect(confirm).toContain('errorMsg = msg;');
    expect(confirm).toContain('SessionExpiredError');
  });

  it('warns before leaving the page while uploaded photos are not yet confirmed', () => {
    expect(UPLOAD_PAGE).toMatch(/addEventListener\('beforeunload'[\s\S]*status === 'done' && !i\.confirmedAs/);
  });

  it('a stored-but-unconfirmed tile says READY TO PUBLISH; PUBLISHED/DRAFT only after server confirmation', () => {
    const tile = UPLOAD_PAGE.slice(UPLOAD_PAGE.indexOf('function buildQueueTile'), UPLOAD_PAGE.indexOf('function buildWallTile'));
    expect(tile).not.toContain('✓ DONE');
    expect(tile).toMatch(/item\.confirmedAs\s*\?[\s\S]*PUBLISHED[\s\S]*UPLOADED — READY TO PUBLISH/);
  });
});
