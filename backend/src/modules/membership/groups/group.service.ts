// backend/src/modules/membership/groups/group.service.ts
//
// Group entity + delegate CRUD (spec 02.3). MEM-006 Group Membership
// Principle: the entity holds the membership; delegates are individual
// Registered Users who receive access THROUGH it. Nothing here touches
// voting or governance -- group entities constitutionally have neither, and
// the schema gives them no columns to hold either.
//
// Authorization model:
//   * Any Registered User may create a group entity naming themselves
//     primary contact (creating an entity is not membership -- MEM-006 P1
//     parallel: the membership application is a separate step).
//   * The primary contact manages their own entity + delegates ("Delegate
//     addition/removal managed by primary holder", spec 02.3).
//   * Staff with group.entity.manage_any can manage any entity.
//
// max_delegates comes from group_type_entitlements keyed via the entity's
// type -> group_membership_types.entity_type. Values seeded in seed_0005
// are UNCONFIRMED placeholders (flagged there and in the session log).

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { EntitlementService } from '../entitlements/entitlement.service';
import { logMembershipAudit } from '../shared/membership-audit.util';

export type GroupEntityType = 'FAMILY' | 'CORPORATE' | 'INSTITUTIONAL';

@Injectable()
export class GroupService {
  constructor(private readonly entitlementService: EntitlementService) {}

  // ---- Authorization helper -------------------------------------------

  // Throws unless the actor is the entity's primary contact or holds the
  // staff permission (the controller passes canManageAny after RBAC check).
  private async requireManageRights(groupEntityId: number, actorUserId: number, canManageAny: boolean) {
    const group = await db
      .selectFrom('group_entities')
      .selectAll()
      .where('id', '=', groupEntityId)
      .executeTakeFirst();
    if (!group) throw new NotFoundException('Group entity not found.');
    if (!canManageAny && group.primary_contact_user_id !== actorUserId) {
      throw new ForbiddenException('Only the group primary contact or membership staff can manage this group.');
    }
    return group;
  }

  // ---- Entities ---------------------------------------------------------

  async createGroup(params: {
    type: GroupEntityType;
    name: string;
    primaryContactUserId: number;
    actorUserId: number;
  }): Promise<{ id: number; uuid: string }> {
    const contact = await db
      .selectFrom('users')
      .select('id')
      .where('id', '=', params.primaryContactUserId)
      .executeTakeFirst();
    if (!contact) throw new NotFoundException('Primary contact user not found.');

    const uuid = randomUUID();
    const inserted = await db
      .insertInto('group_entities')
      .values({
        uuid,
        type: params.type,
        name: params.name,
        primary_contact_user_id: params.primaryContactUserId,
      })
      .executeTakeFirstOrThrow();
    const id = Number(inserted.insertId);

    // The primary contact is also a delegate (spec 02.3: "Primary holder:
    // designated adult, manages delegates" -- the holder participates too).
    await db
      .insertInto('group_delegates')
      .values({ group_entity_id: id, user_id: params.primaryContactUserId, role: 'PRIMARY_CONTACT' })
      .execute();

    await logMembershipAudit({
      membershipId: null,
      eventType: 'GROUP_ENTITY_CREATED',
      actorType: params.actorUserId === params.primaryContactUserId ? 'MEMBER' : 'ADMIN',
      actorUserId: params.actorUserId,
      newValue: { groupEntityId: id, type: params.type, name: params.name },
    });

    return { id, uuid };
  }

  async updateGroup(
    groupEntityId: number,
    updates: { name?: string; primaryContactUserId?: number },
    actorUserId: number,
    canManageAny: boolean,
  ): Promise<void> {
    const group = await this.requireManageRights(groupEntityId, actorUserId, canManageAny);

    const set: Partial<{ name: string; primary_contact_user_id: number }> = {};
    if (updates.name !== undefined) set.name = updates.name;

    if (updates.primaryContactUserId !== undefined) {
      // New primary contact must already be an active delegate -- you hand
      // the keys to someone inside the group, not a stranger.
      const isDelegate = await db
        .selectFrom('group_delegates')
        .select('id')
        .where('group_entity_id', '=', groupEntityId)
        .where('user_id', '=', updates.primaryContactUserId)
        .where('removed_at', 'is', null)
        .executeTakeFirst();
      if (!isDelegate) {
        throw new ConflictException('The new primary contact must be an active delegate of this group first.');
      }
      set.primary_contact_user_id = updates.primaryContactUserId;
    }

    if (Object.keys(set).length === 0) return;

    await db.updateTable('group_entities').set(set).where('id', '=', groupEntityId).execute();

    await logMembershipAudit({
      membershipId: null,
      eventType: 'GROUP_ENTITY_UPDATED',
      actorType: canManageAny && group.primary_contact_user_id !== actorUserId ? 'ADMIN' : 'MEMBER',
      actorUserId,
      oldValue: { name: group.name, primaryContactUserId: group.primary_contact_user_id },
      newValue: updates,
    });
  }

  async getGroup(groupEntityId: number) {
    const group = await db
      .selectFrom('group_entities')
      .selectAll()
      .where('id', '=', groupEntityId)
      .executeTakeFirst();
    if (!group) throw new NotFoundException('Group entity not found.');

    const delegates = await db
      .selectFrom('group_delegates as gd')
      .innerJoin('users as u', 'u.id', 'gd.user_id')
      .select(['gd.id', 'gd.user_id', 'gd.role', 'gd.added_at', 'gd.removed_at', 'u.full_name', 'u.email'])
      .where('gd.group_entity_id', '=', groupEntityId)
      .orderBy('gd.added_at', 'asc')
      .execute();

    return { ...group, delegates };
  }

  async listGroupsForUser(userId: number) {
    // Groups where the user is primary contact or an active delegate.
    return db
      .selectFrom('group_entities as ge')
      .select(['ge.id', 'ge.uuid', 'ge.type', 'ge.name', 'ge.primary_contact_user_id'])
      .where((eb) =>
        eb.or([
          eb('ge.primary_contact_user_id', '=', userId),
          eb.exists(
            eb
              .selectFrom('group_delegates as gd')
              .select('gd.id')
              .whereRef('gd.group_entity_id', '=', 'ge.id')
              .where('gd.user_id', '=', userId)
              .where('gd.removed_at', 'is', null),
          ),
        ]),
      )
      .execute();
  }

  // ---- Delegates --------------------------------------------------------

  private async maxDelegatesFor(entityType: GroupEntityType): Promise<number | null> {
    const groupType = await db
      .selectFrom('group_membership_types')
      .select('id')
      .where('entity_type', '=', entityType)
      .executeTakeFirst();
    if (!groupType) return null;
    const raw = await this.entitlementService.getGroupTypeConfigValue(groupType.id, 'max_delegates');
    return raw ? parseInt(raw, 10) : null;
  }

  async addDelegate(groupEntityId: number, userId: number, actorUserId: number, canManageAny: boolean): Promise<void> {
    const group = await this.requireManageRights(groupEntityId, actorUserId, canManageAny);

    const user = await db.selectFrom('users').select('id').where('id', '=', userId).executeTakeFirst();
    if (!user) throw new NotFoundException('User not found. Delegates must be Registered Users (MEM-006 P1).');

    const existing = await db
      .selectFrom('group_delegates')
      .selectAll()
      .where('group_entity_id', '=', groupEntityId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (existing && existing.removed_at === null) {
      throw new ConflictException('This user is already an active delegate of this group.');
    }

    // max_delegates enforcement -- counts ACTIVE delegates only. NULL config
    // means "no limit configured": allowed, but seed_0005 should normally
    // have populated it.
    const max = await this.maxDelegatesFor(group.type);
    if (max !== null) {
      const activeCountRow = await db
        .selectFrom('group_delegates')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('group_entity_id', '=', groupEntityId)
        .where('removed_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (Number(activeCountRow.n) >= max) {
        throw new ConflictException(
          `This group has reached its delegate limit (${max}). The limit is configurable by membership staff.`,
        );
      }
    }

    if (existing) {
      // Re-adding a previously removed delegate: revive the row (the unique
      // key on (group_entity_id, user_id) makes a fresh INSERT impossible,
      // by design -- history stays on one row).
placeholder
    } else {
      await db
        .insertInto('group_delegates')
        .values({ group_entity_id: groupEntityId, user_id: userId })
        .execute();
    }

    await logMembershipAudit({
      membershipId: null,
      eventType: 'GROUP_DELEGATE_ADDED',
      actorType: canManageAny && group.primary_contact_user_id !== actorUserId ? 'ADMIN' : 'MEMBER',
      actorUserId,
      newValue: { groupEntityId, userId },
    });
  }

  async removeDelegate(
    groupEntityId: number,
    userId: number,
    actorUserId: number,
    canManageAny: boolean,
  ): Promise<void> {
    const group = await this.requireManageRights(groupEntityId, actorUserId, canManageAny);

    if (group.primary_contact_user_id === userId) {
      throw new ConflictException(
        'The primary contact cannot be removed as a delegate. Transfer the primary contact role first.',
      );
    }

    const existing = await db
      .selectFrom('group_delegates')
      .select('id')
      .where('group_entity_id', '=', groupEntityId)
      .where('user_id', '=', userId)
      .where('removed_at', 'is', null)
      .executeTakeFirst();
    if (!existing) throw new NotFoundException('This user is not an active delegate of this group.');

    await db
      .updateTable('group_delegates')
      .set({ removed_at: toMysqlDatetime(new Date()) })
      .where('id', '=', existing.id)
      .execute();

    await logMembershipAudit({
      membershipId: null,
      eventType: 'GROUP_DELEGATE_REMOVED',
      actorType: canManageAny && group.primary_contact_user_id !== actorUserId ? 'ADMIN' : 'MEMBER',
      actorUserId,
      oldValue: { groupEntityId, userId },
    });
  }
}
