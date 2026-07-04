// backend/src/modules/shared/communication/email.service.ts
//
// Thin wrapper around Resend's REST API via native fetch -- no SDK
// dependency (RAM-conscious; the API surface used here is one endpoint).
// Free tier: 3,000 emails/month, 100/day -- adequate for ~15-member club.
//
// RETURN VALUE:
//   send() now returns Promise<string | null>:
//     - string: Resend message ID (e.g. "re_abc123...") on successful send.
//     - null:   stub mode (RESEND_API_KEY not set) -- logs what would be sent.
//   CommunicationService stores this as notification_log.provider_message_id.
//   Existing callers that ignore the return value continue to work unchanged.
//
// FAILURE SEMANTICS:
//   If RESEND_API_KEY is set and the send fails, an Error is thrown.
//   CommunicationService catches this and records status=FAILED in the log.
//   Callers that called send() directly (registration, lifecycle) should be
//   migrated to CommunicationService.dispatch() in Batch 3 -- at that point
//   direct send() usage will be removed.

import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly from   = process.env.EMAIL_FROM_ADDRESS
    ?? 'Bhopal Camera Club <onboarding@resend.dev>';

  async send(to: string, subject: string, html: string): Promise<string | null> {
    if (!this.apiKey) {
      console.log(
        `[email-stub] RESEND_API_KEY not configured` +
        ` -- would send "${subject}" to ${to}`,
      );
      return null;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to: [to], subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend send failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  }
}
