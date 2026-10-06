// backend/src/modules/photographer-profiles/directory-eligibility.service.ts
//
// Public Photographer Directory eligibility -- the single authoritative
// data-loading service. Decision logic lives in directory-eligibility.policy.ts
// (pure, unit-tested); this file only loads data in batches.
//
// Consumers:
//   - PhotographerProfilesService.listPhotographers()  directory filtering (SQL id predicate)
//   - HubProfileService / GET /api/v1/hub/profile/directory-status  Members Hub status
//
// Inputs reused (no parallel logic):
//   profile photo     user_avatars ORIGINAL row -- the same row every public
//                     surface renders as avatarUrl. No row = initials fallback.
//   portfolio count   PUBLIC + ACTIVE + show_in_portfolio photographs exposed by
//                     PortfolioExposureService (MEM-008: entitlement, cap,
//                     portfolio_selected, over-cap fail-closed).
//   completion        computeProfileCompletion() (profile-completion.policy.ts,
//                     PROFILE-ARCH-001 §2) -- the single authoritative calculation.

import { Injectable } from '@nestjs/common';
import { db } from '../../database/db';
import { PortfolioExposureService, exposedPhotoPredicate } from '../gallery/portfolio-exposure.service';
import {
  decideDirectoryEligibility,
  isDirectoryRuleEnforced,
  type DirectoryEligibility,
} from './directory-eligibility.policy';
import { computeProfileCompletion, type ProfileCompletion } from './profile-completion.policy';

export interface DirectoryStatus extends DirectoryEligibility {
  /** false while a completion definition is pending: listing is not filtered. */
  ruleEnforced: boolean;
  /** Authoritative PROFILE-ARCH-001 completion result (per-element detail). */
  completion: ProfileCompletion;
}

/**
 * Base population of the public directory (unchanged pre-existing rules):
 * ACTIVE non-deleted user with a username, PUBLIC profile visibility, and an
 * ACTIVE classed membership. PRIVATE founding members never qualify.
 */
export function directoryBaseQuery() {
  return db
    .selectFrom('users as u')
    .innerJoin('memberships as m', 'm.user_id', 'u.id')
    .where('u.status', '=', 'ACTIVE')
    .where('u.deleted_at', 'is', null)
    .where('u.profile_visibility', '=', 'PUBLIC')
    .where('u.username', 'is not', null)
    .where('m.lifecycle_state', '=', 'ACTIVE')
    .where('m.membership_class_id', 'is not', null);
}

@Injectable()
export class DirectoryEligibilityService {
  constructor(private readonly exposure: PortfolioExposureService) {}

  /** User ids in the directory base population (before eligibility). */
  async baseUserIds(): Promise<number[]> {
    const rows = await directoryBaseQuery().select('u.id').distinct().execute();
    return rows.map(r => Number(r.id));
  }

  /**
   * User ids the public directory may list, or null when the rule is not
   * enforced yet (completion definition pending) -- callers then apply no
   * eligibility filter, preserving the pre-existing listing.
   */
  async listableUserIds(): Promise<number[] | null> {
    if (!isDirectoryRuleEnforced()) return null;
    const ids = await this.baseUserIds();
    const statuses = await this.getStatuses(ids);
    return ids.filter(id => statuses.get(id)?.directoryEligible === true);
  }

  /** Eligibility for each given user (batched). */
  async getStatuses(userIds: number[]): Promise<Map<number, DirectoryStatus>> {
    const out = new Map<number, DirectoryStatus>();
    if (userIds.length === 0) return out;

    const [users, avatars, covers, gear, socials, portfolio] = await Promise.all([
      db.selectFrom('users')
        .select(['id', 'bio', 'city', 'tagline', 'preferred_camera_system', 'website_url', 'photography_genres'])
        .where('id', 'in', userIds)
        .execute(),
      // HAS_VALID_PROFILE_PHOTO: the established public avatar definition
      // (directory card + getPhotographer render avatarUrl from this row).
      db.selectFrom('user_avatars')
        .select('user_id')
        .where('user_id', 'in', userIds)
        .where('size_variant', '=', 'ORIGINAL')
        .where('r2_key', '!=', '')
        .execute(),
      // Active-cover semantics as getPhotographer() / HubProfileService.getProfile().
      db.selectFrom('user_cover_photos')
        .select('user_id')
        .where('user_id', 'in', userIds)
        .where('is_active', '=', true)
        .execute(),
      db.selectFrom('user_gear')
        .select(['user_id', 'gear_type'])
        .where('user_id', 'in', userIds)
        .execute(),
      db.selectFrom('user_social_handles')
        .select(['user_id', 'platform', 'handle_or_url'])
        .where('user_id', 'in', userIds)
        .execute(),
      this.publicPortfolioCounts(userIds),
    ]);

    const avatarSet = new Set(avatars.map(r => Number(r.user_id)));
    const coverSet  = new Set(covers.map(r => Number(r.user_id)));
    const gearBy    = new Map<number, string[]>();
    for (const g of gear) {
      const id = Number(g.user_id);
      gearBy.set(id, [...(gearBy.get(id) ?? []), String(g.gear_type)]);
    }
    const socialBy = new Map<number, Array<{ platform: string; handle: unknown }>>();
    for (const h of socials) {
      const id = Number(h.user_id);
      socialBy.set(id, [...(socialBy.get(id) ?? []), { platform: String(h.platform), handle: h.handle_or_url }]);
    }
    const ruleEnforced = isDirectoryRuleEnforced();

    for (const u of users) {
      const id = Number(u.id);
      const completion = computeProfileCompletion({
        bio:                   u.bio,
        city:                  u.city,
        tagline:               u.tagline,
        preferredCameraSystem: u.preferred_camera_system,
        websiteUrl:            u.website_url,
        photographyGenres:     u.photography_genres,
        gearTypes:             gearBy.get(id) ?? [],
        socialHandles:         socialBy.get(id) ?? [],
        hasActiveCover:        coverSet.has(id),
      });
      out.set(id, {
        ...decideDirectoryEligibility(avatarSet.has(id), ruleEnforced ? completion : null, portfolio.get(id) ?? 0),
        ruleEnforced,
        completion,
      });
    }
    return out;
  }

  async getStatus(userId: number): Promise<DirectoryStatus | null> {
    return (await this.getStatuses([userId])).get(userId) ?? null;
  }

  /**
   * Why this user can never be listed regardless of eligibility, or null when
   * they are in the directory base population.
   */
  async notListedReason(userId: number): Promise<'NO_ACTIVE_MEMBERSHIP' | 'PROFILE_VISIBILITY' | null> {
    const inBase = await directoryBaseQuery().where('u.id', '=', userId).select('u.id').executeTakeFirst();
    if (inBase) return null;
    const membership = await db
      .selectFrom('memberships')
      .select('id')
      .where('user_id', '=', userId)
      .where('lifecycle_state', '=', 'ACTIVE')
      .where('membership_class_id', 'is not', null)
      .executeTakeFirst();
    return membership ? 'PROFILE_VISIBILITY' : 'NO_ACTIVE_MEMBERSHIP';
  }

  /**
   * PUBLIC photographs a non-owner can see on the public portfolio, per owner.
   * MEMBERS_ONLY photographs are not public and never count here.
   */
  private async publicPortfolioCounts(userIds: number[]): Promise<Map<number, number>> {
    const set = await this.exposure.getExposureSet('PORTFOLIO', userIds);
    const rows = await db
      .selectFrom('photos')
      .where('owner_user_id', 'in', userIds)
      .where('status', '=', 'ACTIVE')
      .where('visibility', '=', 'PUBLIC')
      .where('show_in_portfolio', '=', true as any)
      .where(eb => exposedPhotoPredicate(eb, { owner: 'owner_user_id', selected: 'portfolio_selected', id: 'id' }, set))
      .groupBy('owner_user_id')
      .select(['owner_user_id'])
      .select(eb => eb.fn.count<number>('id').as('cnt'))
      .execute();
    return new Map(rows.map(r => [Number(r.owner_user_id), Number(r.cnt)]));
  }
}
