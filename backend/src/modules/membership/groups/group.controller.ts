// backend/src/modules/membership/groups/group.controller.ts
//
// Group entity + delegate CRUD (spec 02.3).
//
// Authorization is deliberately NOT all guard-level here: any Registered
// User can create a group (self as primary contact) and manage their OWN
// group -- so most endpoints use AccessTokenGuard only, with the
// primary-contact-or-staff decision made in the service. The
// group.entity.manage_any permission is checked programmatically via
// RbacService and passed down as canManageAny.

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { CurrentUser } from '../../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/token.util';
import { RbacService } from '../../identity/rbac/rbac.service';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RequirePermissions } from '../../identity/rbac/permissions.decorator';
import { GroupService } from './group.service';
import { GroupMembershipService } from './group-membership.service';
import { CreateGroupDto } from '../dto/create-group.dto';
import { UpdateGroupDto } from '../dto/update-group.dto';
import { AddDelegateDto } from '../dto/add-delegate.dto';
import { InviteGroupMemberDto, RevokeGroupMemberDto } from '../dto/group-member.dto';

const MANAGE_ANY = 'group.entity.manage_any';

@Controller('api/v1/membership/groups')
@UseGuards(AccessTokenGuard)
export class GroupController {
  constructor(
    private readonly groups: GroupService,
    private readonly rbac: RbacService,
    private readonly groupMemberships: GroupMembershipService,
  ) {}

  private async canManageAny(userId: number): Promise<boolean> {
    const keys = await this.rbac.getActivePermissionKeys(userId);
    return keys.has(MANAGE_ANY);
  }

  @Post()
  @HttpCode(201)
  async create(@CurrentUser() actor: AccessTokenPayload, @Body() dto: CreateGroupDto) {
    const staff = await this.canManageAny(actor.sub);
    if (dto.primaryContactUserId && dto.primaryContactUserId !== actor.sub && !staff) {
      throw new ForbiddenException('Only membership staff can create a group on behalf of another user.');
    }
    return this.groups.createGroup({
      type: dto.type,
      name: dto.name,
      primaryContactUserId: dto.primaryContactUserId ?? actor.sub,
      actorUserId: actor.sub,
    });
  }

  @Get('mine')
  @HttpCode(200)
  async mine(@CurrentUser() actor: AccessTokenPayload) {
    return this.groups.listGroupsForUser(actor.sub);
  }

  // ── Family / Corporate: invitation, assignment, revocation ─────────────
  // (static two-segment paths; they cannot shadow the ':id' routes below)

  // Signed-in user's own view: groups they head + invitations awaiting them.
  @Get('memberships/mine')
  @HttpCode(200)
  async myGroupMemberships(@CurrentUser() actor: AccessTokenPayload) {
    return this.groupMemberships.mine(actor.sub);
  }

  // Head (or staff): roster, invitation states, remaining capacity.
  @Get('memberships/:groupMembershipId/members')
  @HttpCode(200)
  async listGroupMembers(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('groupMembershipId', ParseIntPipe) groupMembershipId: number,
  ) {
    return this.groupMemberships.listMembers(groupMembershipId, actor.sub, await this.canManageAny(actor.sub));
  }

  // Head only (enforced in the service): invite a Registered User.
  @Post('memberships/:groupMembershipId/invitations')
  @HttpCode(201)
  async inviteMember(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('groupMembershipId', ParseIntPipe) groupMembershipId: number,
    @Body() dto: InviteGroupMemberDto,
  ) {
    return this.groupMemberships.invite(groupMembershipId, dto.identifier, actor.sub);
  }

  // Invitee only (enforced in the service): accept. Creates the member's own
  // APPROVED record; never activates or numbers it.
  @Post('invitations/:invitationId/accept')
  @HttpCode(200)
  async acceptInvitation(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ) {
    return this.groupMemberships.accept(invitationId, actor.sub);
  }

  // BCC administration ONLY. There is deliberately no head/creator-side
  // revoke, remove, replace or transfer route. Existing permissions, AND
  // semantics: roster administration (group.entity.manage_any) + ending the
  // member's record (membership.lifecycle.terminate). Reason mandatory.
  @Post('memberships/:groupMembershipId/members/:userId/revoke')
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @RequirePermissions(MANAGE_ANY, 'membership.lifecycle.terminate')
  async revokeMember(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('groupMembershipId', ParseIntPipe) groupMembershipId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: RevokeGroupMemberDto,
  ) {
    return this.groupMemberships.revokeMember(groupMembershipId, userId, actor.sub, dto.reason);
  }

  @Get(':id')
  @HttpCode(200)
  async get(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    const group = await this.groups.getGroup(id);
    const staff = await this.canManageAny(actor.sub);
    const isMember =
      group.primary_contact_user_id === actor.sub ||
      // removed_at is Date | null from Kysely -- falsy check is correct here.
      // A merely INVITED person is not yet a member of the group.
      group.delegates.some((d) => d.user_id === actor.sub && !d.removed_at && d.status !== 'INVITED');
    if (!staff && !isMember) {
      throw new ForbiddenException('You are not a delegate of this group.');
    }
    return group;
  }

  @Patch(':id')
  @HttpCode(200)
  async update(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGroupDto,
  ) {
    await this.groups.updateGroup(id, dto, actor.sub, await this.canManageAny(actor.sub));
    return { ok: true };
  }

  @Post(':id/delegates')
  @HttpCode(201)
  async addDelegate(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddDelegateDto,
  ) {
    await this.groups.addDelegate(id, dto.userId, actor.sub, await this.canManageAny(actor.sub));
    return { ok: true };
  }

  @Delete(':id/delegates/:userId')
  @HttpCode(200)
  async removeDelegate(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    await this.groups.removeDelegate(id, userId, actor.sub, await this.canManageAny(actor.sub));
    return { ok: true };
  }
}
