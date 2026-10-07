// backend/src/modules/identity/distinctions/photographic-distinctions.controller.ts
//
// Photographic Distinctions -- identity-domain API (Phase 2A).
//
// Holder (authenticated; the holder is ALWAYS the token subject -- no user
// id is accepted, so cross-user modification is impossible by construction):
//   GET  /api/v1/identity/distinctions/me
//   POST /api/v1/identity/distinctions/me/:distinctionId/declare
//   POST /api/v1/identity/distinctions/me/:distinctionId/withdraw
//
// Administration (explicit RbacGuard permissions; no role or Super Admin
// bypass, nothing derived from membership or recognition):
//   identity.distinction.view
//     GET    admin/declarations?state=&userId=&q=
//     GET    admin/catalogue
//   identity.distinction.remove   (Remove AND Restore; reason required)
//     POST   admin/declarations/:userId/:distinctionId/remove
//     POST   admin/declarations/:userId/:distinctionId/restore
//   identity.distinction.catalogue.manage
//     POST   admin/catalogue/institutions
//     PATCH  admin/catalogue/institutions/:id
//     DELETE admin/catalogue/institutions/:id     (only when unreferenced)
//     POST   admin/catalogue/distinctions
//     PATCH  admin/catalogue/distinctions/:id
//     DELETE admin/catalogue/distinctions/:id     (only when no holder rows)
//
// Distinctions are self-declared and UNVERIFIED; no route verifies,
// evidences or awards anything. The BCC Distinguished Photographer Badge is
// derived at read time and has no write route.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token.util';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import {
  CreateDistinctionDto,
  CreateInstitutionDto,
  DistinctionReasonDto,
  ListDeclarationsQueryDto,
  UpdateDistinctionDto,
  UpdateInstitutionDto,
} from './dto/photographic-distinctions.dto';
import { PhotographicDistinctionsService } from './photographic-distinctions.service';

@Controller('api/v1/identity/distinctions')
export class PhotographicDistinctionsController {
  constructor(private readonly service: PhotographicDistinctionsService) {}

  // ── Holder ───────────────────────────────────────────────────────────────

  @Get('me')
  @UseGuards(AccessTokenGuard)
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getHolderView(user.sub);
  }

  @Post('me/:distinctionId/declare')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  declare(
    @CurrentUser() user: AccessTokenPayload,
    @Param('distinctionId', ParseIntPipe) distinctionId: number,
  ) {
    return this.service.declare(user.sub, distinctionId);
  }

  @Post('me/:distinctionId/withdraw')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  withdraw(
    @CurrentUser() user: AccessTokenPayload,
    @Param('distinctionId', ParseIntPipe) distinctionId: number,
  ) {
    return this.service.withdraw(user.sub, distinctionId);
  }

  // ── Administration: declarations ─────────────────────────────────────────

  @Get('admin/declarations')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.view')
  declarations(@Query() query: ListDeclarationsQueryDto) {
    return this.service.listDeclarations({
      state: query.state,
      userId: query.userId,
      q: query.q?.trim() || undefined,
    });
  }

  @Post('admin/declarations/:userId/:distinctionId/remove')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.remove')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('distinctionId', ParseIntPipe) distinctionId: number,
    @Body() dto: DistinctionReasonDto,
  ) {
    return this.service.remove(user.sub, userId, distinctionId, dto.reason);
  }

  @Post('admin/declarations/:userId/:distinctionId/restore')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.remove')
  restore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('distinctionId', ParseIntPipe) distinctionId: number,
    @Body() dto: DistinctionReasonDto,
  ) {
    return this.service.restore(user.sub, userId, distinctionId, dto.reason);
  }

  // ── Administration: catalogue ────────────────────────────────────────────

  @Get('admin/catalogue')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.view')
  catalogue() {
    return this.service.getCatalogue({ includeInactive: true });
  }

  @Post('admin/catalogue/institutions')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.catalogue.manage')
  createInstitution(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateInstitutionDto) {
    return this.service.createInstitution(user.sub, dto);
  }

  @Patch('admin/catalogue/institutions/:id')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.catalogue.manage')
  updateInstitution(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstitutionDto,
  ) {
    return this.service.updateInstitution(user.sub, id, dto);
  }

  @Delete('admin/catalogue/institutions/:id')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.catalogue.manage')
  deleteInstitution(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteInstitution(user.sub, id);
  }

  @Post('admin/catalogue/distinctions')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.catalogue.manage')
  createDistinction(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateDistinctionDto) {
    return this.service.createDistinction(user.sub, dto);
  }

  @Patch('admin/catalogue/distinctions/:id')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.catalogue.manage')
  updateDistinction(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDistinctionDto,
  ) {
    return this.service.updateDistinction(user.sub, id, dto);
  }

  @Delete('admin/catalogue/distinctions/:id')
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.distinction.catalogue.manage')
  deleteDistinction(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteDistinction(user.sub, id);
  }
}
