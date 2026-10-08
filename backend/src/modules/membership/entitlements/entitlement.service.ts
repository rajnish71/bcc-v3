// backend/src/modules/membership/entitlements/entitlement.service.ts
//
// Spec 02.10 entitlement resolution -- three layers, applied in order:
//   1. class_entitlements       (base, keyed by the membership's class)
//   2. recognition_modifiers    (for each ACTIVE recognition on the
//                                membership; overwrites base per key)
//   3. individual_overrides     (non-expired only; GRANT sets/replaces a
//                                key, REVOKE removes it entirely)
//
// Resolution returns both the flat resolved map and a provenance breakdown
// so admin UIs can show WHY a member has an entitlement.
//
// INTERPRETATION FLAG (multiple active recognitions): the single-active-
// recognition rule is enforced at the DB layer (member_recognitions
// generated-column unique index), so layer 2 can only ever contribute from
// at most one recognition -- no modifier-ordering ambiguity exists today. If
// that DB rule is ever relaxed, modifier precedence between recognitions
// becomes an open question that must go back to governance, not be decided
// here silently.

import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../../../database/db';
import { logMembershipAudit } from '../shared/membership-audit.util';
import { applyEntitlementLayers } from './entitlement-layers';
import { RECOGNITION_CLASS_CODES } from '../recognition/senior-status.reader';

export interface ResolvedEntitlements {
  membershipId: number;
  resolved: Record<string, string>;
  provenance: Array<{
    key: string;
    value: string | null;
    source: 'CLASS' | 'RECOGNITION' | 'OVERRIDE_GRANT' | 'OVERRIDE_REVOKE';
    detail: string;
  }>;
}

@Injectable()
export class EntitlementService {
  async resolve(membershipId: number): Promise<ResolvedEntitlements> {
    const membership = await db
      .selectFrom('memberships')
      .select(['id', 'owner_type', 'membership_class_id', 'group_membership_type_id'])
      .where('id', '=', membershipId)
      .executeTakeFirst();
    if (!membership) throw new NotFoundException('Membership record not found.');

    const resolved: Record<string, string> = {};
    const provenance: ResolvedEntitlements['provenance'] = [];

    // Layer 1 -- base. MEM-006's frozen formula names this term
    // "Base(Membership Class)"; post-0026 (Option B separation) the base for
    // a GROUP-owned membership is its group type's config, which fills the
    // same slot in the formula without making group types classes.
    // A Family/Corporate member's own record (0105: INDIVIDUAL, no class,
    // group_membership_type_id set) takes the same group-type base as the
    // group relationship itself -- never a membership class (MEM-006).
    if (membership.group_membership_type_id !== null) {
      const groupRows = await db
        .selectFrom('group_type_entitlements')
        .select(['entitlement_key', 'entitlement_value'])
        .where('group_membership_type_id', '=', membership.group_membership_type_id)
        .execute();
      for (const row of groupRows) {
        resolved[row.entitlement_key] = row.entitlement_value;
        provenance.push({
          key: row.entitlement_key,
          value: row.entitlement_value,
          source: 'CLASS',
          detail: `group_type_entitlements (group_type_id=${membership.group_membership_type_id})`,
        });
      }
    } else if (membership.membership_class_id !== null) {
      const classRows = await db
        .selectFrom('class_entitlements')
        .select(['entitlement_key', 'entitlement_value'])
        .where('membership_class_id', '=', membership.membership_class_id)
        .execute();
      for (const row of classRows) {
        resolved[row.entitlement_key] = row.entitlement_value;
        provenance.push({
          key: row.entitlement_key,
          value: row.entitlement_value,
          source: 'CLASS',
          detail: `class_entitlements (class_id=${membership.membership_class_id})`,
        });
      }
    }

    // Layer 2 -- active Recognition Class modifiers. WP5: only Recognition
    // Classes are considered here, in a deterministic order (oldest row
    // first, so a later row overwrites an earlier one). Whether a Senior
    // Status Overlay contributes entitlement modifiers, and in what order,
    // is an UNDECIDED governance question and is not encoded here.
    const modifierRows = await db
      .selectFrom('member_recognitions as mr')
      .innerJoin('recognition_modifiers as rm', 'rm.recognition_code', 'mr.recognition_code')
      .select(['rm.entitlement_key', 'rm.modifier_value', 'mr.recognition_code'])
      .where('mr.membership_id', '=', membershipId)
      .where('mr.status', '=', 'ACTIVE')
      .where('mr.recognition_code', 'in', [...RECOGNITION_CLASS_CODES])
      .orderBy('mr.id', 'asc')
      .execute();
    for (const row of modifierRows) {
      resolved[row.entitlement_key] = row.modifier_value;
      provenance.push({
        key: row.entitlement_key,
        value: row.modifier_value,
        source: 'RECOGNITION',
        detail: row.recognition_code,
      });
    }

    // Layer 3 -- individual overrides (non-expired)
    const now = new Date();
    const overrideRows = await db
      .selectFrom('individual_overrides')
      .select(['entitlement_key', 'override_type', 'override_value', 'reason', 'expires_at'])
      .where('membership_id', '=', membershipId)
      .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
      .execute();
    for (const row of overrideRows) {
      if (row.override_type === 'REVOKE') {
        delete resolved[row.entitlement_key];
        provenance.push({
          key: row.entitlement_key,
          value: null,
          source: 'OVERRIDE_REVOKE',
          detail: row.reason,
        });
      } else {
        resolved[row.entitlement_key] = row.override_value;
        provenance.push({
          key: row.entitlement_key,
          value: row.override_value,
          source: 'OVERRIDE_GRANT',
          detail: row.reason,
        });
      }
    }

    return { membershipId, resolved, provenance };
  }

  // Batch form of resolve() for many memberships at once, restricted to a
  // set of keys. Same three layers, same order (applyEntitlementLayers), but
  // 5 queries total instead of 3 per membership -- used by public-exposure
  // filtering, which must evaluate every photographer per request.
  // Returns flat resolved maps only (no provenance).
  async resolveMany(membershipIds: number[], keys: string[]): Promise<Map<number, Record<string, string>>> {
    const out = new Map<number, Record<string, string>>();
    if (membershipIds.length === 0) return out;

    const memberships = await db
      .selectFrom('memberships')
      .select(['id', 'owner_type', 'membership_class_id', 'group_membership_type_id'])
      .where('id', 'in', membershipIds)
      .execute();

    const classIds = [...new Set(memberships.filter((m) => m.group_membership_type_id === null && m.membership_class_id !== null).map((m) => m.membership_class_id as number))];
    const groupIds = [...new Set(memberships.filter((m) => m.group_membership_type_id !== null).map((m) => m.group_membership_type_id as number))];

    const [classRows, groupRows, modifierRows, overrideRows] = await Promise.all([
      classIds.length
        ? db.selectFrom('class_entitlements')
            .select(['membership_class_id', 'entitlement_key', 'entitlement_value'])
            .where('membership_class_id', 'in', classIds)
            .where('entitlement_key', 'in', keys)
            .execute()
        : Promise.resolve([]),
      groupIds.length
        ? db.selectFrom('group_type_entitlements')
            .select(['group_membership_type_id', 'entitlement_key', 'entitlement_value'])
            .where('group_membership_type_id', 'in', groupIds)
            .where('entitlement_key', 'in', keys)
            .execute()
        : Promise.resolve([]),
      db.selectFrom('member_recognitions as mr')
        .innerJoin('recognition_modifiers as rm', 'rm.recognition_code', 'mr.recognition_code')
        .select(['mr.membership_id', 'rm.entitlement_key', 'rm.modifier_value'])
        .where('mr.membership_id', 'in', membershipIds)
        .where('mr.status', '=', 'ACTIVE')
        .where('mr.recognition_code', 'in', [...RECOGNITION_CLASS_CODES])
        .where('rm.entitlement_key', 'in', keys)
        .orderBy('mr.id', 'asc')
        .execute(),
      db.selectFrom('individual_overrides')
        .select(['membership_id', 'entitlement_key', 'override_type', 'override_value', 'expires_at'])
        .where('membership_id', 'in', membershipIds)
        .where('entitlement_key', 'in', keys)
        .execute(),
    ]);

    const now = new Date();
    for (const m of memberships) {
      const isGroup = m.group_membership_type_id !== null;
      const base = isGroup
        ? groupRows
            .filter((r) => r.group_membership_type_id === m.group_membership_type_id)
            .map((r) => ({ key: r.entitlement_key, value: r.entitlement_value }))
        : classRows
            .filter((r) => r.membership_class_id === m.membership_class_id)
            .map((r) => ({ key: r.entitlement_key, value: r.entitlement_value }));
      const mods = modifierRows
        .filter((r) => Number(r.membership_id) === Number(m.id))
        .map((r) => ({ key: r.entitlement_key, value: r.modifier_value }));
      const overrides = overrideRows
        .filter((r) => Number(r.membership_id) === Number(m.id))
        .map((r) => ({
          key: r.entitlement_key,
          type: r.override_type as 'GRANT' | 'REVOKE',
          value: r.override_value,
          expiresAt: r.expires_at ? new Date(r.expires_at as unknown as string) : null,
        }));
      out.set(Number(m.id), applyEntitlementLayers(base, mods, overrides, now));
    }
    return out;
  }

  // Convenience for other services (renewal engine uses this for
  // renewal_term_months / grace_period_days): resolve a single key for a
  // membership's CLASS only -- config keys are class-level policy and are
  // deliberately read from layer 1 alone, not the full three-layer stack.
  // (An individual override changing someone's renewal term would be a
  // governance action nobody has authorised; don't let layer 3 do it
  // implicitly.)
  async getClassConfigValue(membershipClassId: number, key: string): Promise<string | null> {
    const row = await db
      .selectFrom('class_entitlements')
      .select('entitlement_value')
      .where('membership_class_id', '=', membershipClassId)
      .where('entitlement_key', '=', key)
      .executeTakeFirst();
    return row?.entitlement_value ?? null;
  }

  // GROUP-side twin of getClassConfigValue -- same layer-1-only policy
  // reading, same rationale (renewal/grace/max_delegates are type-level
  // policy, never overridable via layer 3).
  async getGroupTypeConfigValue(groupMembershipTypeId: number, key: string): Promise<string | null> {
    const row = await db
      .selectFrom('group_type_entitlements')
      .select('entitlement_value')
      .where('group_membership_type_id', '=', groupMembershipTypeId)
      .where('entitlement_key', '=', key)
      .executeTakeFirst();
    return row?.entitlement_value ?? null;
  }

  // ---- Admin mutations (all audited) ----------------------------------

  async setClassEntitlement(
    membershipClassId: number,
    key: string,
    value: string,
    actorUserId: number,
  ): Promise<void> {
    await db
      .insertInto('class_entitlements')
      .values({ membership_class_id: membershipClassId, entitlement_key: key, entitlement_value: value })
      .onDuplicateKeyUpdate({ entitlement_value: value })
      .execute();

    await logMembershipAudit({
      membershipId: null,
      eventType: 'CLASS_ENTITLEMENT_SET',
      actorType: 'ADMIN',
      actorUserId,
      newValue: { membershipClassId, key, value },
    });
  }

  async removeClassEntitlement(membershipClassId: number, key: string, actorUserId: number): Promise<void> {
    await db
      .deleteFrom('class_entitlements')
      .where('membership_class_id', '=', membershipClassId)
      .where('entitlement_key', '=', key)
      .execute();

    await logMembershipAudit({
      membershipId: null,
      eventType: 'CLASS_ENTITLEMENT_REMOVED',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { membershipClassId, key },
    });
  }

  async setGroupTypeEntitlement(
    groupMembershipTypeId: number,
    key: string,
    value: string,
    actorUserId: number,
  ): Promise<void> {
    await db
      .insertInto('group_type_entitlements')
      .values({ group_membership_type_id: groupMembershipTypeId, entitlement_key: key, entitlement_value: value })
      .onDuplicateKeyUpdate({ entitlement_value: value })
      .execute();

    await logMembershipAudit({
      membershipId: null,
      eventType: 'GROUP_TYPE_ENTITLEMENT_SET',
      actorType: 'ADMIN',
      actorUserId,
      newValue: { groupMembershipTypeId, key, value },
    });
  }

  async removeGroupTypeEntitlement(groupMembershipTypeId: number, key: string, actorUserId: number): Promise<void> {
    await db
      .deleteFrom('group_type_entitlements')
      .where('group_membership_type_id', '=', groupMembershipTypeId)
      .where('entitlement_key', '=', key)
      .execute();

    await logMembershipAudit({
      membershipId: null,
      eventType: 'GROUP_TYPE_ENTITLEMENT_REMOVED',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { groupMembershipTypeId, key },
    });
  }

  async setRecognitionModifier(
    recognitionCode:
      | 'SENIOR_MEMBER'
      | 'HONORARY_SENIOR_MEMBER'
      | 'HONORARY_MEMBER'
      | 'HONORARY_MENTOR'
      | 'HONORARY_GRANDMASTER',
    key: string,
    value: string,
    actorUserId: number,
  ): Promise<void> {
    await db
      .insertInto('recognition_modifiers')
      .values({ recognition_code: recognitionCode, entitlement_key: key, modifier_value: value })
      .onDuplicateKeyUpdate({ modifier_value: value })
      .execute();

    await logMembershipAudit({
      membershipId: null,
      eventType: 'RECOGNITION_MODIFIER_SET',
      actorType: 'ADMIN',
      actorUserId,
      newValue: { recognitionCode, key, value },
    });
  }

  async grantOverride(
    membershipId: number,
    key: string,
    overrideType: 'GRANT' | 'REVOKE',
    value: string,
    reason: string,
    actorUserId: number,
    expiresAt?: string | null,
  ): Promise<void> {
    await db
      .insertInto('individual_overrides')
      .values({
        membership_id: membershipId,
        entitlement_key: key,
        override_type: overrideType,
        override_value: value,
        reason,
        expires_at: expiresAt ?? null,
        created_by_user_id: actorUserId,
      })
      .execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'INDIVIDUAL_OVERRIDE_CREATED',
      actorType: 'ADMIN',
      actorUserId,
      newValue: { key, overrideType, value, expiresAt: expiresAt ?? null },
      notes: reason,
    });
  }

  async removeOverride(overrideId: number, actorUserId: number): Promise<void> {
    const existing = await db
      .selectFrom('individual_overrides')
      .selectAll()
      .where('id', '=', overrideId)
      .executeTakeFirst();
    if (!existing) throw new NotFoundException('Override not found.');

    await db.deleteFrom('individual_overrides').where('id', '=', overrideId).execute();

    await logMembershipAudit({
      membershipId: existing.membership_id,
      eventType: 'INDIVIDUAL_OVERRIDE_REMOVED',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { key: existing.entitlement_key, overrideType: existing.override_type, value: existing.override_value },
    });
  }
}
