// backend/src/modules/identity/distinctions/photographic-distinction-public.ts
//
// Phase 2B -- public read of members' Photographic Distinctions for the
// Photographer Directory and public Photographer Profile.
//
// Read-only and set-based: ONE query for any number of user ids (no N+1).
// A declaration is publicly visible iff (HA decisions H1/H4):
//   user_photographic_distinctions.state = 'DECLARED'
//   AND photographic_distinctions.is_active
//   AND photographic_institutions.is_active
// No membership condition is added here: the existing public profile /
// directory visibility gates remain authoritative. badge_eligible does not
// affect display, and this is NOT the badge (getBadgeStatuses() is).
//
// Order (H2): institution.sort_order, then distinction.sort_order; codes
// break ties so equal sort_orders still render deterministically.
//
// Only the four approved public fields leave this module -- no ids, states,
// timestamps, audit data or badge flags. Self-declared and unverified.

import type { Kysely } from 'kysely';
import { db, type DB } from '../../../database/db';
import { flag } from './photographic-distinction-badge';

export interface PublicPhotographicDistinction {
  institutionCode: string;
  institutionName: string;
  /** Catalogue code, used as the post-nominal exactly as stored (H3). */
  code: string;
  name: string;
}

/** Every requested (valid) user id gets an entry, [] when it has none. */
export async function getPublicDistinctions(
  userIds: number[],
  executor: Kysely<DB> = db,
): Promise<Map<number, PublicPhotographicDistinction[]>> {
  const ids = [...new Set(userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const result = new Map<number, PublicPhotographicDistinction[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return result;

  const rows = await executor
    .selectFrom('user_photographic_distinctions as upd')
    .innerJoin('photographic_distinctions as d', 'd.id', 'upd.distinction_id')
    .innerJoin('photographic_institutions as i', 'i.id', 'd.institution_id')
    .select([
      'upd.user_id as user_id',
      'upd.state as state',
      'd.is_active as distinction_is_active',
      'i.is_active as institution_is_active',
      'i.code as institution_code',
      'i.name as institution_name',
      'i.sort_order as institution_sort',
      'd.sort_order as distinction_sort',
      'd.code as code',
      'd.name as name',
    ])
    .where('upd.user_id', 'in', ids)
    .where('upd.state', '=', 'DECLARED')
    .where('d.is_active', '=', true)
    .where('i.is_active', '=', true)
    .orderBy('i.sort_order', 'asc')
    .orderBy('i.code', 'asc')
    .orderBy('d.sort_order', 'asc')
    .orderBy('d.code', 'asc')
    .execute();

  // The same order is applied here as in SQL, so the contract does not depend
  // on the driver preserving it.
  const ordered = [...rows].sort((a, b) =>
    Number(a.institution_sort) - Number(b.institution_sort)
    || a.institution_code.localeCompare(b.institution_code)
    || Number(a.distinction_sort) - Number(b.distinction_sort)
    || a.code.localeCompare(b.code));

  for (const r of ordered) {
    // Defensive: the WHERE clause is the rule; never trust a row that breaks it.
    if (r.state !== 'DECLARED' || !flag(r.distinction_is_active) || !flag(r.institution_is_active)) continue;
    const list = result.get(Number(r.user_id));
    if (!list) continue;
    list.push({
      institutionCode: r.institution_code,
      institutionName: r.institution_name,
      code: r.code,
      name: r.name,
    });
  }
  return result;
}
