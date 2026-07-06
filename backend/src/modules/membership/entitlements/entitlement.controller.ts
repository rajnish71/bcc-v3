// backend/src/modules/membership/entitlements/entitlement.controller.ts
import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { CurrentUser } from '../../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/token.util';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RequirePermissions } from '../../identity/rbac/permissions.decorator';
import { EntitlementService } from './entitlement.service';
import { SetClassEntitlementDto } from '../dto/set-class-entitlement.dto';
import { SetGroupTypeEntitlementDto } from '../dto/set-group-type-entitlement.dto';
import { SetRecognitionModifierDto } from '../dto/set-recognition-modifier.dto';
import { CreateOverrideDto } from '../dto/create-override.dto';

@Controller('api/v1/membership/entitlements')
@UseGuards(AccessTokenGuard, RbacGuard)
export class EntitlementController {
  constructor(private readonly entitlements: EntitlementService) {}

  @Get('resolve/:membershipId')
  @HttpCode(200)
  @RequirePermissions('membership.entitlement.view')
  async resolve(@Param('membershipId', ParseIntPipe) membershipId: number) {
    return this.entitlements.resolve(membershipId);
  }

  @Post('class')
  @HttpCode(200)
  @RequirePermissions('membership.entitlement.manage')
  async setClassEntitlement(@CurrentUser() actor: AccessTokenPayload, @Body() dto: SetClassEntitlementDto) {
    await this.entitlements.setClassEntitlement(dto.membershipClassId, dto.key, dto.value, actor.sub);
    return { ok: true };
  }

  @Delete('class/:membershipClassId/:key')
  @HttpCode(200)
  @RequirePermissions('membership.entitlement.manage')
  async removeClassEntitlement(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('membershipClassId', ParseIntPipe) membershipClassId: number,
    @Param('key') key: string,
  ) {
    await this.entitlements.removeClassEntitlement(membershipClassId, key, actor.sub);
    return { ok: true };
  }

  @Post('group-type')
  @HttpCode(200)
  @RequirePermissions('group.entitlement.manage')
  async setGroupTypeEntitlement(@CurrentUser() actor: AccessTokenPayload, @Body() dto: SetGroupTypeEntitlementDto) {
    await this.entitlements.setGroupTypeEntitlement(dto.groupMembershipTypeId, dto.key, dto.value, actor.sub);
    return { ok: true };
  }

  @Delete('group-type/:groupMembershipTypeId/:key')
  @HttpCode(200)
  @RequirePermissions('group.entitlement.manage')
  async removeGroupTypeEntitlement(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('groupMembershipTypeId', ParseIntPipe) groupMembershipTypeId: number,
    @Param('key') key: string,
  ) {
    await this.entitlements.removeGroupTypeEntitlement(groupMembershipTypeId, key, actor.sub);
    return { ok: true };
  }

  @Post('recognition-modifier')
  @HttpCode(200)
  @RequirePermissions('membership.entitlement.manage')
  async setRecognitionModifier(@CurrentUser() actor: AccessTokenPayload, @Body() dto: SetRecognitionModifierDto) {
    await this.entitlements.setRecognitionModifier(dto.recognitionCode, dto.key, dto.value, actor.sub);
    return { ok: true };
  }

  @Post('override/:membershipId')
  @HttpCode(201)
  @RequirePermissions('membership.entitlement.manage')
  async createOverride(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('membershipId', ParseIntPipe) membershipId: number,
    @Body() dto: CreateOverrideDto,
  ) {
    await this.entitlements.grantOverride(
      membershipId,
      dto.key,
      dto.overrideType,
      dto.value,
      dto.reason,
      actor.sub,
      dto.expiresAt ?? null,
    );
    return { ok: true };
  }

  @Delete('override/:overrideId')
  @HttpCode(200)
  @RequirePermissions('membership.entitlement.manage')
  async removeOverride(@CurrentUser() actor: AccessTokenPayload, @Param('overrideId', ParseIntPipe) overrideId: number) {
    await this.entitlements.removeOverride(overrideId, actor.sub);
    return { ok: true };
  }
}
