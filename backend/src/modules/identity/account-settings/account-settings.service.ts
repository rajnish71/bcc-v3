import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';
import { db } from '../../../database/db';
import { generateOpaqueToken, hashToken, toMysqlDatetime } from '../shared/token-hash.util';
import { CommunicationService } from '../../shared/communication/communication.service';
import type { UpdateNameDto } from './dto/update-name.dto';
import type { UpdatePasswordDto } from './dto/update-password.dto';
import type { InitiateEmailChangeDto } from './dto/initiate-email-change.dto';

const EMAIL_CHANGE_TTL_HOURS = 24;

@Injectable()
export class AccountSettingsService {
  constructor(private readonly communicationService: CommunicationService) {}

  async getSettings(userId: number) {
    const row = await db
      .selectFrom('users')
      .select(['name_title', 'first_name', 'middle_name', 'last_name', 'full_name', 'username', 'email'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

    return {
      nameTitle:  row.name_title ?? null,
      firstName:  row.first_name ?? null,
      middleName: row.middle_name ?? null,
      lastName:   row.last_name ?? null,
      fullName:   row.full_name,
      username:   row.username ?? null,
      email:      row.email ?? null,
    };
  }

  async updateName(userId: number, dto: UpdateNameDto) {
    const parts = [dto.nameTitle, dto.firstName, dto.middleName, dto.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    await db
      .updateTable('users')
      .set({
        name_title:   dto.nameTitle ?? null,
        first_name:   dto.firstName,
        middle_name:  dto.middleName ?? null,
        last_name:    dto.lastName,
        full_name:    parts,
      })
      .where('id', '=', userId)
      .execute();

    return { fullName: parts };
  }

  async initiateEmailChange(userId: number, dto: InitiateEmailChangeDto) {
    const user = await db
      .selectFrom('users')
      .select(['email'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

    if (user.email?.toLowerCase() === dto.newEmail.toLowerCase()) {
      throw new BadRequestException('New email must differ from current email');
    }

    // Check if email already taken by another user
    const existing = await db
      .selectFrom('users')
      .select(['id'])
      .where('email', '=', dto.newEmail.toLowerCase())
      .executeTakeFirst();

    if (existing) {
      throw new BadRequestException('This email address is already in use');
    }

    const rawToken  = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_HOURS * 60 * 60 * 1000);

    // Upsert: one pending change per user
    await db
      .insertInto('pending_email_changes')
      .values({
        user_id:    userId,
        new_email:  dto.newEmail.toLowerCase(),
        token_hash: tokenHash,
        expires_at: toMysqlDatetime(expiresAt),
      })
      .onDuplicateKeyUpdate({
        new_email:  dto.newEmail.toLowerCase(),
        token_hash: tokenHash,
        expires_at: toMysqlDatetime(expiresAt),
      })
      .execute();

    const baseUrl   = process.env.FRONTEND_BASE_URL ?? 'https://v3bcc.bhopal.info';
    const verifyUrl = `${baseUrl}/hub/account-settings/verify/?token=${rawToken}`;

    const nameRow = await db
      .selectFrom('users')
      .select(['first_name', 'full_name'])
      .where('id', '=', userId)
      .executeTakeFirst();

    const firstName = nameRow?.first_name || (nameRow?.full_name ?? '').split(' ')[0] || 'Member';

    this.communicationService
      .dispatch('ACCOUNT_EMAIL_CHANGE_VERIFY', userId, {
        first_name: firstName,
        new_email:  dto.newEmail,
        verify_url: verifyUrl,
      })
      .catch(err =>
        console.error('[AccountSettings] email change dispatch failed:', err),
      );

    return { sent: true };
  }

  async verifyEmailChange(token: string) {
    const tokenHash = hashToken(token);

    const row = await db
      .selectFrom('pending_email_changes')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundException('Verification link is invalid or has already been used');
    }

    if (new Date(String(row.expires_at)) < new Date()) {
      throw new BadRequestException('Verification link has expired. Please request a new one.');
    }

    await db
      .updateTable('users')
      .set({ email: row.new_email })
      .where('id', '=', row.user_id)
      .execute();

    await db
      .deleteFrom('pending_email_changes')
      .where('id', '=', row.id)
      .execute();

    return { verified: true, newEmail: row.new_email };
  }

  async updatePassword(userId: number, dto: UpdatePasswordDto) {
    const user = await db
      .selectFrom('users')
      .select(['password_hash'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

    if (!user.password_hash) {
      throw new BadRequestException('Account does not use password authentication');
    }

    // Support both argon2 and bcrypt (bcrypt for legacy accounts)
    let valid = false;
    try {
      const isBcrypt = user.password_hash.startsWith('$2a$') ||
                       user.password_hash.startsWith('$2b$') ||
                       user.password_hash.startsWith('$2y$');
      valid = isBcrypt
        ? await bcrypt.compare(dto.currentPassword, user.password_hash)
        : await argon2.verify(user.password_hash, dto.currentPassword);
    } catch {
      valid = false;
    }

    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await argon2.hash(dto.newPassword);

    await db
      .updateTable('users')
      .set({ password_hash: newHash })
      .where('id', '=', userId)
      .execute();

    return { updated: true };
  }
}
