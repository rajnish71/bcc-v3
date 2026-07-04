// backend/src/modules/shared/communication/communication.service.ts
//
// Module 17 Communication Engine -- single dispatch entry point.
//
// All platform notifications go through CommunicationService.dispatch().
// No module should call EmailService.send() directly after this service
// exists -- that path bypasses opt-out checks, template resolution, and
// the notification_log.
//
// ARCHITECTURE:
//   dispatch(typeKey, userId, variables, options?)
//     -> loads notification_types row (validates type is active)
//     -> for each channel the type fires on:
//          - feature-flag guard: SMS/WA require PHONE_OTP_ENABLED=true
//          - opt-out guard: skips if user has opted out (type.is_opt_outable)
//          - template resolution: loads from notification_templates
//          - variable substitution: simple {{key}} string replacement
//          - notification_log write (QUEUED -> SENT/FAILED/SKIPPED)
//          - channel dispatch:
//              EMAIL   -> EmailService (wrapped in BCC HTML shell)
//              IN_APP  -> in_app_notifications table (90-day retention)
//              WA/SMS  -> SKIPPED log (not yet implemented)
//
// EMAIL SHELL:
//   Templates store HTML fragments (body content only). This service wraps
//   them in a standard BCC email shell at dispatch time. The shell is code;
//   the fragment content is admin-editable in the DB. This keeps branding
//   in one place and keeps templates portable.
//
// VARIABLE SUBSTITUTION:
//   Simple replaceAll loop -- no external template library (RAM-conscious).
//   Variables dict is passed by the caller. platform_url is auto-injected
//   from FRONTEND_BASE_URL env. caller variables override auto-injected ones.
//
// OPT-OUT SEMANTICS:
//   - If notification_types.is_opt_outable = FALSE: opt-out check skipped
//     entirely -- these are constitutional/mandatory notifications.
//   - If is_opt_outable = TRUE and a notification_preferences row exists
//     with opted_in = FALSE: channel is skipped with SKIPPED/OPT_OUT log.
//   - If is_opt_outable = TRUE and NO preference row exists: default is
//     opted IN (the absence of a row means the user has not explicitly
//     opted out, consistent with the notification_preferences schema default).
//
// ERROR HANDLING:
//   A dispatch failure on one channel does not abort other channels.
//   Failures are recorded in notification_log with status=FAILED and
//   error_detail. No retry daemon (RAM constraint) -- retries via admin
//   resend or next applicable trigger.
//
// CALLER PATTERN:
//   await communicationService.dispatch('MEMBERSHIP_ACTIVATED', userId, {
//     full_name: 'Rajnish Khare',
//     membership_class: 'Basic Member',
//     membership_number: 'BCC202407000021',
//     expiry_date: '30 Jun 2025',
//   }, { actionUrl: '/member' });

import { Injectable } from '@nestjs/common';
import { db } from '../../../database/db';
import { EmailService } from './email.service';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';

// ---------------------------------------------------------------------------
// BCC standard email shell.
// body_en fragment from notification_templates is injected at {{BODY_CONTENT}}.
// All attributes use double quotes -- no single quotes in this string.
// ASCII-only: HTML entities used in place of any non-ASCII characters.
// ---------------------------------------------------------------------------
const EMAIL_SHELL = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;">
    <tr><td align="center" style="padding:24px 16px;">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;">
        <tr>
          <td style="background:#F5A82A;padding:16px 24px;">
            <strong style="color:#0B0B0E;font-size:18px;font-family:Arial,sans-serif;">
              Bhopal Camera Club
            </strong>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px;color:#1a1a1a;font-size:15px;line-height:1.6;">
            {{BODY_CONTENT}}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 24px;background:#f8f8f8;color:#888;font-size:12px;
                     text-align:center;border-top:1px solid #eee;">
            Bhopal Camera Club &mdash; bcc.bhopal.info
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Channel type union matching the notification_log.channel ENUM
// ---------------------------------------------------------------------------
type Channel = 'EMAIL' | 'IN_APP' | 'WHATSAPP' | 'SMS';

// ---------------------------------------------------------------------------
// Shape of a notification_types row we need in dispatch logic
// ---------------------------------------------------------------------------
interface NotifType {
  type_key: string;
  fires_email: boolean;
  fires_in_app: boolean;
  fires_whatsapp: boolean;
  fires_sms: boolean;
  is_opt_outable: boolean;
  is_active: boolean;
}

@Injectable()
export class CommunicationService {
  constructor(private readonly emailService: EmailService) {}

  // -------------------------------------------------------------------------
  // dispatch() -- public entry point for all callers
  // -------------------------------------------------------------------------
  async dispatch(
    typeKey: string,
    userId: number,
    variables: Record<string, string>,
    options: { actionUrl?: string } = {},
  ): Promise<void> {
    // 1. Load and validate the notification type
    const notifType = await db
      .selectFrom('notification_types')
      .select([
        'type_key',
        'fires_email',
        'fires_in_app',
        'fires_whatsapp',
        'fires_sms',
        'is_opt_outable',
        'is_active',
      ])
      .where('type_key', '=', typeKey)
      .executeTakeFirst();

    if (!notifType) {
      console.warn(`[Comms] dispatch: unknown type_key "${typeKey}" -- skipping`);
      return;
    }
    if (!notifType.is_active) {
      console.warn(`[Comms] dispatch: type_key "${typeKey}" is inactive -- skipping`);
      return;
    }

    // 2. Auto-inject platform_url; caller vars override if they supply it
    const resolvedVars: Record<string, string> = {
      platform_url: process.env.FRONTEND_BASE_URL ?? 'https://v3bcc.bhopal.info',
      ...variables,
    };

    // 3. Load user email (needed only for EMAIL channel but cheap to fetch once)
    const user = await db
      .selectFrom('users')
      .select(['email', 'full_name'])
      .where('id', '=', userId)
      .executeTakeFirst();

    // 4. Dispatch per channel (failures on one channel do not abort others)
    const channelMap: Array<{ channel: Channel; fires: boolean }> = [
      { channel: 'EMAIL',    fires: notifType.fires_email },
      { channel: 'IN_APP',   fires: notifType.fires_in_app },
      { channel: 'WHATSAPP', fires: notifType.fires_whatsapp },
      { channel: 'SMS',      fires: notifType.fires_sms },
    ];

    for (const { channel, fires } of channelMap) {
      if (!fires) continue;
      await this.dispatchChannel(
        typeKey, userId, channel, notifType,
        user ?? null, resolvedVars, options,
      );
    }
  }

  // -------------------------------------------------------------------------
  // dispatchChannel() -- per-channel pipeline
  // -------------------------------------------------------------------------
  private async dispatchChannel(
    typeKey: string,
    userId: number,
    channel: Channel,
    notifType: NotifType,
    user: { email: string | null; full_name: string } | null,
    variables: Record<string, string>,
    options: { actionUrl?: string },
  ): Promise<void> {
    // -- Feature-flag guard for SMS / WhatsApp ---------------------------------
    if (
      (channel === 'WHATSAPP' || channel === 'SMS') &&
      process.env.PHONE_OTP_ENABLED !== 'true'
    ) {
      await this.insertSkipped(typeKey, userId, channel, 'CHANNEL_DISABLED', variables);
      return;
    }

    // -- Opt-out guard ---------------------------------------------------------
    if (notifType.is_opt_outable) {
      const pref = await db
        .selectFrom('notification_preferences')
        .select('opted_in')
        .where('user_id', '=', userId)
        .where('notification_type', '=', typeKey)
        .where('channel', '=', channel)
        .executeTakeFirst();

      // Absence of row = opted in (schema default TRUE).
      // Explicit row with opted_in = false = opted out.
      if (pref !== undefined && !pref.opted_in) {
        await this.insertSkipped(typeKey, userId, channel, 'OPT_OUT', variables);
        return;
      }
    }

    // -- Template resolution ---------------------------------------------------
    const template = await db
      .selectFrom('notification_templates')
      .select(['subject_en', 'body_en'])
      .where('type_key', '=', typeKey)
      .where('channel', '=', channel)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!template) {
      console.warn(`[Comms] No active template for ${typeKey}/${channel} -- skipping channel`);
      return;
    }

    // -- Variable substitution -------------------------------------------------
    const renderedBody    = this.render(template.body_en, variables);
    const renderedSubject = template.subject_en
      ? this.render(template.subject_en, variables)
      : typeKey;

    // -- Write QUEUED log row --------------------------------------------------
    const logId = await this.insertQueued(typeKey, userId, channel, variables);

    // -- Dispatch --------------------------------------------------------------
    try {
      if (channel === 'EMAIL') {
        if (!user?.email) {
          await this.updateLog(logId, 'FAILED', { error_detail: 'User has no email address' });
          return;
        }
        const finalHtml = EMAIL_SHELL.split('{{BODY_CONTENT}}').join(renderedBody);
        const msgId = await this.emailService.send(user.email, renderedSubject, finalHtml);
        await this.updateLog(logId, 'SENT', { provider_message_id: msgId ?? undefined });

      } else if (channel === 'IN_APP') {
        await this.insertInApp(logId, userId, renderedSubject, renderedBody, options.actionUrl);
        await this.updateLog(logId, 'SENT', {});

      } else {
        // WHATSAPP / SMS -- not yet wired (should be unreachable given flag guard)
        await this.updateLog(logId, 'SKIPPED', { skip_reason: 'CHANNEL_DISABLED' });
      }
    } catch (err) {
      const errorDetail = err instanceof Error ? err.message : String(err);
      await this.updateLog(logId, 'FAILED', { error_detail: errorDetail });
      console.error(
        `[Comms] dispatch failed for ${typeKey}/${channel} user=${userId}:`,
        err,
      );
    }
  }

  // -------------------------------------------------------------------------
  // render() -- {{key}} substitution, no external library
  // -------------------------------------------------------------------------
  private render(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // notification_log helpers
  // -------------------------------------------------------------------------

  private async insertQueued(
    typeKey: string,
    userId: number,
    channel: Channel,
    variables: Record<string, string>,
  ): Promise<number> {
    const result = await db
      .insertInto('notification_log')
      .values({
        type_key: typeKey,
        user_id: userId,
        channel,
        status: 'QUEUED',
        variables_snapshot: JSON.stringify(variables) as unknown,
      })
      .executeTakeFirstOrThrow();
    return Number(result.insertId);
  }

  private async insertSkipped(
    typeKey: string,
    userId: number,
    channel: Channel,
    skipReason: 'OPT_OUT' | 'CHANNEL_DISABLED',
    variables: Record<string, string>,
  ): Promise<void> {
    await db
      .insertInto('notification_log')
      .values({
        type_key: typeKey,
        user_id: userId,
        channel,
        status: 'SKIPPED',
        skip_reason: skipReason,
        variables_snapshot: JSON.stringify(variables) as unknown,
      })
      .execute();
  }

  private async updateLog(
    logId: number,
    status: 'SENT' | 'FAILED' | 'SKIPPED',
    extra: {
      provider_message_id?: string;
      error_detail?: string;
      skip_reason?: string;
    },
  ): Promise<void> {
    const now = toMysqlDatetime(new Date());
    await db
      .updateTable('notification_log')
      .set({
        status,
        sent_at:             status === 'SENT'   ? now : null,
        failed_at:           status === 'FAILED' ? now : null,
        provider_message_id: extra.provider_message_id ?? null,
        error_detail:        extra.error_detail        ?? null,
        skip_reason:         extra.skip_reason         ?? null,
      })
      .where('id', '=', logId)
      .execute();
  }

  // -------------------------------------------------------------------------
  // in_app_notifications helper
  // -------------------------------------------------------------------------

  private async insertInApp(
    logId: number,
    userId: number,
    title: string,
    body: string,
    actionUrl?: string,
  ): Promise<void> {
    const now      = new Date();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + ninetyDays);

    await db
      .insertInto('in_app_notifications')
      .values({
        log_id:     logId,
        user_id:    userId,
        title,
        body,
        action_url: actionUrl ?? null,
        expires_at: toMysqlDatetime(expiresAt),
      })
      .execute();
  }
}
