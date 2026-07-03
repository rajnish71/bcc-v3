// backend/src/modules/shared/communication/email.service.ts
//
// Thin wrapper around Resend's REST API via native fetch -- no SDK
// dependency added (RAM-conscious, and the API surface used here is one
// endpoint). Free tier: 3,000 emails/month, 100/day, no card required --
// good fit for a ~15-member club with no revenue yet.
//
// Degrades gracefully, not silently: if RESEND_API_KEY isn't set, this logs
// what WOULD have been sent instead of throwing, so registration/magic-link/
// invitation flows keep working end-to-end (with a visible log line) before
// Rajnish has signed up for Resend and added the key. Once the key exists,
// sending is real and a failure raises -- it does not silently fall back to
// logging at that point, since a real key that fails to send is a genuine
// problem the caller should see.

import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly from = process.env.EMAIL_FROM_ADDRESS || 'BCC Bhopal <onboarding@resend.dev>';

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.apiKey) {
      console.log(`[email-stub] RESEND_API_KEY not configured -- would send "${subject}" to ${to}`);
      return;
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
  }
}
