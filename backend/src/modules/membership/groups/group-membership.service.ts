// backend/src/modules/membership/groups/group-membership.service.ts
//
// Family / Corporate membership -- member invitation, assignment and
// administrative revocation (frozen lifecycle:
//   PAY -> APPROVE -> INVITE/ASSIGN -> ACTIVATE -> NUMBER).
//
// Model (migration 0105), reusing the existing architecture:
//   • The GROUP memberships row is the Family/Corporate RELATIONSHIP. It
//     owns the PAY-001 obligation and is never numbered.
//   • A seat = the EXISTING group_delegates roster row, now carrying
//     INVITED -> ACCEPTED -> (REVOKED_BY_ADMIN). No parallel table.
//   • Each accepted member gets their OWN memberships row (INDIVIDUAL,
//     group type, parent_membership_id = the group row), created APPROVED
//     -- admission is the group's approval -- and numbered ONLY when an
//     administrator activates it through MembershipLifecycleService
//     .activate() -> MembershipNumberingService (MEM-007 §8).
//
// Hard rules enforced here:
//   • Only the group's head (primary contact) invites; only after the group
//     is APPROVED/ACTIVE (payment + approval already happened).
//   • An invitation is accepted only by the invited person; acceptance
//     creates the member record but never activates or numbers it.
//   • Capacity = group_type_entitlements.max_delegates (configuration);
//     INVITED + ACCEPTED seats count, so the head can never over-invite.
//   • The head has NO revoke/remove/replace/transfer operation. Revocation
//     is revokeMember(), exposed only behind existing admin RBAC. It ends
//     the member's record through the existing terminate() lifecycle; the
//     permanent number stays on that record forever (MEM-007 MP-003) and
//     is never released or reused.
//   • Nothing in this file calls the numbering service.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Kysely, Selectable } from 'kysely';
import { db, type DB, type MembershipsTable } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { EntitlementService } from '../entitlements/entitlement.service';
import {
  GROUP_LIFECYCLE_ENTITY_TYPES,
  MembershipLifecycleService,
} from '../lifecycle/membership-lifecycle.service';
import { logMembershipAudit } from '../shared/membership-audit.util';

type MembershipRow = Selectable<MembershipsTable>;

// A seat is "held" (counts against capacity, blocks a duplicate invite)
// while INVITED or ACCEPTED and not removed.
const HELD_SEAT_STATUSES = ['INVITED', 'ACCEPTED'] as const;

// Any of these on a person means they already hold a membership record;
// a second one would duplicate them (frozen contract §14).
const OPEN_MEMBERSHIP_STATES = ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED'] as const;

// Group relationship states in which members may be invited / accepted.
const INVITABLE_GROUP_STATES = ['APPROVED', 'ACTIVE'];

interface SeatRow {
  id: number;
  user_id: number;
  status: 'INVITED' | 'ACCEPTED' | 'REVOKED_BY_ADMIN' | null;
  removed_at: unknown;
  member_membership_id: number | null;
}

function isHeld(seat: Pick<SeatRow, 'status' | 'removed_at'>): boolean {
  return seat.removed_at == null && (HELD_SEAT_STATUSES as readonly string[]).includes(String(seat.status));
}

@Injectable()
export class GroupMembershipService {
  constructor(
    private readonly lifecycle: MembershipLifecycleService,
    private readonly entitlements: EntitlementService,
  ) {}

  // ── Shared reads ─────────────────────────────────────────────────────────

  private async loadGroup(executor: Kysely<DB>, groupMembershipId: number, lock: boolean): Promise<MembershipRow> {
    let query = executor.selectFrom('memberships').selectAll().where('id', '=', groupMembershipId);
    if (lock) query = query.forUpdate();
    const group = await query.executeTakeFirst();
    if (!group || group.owner_type !== 'GROUP' || group.group_entity_id == null || group.group_membership_type_id == null) {
      throw new NotFoundException('Group membership not found.');
    }
    return group;
  }

  private async loadEntity(executor: Kysely<DB>, group: MembershipRow) {
    const entity = await executor
      .selectFrom('group_entities')
      .select(['id', 'type', 'name', 'primary_contact_user_id'])
      .where('id', '=', group.group_entity_id!)
      .executeTakeFirst();
    if (!entity) throw new NotFoundException('Group entity not found.');
    if (!(GROUP_LIFECYCLE_ENTITY_TYPES as readonly string[]).includes(entity.type)) {
      throw new ConflictException('Member invitations exist only for Family and Corporate memberships.');
    }
    return entity;
  }

  // Capacity from configuration (MEM-008 via group_type_entitlements
  // .max_delegates). Missing/invalid is a configuration error -- never
  // "unlimited".
  private async capacity(group: MembershipRow): Promise<number> {
    const raw = await this.entitlements.getGroupTypeConfigValue(group.group_membership_type_id!, 'max_delegates');
    const max = raw != null ? parseInt(raw, 10) : NaN;
    if (!Number.isInteger(max) || max < 1) {
      throw new ConflictException('Membership configuration is incomplete: this group type has no valid max_delegates.');
    }
    return max;
  }

  private async seatsOf(executor: Kysely<DB>, groupEntityId: number): Promise<SeatRow[]> {
    const rows = await executor
      .selectFrom('group_delegates')
      .select(['id', 'user_id', 'status', 'removed_at', 'member_membership_id'])
      .where('group_entity_id', '=', groupEntityId)
      .execute();
    return rows.map((r) => ({
      id: Number(r.id),
      user_id: Number(r.user_id),
      status: r.status ?? null,
      removed_at: r.removed_at,
      member_membership_id: r.member_membership_id != null ? Number(r.member_membership_id) : null,
    }));
  }

  private async hasOpenMembership(executor: Kysely<DB>, userId: number): Promise<boolean> {
    const open = await executor
      .selectFrom('memberships')
      .select('id')
      .where('user_id', '=', userId)
      .where('lifecycle_state', 'in', [...OPEN_MEMBERSHIP_STATES])
      .executeTakeFirst();
    return !!open;
  }

  // Registered Users only (MEM-006 P1): matched by exact email, then username.
  private async resolveInvitee(executor: Kysely<DB>, identifier: string) {
    const value = identifier.trim();
    if (!value) throw new BadRequestException('An email address or username is required.');
    const byEmail = await executor
      .selectFrom('users')
      .select(['id', 'full_name'])
      .where('email', '=', value.toLowerCase())
      .executeTakeFirst();
    if (byEmail) return byEmail;
    const byUsername = await executor
      .selectFrom('users')
      .select(['id', 'full_name'])
      .where('username', '=', value)
      .executeTakeFirst();
    if (byUsername) return byUsername;
    throw new NotFoundException('No registered user matches that email or username. They must register first.');
  }

  // ── Head: invite ─────────────────────────────────────────────────────────

  async invite(
    groupMembershipId: number,
    identifier: string,
    actorUserId: number,
  ): Promise<{ invitationId: number; status: 'INVITED'; capacity: { max: number; used: number; remaining: number } }> {
    return db.transaction().execute(async (trx) => {
      // Row lock on the group serialises concurrent invites/acceptances, so
      // capacity can never be exceeded by a race.
      const group = await this.loadGroup(trx, groupMembershipId, true);
      const entity = await this.loadEntity(trx, group);

      if (entity.primary_contact_user_id == null || Number(entity.primary_contact_user_id) !== actorUserId) {
        throw new ForbiddenException('Only the head (primary contact) of this group can invite members.');
      }
      if (!INVITABLE_GROUP_STATES.includes(group.lifecycle_state)) {
        throw new ConflictException(
          `Members can be invited only after the group membership is approved (it is ${group.lifecycle_state}).`,
        );
      }

      const invitee = await this.resolveInvitee(trx, identifier);
      const inviteeId = Number(invitee.id);
      if (await this.hasOpenMembership(trx, inviteeId)) {
        throw new ConflictException('This person already holds an open membership record and cannot be assigned another.');
      }

      const seats = await this.seatsOf(trx, Number(entity.id));
      const existing = seats.find((s) => s.user_id === inviteeId);
      if (existing && isHeld(existing)) {
        throw new ConflictException(`This person is already ${existing.status === 'INVITED' ? 'invited to' : 'a member of'} this group.`);
      }

      const max = await this.capacity(group);
      const used = seats.filter(isHeld).length;
      if (used >= max) {
        throw new ConflictException(`This group has reached its member limit (${max}).`);
      }

      const now = toMysqlDatetime(new Date());
      const seatValues = {
        status: 'INVITED' as const,
        group_membership_id: groupMembershipId,
        member_membership_id: null,
        invited_by_user_id: actorUserId,
        invited_at: now,
        accepted_at: null,
        revoked_at: null,
        revoked_by_user_id: null,
        revocation_reason: null,
        removed_at: null,
      };

      let invitationId: number;
      if (existing) {
        // One roster row per (entity, user) by design (uq_active_delegate):
        // re-used for the head's own contact row, a pre-0105 roster row, or a
        // person an administrator previously revoked. Prior history stays in
        // membership_audit_log and on any earlier member record.
        await trx.updateTable('group_delegates').set(seatValues).where('id', '=', existing.id).execute();
        invitationId = existing.id;
      } else {
        const inserted = await trx
          .insertInto('group_delegates')
          .values({ group_entity_id: Number(entity.id), user_id: inviteeId, role: 'DELEGATE', ...seatValues })
          .executeTakeFirstOrThrow();
        invitationId = Number(inserted.insertId);
      }

      await logMembershipAudit(
        {
          membershipId: groupMembershipId,
          eventType: 'GROUP_MEMBER_INVITED',
          actorType: 'MEMBER',
          actorUserId,
          newValue: { groupEntityId: Number(entity.id), invitationId, invitedUserId: inviteeId },
        },
        trx,
      );

      return { invitationId, status: 'INVITED' as const, capacity: { max, used: used + 1, remaining: max - used - 1 } };
    });
  }

  // ── Invitee: accept ──────────────────────────────────────────────────────

  async accept(
    invitationId: number,
    actorUserId: number,
  ): Promise<{ invitationId: number; status: 'ACCEPTED'; memberMembershipId: number; lifecycleState: 'APPROVED' }> {
    return db.transaction().execute(async (trx) => {
      const seat = await trx
        .selectFrom('group_delegates')
        .selectAll()
        .where('id', '=', invitationId)
        .forUpdate()
        .executeTakeFirst();
      if (!seat) throw new NotFoundException('Invitation not found.');
      if (Number(seat.user_id) !== actorUserId) {
        throw new ForbiddenException('An invitation can only be accepted by the person it was sent to.');
      }
      if (seat.status !== 'INVITED' || seat.removed_at != null || seat.group_membership_id == null) {
        throw new ConflictException('This invitation is no longer pending.');
      }

      const groupMembershipId = Number(seat.group_membership_id);
      const group = await this.loadGroup(trx, groupMembershipId, true);
      await this.loadEntity(trx, group);
      if (!INVITABLE_GROUP_STATES.includes(group.lifecycle_state)) {
        throw new ConflictException(`The group membership is ${group.lifecycle_state}; this invitation can no longer be accepted.`);
      }

      const max = await this.capacity(group);
      const seats = await this.seatsOf(trx, Number(group.group_entity_id));
      const accepted = seats.filter((s) => s.id !== Number(seat.id) && s.removed_at == null && s.status === 'ACCEPTED').length;
      if (accepted >= max) {
        throw new ConflictException(`This group has reached its member limit (${max}).`);
      }
      if (await this.hasOpenMembership(trx, actorUserId)) {
        throw new ConflictException('You already hold an open membership record; you cannot be assigned another.');
      }

      const now = toMysqlDatetime(new Date());
      // The member's OWN record. APPROVED: admission is the group's (paid,
      // approved) membership. NOT activated and NOT numbered here -- that is
      // the administrator's activate() step (MEM-007 §8 Allocation Trigger).
      const inserted = await trx
        .insertInto('memberships')
        .values({
          uuid: randomUUID(),
          owner_type: 'INDIVIDUAL',
          user_id: actorUserId,
          group_entity_id: null,
          membership_class_id: null,
          group_membership_type_id: group.group_membership_type_id,
          parent_membership_id: groupMembershipId,
          lifecycle_state: 'APPROVED',
          applied_at: now,
          approved_at: now,
        })
        .executeTakeFirstOrThrow();
      const memberMembershipId = Number(inserted.insertId);

      await trx
        .updateTable('group_delegates')
        .set({ status: 'ACCEPTED', accepted_at: now, member_membership_id: memberMembershipId, added_at: now })
        .where('id', '=', Number(seat.id))
        .execute();

      await logMembershipAudit(
        {
          membershipId: groupMembershipId,
          eventType: 'GROUP_MEMBER_INVITATION_ACCEPTED',
          actorType: 'MEMBER',
          actorUserId,
          newValue: { invitationId, userId: actorUserId, memberMembershipId },
        },
        trx,
      );
      await logMembershipAudit(
        {
          membershipId: memberMembershipId,
          eventType: 'GROUP_MEMBER_ASSIGNED',
          actorType: 'MEMBER',
          actorUserId,
          newValue: { state: 'APPROVED', groupMembershipId, invitationId },
          notes: 'Member record created on invitation acceptance; activation and numbering pending.',
        },
        trx,
      );

      return { invitationId, status: 'ACCEPTED' as const, memberMembershipId, lifecycleState: 'APPROVED' as const };
    });
  }

  // ── Administration: revoke (NEVER exposed to the head) ───────────────────

  async revokeMember(
    groupMembershipId: number,
    userId: number,
    actorUserId: number,
    reason: string,
  ): Promise<{ status: 'REVOKED_BY_ADMIN'; memberMembershipId: number | null; memberLifecycleState: string | null }> {
    const trimmedReason = (reason ?? '').trim();
    if (!trimmedReason) throw new BadRequestException('A reason is required to revoke a group member.');

    const group = await this.loadGroup(db, groupMembershipId, false);
    const seat = await db
      .selectFrom('group_delegates')
      .selectAll()
      .where('group_entity_id', '=', group.group_entity_id!)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!seat || !isHeld({ status: seat.status ?? null, removed_at: seat.removed_at })) {
      throw new NotFoundException('This person holds no invitation or seat in this group.');
    }

    // The member's own record leaves through the EXISTING termination
    // lifecycle (audited, actor + reason). Its permanent number -- if one
    // was ever allocated -- stays on it; MEM-007 MP-003: never reused.
    let memberLifecycleState: string | null = null;
    const memberMembershipId = seat.member_membership_id != null ? Number(seat.member_membership_id) : null;
    if (memberMembershipId != null) {
      const member = await this.lifecycle.getOrThrow(memberMembershipId);
      if (member.lifecycle_state !== 'TERMINATED' && member.lifecycle_state !== 'REJECTED') {
        await this.lifecycle.terminate(memberMembershipId, actorUserId, `Removed from group by BCC administration: ${trimmedReason}`);
      }
      memberLifecycleState = (await this.lifecycle.getOrThrow(memberMembershipId)).lifecycle_state;
    }

    await db.transaction().execute(async (trx) => {
      const now = toMysqlDatetime(new Date());
      await trx
        .updateTable('group_delegates')
        .set({
          status: 'REVOKED_BY_ADMIN',
          revoked_at: now,
          revoked_by_user_id: actorUserId,
          revocation_reason: trimmedReason.slice(0, 500),
          removed_at: now,
        })
        .where('id', '=', Number(seat.id))
        .where('status', 'in', [...HELD_SEAT_STATUSES])
        .execute();

      await logMembershipAudit(
        {
          membershipId: groupMembershipId,
          eventType: 'GROUP_MEMBER_REVOKED',
          actorType: 'ADMIN',
          actorUserId,
          oldValue: { invitationId: Number(seat.id), status: seat.status },
          newValue: {
            status: 'REVOKED_BY_ADMIN',
            groupEntityId: Number(group.group_entity_id),
            targetUserId: userId,
            memberMembershipId,
          },
          notes: trimmedReason,
        },
        trx,
      );
    });

    return { status: 'REVOKED_BY_ADMIN', memberMembershipId, memberLifecycleState };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  // The head (or staff) sees the roster, invitation states and capacity.
  async listMembers(groupMembershipId: number, actorUserId: number, isStaff: boolean) {
    const group = await this.loadGroup(db, groupMembershipId, false);
    const entity = await this.loadEntity(db, group);
    if (!isStaff && Number(entity.primary_contact_user_id) !== actorUserId) {
      throw new ForbiddenException('Only the head of this group or membership staff can view its members.');
    }

    const rows = await db
      .selectFrom('group_delegates as gd')
      .innerJoin('users as u', 'u.id', 'gd.user_id')
      .leftJoin('memberships as m', 'm.id', 'gd.member_membership_id')
      .select([
        'gd.id as invitationId',
        'gd.user_id as userId',
        'u.full_name as fullName',
        'gd.status',
        'gd.invited_at as invitedAt',
        'gd.accepted_at as acceptedAt',
        'gd.revoked_at as revokedAt',
        'gd.member_membership_id as memberMembershipId',
        'm.lifecycle_state as memberLifecycleState',
        'm.membership_number as membershipNumber',
      ])
      .where('gd.group_entity_id', '=', Number(entity.id))
      .where('gd.status', 'is not', null)
      .orderBy('gd.invited_at', 'asc')
      .execute();

    const max = await this.capacity(group);
    const used = rows.filter((r) => r.status === 'INVITED' || r.status === 'ACCEPTED').length;

    return {
      group: {
        membershipId: groupMembershipId,
        lifecycleState: group.lifecycle_state,
        type: entity.type,
        name: entity.name,
        expiresAt: group.expires_at,
        canInvite: INVITABLE_GROUP_STATES.includes(group.lifecycle_state),
      },
      capacity: { max, used, remaining: Math.max(0, max - used) },
      members: rows,
    };
  }

  // Hub view for the signed-in user: groups they head, and invitations
  // waiting for their acceptance.
  async mine(userId: number) {
    const headOf = await db
      .selectFrom('memberships as m')
      .innerJoin('group_entities as ge', 'ge.id', 'm.group_entity_id')
      .select([
        'm.id as membershipId',
        'm.lifecycle_state as lifecycleState',
        'm.expires_at as expiresAt',
        'ge.type',
        'ge.name',
      ])
      .where('m.owner_type', '=', 'GROUP')
      .where('ge.primary_contact_user_id', '=', userId)
      .where('ge.type', 'in', [...GROUP_LIFECYCLE_ENTITY_TYPES])
      .orderBy('m.created_at', 'desc')
      .execute();

    const invitations = await db
      .selectFrom('group_delegates as gd')
      .innerJoin('group_entities as ge', 'ge.id', 'gd.group_entity_id')
      .select(['gd.id as invitationId', 'gd.invited_at as invitedAt', 'ge.type', 'ge.name'])
      .where('gd.user_id', '=', userId)
      .where('gd.status', '=', 'INVITED')
      .where('gd.removed_at', 'is', null)
      .execute();

    return { headOf, invitations };
  }
}
