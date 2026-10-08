// backend/src/modules/identity/distinctions/photographic-distinction-catalogue-audit.ts
//
// Pure mapping from a catalogue change to identity_audit_log events.
// Catalogue-level events ALWAYS carry targetUserId = null (0115): a
// catalogue change affects no individual, and the actor is never used as a
// stand-in target. updated_by_user_id on the catalogue row is a convenience
// column only -- the audit row is the record.
//
// One update can yield several events, so activation and badge-eligibility
// changes stay individually findable by action_type:
//   *_DEACTIVATED / *_REACTIVATED          is_active changed
//   PHOTOGRAPHIC_DISTINCTION_BADGE_ELIGIBILITY_CHANGED  (distinctions only)
//   *_UPDATED                              code / name / sort_order changed
//   *_DELETED                              unreferenced entry removed

import type { IdentityAuditEntry } from '../shared/identity-audit.util';
import { flag } from './photographic-distinction-badge';

export type CatalogueKind = 'INSTITUTION' | 'DISTINCTION';

const PREFIX: Record<CatalogueKind, string> = {
  INSTITUTION: 'PHOTOGRAPHIC_INSTITUTION',
  DISTINCTION: 'PHOTOGRAPHIC_DISTINCTION_CATALOGUE',
};

const PLAIN_FIELDS = ['code', 'display_code', 'name', 'sort_order'] as const;

export function catalogueCreatedEvent(
  kind: CatalogueKind,
  actorId: number,
  created: Record<string, unknown>,
): IdentityAuditEntry {
  return { actorId, targetUserId: null, actionType: `${PREFIX[kind]}_CREATED`, newValue: created };
}

export function catalogueDeletedEvent(
  kind: CatalogueKind,
  actorId: number,
  deleted: Record<string, unknown>,
): IdentityAuditEntry {
  return { actorId, targetUserId: null, actionType: `${PREFIX[kind]}_DELETED`, oldValue: deleted };
}

export function catalogueUpdateEvents(
  kind: CatalogueKind,
  actorId: number,
  id: number,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): IdentityAuditEntry[] {
  const events: IdentityAuditEntry[] = [];
  const base = { actorId, targetUserId: null } as const;

  const plainOld: Record<string, unknown> = {};
  const plainNew: Record<string, unknown> = {};
  for (const f of PLAIN_FIELDS) {
    if (f in after && after[f] !== before[f]) {
      plainOld[f] = before[f];
      plainNew[f] = after[f];
    }
  }
  if (Object.keys(plainNew).length > 0) {
    events.push({ ...base, actionType: `${PREFIX[kind]}_UPDATED`, oldValue: { id, ...plainOld }, newValue: { id, ...plainNew } });
  }

  if ('is_active' in after && flag(after.is_active) !== flag(before.is_active)) {
    events.push({
      ...base,
      actionType: `${PREFIX[kind]}_${flag(after.is_active) ? 'REACTIVATED' : 'DEACTIVATED'}`,
      oldValue: { id, is_active: flag(before.is_active) },
      newValue: { id, is_active: flag(after.is_active) },
    });
  }

  if (kind === 'DISTINCTION' && 'badge_eligible' in after && flag(after.badge_eligible) !== flag(before.badge_eligible)) {
    events.push({
      ...base,
      actionType: 'PHOTOGRAPHIC_DISTINCTION_BADGE_ELIGIBILITY_CHANGED',
      oldValue: { id, badge_eligible: flag(before.badge_eligible) },
      newValue: { id, badge_eligible: flag(after.badge_eligible) },
    });
  }

  return events;
}
