// backend/src/modules/identity/rbac/rbac.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacGuard } from './rbac.guard';
import { RequirePermissions } from './permissions.decorator';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token.util';
import { AssignRoleDto } from './dto/assign-role.dto';

@Controller('api/v1/rbac')
@UseGuards(AccessTokenGuard, RbacGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('users/:userId/roles')
  @RequirePermissions('identity.role.view')
  async getUserRoles(@Param('userId', ParseIntPipe) userId: number) {
    return this.rbacService.getActiveRoles(userId);
  }

  @Post('roles')
  @RequirePermissions('identity.role.assign')
  async assignRole(@CurrentUser() actor: AccessTokenPayload, @Body() dto: AssignRoleDto) {
    return this.rbacService.assignRole({
      actorId: actor.sub,
      targetUserId: dto.userId,
      roleName: dto.roleName,
      scopeType: dto.scopeType ?? null,
      scopeId: dto.scopeId ?? null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      reason: dto.reason ?? null,
    });
  }

  @Delete('roles/:userRoleId')
  @HttpCode(204)
  @RequirePermissions('identity.role.assign')
  async revokeRole(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('userRoleId', ParseIntPipe) userRoleId: number,
    @Query('reason') reason?: string,
  ) {
    await this.rbacService.revokeRole(actor.sub, userRoleId, reason ?? null);
  }
}
