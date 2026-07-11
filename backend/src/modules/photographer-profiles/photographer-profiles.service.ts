// backend/src/modules/photographer-profiles/photographer-profiles.service.ts
//
// Module 06 -- Photographer Profiles & Portfolios (spec 06.1, 06.2)
//
// Phase 2a scope:
//   - Photographer directory: all ACTIVE members with PUBLIC profile visibility.
//   - Photographer detail: profile + recognition + social handles + photo count.
//   - Portfolio = gallery photos (curated pinning is a Phase 3 hub feature).
//
// MEM-006 PUBLIC DOMAIN POLICY (confirmed Jul 2026):
//   Constitutional class badges ARE shown on photographer profile pages.
//   (e.g. "Founding Member" badge on Rajnish's profile is correct.)
//   Class names are hidden only on join/membership WORKFLOW pages (/join, /membership).
//   PUBLIC_CLASS_MASK maps all classes to descriptive tokens for the frontend badge component.
//
// PHOTO COUNT:
//   Counts ACTIVE photos with PUBLIC or MEMBERS_ONLY visibility.
//   PRIVATE and UNLISTED photos are excluded from the public count.
//
// PHOTO SORT ('photos'):
//   For Phase 2a the photo-count sort fetches up to 1000 rows and sorts
//   in JS (dataset is tiny). Convert to a SQL subquery if membership grows large.

import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../../database/db';

// ---------------------------------------------------------------------------
// Class token map -- returned in API response as `memberClass`
// Frontend badge component uses these tokens for colours and labels.
// Constitutional classes show their real token (not masked to 'member').
// ---------------------------------------------------------------------------
const PUBLIC_CLASS_MASK: Record<string, string> = {
  BASIC_MEMBER:      'basic',
  STUDENT_MEMBER:    'student',
  INDIVIDUAL_MEMBER: 'individual',
  FULL_MEMBER:       'full',
  LIFE_MEMBER:       'life',
  PATRON_MEMBER:     'patron',
  FOUNDING_MEMBER:   'founding',
};

// Recognition display labels
const RECOGNITION_LABELS: Record<string, string> = {
  SENIOR_MEMBER:          'Senior Member',
  HONORARY_SENIOR_MEMBER: 'Honorary Senior Member',
  HONORARY_MEMBER:        'Honorary Member',
  HONORARY_MENTOR:        'Honorary Mentor',
  HONORARY_GRANDMASTER:   'Honorary Grandmaster',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskClass(code: unknown): string {
  return PUBLIC_CLASS_MASK[String(code)] ?? 'member';
}

async function batchPhotoCounts(userIds: number[]): Promise<Record<number, number>> {
  if (userIds.length === 0) return {};

  const rows = await db
    .selectFrom('photos')
    .where('owner_user_id', 'in', userIds)
    .where('status', '=', 'ACTIVE')
    .where('visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'] as const)
    .groupBy('owner_user_id')
    .select(['owner_user_id'])
    .select(eb => eb.fn.count<number>('id').as('cnt'))
    .execute();

  const map: Record<number, number> = {};
  for (const r of rows) {
    map[r.owner_user_id as number] = Number(r.cnt);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PhotographerProfilesService {

  // =========================================================================
  // List photographers
  // =========================================================================

  async listPhotographers(opts: {
    limit:  number;
    offset: number;
    sort:   'name' | 'photos' | 'joined';
    genre?: string;
    hasApprovedPhotos?: boolean;
  }) {
    // ------------------------------------------------------------------
    // Total count
    // ------------------------------------------------------------------
    let countQuery = db
      .selectFrom('users as u')
      .innerJoin('memberships as m', 'm.user_id', 'u.id')
      .where('u.status', '=', 'ACTIVE')
      .where('u.deleted_at', 'is', null)
      .where('u.profile_visibility', '=', 'PUBLIC')
      .where('u.username', 'is not', null)
      .where('m.lifecycle_state', '=', 'ACTIVE')
      .where('m.membership_class_id', 'is not', null);

    if (opts.hasApprovedPhotos) {
      countQuery = countQuery.where((eb) =>
        eb.exists(
          eb.selectFrom('photos')
            .whereRef('photos.owner_user_id', '=', 'u.id')
            .where('photos.status', '=', 'ACTIVE')
            .where('photos.visibility', '=', 'PUBLIC')
            .select('photos.id')
        )
      );
    }

    const countRow = await countQuery
      .select(eb => eb.fn.count<number>('u.id').as('total'))
      .executeTakeFirst();

    const total = Number(countRow?.total ?? 0);

    if (total === 0) {
      return { data: [], meta: { total_count: 0, limit: opts.limit, offset: opts.offset } };
    }

    // ------------------------------------------------------------------
    // Row fetch
    // ------------------------------------------------------------------
    const photoSort = opts.sort === 'photos';
    const dbLimit   = photoSort ? 1000 : opts.limit;
    const dbOffset  = photoSort ? 0    : opts.offset;

    let rowsQuery = db
      .selectFrom('users as u')
      .innerJoin('memberships as m', 'm.user_id', 'u.id')
      .innerJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .leftJoin('user_avatars as av', join =>
        join
          .onRef('av.user_id', '=', 'u.id')
          .on('av.size_variant', '=', 'MEDIUM'),
      )
      .where('u.status', '=', 'ACTIVE')
      .where('u.deleted_at', 'is', null)
      .where('u.profile_visibility', '=', 'PUBLIC')
      .where('u.username', 'is not', null)
      .where('m.lifecycle_state', '=', 'ACTIVE')
      .where('m.membership_class_id', 'is not', null);

    if (opts.hasApprovedPhotos) {
      rowsQuery = rowsQuery.where((eb) =>
        eb.exists(
          eb.selectFrom('photos')
            .whereRef('photos.owner_user_id', '=', 'u.id')
            .where('photos.status', '=', 'ACTIVE')
            .where('photos.visibility', '=', 'PUBLIC')
            .select('photos.id')
        )
      );
    }

    const rows = await rowsQuery
      .select([
        'u.id',
        'u.username',
        'u.full_name',
        'u.bio',
        'u.tagline',
        'u.city',
        'm.join_year',
        'mc.code as class_code',
        'av.imagekit_url as avatar_url',
      ])
      .orderBy(
        opts.sort === 'joined' ? 'm.join_year' : 'u.full_name',
        'asc',
      )
      .limit(dbLimit)
      .offset(dbOffset)
      .execute();

    if (rows.length === 0) {
      return { data: [], meta: { total_count: total, limit: opts.limit, offset: opts.offset } };
    }

    // ------------------------------------------------------------------
    // Photo counts (batched)
    // ------------------------------------------------------------------
    const userIds  = rows.map(r => r.id);
    const photoMap = await batchPhotoCounts(userIds);

    // ------------------------------------------------------------------
    // Optional genre filter
    // ------------------------------------------------------------------
    let genreSet: Set<number> | null = null;
    if (opts.genre) {
      const genreRows = await db
        .selectFrom('photos')
        .where('owner_user_id', 'in', userIds)
        .where('status', '=', 'ACTIVE')
        .where('genre', '=', opts.genre as any)
        .where('visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'] as const)
        .select('owner_user_id')
        .execute();
      genreSet = new Set(genreRows.map(r => r.owner_user_id as number));
    }

    // ------------------------------------------------------------------
    // Build result
    // ------------------------------------------------------------------
    let items = rows
      .filter(r => genreSet == null || genreSet.has(r.id))
      .map(r => ({
        id:          r.id,
        username:    r.username!,
        displayName: r.full_name,
        tagline:     r.tagline ?? null,
        bio:         r.bio ?? null,
        city:        r.city ?? null,
        memberClass: maskClass(r.class_code),
        memberSince: r.join_year ?? null,
        photoCount:  photoMap[r.id] ?? 0,
        avatarUrl:   r.avatar_url ?? null,
      }));

    if (photoSort) {
      items.sort((a, b) => b.photoCount - a.photoCount);
      items = items.slice(opts.offset, opts.offset + opts.limit);
    }

    return {
      data: items,
      meta: { total_count: total, limit: opts.limit, offset: opts.offset },
    };
  }

  // =========================================================================
  // Photographer detail by username
  // =========================================================================

  async getPhotographer(username: string) {
    const user = await db
      .selectFrom('users as u')
      .innerJoin('memberships as m', 'm.user_id', 'u.id')
      .innerJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .leftJoin('user_avatars as av', join =>
        join
          .onRef('av.user_id', '=', 'u.id')
          .on('av.size_variant', '=', 'MEDIUM'),
      )
      .where('u.username', '=', username)
      .where('u.status', '=', 'ACTIVE')
      .where('u.deleted_at', 'is', null)
      .where('m.lifecycle_state', '=', 'ACTIVE')
      .where('m.membership_class_id', 'is not', null)
      .select([
        'u.id',
        'u.username',
        'u.full_name',
        'u.bio',
        'u.city',
        'u.state',
        'u.experience_level',
        'u.profile_visibility',
        'u.tagline',
        'u.website_url',
        'u.photography_genres',
        'u.areas_of_expertise',
        'u.preferred_camera_system',
        'm.id as membership_id',
        'm.join_year',
        'm.membership_number',
        'mc.code as class_code',
        'av.imagekit_url as avatar_url',
      ])
      .executeTakeFirst();

    if (!user) throw new NotFoundException('Photographer not found.');
    if (user.profile_visibility === 'PRIVATE') throw new NotFoundException('Photographer not found.');

    // Active recognition
    const recognition = await db
      .selectFrom('member_recognitions')
      .where('membership_id', '=', user.membership_id as number)
      .where('status', '=', 'ACTIVE')
      .select(['recognition_code', 'track'])
      .executeTakeFirst();

    // Social handles
    const handleRows = await db
      .selectFrom('user_social_handles')
      .where('user_id', '=', user.id)
      .select(['platform', 'handle_or_url'])
      .execute();

    const socialHandles: Record<string, string> = {};
    for (const h of handleRows) {
      socialHandles[h.platform.toLowerCase()] = h.handle_or_url;
    }

    // Cover photo
    const cover = await db
      .selectFrom('user_cover_photos')
      .select(['imagekit_url'])
      .where('user_id', '=', user.id)
      .where('is_active', '=', true)
      .executeTakeFirst();

    // Gear
    const gearRows = await db
      .selectFrom('user_gear')
      .select(['gear_type', 'label'])
      .where('user_id', '=', user.id)
      .execute();

    // Photo count
    const countRow = await db
      .selectFrom('photos')
      .where('owner_user_id', '=', user.id)
      .where('status', '=', 'ACTIVE')
      .where('visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'] as const)
      .select(eb => eb.fn.count<number>('id').as('cnt'))
      .executeTakeFirst();

    // Founding member: serials 00001–00007 in BCC201911SSSSS format
    const mNum = user.membership_number ?? '';
    const serial = mNum.slice(9);
    const isFoundingMember = mNum.length >= 14 && serial >= '00001' && serial <= '00007';

    return {
      data: {
        id:                    user.id,
        username:              user.username!,
        displayName:           user.full_name,
        tagline:               user.tagline ?? null,
        bio:                   user.bio ?? null,
        city:                  user.city ?? null,
        state:                 user.state ?? null,
        experienceLevel:       user.experience_level ?? null,
        memberClass:           maskClass(user.class_code),
        memberSince:           user.join_year ?? null,
        photoCount:            Number(countRow?.cnt ?? 0),
        avatarUrl:             user.avatar_url ?? null,
        coverUrl:              cover?.imagekit_url ?? null,
        websiteUrl:            user.website_url ?? null,
        photographyGenres:     (user.photography_genres as unknown as string[] | null) ?? [],
        areasOfExpertise:      (user.areas_of_expertise as unknown as string[] | null) ?? [],
        preferredCameraSystem: user.preferred_camera_system ?? null,
        isFoundingMember,
        gear: {
          bodies:      gearRows.filter(g => g.gear_type === 'BODY').map(g => g.label),
          lenses:      gearRows.filter(g => g.gear_type === 'LENS').map(g => g.label),
          accessories: gearRows.filter(g => g.gear_type === 'ACCESSORY').map(g => g.label),
        },
        recognition: recognition
          ? {
              code:  recognition.recognition_code,
              label: RECOGNITION_LABELS[recognition.recognition_code] ?? recognition.recognition_code,
              track: recognition.track,
            }
          : null,
        socialHandles,
      },
    };
  }
}
