// backend/src/modules/membership/voting-register/voting-register.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { CurrentUser } from '../../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/token.util';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RequirePermissions } from '../../identity/rbac/permissions.decorator';
import { VotingRegisterService } from './voting-register.service';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

class GenerateSnapshotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label!: string;
}

@Controller('membership/voting-register')
@UseGuards(AccessTokenGuard)
export class VotingRegisterController {
  constructor(private readonly service: VotingRegisterService) {}

  // POST /membership/voting-register/snapshots
  // Requires: membership.voting_register.generate
  @Post('snapshots')
  @UseGuards(RbacGuard)
  @RequirePermissions('membership.voting_register.generate')
  async generate(@Body() dto: GenerateSnapshotDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.generateSnapshot(dto.label, user.sub);
  }

  // GET /membership/voting-register/snapshots
  // Requires: membership.voting_register.view
  @Get('snapshots')
  @UseGuards(RbacGuard)
  @RequirePermissions('membership.voting_register.view')
  async list() {
    return this.service.listSnapshots();
  }

  // GET /membership/voting-register/snapshots/:uuid
  // Requires: membership.voting_register.view
  @Get('snapshots/:uuid')
  @UseGuards(RbacGuard)
  @RequirePermissions('membership.voting_register.view')
  async getOne(@Param('uuid') uuid: string) {
    return this.service.getSnapshot(uuid);
  }
}
