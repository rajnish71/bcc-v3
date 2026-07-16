// backend/src/modules/membership/hub/hub-membership.service.ts
//
// Self-service membership application and renewal for authenticated users.
// Two flows:
//   APPLICATION — USER role, no active/pending membership
//   RENEWAL     — user has ACTIVE or APPROVED membership in renewal window
//
// CONSTITUTIONAL GUARDS (enforced here):
//   year_joined_bcc is NEVER updated by any method in this service.
//   Membership number is never issued here — PENDING state only.
//   MEM-006: Only Basic membership type on self-service form.
//   MEM-007: No BCCTemp number assigned here.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import type { SubmitMembershipFormDto } from '../dto/submit-membership-form.dto';
import { normalize, validate } from '../../shared/phone.util';
import { findUserByPhone } from '../../shared/phone-lookup.util';

const BASIC_MEMBER_CODE = 'BASIC_MEMBER';

@Injectable()
export class HubMembershipService {

  private async getBasicMemberClassId(): Promise<number> {
    const cls = await db
      .selectFrom('membership_classes')
      .select('id')
      .where('code', '=', BASIC_MEMBER_CODE)
      .executeTakeFirst();
    if (!cls) throw new NotFoundException('BASIC_MEMBER class not found in membership_classes');
    return cls.id;
  }

  private async getUserPrefill(userId: number) {
    const user = await db
      .selectFrom('users')
      .select([
        'full_name',
        'email',
        'phone',
        'city',
        'state',
        'address_line1',
        'address_line2',
        'pin_code',
        'date_of_birth',
        'gender',
      ])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async getActiveMembership(userId: number) {
    return db
      .selectFrom('memberships')
      .selectAll()
      .where('user_id', '=', userId)
      .where('owner_type', '=', 'INDIVIDUAL')
      .where('lifecycle_state', 'in', ['PENDING', 'APPROVED', 'ACTIVE'])
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
  }

  // ── Application flow (Variant A) ──────────────────────────────────────────

  async getApplicationPrefill(userId: number) {
    const [user, existing] = await Promise.all([
      this.getUserPrefill(userId),
      this.getActiveMembership(userId),
    ]);

    let applicationStatus: 'NONE' | 'PENDING' | 'ACTIVE' = 'NONE';
    let submittedAt: string | null = null;

    if (existing) {
      if (existing.lifecycle_state === 'ACTIVE' || existing.lifecycle_state === 'APPROVED') {
        applicationStatus = 'ACTIVE';
      } else if (existing.lifecycle_state === 'PENDING') {
        applicationStatus = 'PENDING';
        submittedAt = existing.applied_at ? toMysqlDatetime(new Date(existing.applied_at as unknown as string)) : null;
      }
    }

    return {
      fullName: user.full_name,
      email: user.email,
      phone: user.phone ? normalize(user.phone) : null,
      city: user.city ?? null,
      state: user.state ?? null,
      addressLine1: user.address_line1 ?? null,
      addressLine2: user.address_line2 ?? null,
      pinCode: user.pin_code ?? null,
      dateOfBirth: user.date_of_birth
        ? (user.date_of_birth as unknown as Date).toISOString().slice(0, 10)
        : null,
      gender: user.gender ?? null,
      applicationStatus,
      submittedAt,
    };
  }

  async submitApplication(
    userId: number,
    dto: SubmitMembershipFormDto,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    const existing = await this.getActiveMembership(userId);
    if (existing) {
      throw new ConflictException(
        existing.lifecycle_state === 'PENDING'
          ? 'You already have a pending membership application'
          : 'You already have an active membership',
      );
    }

    const canonical = normalize(dto.phone);
    if (!validate(canonical)) {
      throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
    }
    // Exclude the current user — they may already have this phone on their account.
    const phoneConflict = await findUserByPhone(canonical, userId);
    if (phoneConflict) {
      throw new ConflictException('This phone number is already registered to another account');
    }

    const classId = await this.getBasicMemberClassId();
    const membershipUuid = randomUUID();
    const now = toMysqlDatetime(new Date());

    await db.transaction().execute(async (trx) => {
      // 1. INSERT membership row (PENDING)
      await trx
        .insertInto('memberships')
        .values({
          uuid: membershipUuid,
          owner_type: 'INDIVIDUAL',
          user_id: userId,
          membership_class_id: classId,
          lifecycle_state: 'PENDING',
          applied_at: now,
        })
        .execute();

      // 2. UPDATE users — Step 1 editable fields only
      // year_joined_bcc is NEVER updated here (constitutional guard)
      await trx
        .updateTable('users')
        .set({
          phone: canonical,
          city: dto.city,
          state: dto.state,
          address_line1: dto.addressLine1,
          address_line2: dto.addressLine2 ?? null,
          pin_code: dto.pinCode,
          date_of_birth: dto.dateOfBirth,
          gender: dto.gender,
        })
        .where('id', '=', userId)
        .execute();

      // 3. INSERT consent audit record (append-only, never updated)
      await trx
        .insertInto('membership_consent_log')
        .values({
          user_id: userId,
          consent_type: 'APPLICATION',
          terms_version: dto.termsVersion,
          ip_address: ipAddress,
          user_agent: userAgent,
        })
        .execute();
    });

    return { success: true, submittedAt: now };
  }

  // ── Renewal flow (Variant B) ──────────────────────────────────────────────

  async getRenewalPrefill(userId: number) {
    const activeMembership = await db
      .selectFrom('memberships')
      .selectAll()
      .where('user_id', '=', userId)
      .where('owner_type', '=', 'INDIVIDUAL')
      .where('lifecycle_state', 'in', ['ACTIVE', 'APPROVED', 'EXPIRED'])
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    if (!activeMembership) {
      throw new ForbiddenException('No active or recently expired membership found');
    }

    const expiresAt = activeMembership.expires_at
      ? new Date(activeMembership.expires_at as unknown as string)
      : null;

    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const renewalEligible =
      activeMembership.lifecycle_state === 'EXPIRED' ||
      (expiresAt !== null && expiresAt <= sixtyDaysFromNow);

    let projectedNewExpiry: string | null = null;
    if (expiresAt) {
      const base = expiresAt > now ? expiresAt : now;
      const projected = new Date(base);
      projected.setFullYear(projected.getFullYear() + 1);
      projectedNewExpiry = projected.toISOString().slice(0, 10);
    }

    const user = await this.getUserPrefill(userId);

    return {
      fullName: user.full_name,
      email: user.email,
      phone: user.phone ? normalize(user.phone) : null,
      city: user.city ?? null,
      state: user.state ?? null,
      addressLine1: user.address_line1 ?? null,
      addressLine2: user.address_line2 ?? null,
      pinCode: user.pin_code ?? null,
      dateOfBirth: user.date_of_birth
        ? (user.date_of_birth as unknown as Date).toISOString().slice(0, 10)
        : null,
      gender: user.gender ?? null,
      applicationStatus: activeMembership.lifecycle_state as string,
      expiresAt: expiresAt ? expiresAt.toISOString().slice(0, 10) : null,
      renewalEligible,
      projectedNewExpiry,
    };
  }

  async submitRenewal(
    userId: number,
    dto: SubmitMembershipFormDto,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    const activeMembership = await db
      .selectFrom('memberships')
      .selectAll()
      .where('user_id', '=', userId)
      .where('owner_type', '=', 'INDIVIDUAL')
      .where('lifecycle_state', 'in', ['ACTIVE', 'APPROVED', 'EXPIRED'])
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    if (!activeMembership) {
      throw new ForbiddenException('No active or recently expired membership found for renewal');
    }

    const alreadyPending = await db
      .selectFrom('memberships')
      .select('id')
      .where('user_id', '=', userId)
      .where('owner_type', '=', 'INDIVIDUAL')
      .where('lifecycle_state', '=', 'PENDING')
      .executeTakeFirst();

    if (alreadyPending) {
      throw new ConflictException('You already have a pending renewal application');
    }

    const canonical = normalize(dto.phone);
    if (!validate(canonical)) {
      throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
    }
    const phoneConflict = await findUserByPhone(canonical, userId);
    if (phoneConflict) {
      throw new ConflictException('This phone number is already registered to another account');
    }

    const classId = await this.getBasicMemberClassId();
    const membershipUuid = randomUUID();
    const now = toMysqlDatetime(new Date());

    await db.transaction().execute(async (trx) => {
      // 1. INSERT new membership row (PENDING renewal)
      await trx
        .insertInto('memberships')
        .values({
          uuid: membershipUuid,
          owner_type: 'INDIVIDUAL',
          user_id: userId,
          membership_class_id: classId,
          lifecycle_state: 'PENDING',
          applied_at: now,
        })
        .execute();

      // 2. UPDATE users — Step 1 editable fields only
      // year_joined_bcc is NEVER updated here (constitutional guard)
      await trx
        .updateTable('users')
        .set({
          phone: canonical,
          city: dto.city,
          state: dto.state,
          address_line1: dto.addressLine1,
          address_line2: dto.addressLine2 ?? null,
          pin_code: dto.pinCode,
          date_of_birth: dto.dateOfBirth,
          gender: dto.gender,
        })
        .where('id', '=', userId)
        .execute();

      // 3. INSERT consent audit record (append-only, never updated)
      await trx
        .insertInto('membership_consent_log')
        .values({
          user_id: userId,
          consent_type: 'RENEWAL',
          terms_version: dto.termsVersion,
          ip_address: ipAddress,
          user_agent: userAgent,
        })
        .execute();
    });

    return { success: true, submittedAt: now };
  }
}
