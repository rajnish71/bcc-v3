// backend/src/modules/identity/registration/registration.service.ts
//
// MEM-006 P1: every method here creates AT MOST a User Account + Identity
// Record + Authentication Relationship. None of them touch memberships,
// membership_classes, member_recognitions, or any entitlement table -- not
// even a read. None of them insert a user_roles row, either: "Registered
// User" baseline access is the absence of any role assignment, not a role
// itself (see rbac.service.ts header for the full reasoning and the flag to
// Rajnish about spec 01.1 vs 01.5's role list -- this file assumes that
// reading and should be revisited together if it's wrong).
//
// Delivery of the actual email/SMS/WhatsApp for verification links, OTPs,
// magic links, and invitations is stubbed to console.log. Resend
// (email) and MSG91/Interakt (WhatsApp OTP) are "Architecture-defined" per
// TECH-STACK-FREEZE but no CommunicationService exists yet -- wiring real
// delivery is follow-up work, not silently skipped, just out of scope for
// this pass (RegistrationService + RbacGuard/RbacService).

import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Selectable } from 'kysely';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { db, UsersTable } from '../../../database/db';
import { AuthService, DeviceContext, TokenPair } from '../auth/auth.service';
import { logIdentityAudit } from '../shared/identity-audit.util';
import {
  generateNumericOtp,
  generateOpaqueToken,
  hashToken,
  toMysqlDatetime,
} from '../shared/token-hash.util';
import { RegisterEmailPasswordDto } from './dto/register-email-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { ConsumeMagicLinkDto } from './dto/consume-magic-link.dto';
import { AdminCreateAccountDto } from './dto/admin-create-account.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { EmailService } from '../../shared/communication/email.service';
import { CommunicationService } from '../../shared/communication/communication.service';

const EMAIL_VERIFICATION_TTL_HOURS = 24;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const MAGIC_LINK_TTL_MINUTES = 15;
const INVITATION_TTL_DAYS = 7;

type RegistrationMethod =
  | 'EMAIL_PASSWORD'
  | 'PHONE_OTP'
  | 'SOCIAL_LOGIN'
  | 'MAGIC_LINK'
  | 'ADMIN_CREATED'
  | 'INVITATION';

export interface PublicUser {
  id: number;
  uuid: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  registrationMethod: RegistrationMethod;
  emailVerified: boolean;
  phoneVerified: boolean;
  forcePasswordReset: boolean;
  createdAt: Date;
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly communicationService: CommunicationService,
  ) {}

  // ======================================================================
  // 1. Email + password
  // ======================================================================

  async registerWithEmailPassword(
    dto: RegisterEmailPasswordDto,
    device: DeviceContext,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const existing = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', dto.email)
      .executeTakeFirst();
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const fullName = [dto.nameTitle, dto.firstName, dto.middleName, dto.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const { id, uuid } = await this.createBaselineUser({
      email: dto.email,
      phone: null,
      fullName,
      nameTitle: dto.nameTitle ?? null,
      firstName: dto.firstName,
      middleName: dto.middleName ?? null,
      lastName: dto.lastName,
      passwordHash,
      registrationMethod: 'EMAIL_PASSWORD',
      createdBy: null,
      emailVerifiedNow: false,
      phoneVerifiedNow: false,
    });

    await this.issueEmailVerification(id, dto.email);

    const tokens = await this.authService.issueSessionForUser(id, uuid, 'ACTIVE', device);
    return { user: await this.toPublicUser(id), tokens };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    const row = await db
      .selectFrom('email_verification_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!row) throw new NotFoundException('Invalid verification token');
    if (row.consumed_at) throw new GoneException('Verification token already used');
    if (new Date(row.expires_at) < new Date()) throw new GoneException('Verification token expired');

    await db
      .updateTable('email_verification_tokens')
      .set({ consumed_at: toMysqlDatetime(new Date()) })
      .where('id', '=', row.id)
      .execute();

    await db
      .updateTable('users')
      .set({ email_verified_at: toMysqlDatetime(new Date()) })
      .where('id', '=', row.user_id)
      .execute();
  }

  private async issueEmailVerification(userId: number, email: string): Promise<void> {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

    await db
      .insertInto('email_verification_tokens')
      .values({ user_id: userId, token_hash: tokenHash, expires_at: toMysqlDatetime(expiresAt) })
      .execute();

    const verifyUrl = `${this.frontendBaseUrl()}/verify-email?token=${rawToken}`;
    // Dispatch via engine: logs, respects opt-out, fires in-app + email from template.
    const userRow = await db
      .selectFrom('users')
      .select('full_name')
      .where('id', '=', userId)
      .executeTakeFirst();
    const firstName = userRow?.full_name?.split(' ')[0] ?? 'there';
    await this.communicationService.dispatch('AUTH_EMAIL_VERIFY', userId, {
      first_name: firstName,
      verification_url: verifyUrl,
    });
  }

  // ======================================================================
  // 2. Phone + OTP (India-first, WhatsApp OTP per spec -- delivery stubbed)
  // ======================================================================

  async requestPhoneOtp(dto: RequestPhoneOtpDto): Promise<{ message: string }> {
    this.assertPhoneOtpEnabled();

    const existing = await db
      .selectFrom('users')
      .select('id')
      .where('phone', '=', dto.phone)
      .executeTakeFirst();
    if (existing) {
      throw new ConflictException('An account with this phone number already exists');
    }

    const code = generateNumericOtp(6);
    const codeHash = hashToken(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await db
      .insertInto('otp_codes')
      .values({
        user_id: null,
        phone: dto.phone,
        code_hash: codeHash,
        purpose: 'REGISTRATION',
        expires_at: toMysqlDatetime(expiresAt),
      })
      .execute();

    console.log(`[otp] would send to ${dto.phone}: code=${code}`);
    return { message: 'OTP sent' };
  }

  async verifyPhoneOtpAndRegister(
    dto: VerifyPhoneOtpDto,
    device: DeviceContext,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    this.assertPhoneOtpEnabled();

    const row = await db
      .selectFrom('otp_codes')
      .selectAll()
      .where('phone', '=', dto.phone)
      .where('purpose', '=', 'REGISTRATION')
      .where('consumed_at', 'is', null)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    if (!row) throw new NotFoundException('No pending OTP for this phone number');
    if (new Date(row.expires_at) < new Date()) throw new GoneException('OTP expired, request a new one');
    if (row.attempt_count >= OTP_MAX_ATTEMPTS) {
      throw new ForbiddenException('Too many attempts, request a new OTP');
    }

    const codeHash = hashToken(dto.code);
    if (codeHash !== row.code_hash) {
      await db
        .updateTable('otp_codes')
        .set({ attempt_count: row.attempt_count + 1 })
        .where('id', '=', row.id)
        .execute();
      throw new UnauthorizedException('Incorrect OTP');
    }

    const existingUser = await db
      .selectFrom('users')
      .select('id')
      .where('phone', '=', dto.phone)
      .executeTakeFirst();
    if (existingUser) {
      throw new ConflictException('An account with this phone number already exists');
    }

    await db
      .updateTable('otp_codes')
      .set({ consumed_at: toMysqlDatetime(new Date()) })
      .where('id', '=', row.id)
      .execute();

    const { id, uuid } = await this.createBaselineUser({
      email: null,
      phone: dto.phone,
      fullName: dto.fullName,
      passwordHash: null,
      registrationMethod: 'PHONE_OTP',
      createdBy: null,
      emailVerifiedNow: false,
      phoneVerifiedNow: true,
    });

    const tokens = await this.authService.issueSessionForUser(id, uuid, 'ACTIVE', device);
    return { user: await this.toPublicUser(id), tokens };
  }

  // ======================================================================
  // 3. Social login (Google, Facebook, Instagram)
  // ======================================================================
  // Trusts the caller to have already verified the provider token -- the
  // real OAuth code-exchange step is a separate, not-yet-built concern.

  async registerOrLoginWithSocial(
    dto: SocialLoginDto,
    device: DeviceContext,
  ): Promise<{ user: PublicUser; tokens: TokenPair; wasNewUser: boolean }> {
    const linked = await db
      .selectFrom('auth_identities')
      .selectAll()
      .where('provider', '=', dto.provider)
      .where('provider_user_id', '=', dto.providerUserId)
      .executeTakeFirst();

    if (linked) {
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', linked.user_id)
        .executeTakeFirst();
      if (!user) throw new NotFoundException('Linked account no longer exists');
      if (user.status !== 'ACTIVE') throw new ForbiddenException(`Account is ${user.status.toLowerCase()}`);

      const tokens = await this.authService.issueSessionForUser(user.id, user.uuid, user.status, device);
      return { user: this.rowToPublicUser(user), tokens, wasNewUser: false };
    }

    // Not linked yet -- an account with this email may already exist
    // (registered some other way). Link rather than duplicate the person.
    const existingByEmail = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', dto.email)
      .executeTakeFirst();

    if (existingByEmail) {
      if (existingByEmail.status !== 'ACTIVE') {
        throw new ForbiddenException(`Account is ${existingByEmail.status.toLowerCase()}`);
      }

      await db
        .insertInto('auth_identities')
        .values({ user_id: existingByEmail.id, provider: dto.provider, provider_user_id: dto.providerUserId })
        .execute();

      await logIdentityAudit({
        actorId: existingByEmail.id,
        targetUserId: existingByEmail.id,
        actionType: 'SOCIAL_IDENTITY_LINKED',
        newValue: { provider: dto.provider },
      });

      const tokens = await this.authService.issueSessionForUser(
        existingByEmail.id,
        existingByEmail.uuid,
        existingByEmail.status,
        device,
      );
      return { user: this.rowToPublicUser(existingByEmail), tokens, wasNewUser: false };
    }

    const { id, uuid } = await this.createBaselineUser({
      email: dto.email,
      phone: null,
      fullName: dto.fullName,
      passwordHash: null,
      registrationMethod: 'SOCIAL_LOGIN',
      createdBy: null,
      emailVerifiedNow: true, // provider vouches for the email
      phoneVerifiedNow: false,
    });

    await db
      .insertInto('auth_identities')
      .values({ user_id: id, provider: dto.provider, provider_user_id: dto.providerUserId })
      .execute();

    const tokens = await this.authService.issueSessionForUser(id, uuid, 'ACTIVE', device);
    return { user: await this.toPublicUser(id), tokens, wasNewUser: true };
  }

  // ======================================================================
  // 4. Magic link (passwordless -- doubles as registration AND login,
  //    since there's no way to know in advance whether the email is new)
  // ======================================================================

  async requestMagicLink(dto: RequestMagicLinkDto): Promise<{ message: string }> {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000);

    await db
      .insertInto('magic_links')
      .values({ email: dto.email, token_hash: tokenHash, expires_at: toMysqlDatetime(expiresAt) })
      .execute();

    const magicUrl = `${this.frontendBaseUrl()}/magic-link?token=${rawToken}`;
    // Look up user for dispatch. If no account exists for this email, fall
    // back to a direct email (enumeration-safe: both paths send an email).
    const magicUser = await db
      .selectFrom('users')
      .select(['id', 'full_name'])
      .where('email', '=', dto.email)
      .executeTakeFirst();
    if (magicUser) {
      const firstName = magicUser.full_name?.split(' ')[0] ?? 'there';
      await this.communicationService.dispatch('AUTH_MAGIC_LINK', magicUser.id, {
        first_name: firstName,
        magic_link_url: magicUrl,
      });
    } else {
      // Pre-user path: no account yet -- send direct, no log entry possible.
      await this.emailService.send(
        dto.email,
        'Your BCC sign-in link',
        this.communicationService.wrapEmail(
          `<p>Click the link below to sign in to Bhopal Camera Club:</p>` +
          `<p style="margin:24px 0;"><a href="${magicUrl}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;">Sign In to BCC</a></p>` +
          `<p style="color:#666;font-size:13px;">This link expires in ${MAGIC_LINK_TTL_MINUTES} minutes and can only be used once.</p>`,
        ),
      );
    }
    return { message: 'Magic link sent' };
  }

  async consumeMagicLink(
    dto: ConsumeMagicLinkDto,
    device: DeviceContext,
  ): Promise<{ user: PublicUser; tokens: TokenPair; wasNewUser: boolean }> {
    const tokenHash = hashToken(dto.token);
    const row = await db
      .selectFrom('magic_links')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!row) throw new NotFoundException('Invalid magic link');
    if (row.consumed_at) throw new GoneException('Magic link already used');
    if (new Date(row.expires_at) < new Date()) throw new GoneException('Magic link expired');

    await db
      .updateTable('magic_links')
      .set({ consumed_at: toMysqlDatetime(new Date()) })
      .where('id', '=', row.id)
      .execute();

    const existingUser = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', row.email)
      .executeTakeFirst();

    if (existingUser) {
      if (existingUser.status !== 'ACTIVE') {
        throw new ForbiddenException(`Account is ${existingUser.status.toLowerCase()}`);
      }
      const tokens = await this.authService.issueSessionForUser(
        existingUser.id,
        existingUser.uuid,
        existingUser.status,
        device,
      );
      return { user: this.rowToPublicUser(existingUser), tokens, wasNewUser: false };
    }

    const fullName = dto.fullName?.trim() || row.email.split('@')[0];
    const { id, uuid } = await this.createBaselineUser({
      email: row.email,
      phone: null,
      fullName,
      passwordHash: null,
      registrationMethod: 'MAGIC_LINK',
      createdBy: null,
      emailVerifiedNow: true, // clicking the link proves inbox control
      phoneVerifiedNow: false,
    });

    const tokens = await this.authService.issueSessionForUser(id, uuid, 'ACTIVE', device);
    return { user: await this.toPublicUser(id), tokens, wasNewUser: true };
  }

  // ======================================================================
  // 5. Admin-created ("coordinator creates account for a member" -- spec
  //    01.2 verbatim). Gated by RbacGuard(identity.user.create) at the
  //    controller. Does NOT log the admin in as the new user -- returns the
  //    temporary password once for the admin to deliver out-of-band.
  // ======================================================================

  async adminCreateAccount(
    actorId: number,
    dto: AdminCreateAccountDto,
  ): Promise<{ user: PublicUser; temporaryPassword: string }> {
    const existingEmail = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', dto.email)
      .executeTakeFirst();
    if (existingEmail) throw new ConflictException('An account with this email already exists');

    if (dto.phone) {
      const existingPhone = await db
        .selectFrom('users')
        .select('id')
        .where('phone', '=', dto.phone)
        .executeTakeFirst();
      if (existingPhone) throw new ConflictException('An account with this phone number already exists');
    }

    // Random per-account temp password -- deliberately NOT the shared
    // 'Bcc2026!' default used for the one-time legacy migration bulk import.
    // That was a bulk-onboarding convention for ~20 known people at once;
    // reusing it here for an ongoing admin-created path would mean every
    // fresh V3-native account shares one guessable password. Flagged as a
    // deliberate departure from that earlier convention, not an oversight.
    const temporaryPassword = generateOpaqueToken().slice(0, 16);
    const passwordHash = await argon2.hash(temporaryPassword);

    const { id } = await this.createBaselineUser({
      email: dto.email,
      phone: dto.phone ?? null,
      fullName: dto.fullName,
      passwordHash,
      registrationMethod: 'ADMIN_CREATED',
      createdBy: actorId,
      emailVerifiedNow: false,
      phoneVerifiedNow: false,
    });

    await db.updateTable('users').set({ force_password_reset: true }).where('id', '=', id).execute();

    return { user: await this.toPublicUser(id), temporaryPassword };
  }

  // ======================================================================
  // 6. Invitation-based. No role/scope is ever attached to an invitation --
  //    MEM-006 P1 means an invite can fast-track WHO registers, never WHAT
  //    they're entitled to beyond baseline. Gated by
  //    RbacGuard(identity.invitation.create) at the controller.
  // ======================================================================

  async createInvitation(
    actorId: number,
    dto: CreateInvitationDto,
  ): Promise<{ invitationToken: string; expiresAt: Date }> {
    const existingUser = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', dto.email)
      .executeTakeFirst();
    if (existingUser) throw new ConflictException('An account with this email already exists');

    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await db
      .insertInto('invitations')
      .values({ email: dto.email, token_hash: tokenHash, invited_by: actorId, expires_at: toMysqlDatetime(expiresAt) })
      .execute();

    const inviteUrl = `${this.frontendBaseUrl()}/join?invitation=${rawToken}`;
    await this.emailService.send(
      dto.email,
      'You are invited to join Bhopal Camera Club',
      `<p>You have been invited to join the BCC platform. Click the link below to set up your account:</p>` +
        `<p><a href="${inviteUrl}">${inviteUrl}</a></p>` +
        `<p>This invitation expires in ${INVITATION_TTL_DAYS} days.</p>`,
    );
    return { invitationToken: rawToken, expiresAt };
  }

  async acceptInvitation(
    dto: AcceptInvitationDto,
    device: DeviceContext,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const tokenHash = hashToken(dto.token);
    const row = await db
      .selectFrom('invitations')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!row) throw new NotFoundException('Invalid invitation');
    if (row.consumed_at) throw new GoneException('Invitation already used');
    if (new Date(row.expires_at) < new Date()) throw new GoneException('Invitation expired');

    const existingUser = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', row.email)
      .executeTakeFirst();
    if (existingUser) throw new ConflictException('An account with this email already exists');

    if (dto.phone) {
      const existingPhone = await db
        .selectFrom('users')
        .select('id')
        .where('phone', '=', dto.phone)
        .executeTakeFirst();
      if (existingPhone) throw new ConflictException('An account with this phone number already exists');
    }

    await db
      .updateTable('invitations')
      .set({ consumed_at: toMysqlDatetime(new Date()) })
      .where('id', '=', row.id)
      .execute();

    const passwordHash = await argon2.hash(dto.password);
    const { id, uuid } = await this.createBaselineUser({
      email: row.email,
      phone: dto.phone ?? null,
      fullName: dto.fullName,
      passwordHash,
      registrationMethod: 'INVITATION',
      createdBy: row.invited_by,
      emailVerifiedNow: true, // received + opened the invite at that address
      phoneVerifiedNow: false,
    });

    const tokens = await this.authService.issueSessionForUser(id, uuid, 'ACTIVE', device);
    return { user: await this.toPublicUser(id), tokens };
  }

  // ======================================================================
  // Shared helpers
  // ======================================================================

  private frontendBaseUrl(): string {
    return process.env.FRONTEND_BASE_URL || 'https://v3bcc.bhopal.info';
  }

  // Off by default -- MSG91/Interakt both charge per message with no
  // meaningful free tier for ongoing use, and there's no revenue model yet
  // to justify a standing WhatsApp/SMS cost. Flip PHONE_OTP_ENABLED=true
  // once a provider is actually chosen and paid for; the otp_codes schema
  // and this whole code path are otherwise ready to go.
  private assertPhoneOtpEnabled(): void {
    if (process.env.PHONE_OTP_ENABLED !== 'true') {
      throw new ServiceUnavailableException(
        'Phone/WhatsApp OTP registration is not available yet -- no SMS provider is configured. Use email, magic link, or social login instead.',
      );
    }
  }

  private async createBaselineUser(params: {
    email: string | null;
    phone: string | null;
    fullName: string;
    nameTitle?: string | null;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    passwordHash: string | null;
    registrationMethod: RegistrationMethod;
    createdBy: number | null;
    emailVerifiedNow: boolean;
    phoneVerifiedNow: boolean;
  }): Promise<{ id: number; uuid: string }> {
    const uuid = randomUUID();
    const now = toMysqlDatetime(new Date());

    const inserted = await db
      .insertInto('users')
      .values({
        uuid,
        email: params.email,
        phone: params.phone,
        password_hash: params.passwordHash,
        full_name: params.fullName,
        name_title: params.nameTitle ?? null,
        first_name: params.firstName ?? null,
        middle_name: params.middleName ?? null,
        last_name: params.lastName ?? null,
        status: 'ACTIVE',
        email_verified_at: params.emailVerifiedNow ? now : null,
        phone_verified_at: params.phoneVerifiedNow ? now : null,
        registration_method: params.registrationMethod,
        created_by: params.createdBy,
      })
      .executeTakeFirstOrThrow();

    const userId = Number(inserted.insertId);

    // Deliberately NOT inserting a user_roles row here -- see file header.
    await logIdentityAudit({
      actorId: params.createdBy,
      targetUserId: userId,
      actionType: 'USER_REGISTERED',
      newValue: { method: params.registrationMethod },
    });

    return { id: userId, uuid };
  }

  private async toPublicUser(userId: number): Promise<PublicUser> {
    const row = await db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirstOrThrow();
    return this.rowToPublicUser(row);
  }

  private rowToPublicUser(row: Selectable<UsersTable>): PublicUser {
    return {
      id: row.id,
      uuid: row.uuid,
      email: row.email,
      phone: row.phone,
      fullName: row.full_name,
      status: row.status,
      registrationMethod: row.registration_method as RegistrationMethod,
      emailVerified: !!row.email_verified_at,
      phoneVerified: !!row.phone_verified_at,
      forcePasswordReset: !!row.force_password_reset,
      createdAt: new Date(row.created_at as unknown as string),
    };
  }
}
