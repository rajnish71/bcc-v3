// backend/src/modules/notifications/notification.service.spec.ts
//
// Focused regression & unit tests for Module 17 Notification bell & inbox.
// Tests read-state persistence, user scoping, unread counts, and Fastify HTTP handling.

jest.mock('../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../test-support/fake-db');
  return { db: new FakeDb() };
});

import { db } from '../../database/db';
import type { FakeDb, FakeOp } from '../../test-support/fake-db';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { fastifyServerOptions } from '../../http/fastify-options';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';

const fake = db as unknown as FakeDb;
process.env.JWT_ACCESS_SECRET = 'notif-spec-secret';

function whereVal(op: FakeOp, col: string): unknown {
  const match = op.wheres.find(([c]) => c === col);
  return match ? match[2] : undefined;
}

interface TestNotificationRow {
  id: number;
  user_id: number;
  title: string;
  body: string;
  action_url: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
  expires_at: Date;
}

describe('Notification Persistence & Scoping (Stateful Lifecycle)', () => {
  let service: NotificationService;
  let store: TestNotificationRow[];

  beforeEach(() => {
    fake.reset();
    service = new NotificationService();

    const now = new Date();
    const future = new Date(now.getTime() + 86400000 * 30);

    // Initial store: User 42 has 3 unread items, User 99 has 1 unread item
    store = [
      {
        id: 1,
        user_id: 42,
        title: 'Welcome to BCC',
        body: 'Your journey starts here',
        action_url: '/hub/',
        is_read: false,
        read_at: null,
        created_at: new Date(now.getTime() - 3000),
        expires_at: future,
      },
      {
        id: 2,
        user_id: 42,
        title: 'Photo Accepted',
        body: 'Your photo was accepted',
        action_url: '/hub/portfolio/',
        is_read: false,
        read_at: null,
        created_at: new Date(now.getTime() - 2000),
        expires_at: future,
      },
      {
        id: 3,
        user_id: 42,
        title: 'Upcoming Photo Walk',
        body: 'Join the photowalk this Sunday',
        action_url: '/activities/?type=photo_walk',
        is_read: false,
        read_at: null,
        created_at: new Date(now.getTime() - 1000),
        expires_at: future,
      },
      {
        id: 4,
        user_id: 99,
        title: 'User 99 Notice',
        body: 'Private notice for user 99',
        action_url: null,
        is_read: false,
        read_at: null,
        created_at: now,
        expires_at: future,
      },
    ];

    // Wire up FakeDb responder to simulate authoritative MySQL reads & updates
    fake.responder = (op) => {
      if (op.table !== 'in_app_notifications') return undefined;

      if (op.kind === 'update') {
        const targetId = whereVal(op, 'id') as number | undefined;
        const targetUserId = whereVal(op, 'user_id') as number | undefined;
        const requiresUnread = whereVal(op, 'is_read') === false;

        let modified = 0;
        for (const row of store) {
          if (targetUserId !== undefined && row.user_id !== targetUserId) continue;
          if (targetId !== undefined && row.id !== targetId) continue;
          if (requiresUnread && row.is_read) continue;

          if (op.set?.is_read !== undefined) {
            row.is_read = Boolean(op.set.is_read);
          }
          if (op.set?.read_at !== undefined) {
            row.read_at = new Date(op.set.read_at as string);
          }
          modified++;
        }
        return { numUpdatedRows: BigInt(modified) };
      }

      if (op.kind === 'select') {
        const targetUserId = whereVal(op, 'user_id') as number | undefined;
        const unreadOnly = whereVal(op, 'is_read') === false;

        const filtered = store.filter((row) => {
          if (targetUserId !== undefined && row.user_id !== targetUserId) return false;
          if (unreadOnly && row.is_read) return false;
          return true;
        });

        // If count aggregation query (no limit)
        if (!op.limit) {
          return { n: filtered.length };
        }

        // Return rows
        return filtered.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          action_url: r.action_url,
          is_read: r.is_read ? 1 : 0,
          read_at: r.read_at,
          created_at: r.created_at,
          expires_at: r.expires_at,
        }));
      }

      return undefined;
    };
  });

  it('step 1: verifies initial unread count agrees with persisted records', async () => {
    const unread = await service.getUnreadCount(42);
    expect(unread).toEqual({ count: 3 });
  });

  it('step 2: mark one notification read -> persists -> retrieves it as read', async () => {
    // Initial state
    expect((await service.getUnreadCount(42)).count).toBe(3);

    // Mark notification 1 as read
    await service.markRead(42, 1);

    // Unread count decrements to 2
    expect((await service.getUnreadCount(42)).count).toBe(2);

    // Retrieve full list
    const list = await service.getNotifications(42, { page: 1, limit: 10 });
    expect(list.total).toBe(3);
    expect(list.unreadCount).toBe(2);

    const item1 = list.items.find((i) => i.id === 1);
    const item2 = list.items.find((i) => i.id === 2);
    const item3 = list.items.find((i) => i.id === 3);

    expect(item1?.isRead).toBe(true);
    expect(item1?.readAt).not.toBeNull();
    expect(item2?.isRead).toBe(false);
    expect(item2?.readAt).toBeNull();
    expect(item3?.isRead).toBe(false);
  });

  it('step 3: mark all notifications read -> persists -> list and count reflect 0 unread', async () => {
    await service.markAllRead(42);

    // Unread count becomes 0
    expect((await service.getUnreadCount(42)).count).toBe(0);

    // Retrieve list
    const list = await service.getNotifications(42, { page: 1, limit: 10 });
    expect(list.total).toBe(3);
    expect(list.unreadCount).toBe(0);
    expect(list.items.every((i) => i.isRead)).toBe(true);

    // Filtering unreadOnly returns empty list
    const unreadOnlyList = await service.getNotifications(42, { unreadOnly: true });
    expect(unreadOnlyList.items).toHaveLength(0);
    expect(unreadOnlyList.total).toBe(0);
  });

  it('step 4: cross-user isolation: user 42 cannot modify user 99 notification', async () => {
    // User 42 attempts to mark User 99's notification (id 4)
    await service.markRead(42, 4);

    // User 99's notification remains unread
    expect((await service.getUnreadCount(99)).count).toBe(1);
    const user99List = await service.getNotifications(99);
    expect(user99List.items[0].id).toBe(4);
    expect(user99List.items[0].isRead).toBe(false);

    // User 42's notifications are unaffected
    expect((await service.getUnreadCount(42)).count).toBe(3);
  });

  it('step 5: repeated requests are idempotent and do not duplicate or corrupt state', async () => {
    await service.markRead(42, 1);
    await service.markRead(42, 1); // repeated
    await service.markRead(42, 1); // repeated

    expect((await service.getUnreadCount(42)).count).toBe(2);

    await service.markAllRead(42);
    await service.markAllRead(42); // repeated

    expect((await service.getUnreadCount(42)).count).toBe(0);
  });
});

describe('NotificationController (Fastify HTTP Protocol & Guards)', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    fake.reset();
    jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });

    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        NotificationService,
        AccessTokenGuard,
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(fastifyServerOptions),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fake.reset();
  });

  function tokenFor(userId = 42): string {
    return jwt.sign({
      sub: userId,
      uuid: 'test-uuid-42',
      status: 'ACTIVE',
    });
  }

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed token with 401', async () => {
    const res = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: { authorization: 'Bearer invalid.jwt.token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-numeric notification ID with 400', async () => {
    const res = await app.getHttpAdapter().getInstance().inject({
      method: 'PATCH',
      url: '/api/v1/notifications/abc/read',
      headers: { authorization: `Bearer ${tokenFor(42)}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /mark-all-read succeeds with no body and no Content-Type header (canonical contract)', async () => {
    const res = await app.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/api/v1/notifications/mark-all-read',
      headers: {
        authorization: `Bearer ${tokenFor(42)}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const writes = fake.writes('in_app_notifications', 'update');
    expect(writes).toHaveLength(1);
    expect(whereVal(writes[0], 'user_id')).toBe(42);
  });

  it('PATCH /:id/read succeeds with no body and no Content-Type header (canonical contract)', async () => {
    const res = await app.getHttpAdapter().getInstance().inject({
      method: 'PATCH',
      url: '/api/v1/notifications/55/read',
      headers: {
        authorization: `Bearer ${tokenFor(42)}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const writes = fake.writes('in_app_notifications', 'update');
    expect(writes).toHaveLength(1);
    expect(whereVal(writes[0], 'id')).toBe(55);
    expect(whereVal(writes[0], 'user_id')).toBe(42);
  });

  it('reproduces and documents Fastify FST_ERR_CTP_EMPTY_JSON_BODY when Content-Type is sent with no body', async () => {
    // This proves the exact failure mode identified in the audit:
    // When the frontend blindly injected Content-Type: application/json without a body,
    // Fastify rejected the request before reaching the controller.
    const res = await app.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/api/v1/notifications/mark-all-read',
      headers: {
        authorization: `Bearer ${tokenFor(42)}`,
        'content-type': 'application/json',
      },
      // payload omitted
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      statusCode: 400,
      message: "Body cannot be empty when content-type is set to 'application/json'",
    });
  });

  it('GET /unread-count returns count for authenticated user', async () => {
    fake.responder = (op) => {
      if (op.table === 'in_app_notifications' && op.kind === 'select') {
        return { n: 5 };
      }
      return undefined;
    };

    const res = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: {
        authorization: `Bearer ${tokenFor(42)}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ count: 5 });
  });
});
