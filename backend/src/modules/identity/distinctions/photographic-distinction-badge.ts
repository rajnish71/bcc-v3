// backend/src/modules/identity/distinctions/photographic-distinction-badge.ts
//
// BCC Distinguished Photographer Badge -- derived at READ TIME only.
//
//   QUALIFIED(user) :=
//       EXISTS ACTIVE membership for user
//       AND EXISTS DECLARED distinction for user
//           WHERE distinction.is_active AND distinction.badge_eligible
//             AND institution.is_active
//
// There is no badge table, no stored badge state, no award/revocation: the
// badge disappears the moment any condition stops holding. It is NOT a
// Membership Category, Recognition Class, Status Overlay, RBAC role or
// entitlement, and nothing here reads member_recognitions.
//
// Membership semantics are the existing ones (session-mapper.ts,
// portfolio-exposure.service.ts): a memberships row owned by the user with
// lifecycle_state = 'ACTIVE', any membership class. Only INDIVIDUAL-owned
// rows count -- a Family/Corporate member's own record is INDIVIDUAL with
// user_id set (0105) and qualifies; a GROUP-owned relationship row is a
// group/entity record and never qualifies.

import type { Kysely } from 'kysely';
import { db, type DB } from '../../../database/db';

export const BCC_DISTINGUISHED_PHOTOGRAPHER_BADGE = 'BCC Distinguished Photographer Badge';

/** mysql2 returns TINYINT(1) as 0/1; accept either representation. */
export function flag(value: unknown): boolean {
  return value === true || Number(value) === 1;
}

export interface BadgeMembershipFact {
  owner_type: 'INDIVIDUAL' | 'GROUP';
  lifecycle_state: string;
}

export interface BadgeDeclarationFact {
  state: string;
  distinction_is_active: unknown;
  badge_eligible: unknown;
  institution_is_active: unknown;
}

export function hasQualifyingMembership(memberships: BadgeMembershipFact[]): boolean {
  return memberships.some((m) => m.owner_type === 'INDIVIDUAL' && m.lifecycle_state === 'ACTIVE');
}

export function isQualifyingDeclaration(d: BadgeDeclarationFact): boolean {
  return (
    d.state === 'DECLARED' &&
    flag(d.distinction_is_active) &&
    flag(d.badge_eligible) &&
    flag(d.institution_is_active)
  );
}

export function isBadgeQualified(
  memberships: BadgeMembershipFact[],
  declarations: BadgeDeclarationFact[],
): boolean {
  return hasQualifyingMembership(memberships) && declarations.some(isQualifyingDeclaration);
}

/**
 * Returns the subset of userIds that currently qualify. Two reads, then the
 * pure predicate above -- so the tested rule is the production rule.
 */
export async function findBadgeQualifiedUserIds(
  userIds: number[],
  executor: Kysely<DB> = db,
): Promise<Set<number>> {
  const qualified = new Set<number>();
  const ids = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return qualified;

  const declarations = await executor
    .selectFrom('user_photographic_distinctions as upd')
    .innerJoin('photographic_distinctions as d', 'd.id', 'upd.distinction_id')
    .innerJoin('photographic_institutions as i', 'i.id', 'd.institution_id')
    .select([
      'upd.user_id as user_id',
      'upd.state as state',
      'd.is_active as distinction_is_active',
      'd.badge_eligible as badge_eligible',
      'i.is_active as institution_is_active',
    ])
    .where('upd.user_id', 'in', ids)
    .where('upd.state', '=', 'DECLARED')
    .execute();

  const declByUser = new Map<number, BadgeDeclarationFact[]>();
  for (const row of declarations) {
    if (!isQualifyingDeclaration(row)) continue;
    const uid = Number(row.user_id);
    declByUser.set(uid, [...(declByUser.get(uid) ?? []), row]);
  }
  if (declByUser.size === 0) return qualified;

  const memberships = await executor
    .selectFrom('memberships')
    .select(['user_id', 'owner_type', 'lifecycle_state'])
    .where('user_id', 'in', [...declByUser.keys()])
    .where('lifecycle_state', '=', 'ACTIVE')
    .execute();

  const memByUser = new Map<number, BadgeMembershipFact[]>();
  for (const m of memberships) {
    if (m.user_id === null) continue;
    const uid = Number(m.user_id);
    memByUser.set(uid, [...(memByUser.get(uid) ?? []), m]);
  }

  for (const [uid, decls] of declByUser) {
    if (isBadgeQualified(memByUser.get(uid) ?? [], decls)) qualified.add(uid);
  }
  return qualified;
}
