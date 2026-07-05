// backend/src/modules/notifications/notification.service.ts
// Module 17 -- notification bell + preferences service.

import { Injectable } from '@nestjs/common';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}
function toIsoOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return toDate(v).toISOString();
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  expiresAt: string;
}
export interface NotificationListResult {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  hasMore: boolean;
}
export interface PreferenceChannel { channel: 'EMAIL' | 'IN_APP'; optedIn: boolean; }
export interface PreferenceType { typeKey: string; triggerEvent: string; channels: PreferenceChannel[]; }
type Channel = 'EMAIL' | 'IN_APP' | 'WHATSAPP' | 'SMS';

@Injectable()
export class NotificationService {

  // Cheap unread count for the bell badge
  async getUnreadCount(userId: number): Promise<{ count: number }> {
    const row = await db
      .selectFrom('in_app_notifications')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .where('expires_at', '>', new Date())
      .executeTakeFirstOrThrow();
    return { count: Number(row.n) };
  }

  // Paginated list, newest first, expired excluded
  async getNotifications(
    userId: number,
    opts: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ): Promise<NotificationListResult> {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(50, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;
    const now    = toMysqlDatetime(new Date());

    void this.cleanupExpired(userId); // fire-and-forget -- no daemon needed

    let base = db
      .selectFrom('in_app_notifications')
      .where('user_id', '=', userId)
      .where('expires_at', '>', new Date());
    if (opts.unreadOnly) base = base.where('is_read', '=', false);

    const countRow = await base
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow();
    const total = Number(countRow.n);

    const unreadRow = await db
      .selectFrom('in_app_notifications')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .where('expires_at', '>', new Date())
      .executeTakeFirstOrThrow();
    const unreadCount = Number(unreadRow.n);

    const rows = await base
      .select(['id', 'title', 'body', 'action_url', 'is_read', 'read_at', 'created_at', 'expires_at'])
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const items: NotificationItem[] = rows.map((r) => ({
      id:        r.id,
      title:     r.title,
      body:      r.body,
      actionUrl: r.action_url,
      isRead:    !!r.is_read,
      readAt:    toIsoOrNull(r.read_at),
      createdAt: toDate(r.created_at).toISOString(),
      expiresAt: toDate(r.expires_at).toISOString(),
    }));

    return { items, total, unreadCount, hasMore: offset + rows.length < total };
  }

  // Mark one notification read (ownership-guarded)
  async markRead(userId: number, notificationId: number): Promise<void> {
    await db
      .updateTable('in_app_notifications')
      .set({ is_read: true, read_at: toMysqlDatetime(new Date()) })
      .where('id', '=', notificationId)
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .execute();
  }

  // Mark all as read
  async markAllRead(userId: number): Promise<void> {
    await db
      .updateTable('in_app_notifications')
      .set({ is_read: true, read_at: toMysqlDatetime(new Date()) })
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .execute();
  }

  // Preferences -- only opt-outable types, only channels the type fires on
  async getPreferences(userId: number): Promise<{ types: PreferenceType[] }> {
    const phoneEnabled = process.env.PHONE_OTP_ENABLED === 'true';

    const types = await db
      .selectFrom('notification_types')
      .select(['type_key', 'trigger_event', 'fires_email', 'fires_in_app', 'fires_whatsapp', 'fires_sms'])
      .where('is_opt_outable', '=', true)
      .where('is_active', '=', true)
      .orderBy('module', 'asc')
      .orderBy('type_key', 'asc')
      .execute();

    if (types.length === 0) return { types: [] };

    const prefs = await db
      .selectFrom('notification_preferences')
      .select(['notification_type', 'channel', 'opted_in'])
      .where('user_id', '=', userId)
      .where('notification_type', 'in', types.map((t) => t.type_key))
      .execute();

    const prefIndex: Record<string, Record<string, boolean>> = {};
    for (const p of prefs) {
      if (!prefIndex[p.notification_type]) prefIndex[p.notification_type] = {};
      prefIndex[p.notification_type][p.channel] = !!p.opted_in;
    }

    const result: PreferenceType[] = types.map((t) => {
      const userPrefs = prefIndex[t.type_key] ?? {};
      const channels: PreferenceChannel[] = [];
      const eligible: Array<{ ch: Channel; fires: boolean }> = [
        { ch: 'EMAIL',    fires: t.fires_email },
        { ch: 'IN_APP',   fires: t.fires_in_app },
        { ch: 'WHATSAPP', fires: t.fires_whatsapp && phoneEnabled },
        { ch: 'SMS',      fires: t.fires_sms      && phoneEnabled },
      ];
      for (const { ch, fires } of eligible) {
        if (!fires) continue;
        const optedIn = userPrefs[ch] !== undefined ? userPrefs[ch] : true;
        channels.push({ channel: ch as 'EMAIL' | 'IN_APP', optedIn });
      }
      return { typeKey: t.type_key, triggerEvent: t.trigger_event, channels };
    });

    return { types: result };
  }

  // Upsert a preference; returns error reason for caller to surface as 400/403
  async upsertPreference(
    userId: number, typeKey: string, channel: string, optedIn: boolean,
  ): Promise<{ ok: boolean; reason?: string }> {
    const type = await db
      .selectFrom('notification_types')
      .select(['is_opt_outable', 'is_active', 'fires_email', 'fires_in_app', 'fires_whatsapp', 'fires_sms'])
      .where('type_key', '=', typeKey)
      .executeTakeFirst();

    if (!type)             return { ok: false, reason: 'Unknown notification type' };
    if (!type.is_active)   return { ok: false, reason: 'Notification type is inactive' };
    if (!type.is_opt_outable) return { ok: false, reason: 'This notification type cannot be opted out of' };

    const fires: Record<string, boolean> = {
      EMAIL: type.fires_email, IN_APP: type.fires_in_app,
      WHATSAPP: type.fires_whatsapp, SMS: type.fires_sms,
    };
    if (!fires[channel]) {
      return { ok: false, reason: `Type "${typeKey}" does not fire on channel "${channel}"` };
    }

    await db
      .insertInto('notification_preferences')
      .values({
        user_id: userId, notification_type: typeKey,
        channel: channel as 'EMAIL' | 'IN_APP' | 'WHATSAPP' | 'SMS',
        opted_in: optedIn,
      })
      .onDuplicateKeyUpdate({ opted_in: optedIn })
      .execute();

    return { ok: true };
  }

  private async cleanupExpired(userId: number): Promise<void> {
    try {
      await db
        .deleteFrom('in_app_notifications')
        .where('user_id', '=', userId)
        .where('expires_at', '<=', new Date())
        .execute();
    } catch { /* non-critical */ }
  }
}
