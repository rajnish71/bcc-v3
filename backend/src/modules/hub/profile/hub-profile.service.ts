import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../../database/db';
import { R2Service } from '../../shared/storage/r2.service';
import { ikUrl, extFromMime } from '../../shared/storage/imagekit.util';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { UpdateSocialDto } from './dto/update-social.dto';
import type { UpdateGearDto } from './dto/update-gear.dto';
import type { UpdateDistinctionsDto } from './dto/update-distinctions.dto';

// Fields that must never be modified via the profile PUT endpoint
const PROTECTED_FIELDS = new Set([
  'username', 'email', 'full_name', 'name_title', 'first_name',
  'middle_name', 'last_name', 'year_joined_bcc',
  'membership_number', 'membership_tier',
]);

@Injectable()
export class HubProfileService {
  constructor(private readonly r2: R2Service) {}

  // ──────────────────────────────────────────────────────────────────────────
  // GET profile
  // ──────────────────────────────────────────────────────────────────────────

  async getProfile(userId: number) {
    const user = await db
      .selectFrom('users')
      .select([
        'id', 'username', 'email', 'full_name', 'name_title',
        'first_name', 'middle_name', 'last_name',
        'phone', 'gender', 'date_of_birth',
        'address_line1', 'address_line2', 'address_line3',
        'city', 'state', 'pin_code',
        'blood_group',
        'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
        'tagline', 'website_url', 'bio', 'awards_html',
        'photography_genres', 'areas_of_expertise', 'favourite_subjects',
        'preferred_camera_system', 'year_joined_bcc',
      ])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user) throw new NotFoundException('User not found');

    // Avatar — use ORIGINAL variant; fall back to THUMB
    const avatar = await db
      .selectFrom('user_avatars')
      .select(['imagekit_url', 'size_variant'])
      .where('user_id', '=', userId)
      .where(eb => eb.or([
        eb('size_variant', '=', 'ORIGINAL'),
        eb('size_variant', '=', 'THUMB'),
      ]))
      .orderBy(eb =>
        eb.case()
          .when('size_variant', '=', 'ORIGINAL').then(0)
          .else(1)
          .end()
      )
      .executeTakeFirst();

    // Active cover
    const cover = await db
      .selectFrom('user_cover_photos')
      .select(['imagekit_url'])
      .where('user_id', '=', userId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    // Active membership
    const membership = await db
      .selectFrom('memberships')
      .leftJoin('membership_classes', 'membership_classes.id', 'memberships.membership_class_id')
      .select([
        'memberships.membership_number',
        'memberships.activated_at',
        'membership_classes.name as class_name',
        'membership_classes.code as class_code',
      ])
      .where('memberships.user_id', '=', userId)
      .where('memberships.lifecycle_state', '=', 'ACTIVE')
      .executeTakeFirst();

    // Social handles
    const socialRows = await db
      .selectFrom('user_social_handles')
      .select(['platform', 'handle_or_url'])
      .where('user_id', '=', userId)
      .execute();

    // Gear
    const gearRows = await db
      .selectFrom('user_gear')
      .select(['gear_type', 'label'])
      .where('user_id', '=', userId)
      .execute();

    // Photo titles
    const titleRows = await db
      .selectFrom('user_photo_titles')
      .select(['body_code', 'title_code'])
      .where('user_id', '=', userId)
      .orderBy('sort_order', 'asc')
      .execute();

    // Internal BCC roles
    const roleRows = await db
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .select(['roles.name'])
      .where('user_roles.user_id', '=', userId)
      .where('roles.category', '=', 'OPERATIONAL')
      .where(eb => eb.or([
        eb('user_roles.valid_until', 'is', null),
        eb('user_roles.valid_until', '>', new Date() as any),
      ]))
      .execute();

    const roleNames = new Set(roleRows.map(r => r.name.toLowerCase()));

    // Stats
    const photoCount = await db
      .selectFrom('photos')
      .select(({ fn }) => [fn.countAll<number>().as('count')])
      .where('owner_user_id', '=', userId)
      .where('status', '=', 'ACTIVE')
      .executeTakeFirst();

    const eventCount = await db
      .selectFrom('event_registrations')
      .select(({ fn }) => [fn.countAll<number>().as('count')])
      .where('user_id', '=', userId)
      .where('status', '=', 'ATTENDED')
      .executeTakeFirst();

    // Assemble distinctions
    const groupByCode = (code: string) =>
      titleRows
        .filter(r => r.body_code === code)
        .map(r => r.title_code)
        .join(' ');
    const otherCodes = titleRows
      .filter(r => r.body_code === 'GPU' || r.body_code === 'OTHER')
      .map(r => r.title_code)
      .join(' ');

    // Assemble gear
    const bodies = gearRows.filter(g => g.gear_type === 'BODY').map(g => g.label);
    const lenses = gearRows.filter(g => g.gear_type === 'LENS').map(g => g.label);
    const accessories = gearRows.filter(g => g.gear_type === 'ACCESSORY').map(g => g.label);

    return {
      // Identity
      username: user.username,
      avatarUrl: avatar?.imagekit_url ?? null,
      coverUrl: cover?.imagekit_url ?? null,
      membershipTier: membership?.class_code ?? null,
      membershipNumber: membership?.membership_number ?? null,
      memberSince: membership?.activated_at ?? null,

      // Personal — name fields read-only
      fullName: user.full_name,
      nameTitle: user.name_title,
      firstName: user.first_name,
      middleName: user.middle_name,
      lastName: user.last_name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      dateOfBirth: user.date_of_birth,

      // Address
      addressLine1: user.address_line1,
      addressLine2: user.address_line2,
      addressLine3: user.address_line3,
      city: user.city,
      state: user.state,
      pinCode: user.pin_code,
      bloodGroup: user.blood_group,
      emergencyContactName: user.emergency_contact_name,
      emergencyContactPhone: user.emergency_contact_phone,
      emergencyContactRelationship: user.emergency_contact_relationship,

      // Public Profile
      tagline: user.tagline,
      websiteUrl: user.website_url,
      areasOfExpertise: (user.areas_of_expertise as string[] | null) ?? [],
      favouriteSubjects: (user.favourite_subjects as string[] | null) ?? [],
      preferredCameraSystem: user.preferred_camera_system,
      yearJoinedBcc: user.year_joined_bcc,
      photographyGenres: (user.photography_genres as string[] | null) ?? [],
      bio: user.bio,

      // Social links
      socialLinks: socialRows.map(s => ({ platform: s.platform, handle: s.handle_or_url })),

      // Equipment
      gear: { bodies, lenses, other: accessories },

      // Distinctions
      photoTitles: {
        fiap: groupByCode('FIAP'),
        fip: groupByCode('FIP'),
        psa: groupByCode('PSA'),
        other: otherCodes,
      },
      awardsHtml: user.awards_html,

      // Internal BCC
      internalRoles: {
        coordinator: roleNames.has('coordinator'),
        mentor: roleNames.has('mentor'),
        instructor: roleNames.has('instructor'),
        volunteer: roleNames.has('volunteer'),
      },

      // Stats
      stats: {
        memberSince: membership?.activated_at ?? null,
        membershipClass: membership?.class_name ?? null,
        portfolioCount: Number(photoCount?.count ?? 0),
        eventAttendance: Number(eventCount?.count ?? 0),
        contestAwards: 0,
        activityScore: 0,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUT profile — editable fields only
  // ──────────────────────────────────────────────────────────────────────────

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const updateData: Record<string, unknown> = {};

    if (dto.phone !== undefined) updateData.phone = dto.phone ?? null;
    if (dto.gender !== undefined) updateData.gender = dto.gender ?? null;
    if (dto.dateOfBirth !== undefined) updateData.date_of_birth = dto.dateOfBirth ? new Date(dto.dateOfBirth).toISOString().split('T')[0] : null;

    if (dto.addressLine1 !== undefined) updateData.address_line1 = dto.addressLine1 ?? null;
    if (dto.addressLine2 !== undefined) updateData.address_line2 = dto.addressLine2 ?? null;
    if (dto.addressLine3 !== undefined) updateData.address_line3 = dto.addressLine3 ?? null;
    if (dto.city !== undefined) updateData.city = dto.city ?? null;
    if (dto.state !== undefined) updateData.state = dto.state ?? null;
    if (dto.pinCode !== undefined) updateData.pin_code = dto.pinCode ?? null;
    if (dto.bloodGroup !== undefined) updateData.blood_group = dto.bloodGroup ?? null;
    if (dto.emergencyContactName !== undefined) updateData.emergency_contact_name = dto.emergencyContactName ?? null;
    if (dto.emergencyContactPhone !== undefined) updateData.emergency_contact_phone = dto.emergencyContactPhone ?? null;
    if (dto.emergencyContactRelationship !== undefined) updateData.emergency_contact_relationship = dto.emergencyContactRelationship ?? null;

    if (dto.tagline !== undefined) updateData.tagline = dto.tagline ?? null;
    if (dto.websiteUrl !== undefined) updateData.website_url = dto.websiteUrl ?? null;
    if (dto.areasOfExpertise !== undefined) updateData.areas_of_expertise = JSON.stringify(dto.areasOfExpertise ?? []);
    if (dto.favouriteSubjects !== undefined) updateData.favourite_subjects = JSON.stringify(dto.favouriteSubjects ?? []);
    if (dto.preferredCameraSystem !== undefined) updateData.preferred_camera_system = dto.preferredCameraSystem ?? null;
    if (dto.photographyGenres !== undefined) updateData.photography_genres = JSON.stringify(dto.photographyGenres ?? []);
    if (dto.bio !== undefined) updateData.bio = dto.bio ?? null;

    // Strip any protected fields that somehow slipped through
    for (const key of PROTECTED_FIELDS) delete updateData[key];

    if (Object.keys(updateData).length === 0) {
      return { saved: true, savedAt: new Date().toISOString() };
    }

    await db
      .updateTable('users')
      .set(updateData as any)
      .where('id', '=', userId)
      .execute();

    return { saved: true, savedAt: new Date().toISOString() };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUT /social — replace all social handles
  // ──────────────────────────────────────────────────────────────────────────

  async updateSocial(userId: number, dto: UpdateSocialDto) {
    await db.deleteFrom('user_social_handles').where('user_id', '=', userId).execute();

    const links = dto.links.filter(l => l.handle.trim().length > 0);
    if (links.length > 0) {
      await db
        .insertInto('user_social_handles')
        .values(links.map(l => ({
          user_id: userId,
          platform: l.platform as any,
          handle_or_url: l.handle.trim(),
        })))
        .execute();
    }

    return { saved: true, savedAt: new Date().toISOString() };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUT /gear — replace all equipment
  // ──────────────────────────────────────────────────────────────────────────

  async updateGear(userId: number, dto: UpdateGearDto) {
    await db.deleteFrom('user_gear').where('user_id', '=', userId).execute();

    const rows: { user_id: number; gear_type: 'BODY' | 'LENS' | 'ACCESSORY'; label: string }[] = [];
    for (const label of dto.bodies ?? []) {
      if (label.trim()) rows.push({ user_id: userId, gear_type: 'BODY', label: label.trim() });
    }
    for (const label of dto.lenses ?? []) {
      if (label.trim()) rows.push({ user_id: userId, gear_type: 'LENS', label: label.trim() });
    }
    for (const label of [...(dto.drones ?? []), ...(dto.other ?? [])]) {
      if (label.trim()) rows.push({ user_id: userId, gear_type: 'ACCESSORY', label: label.trim() });
    }

    if (rows.length > 0) {
      await db.insertInto('user_gear').values(rows).execute();
    }

    return { saved: true, savedAt: new Date().toISOString() };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUT /distinctions — replace photo titles + update awards_html
  // ──────────────────────────────────────────────────────────────────────────

  async updateDistinctions(userId: number, dto: UpdateDistinctionsDto) {
    // Clear all existing title rows for this user
    await db.deleteFrom('user_photo_titles').where('user_id', '=', userId).execute();

    const titleRows: { user_id: number; body_code: 'FIP' | 'PSA' | 'FIAP' | 'GPU' | 'OTHER'; title_code: string; sort_order: number }[] = [];

    const addTitles = (bodyCode: 'FIP' | 'PSA' | 'FIAP' | 'OTHER', text: string | undefined, baseSort: number) => {
      if (!text?.trim()) return;
      titleRows.push({ user_id: userId, body_code: bodyCode, title_code: text.trim(), sort_order: baseSort });
    };

    addTitles('FIAP', dto.fiap, 10);
    addTitles('FIP', dto.fip, 20);
    addTitles('PSA', dto.psa, 30);
    addTitles('OTHER', dto.other, 50);

    if (titleRows.length > 0) {
      await db.insertInto('user_photo_titles').values(titleRows).execute();
    }

    // Update awards_html on users
    if (dto.awardsHtml !== undefined) {
      await db
        .updateTable('users')
        .set({ awards_html: dto.awardsHtml ?? null })
        .where('id', '=', userId)
        .execute();
    }

    return { saved: true, savedAt: new Date().toISOString() };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /avatar/presign
  // ──────────────────────────────────────────────────────────────────────────

  async presignAvatar(userId: number, mimeType: string, fileSizeBytes: number) {
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const r2Key = `avatars/${userId}/${randomUUID()}.${ext}`;
    const uploadUrl = await this.r2.presignUpload(r2Key, mimeType, fileSizeBytes);
    return { uploadUrl, r2Key };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /avatar/confirm
  // ──────────────────────────────────────────────────────────────────────────

  async confirmAvatar(userId: number, r2Key: string) {
    const { exists } = await this.r2.headObject(r2Key);
    if (!exists) throw new BadRequestException('Avatar upload not found in storage');

    const imagekitUrl = ikUrl(r2Key);

    // Delete old ORIGINAL avatar row for this user
    await db
      .deleteFrom('user_avatars')
      .where('user_id', '=', userId)
      .where('size_variant', '=', 'ORIGINAL')
      .execute();

    // Insert new row
    await db
      .insertInto('user_avatars')
      .values({
        user_id: userId,
        size_variant: 'ORIGINAL',
        r2_key: r2Key,
        imagekit_url: imagekitUrl,
      })
      .execute();

    return { avatarUrl: imagekitUrl };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /cover/presign
  // ──────────────────────────────────────────────────────────────────────────

  async presignCover(userId: number, mimeType: string, fileSizeBytes: number) {
    if (fileSizeBytes > 10 * 1024 * 1024) throw new BadRequestException('Cover photo must be under 10 MB');
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const r2Key = `covers/${userId}/${randomUUID()}.${ext}`;
    const uploadUrl = await this.r2.presignUpload(r2Key, mimeType, fileSizeBytes);
    return { uploadUrl, r2Key };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /cover/confirm
  // ──────────────────────────────────────────────────────────────────────────

  async confirmCover(userId: number, r2Key: string) {
    const { exists } = await this.r2.headObject(r2Key);
    if (!exists) throw new BadRequestException('Cover upload not found in storage');

    const imagekitUrl = ikUrl(r2Key);

    // Deactivate all existing covers
    await db
      .updateTable('user_cover_photos')
      .set({ is_active: false })
      .where('user_id', '=', userId)
      .execute();

    // Insert new active cover
    await db
      .insertInto('user_cover_photos')
      .values({
        user_id: userId,
        r2_key: r2Key,
        imagekit_url: imagekitUrl,
        is_active: true,
      })
      .execute();

    return { coverUrl: imagekitUrl };
  }
}
