// backend/src/modules/photographer-profiles/photographer-profiles.service.ts
//
// Module 06 -- Photographer Profiles & Portfolios (spec 06.1, 06.2)
//
// Phase 2a scope:
//   - Photographer directory: ACTIVE members with PUBLIC profile visibility
//     who are DIRECTORY-ELIGIBLE (directory-eligibility.policy.ts: profile
//     photo + completion >= 50% + >= 5 public portfolio photographs) --
//     enforced only once the profile-completion definition is approved.
//     Eligibility gates LISTING only -- getPhotographer() and the public
//     profile route are unchanged (see listProfilePaths()).
//   - Photographer detail: profile + recognition + social handles + photo count.
//   - Portfolio = gallery photos (curated pinning is a Phase 3 hub feature).
//
// MEM-006 PUBLIC DOMAIN POLICY (confirmed Jul 2026):
//   Constitutional class badges ARE shown on photographer profile pages.
//   (e.g. "Founding Member" badge on Rajnish's profile is correct.)
//   Class names are hidden only on join/membership WORKFLOW pages (/join, /membership).
//   PUBLIC_CLASS_MASK maps all classes to descriptive tokens for the frontend badge component.
//
// PHOTO COUNT (directory card, Most/Fewest Photos sort):
//   PUBLICLY_ELIGIBLE_PORTFOLIO_COUNT (PROFILE-ARCH-001 §3) -- ACTIVE, PUBLIC,
//   show_in_portfolio photographs exposed by the MEM-008 exposure path
//   (entitlement, cap, portfolio_selected, over-cap fail-closed). Computed in
//   the row query as a correlated subquery so sorting by it is SQL-side.
//
// FILTER / SORT vocabulary: directory-listing.policy.ts.

import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../../database/db';
import { ikUrl, COVER_DELIVERY_TR, AVATAR_DELIVERY_TR } from '../shared/storage/imagekit.util';
import { PortfolioExposureService, exposedPhotoPredicate } from '../gallery/portfolio-exposure.service';
import type { ExposureSet } from '../gallery/portfolio-exposure.policy';
import { DirectoryEligibilityService, directoryBaseQuery } from './directory-eligibility.service';
import { GalleryService } from '../gallery/gallery.service';
import { countCurrentMembers } from '../membership/current-members.query';
import { findBadgeQualifiedUserIds } from '../identity/distinctions/photographic-distinction-badge';
import { getPublicDistinctions } from '../identity/distinctions/photographic-distinction-public';
import {
  buildDisplayName,
  suppressedTitleRegex,
  newSeed,
  HONORARY_RECOGNITION_CODES,
  LEGACY_MEMBER_CLASS_CODE,
  type DirectoryFilter,
  type DirectorySort,
} from './directory-listing.policy';

const P_COLS = { owner: 'photos.owner_user_id', selected: 'photos.portfolio_selected', id: 'photos.id' };

// ---------------------------------------------------------------------------
// Class token map -- returned in API response as `memberClass`
// Frontend badge component uses these tokens for colours and labels.
// Constitutional classes show their real token (not masked to 'member').
// ---------------------------------------------------------------------------
const PUBLIC_CLASS_MASK: Record<string, string> = {
  BASIC_MEMBER:      'basic',
  STUDENT_MEMBER:    'student',
  INDIVIDUAL_MEMBER: 'individual',
  INDIVIDUAL_BIENNIAL: 'individual', // MEM-008 §5: 2-year term of Individual, same public class
  FULL_MEMBER:       'full',
  LIFE_MEMBER:       'life',
  PATRON_MEMBER:     'patron',
  FOUNDING_MEMBER:   'founding',
  LEGACY_MEMBER:     'legacy',   // MEM-008 §2: Legacy Member Badge / Legacy Recognition
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

/**
 * SQL mirror of buildDisplayName() (directory-listing.policy.ts), used as the
 * Name A–Z / Z–A sort key so ordering follows the name the card displays
 * (many full_name values carry a baked-in "Mr." / "Mrs." / "Dr." prefix).
 */
const DR_PREFIX_REGEX = '^Dr\\. ';

function displayNameSortKey() {
  const name = sql`TRIM(COALESCE(u.full_name, ''))`;
  return sql`CASE
    WHEN REGEXP_LIKE(${name}, ${suppressedTitleRegex()}, 'c')
      THEN TRIM(SUBSTRING(${name}, LOCATE(' ', ${name}) + 1))
    WHEN u.name_title = 'Dr.' AND NOT REGEXP_LIKE(${name}, ${DR_PREFIX_REGEX}, 'c')
      THEN CONCAT('Dr. ', ${name})
    ELSE ${name}
  END`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PhotographerProfilesService {
  constructor(
    private readonly exposure: PortfolioExposureService,
    private readonly eligibility: DirectoryEligibilityService,
    private readonly gallery: GalleryService,
  ) {}

  // =========================================================================
  // List photographers
  // =========================================================================

  async listPhotographers(opts: {
    limit:  number;
    offset: number;
    sort:   DirectorySort;
    filter?: DirectoryFilter;
    /** Random-order seed; generated when absent and echoed in meta. */
    seed?:  number | null;
    genre?: string;
    hasApprovedPhotos?: boolean;
  }) {
    const filter = opts.filter ?? 'all';
    const seed   = opts.sort === 'random' ? (opts.seed ?? newSeed()) : null;
    const meta   = (total: number) => ({
      total_count: total, limit: opts.limit, offset: opts.offset, sort: opts.sort, filter, seed,
    });

    // MEM-008: PUBLIC photographs are exposed per owner entitlement + cap.
    const exposureSet = await this.exposure.getExposureSet('PORTFOLIO');

    // Directory eligibility (profile photo + completion >= 50% + >= 5 public
    // portfolio photographs). Applied as a SQL id predicate on BOTH the count
    // and the row query so totals, pagination, sorting and filtering can
    // never surface an ineligible photographer. null = rule not enforced
    // yet (profile-completion definition pending): no eligibility filter.
    const eligibleIds = await this.eligibility.listableUserIds();
    if (eligibleIds !== null && eligibleIds.length === 0) {
      return { data: [], meta: meta(0) };
    }

    // Photography Distinctions: the canonical read-time badge predicate,
    // evaluated over the eligible population only (never widens it).
    let distinctionIds: number[] = [];
    if (filter === 'distinctions') {
      const candidates = eligibleIds ?? await this.eligibility.baseUserIds();
      distinctionIds = [...await findBadgeQualifiedUserIds(candidates)];
      if (distinctionIds.length === 0) return { data: [], meta: meta(0) };
    }

    const applyFilters = <QB extends { where: any }>(qb: QB): QB => {
      let q: any = eligibleIds === null ? qb : qb.where('u.id', 'in', eligibleIds);
      if (filter === 'active') {
        q = q.where('m.lifecycle_state', '=', 'ACTIVE');
      } else if (filter === 'legacy') {
        q = q.where('m.membership_class_id', 'in', (eb: any) =>
          eb.selectFrom('membership_classes')
            .where('code', '=', LEGACY_MEMBER_CLASS_CODE)
            .select('id'),
        );
      } else if (filter === 'honorary') {
        q = q.where((eb: any) =>
          eb.exists(
            eb.selectFrom('member_recognitions as mr')
              .whereRef('mr.membership_id', '=', 'm.id')
              .where('mr.status', '=', 'ACTIVE')
              .where('mr.recognition_code', 'in', HONORARY_RECOGNITION_CODES)
              .select('mr.id'),
          ),
        );
      } else if (filter === 'distinctions') {
        q = q.where('u.id', 'in', distinctionIds);
      }
      if (opts.hasApprovedPhotos) {
        q = q.where((eb: any) =>
          eb.exists(
            eb.selectFrom('photos')
              .whereRef('photos.owner_user_id', '=', 'u.id')
              .where('photos.status', '=', 'ACTIVE')
              .where('photos.visibility', '=', 'PUBLIC')
              .where('photos.show_in_portfolio', '=', true as any)
              .where((eb2: any) => exposedPhotoPredicate(eb2, P_COLS, exposureSet))
              .select('photos.id')
          )
        );
      }
      // Genre filter in SQL (previously applied in JS after LIMIT/OFFSET,
      // which made total_count and page contents inconsistent).
      if (opts.genre) {
        const genre = opts.genre;
        q = q.where((eb: any) =>
          eb.exists(
            eb.selectFrom('photos')
              .innerJoin('photo_tag_assignments as pta', 'pta.photo_id', 'photos.id')
              .innerJoin('photo_tags as pt', 'pt.id', 'pta.tag_id')
              .whereRef('photos.owner_user_id', '=', 'u.id')
              .where('photos.status', '=', 'ACTIVE')
              .where('pt.tag_key', '=', genre)
              .where('pt.category', '=', 'GENRE')
              .where('photos.visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'] as const)
              .where('photos.show_in_portfolio', '=', true as any)
              .where((eb2: any) => eb2.or([
                eb2('photos.visibility', '!=', 'PUBLIC'),
                exposedPhotoPredicate(eb2, P_COLS, exposureSet),
              ]))
              .select('photos.id')
          )
        );
      }
      return q;
    };

    // ------------------------------------------------------------------
    // Total count
    // ------------------------------------------------------------------
    const countRow = await applyFilters(directoryBaseQuery())
      .select(eb => eb.fn.count<number>('u.id').as('total'))
      .executeTakeFirst();

    const total = Number(countRow?.total ?? 0);

    if (total === 0) {
      return { data: [], meta: meta(0) };
    }

    // ------------------------------------------------------------------
    // Row fetch -- one query. The photo count is a correlated subquery so
    // the photo sorts run in SQL under LIMIT/OFFSET (no N+1, no JS re-sort).
    // ------------------------------------------------------------------
    let rowQ = applyFilters(directoryBaseQuery())
      .innerJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .leftJoin('user_avatars as av', join =>
        join
          .onRef('av.user_id', '=', 'u.id')
          .on('av.size_variant', '=', 'ORIGINAL'),
      )
      .select([
        'u.id',
        'u.username',
        'u.full_name',
        'u.name_title',
        'u.bio',
        'u.tagline',
        'u.city',
        'm.join_year',
        'mc.code as class_code',
        'av.r2_key as avatar_r2_key',
      ])
      .select(eb =>
        eb.selectFrom('photos')
          .whereRef('photos.owner_user_id', '=', 'u.id')
          .where('photos.status', '=', 'ACTIVE')
          .where('photos.visibility', '=', 'PUBLIC')
          .where('photos.show_in_portfolio', '=', true as any)
          .where(eb2 => exposedPhotoPredicate(eb2, P_COLS, exposureSet))
          .select(eb2 => eb2.fn.countAll<number>().as('n'))
          .as('photo_count'),
      );

    // Every order ends on u.id (unique) so offset pages never overlap or skip.
    switch (opts.sort) {
      case 'random':
        rowQ = rowQ.orderBy(sql`CRC32(CONCAT(${seed}, ':', u.id))`, 'asc').orderBy('u.id', 'asc');
        break;
      case 'newest':
      case 'earliest': {
        const dir = opts.sort === 'newest' ? 'desc' : 'asc';
        rowQ = rowQ
          .orderBy(sql`m.join_year IS NULL`, 'asc') // undated last in both directions
          .orderBy('m.join_year', dir)
          .orderBy('m.join_month', dir)
          .orderBy('m.number_serial', dir)
          .orderBy('u.id', dir);
        break;
      }
      case 'photos_desc':
      case 'photos_asc':
        rowQ = rowQ
          .orderBy(sql`photo_count`, opts.sort === 'photos_desc' ? 'desc' : 'asc')
          .orderBy(displayNameSortKey(), 'asc')
          .orderBy('u.id', 'asc');
        break;
      case 'name_desc':
        rowQ = rowQ.orderBy(displayNameSortKey(), 'desc').orderBy('u.id', 'desc');
        break;
      case 'name_asc':
      default:
        rowQ = rowQ.orderBy(displayNameSortKey(), 'asc').orderBy('u.id', 'asc');
        break;
    }

    const rows = await rowQ.limit(opts.limit).offset(opts.offset).execute();

    // Phase 2B: post-nominals for the whole page in ONE set-based query.
    const distinctions = await getPublicDistinctions(rows.map(r => Number(r.id)));

    return {
      data: rows.map(r => ({
        id:          r.id,
        username:    r.username!,
        displayName: buildDisplayName(r.full_name, r.name_title ?? null),
        tagline:     r.tagline ?? null,
        bio:         r.bio ?? null,
        city:        r.city ?? null,
        memberClass: maskClass(r.class_code),
        memberSince: r.join_year ?? null,
        photoCount:  Number(r.photo_count ?? 0),
        avatarUrl:   r.avatar_r2_key ? ikUrl(r.avatar_r2_key, AVATAR_DELIVERY_TR) : null,
        postNominals: (distinctions.get(Number(r.id)) ?? []).map(d => d.code),
      })),
      meta: meta(total),
    };
  }

  // =========================================================================
  // Directory statistics -- independent of any directory filter or sort.
  //
  //   totalMembers      canonical current-member count (ACTIVE individual
  //                     memberships) -- the same query behind /api/v1/stats.
  //   activePortfolios  photographers the public directory lists (base gates
  //                     + PROFILE-ARCH-001 eligibility).
  //   photosInShowcase  photographs in the public Showcase pool
  //                     (GalleryService.countShowcasePhotos, MEM-008 GALLERY).
  // =========================================================================

  async getDirectoryStats() {
    const [totalMembers, eligibleIds, photosInShowcase] = await Promise.all([
      countCurrentMembers(),
      this.eligibility.listableUserIds(),
      this.gallery.countShowcasePhotos(),
    ]);
    const activePortfolios = eligibleIds !== null
      ? eligibleIds.length
      : (await this.eligibility.baseUserIds()).length;
    return { data: { totalMembers, activePortfolios, photosInShowcase } };
  }
  // =========================================================================
  // Public profile paths (static build of /photographers/:username/)
  //
  // Directory eligibility gates LISTING, not profile visibility. Before the
  // eligibility rule, profile pages were pre-rendered from the directory
  // list; this keeps exactly that pre-eligibility population (PUBLIC profile
  // + ACTIVE classed membership) so an unlisted photographer's public profile
  // keeps its static page, metadata and sitemap entry. Returns slugs only --
  // no directory card data.
  // =========================================================================

  async listProfilePaths() {
    const rows = await directoryBaseQuery()
      .select(['u.id', 'u.username'])
      .distinct()
      .orderBy('u.id', 'asc')
      .execute();
    return { data: rows.map(r => ({ id: r.id, username: r.username! })) };
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
          .on('av.size_variant', '=', 'ORIGINAL'),
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
        'u.name_title',
        'u.bio',
        'u.city',
        'u.state',
        'u.experience_level',
        'u.profile_visibility',
        'u.gallery_layout',
        'u.tagline',
        'u.website_url',
        'u.photography_genres',
        'u.areas_of_expertise',
        'u.favourite_subjects',
        'u.preferred_camera_system',
        'u.awards_html',
        'm.id as membership_id',
        'm.join_year',
        'm.membership_number',
        'mc.code as class_code',
        'av.r2_key as avatar_r2_key',
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
      .select(['r2_key'])
      .where('user_id', '=', user.id)
      .where('is_active', '=', true)
      .executeTakeFirst();

    // Gear
    const gearRows = await db
      .selectFrom('user_gear')
      .select(['gear_type', 'label'])
      .where('user_id', '=', user.id)
      .execute();

    // Awards
    const awardRows = await db
      .selectFrom('user_awards')
      .select(['award_name', 'awarding_body', 'award_year', 'description'])
      .where('user_id', '=', user.id)
      .orderBy('sort_order', 'asc')
      .execute();

    // Photography society titles (FIP, PSA, FIAP, GPU, OTHER)
    // Phase 2B: structured, self-declared Photographic Distinctions (public
    // fields only). Read after the PRIVATE gate above, so it never widens it.
    const photographicDistinctions = (await getPublicDistinctions([Number(user.id)])).get(Number(user.id)) ?? [];

    const titleRows = await db
      .selectFrom('user_photo_titles')
      .select(['body_code', 'title_code', 'body_name'])
      .where('user_id', '=', user.id)
      .orderBy('sort_order', 'asc')
      .execute();

    // Photo count (MEM-008: PUBLIC photographs only while exposed)
    const ownSet = await this.exposure.getExposureSet('PORTFOLIO', [user.id]);
    const countRow = await db
      .selectFrom('photos')
      .where('owner_user_id', '=', user.id)
      .where('status', '=', 'ACTIVE')
      .where('visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'] as const)
      .where('show_in_portfolio', '=', true as any)
      .where(eb => eb.or([
        eb('visibility', '!=', 'PUBLIC'),
        exposedPhotoPredicate(eb, { owner: 'owner_user_id', selected: 'portfolio_selected', id: 'id' }, ownSet),
      ]))
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
        displayName:           buildDisplayName(user.full_name, user.name_title ?? null),
        tagline:               user.tagline ?? null,
        bio:                   user.bio ?? null,
        city:                  user.city ?? null,
        state:                 user.state ?? null,
        experienceLevel:       user.experience_level ?? null,
        memberClass:           maskClass(user.class_code),
        memberSince:           user.join_year ?? null,
        photoCount:            Number(countRow?.cnt ?? 0),
        avatarUrl:             user.avatar_r2_key ? ikUrl(user.avatar_r2_key, AVATAR_DELIVERY_TR) : null,
        coverUrl:              cover ? ikUrl(cover.r2_key, COVER_DELIVERY_TR) : null,
        websiteUrl:            user.website_url ?? null,
        photographyGenres:     (user.photography_genres as unknown as string[] | null) ?? [],
        areasOfExpertise:      (user.areas_of_expertise as unknown as string[] | null) ?? [],
        favouriteSubjects:     (user.favourite_subjects as unknown as string[] | null) ?? [],
        preferredCameraSystem: user.preferred_camera_system ?? null,
        galleryLayout: (user as any).gallery_layout ?? 'justified',
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
        awards: awardRows.map(a => ({
          name:         a.award_name,
          awardingBody: a.awarding_body ?? null,
          year:         a.award_year ?? null,
          description:  a.description ?? null,
        })),
        awardsHtml: (user as any).awards_html ?? null,
        photoTitles: titleRows.map(t => ({
          bodyCode: t.body_code,
          bodyName: t.body_name ?? t.body_code,
          titleCode: t.title_code,
        })),
        photographicDistinctions,
      },
    };
  }
}
