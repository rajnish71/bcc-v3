import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import { EmailService } from '../shared/communication/email.service';
import { ContactDto } from './contact.dto';

@Injectable()
export class ContactService {
  private readonly RECIPIENT = process.env.CONTACT_EMAIL || 'hello@bcc.bhopal.info';

  constructor(private readonly email: EmailService) {}

  async send(dto: ContactDto, ip: string, userAgent?: string): Promise<void> {
    const isSpam = !!dto.website;

    // 1. Store submission in database
    try {
      await db
        .insertInto('contact_messages')
        .values({
          name: dto.name,
          email: dto.email,
          phone: dto.phone || null,
          subject: dto.subject,
          message: dto.message,
          ip_address: ip || null,
          user_agent: userAgent || null,
          status: isSpam ? 'SPAM' : 'NEW',
        })
        .execute();
    } catch (err) {
      console.error('[contact] db store failed:', err);
      throw new InternalServerErrorException(
        'Failed to save your message. Please try again or email us directly.',
      );
    }

    // 2. Honeypot check: silently ignore submission if filled
    if (isSpam) {
      console.log('[contact] honeypot triggered, message stored as SPAM and email skipped.');
      return;
    }

    // 3. Attempt email via Resend
    // Timestamp in IST (UTC+5:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const timestamp = ist
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '')
      .split('.')[0] + ' IST';

    const html = this.buildHtml(dto, timestamp);
    const subject = `[BCC Contact] ${dto.subject}`;

    try {
      await this.email.send(this.RECIPIENT, subject, html, dto.email);
    } catch (err) {
      // Log but surface as 500 so the frontend shows an error state.
      console.error('[contact] email send failed:', err);
      throw new InternalServerErrorException(
        'Failed to deliver your message. Please try again or email us directly.',
      );
    }
  }

  private buildHtml(dto: ContactDto, timestamp: string): string {
    const safe = (s: string | undefined) =>
      (s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>BCC Contact Form Submission</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a1a;padding:28px 36px;">
              <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.1em;color:#b8924a;text-transform:uppercase;">Bhopal Camera Club</p>
              <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;">New Contact Form Message</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <tr>
                  <td style="padding-bottom:20px;border-bottom:1px solid #f0f0f0;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#999999;text-transform:uppercase;">From</p>
                    <p style="margin:0;font-size:15px;color:#1a1a1a;font-weight:600;">${safe(dto.name)}</p>
                    <p style="margin:2px 0 0;font-size:13px;color:#555555;">${safe(dto.email)}</p>
                    ${dto.phone ? `<p style="margin:2px 0 0;font-size:13px;color:#555555;">${safe(dto.phone)}</p>` : ''}
                  </td>
                </tr>

                <tr>
                  <td style="padding:20px 0;border-bottom:1px solid #f0f0f0;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#999999;text-transform:uppercase;">Subject</p>
                    <p style="margin:0;font-size:15px;color:#1a1a1a;font-weight:600;">${safe(dto.subject)}</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:20px 0;border-bottom:1px solid #f0f0f0;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#999999;text-transform:uppercase;">Message</p>
                    <p style="margin:0;font-size:14px;line-height:1.75;color:#333333;">${safe(dto.message)}</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding-top:20px;">
                    <p style="margin:0;font-size:11px;color:#aaaaaa;">Submitted: ${timestamp}</p>
                    <p style="margin:4px 0 0;font-size:11px;color:#aaaaaa;">Reply directly to this email to respond to ${safe(dto.name)}.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;border-top:1px solid #eeeeee;padding:20px 36px;">
              <p style="margin:0;font-size:11px;color:#aaaaaa;">This message was sent via the contact form at <a href="https://v3bcc.bhopal.info/contact/" style="color:#b8924a;">v3bcc.bhopal.info/contact/</a>.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }
}
