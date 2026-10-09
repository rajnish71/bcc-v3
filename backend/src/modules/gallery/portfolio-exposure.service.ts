// backend/src/modules/gallery/portfolio-exposure.service.ts
//
// MEM-008 public portfolio exposure -- the backend/service-layer authority for
// "which owners' PUBLIC photographs may a non-owner see?".
//
// Exposure depends on: ACTIVE membership -> resolved entitlements
// (EntitlementService: class + recognition + individual override) ->
// portfolio_enabled / public_gallery_enabled -> portfolio_max_photos cap ->
// member-selected slots. Decision logic lives in portfolio-exposure.policy.ts
// (pure, unit-tested); this file only loads data and builds SQL predicates.
//
// Scope:
//   PORTFOLIO  photo pages, photographer portfolio, static photo ids, related,
//              comments, activity gallery ...
//   GALLERY    club-wide public feed / genre chips (needs public_gallery_enabled)
//
// Applies to photos whose visibility is PUBLIC only. MEMBERS_ONLY / PRIVATE /
// UNLISTED are not public exposure and keep their existing rules.

import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../../database/db';
import { EntitlementService } from '../membership/entitlements/entitlement.service';
import {
  ExposureScope,
  ExposureSet,
  OwnerExposure,
  PORTFOLIO_ENABLED_KEY,
  PORTFOLIO_MAX_PHOTOS_KEY,
  PUBLIC_GALLERY_ENABLED_KEY,
  buildExposureSet,
  exposureFromResolved,
  mergeExposures,
  NO_EXPOSURE,
  setAllowsPhoto,
  withRecognitionPortfolio,
} from './portfolio-exposure.policy';
import { RECOGNITION_CLASS_CODES, SeniorStatusReader } from '../membership/recognition/senior-status.reader';

const EXPOSURE_KEYS = [PORTFOLIO_ENABLED_KEY, PUBLIC_GALLERY_ENABLED_KEY, PORTFOLIO_MAX_PHOTOS_KEY];

/**
 * SQL predicate: photo (already restricted to visibility = PUBLIC by the caller)
 * belongs to an owner exposed by `set`. Use inside `.where(eb => ...)`.
 */
export function exposedPhotoPredicate(
  eb: any,
  cols: { owner: string; selected: string; id: string },
  set: ExposureSet,
) {
  const owners: any[] = [];
  if (set.uncappedOwnerIds.length > 0) owners.push(eb(cols.owner, 'in', set.uncappedOwnerIds));
  const selectedOnly = [...set.cappedOwnerIds, ...set.selectionRequiredOwnerIds];
  if (selectedOnly.length > 0) {
    owners.push(eb.and([eb(cols.owner, 'in', selectedOnly), eb(cols.selected, '=', 1)]));
  }
  if (owners.length === 0) return sql<boolean>`1 = 0`;
  return eb.or(owners);
}

@Injectable()
export class PortfolioExposureService {
  constructor(private readonly entitlements: EntitlementService) {}

  /** Exposure of each given owner (or every owner with an ACTIVE membership). */
  async getOwnerExposures(ownerUserIds?: number[]): Promise<Map<number, OwnerExposure>> {
    const result = new Map<number, OwnerExposure>();
    if (ownerUserIds && ownerUserIds.length === 0) return result;

    let q = db
      .selectFrom('memberships')
      .select(['id', 'user_id'])
      .where('lifecycle_state', '=', 'ACTIVE')
      .where('user_id', 'is not', null);
    if (ownerUserIds) q = q.where('user_id', 'in', ownerUserIds);
    const memberships = await q.execute();

    const resolved = await this.entitlements.resolveMany(
      memberships.map((m) => Number(m.id)),
      EXPOSURE_KEYS,
    );

    const perUser = new Map<number, OwnerExposure[]>();
    for (const m of memberships) {
      const uid = Number(m.user_id);
      const list = perUser.get(uid) ?? [];
      list.push(exposureFromResolved(resolved.get(Number(m.id)) ?? {}));
      perUser.set(uid, list);
    }
    for (const [uid, list] of perUser) result.set(uid, mergeExposures(list));

    await this.applyRecognitionPortfolio(result, memberships, ownerUserIds);
    return result;
  }

  /**
   * MEM-008 Amendment 002: Senior Member and the four Recognition Classes carry
   * an Unlimited Public Photographer Portfolio that needs no ACTIVE underlying
   * Membership and cannot be reduced by an Individual Override / restriction.
   * Applied after (and independent of) the entitlement layers, so no override
   * can lower it. Grants the portfolio only -- never public gallery, never
   * directory eligibility, never an automatic portfolio_selected.
   */
  private async applyRecognitionPortfolio(
    result: Map<number, OwnerExposure>,
    activeMemberships: Array<{ id: unknown; user_id: unknown }>,
    ownerUserIds?: number[],
  ): Promise<void> {
    const holders = await this.getRecognitionHolderIds(ownerUserIds);
    if (holders.size === 0) return;

    // Same memberships, resolved WITHOUT recognition modifiers: tells a
    // class/override-level uncapped member (selection irrelevant, as today)
    // from one who is uncapped only by recognition (selection still explicit).
    const holderMemberships = activeMemberships.filter((m) => holders.has(Number(m.user_id)));
    const resolvedBase = await this.entitlements.resolveMany(
      holderMemberships.map((m) => Number(m.id)),
      EXPOSURE_KEYS,
      { excludeRecognition: true },
    );
    const basePerUser = new Map<number, OwnerExposure[]>();
    for (const m of holderMemberships) {
      const uid = Number(m.user_id);
      const list = basePerUser.get(uid) ?? [];
      list.push(exposureFromResolved(resolvedBase.get(Number(m.id)) ?? {}));
      basePerUser.set(uid, list);
    }

    for (const uid of holders) {
      const base = basePerUser.get(uid);
      result.set(uid, withRecognitionPortfolio(result.get(uid), base ? mergeExposures(base) : undefined));
    }
  }

  /**
   * Users holding Senior Member status (overlay or legacy manual recognition,
   * via SeniorStatusReader) or an ACTIVE Honorary Member / Mentor /
   * Grandmaster / Honorary Senior recognition. The recognition's own membership
   * row may be in any lifecycle state: Recognition is not Membership.
   */
  private async getRecognitionHolderIds(ownerUserIds?: number[]): Promise<Set<number>> {
    const holders = new Set<number>();
    if (ownerUserIds && ownerUserIds.length === 0) return holders;

    let q = db
      .selectFrom('member_recognitions as mr')
      .innerJoin('memberships as m', 'm.id', 'mr.membership_id')
      .select('m.user_id')
      .distinct()
      .where('mr.status', '=', 'ACTIVE')
      .where('mr.recognition_code', 'in', [...RECOGNITION_CLASS_CODES])
      .where('m.user_id', 'is not', null);
    if (ownerUserIds) q = q.where('m.user_id', 'in', ownerUserIds);
    for (const r of await q.execute()) holders.add(Number(r.user_id));

    const wanted = ownerUserIds ? new Set(ownerUserIds) : null;
    for (const s of await new SeniorStatusReader().listActive()) {
      if (!wanted || wanted.has(s.userId)) holders.add(s.userId);
    }
    return holders;
  }

  async getOwnerExposure(ownerUserId: number): Promise<OwnerExposure> {
    return (await this.getOwnerExposures([ownerUserId])).get(ownerUserId) ?? NO_EXPOSURE;
  }

  /** Number of ACTIVE photographs the owner currently holds a slot with. */
  async countSelected(ownerUserId: number): Promise<number> {
    const row = await db
      .selectFrom('photos')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('owner_user_id', '=', ownerUserId)
      .where('status', '=', 'ACTIVE')
      .where('portfolio_selected', '=', true as any)
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  /** Owners exposed on `scope` (optionally limited to `ownerUserIds`). */
  async getExposureSet(scope: ExposureScope, ownerUserIds?: number[]): Promise<ExposureSet> {
    const owners = await this.getOwnerExposures(ownerUserIds);

    // Only capped owners need their selected ids (to detect an over-cap selection).
    const capped = [...owners.entries()]
      .filter(([, e]) => (scope === 'GALLERY' ? e.galleryEnabled : e.portfolioEnabled) && e.maxPhotos !== null)
      .map(([id]) => id);
    const selectedByOwner = new Map<number, number[]>();
    if (capped.length > 0) {
      const rows = await db
        .selectFrom('photos')
        .select(['id', 'owner_user_id'])
        .where('owner_user_id', 'in', capped)
        .where('status', '=', 'ACTIVE')
        .where('portfolio_selected', '=', true as any)
        .execute();
      for (const r of rows) {
        const uid = Number(r.owner_user_id);
        const list = selectedByOwner.get(uid) ?? [];
        list.push(Number(r.id));
        selectedByOwner.set(uid, list);
      }
    }
    return buildExposureSet(owners, scope, selectedByOwner);
  }

  /** Is this single PUBLIC photograph exposed to non-owners? */
  async isPhotoExposed(
    photo: { id: number; owner_user_id: number; portfolio_selected?: unknown },
    scope: ExposureScope = 'PORTFOLIO',
  ): Promise<boolean> {
    const ownerId = Number(photo.owner_user_id);
    const set = await this.getExposureSet(scope, [ownerId]);
    return setAllowsPhoto(set, {
      ownerId,
      id: Number(photo.id),
      selected: !!photo.portfolio_selected,
    });
  }
}
