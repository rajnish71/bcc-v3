// backend/src/modules/identity/auth/auth.service.ts
//
// MEM-006 P1: this service authenticates Registered Users. It has no
// awareness of membership, recognition, or governance state -- it reads only
// from `users`, `refresh_tokens`, `login_history`, `account_lockouts`. It
// does not join against `memberships` or any membership-adjacent table.
//
// AUTH STRATEGY (confirmed, Option C): short-lived signed access JWT +
// rotating opaque refresh token persisted in `refresh_tokens`. Access tokens
// are verified by signature only (see AccessTokenGuard) -- no DB hit on most
// requests. Refresh tokens are the only thing that touches the DB, and only
// at login/refresh/logout.

import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { db } from '../../../database/db';
import {
  generateRefreshToken,
  hashRefreshToken,
  AccessTokenPayload,
} from './token.util';
import { toMysqlDatetime } from '../shared/token-hash.util';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface DeviceContext {
  ipAddress: string | null;
  userAgent: string | null;
  deviceLabel?: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds, for the access token
}

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  // -- Login ------------------------------------------------------------

  async login(
    email: string,
    password: string,
    device: DeviceContext,
  ): Promise<TokenPair> {
    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    // Same generic failure for "no such user" and "wrong password" --
    // don't leak account existence.
    if (!user || !user.password_hash) {
      await this.recordLoginAttempt(null, email, device, 'FAILED');
      throw new UnauthorizedException('Invalid email or password');
    }

    const lockout = await db
      .selectFrom('account_lockouts')
      .selectAll()
      .where('user_id', '=', user.id)
      .executeTakeFirst();

    if (lockout?.locked_at && !lockout.unlocked_at) {
      const lockedAt = new Date(lockout.locked_at).getTime();
      const unlockAt = lockedAt + LOCKOUT_MINUTES * 60 * 1000;
      if (Date.now() < unlockAt) {
        await this.recordLoginAttempt(user.id, email, device, 'LOCKED');
        throw new ForbiddenException(
          'Account temporarily locked due to repeated failed attempts',
        );
      }
    }

    // Verify password. argon2.verify() throws a TypeError if the stored hash
    // uses an unrecognised format (e.g. a bcrypt hash written by a migration
    // before the V3 auth system was in place). Catch that case and treat it
    // as a wrong-password result -- never let a hash format mismatch surface
    // as a 500 to the client.
    let passwordValid = false;
    try {
      passwordValid = await argon2.verify(user.password_hash, password);
    } catch {
      // Unrecognised hash format. Log at warn level for ops visibility.
      // The user will see "Invalid email or password" and can use the
      // password-reset flow to obtain a fresh argon2 hash.
      passwordValid = false;
    }

    if (!passwordValid) {
      await this.registerFailedAttempt(user.id);
      await this.recordLoginAttempt(user.id, email, device, 'FAILED');
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      await this.recordLoginAttempt(user.id, email, device, 'FAILED');
      throw new ForbiddenException(`Account is ${user.status.toLowerCase()}`);
    }

    // Success -- clear any failed-attempt counter, record history, issue tokens.
    await this.clearFailedAttempts(user.id);
    await this.recordLoginAttempt(user.id, email, device, 'SUCCESS');

    return this.issueTokenPair(user.id, user.uuid, user.status, device);
  }

  // -- Token issuance --------------------------------------------------

  /**
   * Public entry point for other identity-domain services (RegistrationService)
   * to issue a fresh session immediately after creating a user -- e.g. email
   * verification isn't required to start browsing. Deliberately thin: no
   * password/lockout checks here, because the caller has already established
   * who this user is through its own method (OTP verified, magic link
   * consumed, etc).
   */
  async issueSessionForUser(
    userId: number,
    uuid: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED',
    device: DeviceContext,
  ): Promise<TokenPair> {
    return this.issueTokenPair(userId, uuid, status, device);
  }


  private async issueTokenPair(
    userId: number,
    uuid: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED',
    device: DeviceContext,
    replacesTokenId?: number,
  ): Promise<TokenPair> {
    const payload: AccessTokenPayload = { sub: userId, uuid, status };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const inserted = await db
      .insertInto('refresh_tokens')
      .values({
        user_id: userId,
        token_hash: tokenHash,
        device_label: device.deviceLabel ?? null,
        ip_address: device.ipAddress,
        user_agent: device.userAgent,
        expires_at: toMysqlDatetime(expiresAt),
      })
      .executeTakeFirstOrThrow();

    if (replacesTokenId) {
      await db
        .updateTable('refresh_tokens')
        .set({ replaced_by_token_id: Number(inserted.insertId) })
        .where('id', '=', replacesTokenId)
        .execute();
    }

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  // -- Refresh (rotation) ----------------------------------------------

  async refresh(rawRefreshToken: string, device: DeviceContext): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(rawRefreshToken);

    const existing = await db
      .selectFrom('refresh_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // REPLAY DETECTION: a revoked token being presented again means either
    // the legitimate client raced itself, or the token was stolen and both
    // parties are now using it. Treat as compromise -- revoke every active
    // token for this user and force full re-login everywhere.
    if (existing.revoked_at) {
      await db
        .updateTable('refresh_tokens')
        .set({ revoked_at: toMysqlDatetime(new Date()) })
        .where('user_id', '=', existing.user_id)
        .where('revoked_at', 'is', null)
        .execute();
      throw new UnauthorizedException(
        'Refresh token reuse detected -- all sessions revoked, please log in again',
      );
    }

    if (new Date(existing.expires_at) < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', existing.user_id)
      .executeTakeFirst();

    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    await db
      .updateTable('refresh_tokens')
      .set({ last_used_at: toMysqlDatetime(new Date()) })
      .where('id', '=', existing.id)
      .execute();

    return this.issueTokenPair(
      user.id,
      user.uuid,
      user.status,
      device.deviceLabel ? device : { ...device, deviceLabel: existing.device_label },
      existing.id,
    );
  }

  // -- Logout / session management ------------------------------------

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    await db
      .updateTable('refresh_tokens')
      .set({ revoked_at: toMysqlDatetime(new Date()) })
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .execute();
  }

  async listActiveSessions(userId: number) {
    return db
      .selectFrom('refresh_tokens')
      .select([
        'id',
        'device_label',
        'ip_address',
        'user_agent',
        'issued_at',
        'last_used_at',
        'expires_at',
      ])
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .orderBy('last_used_at', 'desc')
      .execute();
  }

  async revokeSession(userId: number, sessionId: number): Promise<void> {
    const result = await db
      .updateTable('refresh_tokens')
      .set({ revoked_at: toMysqlDatetime(new Date()) })
      .where('id', '=', sessionId)
      .where('user_id', '=', userId) // ownership check -- can't revoke someone else's session
      .where('revoked_at', 'is', null)
      .execute();

    if (result.length === 0 || result[0].numUpdatedRows === 0n) {
      throw new ForbiddenException('Session not found or already revoked');
    }
  }

  // -- Failed-attempt / lockout bookkeeping ----------------------------

  private async registerFailedAttempt(userId: number): Promise<void> {
    const existing = await db
      .selectFrom('account_lockouts')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!existing) {
      await db
        .insertInto('account_lockouts')
        .values({ user_id: userId, failed_attempts: 1 })
        .execute();
      return;
    }

    const newCount = existing.failed_attempts + 1;
    const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;

    await db
      .updateTable('account_lockouts')
      .set({
        failed_attempts: newCount,
        ...(shouldLock
          ? { locked_at: toMysqlDatetime(new Date()), unlocked_at: null }
          : {}),
      })
      .where('user_id', '=', userId)
      .execute();
  }

  private async clearFailedAttempts(userId: number): Promise<void> {
    await db
      .updateTable('account_lockouts')
      .set({ failed_attempts: 0, locked_at: null, unlocked_at: null })
      .where('user_id', '=', userId)
      .execute();
  }

  private async recordLoginAttempt(
    userId: number | null,
    emailAttempted: string,
    device: DeviceContext,
    status: 'SUCCESS' | 'FAILED' | 'LOCKED',
  ): Promise<void> {
    await db
      .insertInto('login_history')
      .values({
        user_id: userId,
        email_attempted: emailAttempted,
        ip_address: device.ipAddress,
        device: device.userAgent,
        location: null, // IP geolocation deferred -- not in scope for this pass
        status,
      })
      .execute();
  }
}
