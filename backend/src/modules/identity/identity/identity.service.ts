// backend/src/modules/identity/identity/identity.service.ts
//
// IDENTITY-ARCH-001: IdentityService is the sole owner of identity lifecycle.
//
// Responsibilities:
//   createIdentity()              — no-op; identity_status defaults to
//                                   IDENTITY_PENDING in the DB on INSERT.
//   completeIdentity()            — validate username, reserve it atomically,
//                                   mark identity complete.
//   validateUsername()            — format validation only (no DB hit).
//   checkUsernameAvailability()   — DB uniqueness check.
//   reserveUsername()             — atomic DB write; throws on conflict.
//   markIdentityComplete()        — set identity_status + timestamp.
//   isIdentityComplete()          — boolean check from DB.
//   sendCompletionLink()          — email the identity completion URL.
//   sendPriorityCompletionLink()  — same with elevated subject line.
//
// Administrators must NEVER assign usernames (IDENTITY-ARCH-001).
// RBAC, membership, and profile visibility are never modified here.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '../../../database/db';
import { toMysqlDatetime } from '../shared/token-hash.util';
import { CommunicationService } from '../../shared/communication/communication.service';
import { EmailService } from '../../shared/communication/email.service';

// Username rules (mirrored in CompleteIdentityDto validation decorator):
const USERNAME_RE = /^[a-z0-9_]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 30;

// Words that cannot be used as usernames to avoid impersonation or route
// conflicts.  All lowercase.
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'superadmin', 'moderator', 'coordinator',
  'bcc', 'bhopalcameraclub', 'support', 'help', 'info', 'noreply',
  'api', 'hub', 'auth', 'login', 'signin', 'register', 'signup',
  'settings', 'profile', 'account', 'me', 'user', 'member',
  'gallery', 'showcase', 'photographers', 'photos', 'upload',
  'contact', 'about', 'home', 'index', 'root',
]);

@Injectable()
export class IdentityService {
  constructor(
    private readonly communicationService: CommunicationService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Validation ──────────────────────────────────────────────────────────

  validateUsername(username: string): void {
    if (!username) throw new BadRequestException('Username is required.');

    const lower = username.toLowerCase();

    if (lower.length < USERNAME_MIN) {
      throw new BadRequestException(`Username must be at least ${USERNAME_MIN} characters.`);
    }
    if (lower.length > USERNAME_MAX) {
      throw new BadRequestException(`Username cannot exceed ${USERNAME_MAX} characters.`);
    }
    if (!USERNAME_RE.test(lower)) {
      throw new BadRequestException(
        'Username may only contain lowercase letters, numbers, and underscores.',
      );
    }
    if (/^_+$/.test(lower)) {
      throw new BadRequestException('Username cannot consist only of underscores.');
    }
    if (/^\d+$/.test(lower)) {
      throw new BadRequestException('Username cannot consist only of numbers.');
    }
    if (RESERVED_USERNAMES.has(lower)) {
      throw new BadRequestException('That username is reserved and cannot be used.');
    }
  }

  async checkUsernameAvailability(
    username: string,
    excludeUserId?: number,
  ): Promise<{ available: boolean; reason?: string }> {
    const lower = username.toLowerCase();

    try {
      this.validateUsername(lower);
    } catch (err: unknown) {
      const msg = err instanceof BadRequestException ? err.message : 'Invalid username.';
      return { available: false, reason: msg };
    }

    const query = db
      .selectFrom('users')
      .select('id')
      .where('username', '=', lower);

    const existing = excludeUserId
      ? await query.where('id', '!=', excludeUserId).executeTakeFirst()
      : await query.executeTakeFirst();

    if (existing) {
      return { available: false, reason: 'That username is already taken.' };
    }
    return { available: true };
  }

  // ─── Identity lifecycle ───────────────────────────────────────────────────

  async isIdentityComplete(userId: number): Promise<boolean> {
    const row = await db
      .selectFrom('users')
      .select('identity_status')
      .where('id', '=', userId)
      .executeTakeFirst();
    return row?.identity_status === 'IDENTITY_COMPLETE';
  }

  async reserveUsername(userId: number, username: string): Promise<void> {
    const lower = username.toLowerCase();

    this.validateUsername(lower);

    const existing = await db
      .selectFrom('users')
      .select('id')
      .where('username', '=', lower)
      .where('id', '!=', userId)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException('That username was just taken. Please choose another.');
    }

    try {
      await db
        .updateTable('users')
        .set({ username: lower })
        .where('id', '=', userId)
        .where('username', 'is', null)
        .execute();
    } catch (err: unknown) {
      // MySQL ER_DUP_ENTRY (1062) — another user claimed this username in the
      // sub-millisecond window between our pre-write SELECT and this UPDATE.
      const mysqlErr = err as { code?: string };
      if (mysqlErr.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('That username was just taken. Please choose another.');
      }
      throw err;
    }

    // Verify the write succeeded (protects against race where another request
    // won the INSERT between our SELECT above and this UPDATE).
    const verify = await db
      .selectFrom('users')
      .select('username')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

    if (verify.username !== lower) {
      throw new ConflictException('Username could not be reserved. Please try again.');
    }
  }

  async markIdentityComplete(userId: number): Promise<void> {
    await db
      .updateTable('users')
      .set({
        identity_status: 'IDENTITY_COMPLETE',
        identity_completed_at: toMysqlDatetime(new Date()),
      })
      .where('id', '=', userId)
      .execute();
  }

  async completeIdentity(
    userId: number,
    username: string,
    displayName?: string,
  ): Promise<void> {
    const user = await db
      .selectFrom('users')
      .select(['id', 'identity_status', 'username', 'full_name', 'email'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user) throw new NotFoundException('User not found.');

    if (user.identity_status === 'IDENTITY_COMPLETE') {
      return; // idempotent — already complete
    }

    // If the user submitted a displayName and doesn't have one yet, set it.
    if (displayName && (!user.full_name || user.full_name.trim() === '')) {
      const trimmed = displayName.trim();
      if (trimmed) {
        await db
          .updateTable('users')
          .set({ full_name: trimmed })
          .where('id', '=', userId)
          .execute();
      }
    }

    // Atomically reserve the username.
    await this.reserveUsername(userId, username);

    // Mark identity complete.
    await this.markIdentityComplete(userId);
  }

  // ─── Admin notification actions ───────────────────────────────────────────

  async sendCompletionLink(
    adminId: number,
    targetUserId: number,
  ): Promise<void> {
    const user = await this.requireUser(targetUserId);
    if (!user.email) throw new BadRequestException('User has no email address on file.');

    const baseUrl = process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info';
    const completionUrl = `${baseUrl}/auth/identity-complete/?next=/hub/`;
    const firstName = user.full_name?.split(' ')[0] || 'Member';

    await this.emailService.send(
      user.email,
      'Complete your Bhopal Camera Club account setup',
      this.communicationService.wrapEmail(
        `<p>Hi ${firstName},</p>` +
        `<p>Your account at Bhopal Camera Club is ready, but you still need to choose a username to complete your setup.</p>` +
        `<p style="margin:24px 0;">` +
        `<a href="${completionUrl}" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;text-decoration:none;font-weight:bold;">Complete Account Setup</a>` +
        `</p>` +
        `<p style="color:#666;font-size:13px;">If the button above doesn't work, copy and paste this link: ${completionUrl}</p>`,
      ),
    );

    void adminId; // logged in calling controller if needed
  }

  async sendPriorityCompletionLink(
    adminId: number,
    targetUserId: number,
  ): Promise<void> {
    const user = await this.requireUser(targetUserId);
    if (!user.email) throw new BadRequestException('User has no email address on file.');

    const baseUrl = process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info';
    const completionUrl = `${baseUrl}/auth/identity-complete/?next=/hub/`;
    const firstName = user.full_name?.split(' ')[0] || 'Member';

    await this.emailService.send(
      user.email,
      'ACTION REQUIRED: Complete your BCC account setup',
      this.communicationService.wrapEmail(
        `<p>Hi ${firstName},</p>` +
        `<p><strong>Your account setup requires your attention.</strong> Please choose a username to complete your Bhopal Camera Club account. This is required before you can access member features.</p>` +
        `<p style="margin:24px 0;">` +
        `<a href="${completionUrl}" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;text-decoration:none;font-weight:bold;">Complete Account Setup Now</a>` +
        `</p>` +
        `<p style="color:#666;font-size:13px;">If the button above doesn't work, copy and paste this link: ${completionUrl}</p>`,
      ),
    );

    void adminId;
  }

  async resendWelcomeEmail(
    adminId: number,
    targetUserId: number,
  ): Promise<void> {
    const user = await this.requireUser(targetUserId);
    const firstName = user.full_name?.split(' ')[0] || 'Member';

    await this.communicationService.dispatch('AUTH_WELCOME', targetUserId, {
      first_name: firstName,
    });

    void adminId;
  }

  async sendMembershipInvitation(
    adminId: number,
    targetUserId: number,
  ): Promise<void> {
    const user = await this.requireUser(targetUserId);
    if (!user.email) throw new BadRequestException('User has no email address on file.');

    const baseUrl = process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info';
    const appPath = '/hub/membership/apply/';
    const membershipApplicationUrl = `${baseUrl}${appPath}`;
    const displayName = user.full_name || user.username || 'Member';

    const emailBody = `
      <p>Dear ${displayName},</p>
      <p>Welcome to the Bhopal Camera Club!</p>
      <p>We are pleased to inform you that your BCC Portal User ID has been created successfully. You can now sign in to the BCC Portal using your registered email address and password.</p>
      
      <p><strong>IMPORTANT: User ID vs. Membership</strong></p>
      <p>Please note that creating a User ID <strong>does not</strong> automatically make you an official member of the Bhopal Camera Club. A User ID provides portal access, but membership requires a separate application process. To help clarify, here is the difference:</p>
      
      <div style="margin: 16px 0; padding: 12px 16px; background: #FAF8F4; border-left: 4px solid #C9A961;">
        <p style="margin: 0 0 8px 0; font-weight: bold; color: #141210;">✔ User ID</p>
        <ul style="margin: 0 0 16px 0; padding-left: 20px;">
          <li>Allows you to sign in to the portal</li>
          <li>Maintain and update your profile</li>
          <li>Participate in public portal activities</li>
        </ul>
        
        <p style="margin: 0 0 8px 0; font-weight: bold; color: #141210;">✔ Membership</p>
        <ul style="margin: 0; padding-left: 20px;">
          <li>Makes you an official Bhopal Camera Club Member</li>
          <li>Unlocks members-only privileges and events</li>
          <li>Requires submission of a membership application</li>
        </ul>
      </div>
      
      <p><strong>Apply for Membership</strong></p>
      <p>You may apply for any membership category currently available. Please note that our <strong>Basic Membership</strong> is currently free, and only requires an annual renewal to keep your profile and club records up to date.</p>
      
      <p>To begin your membership application immediately, please click the link below:</p>
      <p style="margin: 24px 0;">
        <a href="${membershipApplicationUrl}" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;text-decoration:none;font-weight:bold;border-radius:2px;">Apply for Membership</a>
      </p>
      <p style="color:#666;font-size:13px;">If the button above does not work, please copy and paste this URL into your browser:<br/>
      ${membershipApplicationUrl}</p>
      
      <p>or</p>
      <p>Log in to your account and click:<br/>
      <strong>Membership &rarr; Apply for Membership</strong></p>
      
      <p>We look forward to welcoming you as an official member of the Bhopal Camera Club community.</p>
      
      <p>Warm regards,</p>
      <p><strong>BCC Membership Team</strong><br/>
      Bhopal Camera Club</p>
    `;

    await this.emailService.send(
      user.email,
      'Your BCC User ID is Ready — Apply for Membership',
      this.communicationService.wrapEmail(emailBody),
    );

    void adminId;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async requireUser(userId: number) {
    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'full_name', 'identity_status', 'username'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}
