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
import { GroupService } from './group.service';
import { CreateGroupDto } from '../dto/create-group.dto';
import { UpdateGroupDto } from '../dto/update-group.dto';
import { AddDelegateDto } from '../dto/add-delegate.dto';

const MANAGE_ANY = 'group.entity.manage_any';

@Controller('api/v1/membership/groups')
@UseGuards(AccessTokenGuard)
export class GroupController {
  constructor(
    private readonly groups: GroupService,
    private readonly rbac: RbacService,
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

  @Get(':id')
  @HttpCode(200)
  async get(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    const group = await this.groups.getGroup(id);
    const staff = await this.canManageAny(actor.sub);
    const isMember =
      group.primary_contact_user_id === actor.sub ||
      // removed_at is Date | null from Kysely -- falsy check is correct here
      group.delegates.some((d) => d.user_id === actor.sub && !d.removed_at);
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
