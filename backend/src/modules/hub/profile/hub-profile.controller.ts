import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { CurrentUser } from '../../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/token.util';
import { HubProfileService } from './hub-profile.service';
import { DirectoryEligibilityService } from '../../photographer-profiles/directory-eligibility.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSocialDto } from './dto/update-social.dto';
import { UpdateGearDto } from './dto/update-gear.dto';
import { UpdateDistinctionsDto } from './dto/update-distinctions.dto';
import { PresignMediaDto, ConfirmMediaDto } from './dto/presign-media.dto';

@Controller('api/v1/hub/profile')
@UseGuards(AccessTokenGuard)
export class HubProfileController {
  constructor(
    private readonly svc: HubProfileService,
    private readonly directory: DirectoryEligibilityService,
  ) {}

  @Get()
  getProfile(@CurrentUser() user: AccessTokenPayload) {
    return this.svc.getProfile(user.sub);
  }

  /**
   * GET /api/v1/hub/profile/directory-status
   * The member's own public Photographer Directory eligibility + profile
   * completion, derived from current data on every call (never persisted).
   * notListedReason != null: never listed regardless of eligibility
   * (no ACTIVE membership, or profile visibility not PUBLIC).
   */
  @Get('directory-status')
  async getDirectoryStatus(@CurrentUser() user: AccessTokenPayload) {
    const [status, notListedReason] = await Promise.all([
      this.directory.getStatus(user.sub),
      this.directory.notListedReason(user.sub),
    ]);
    if (!status) throw new NotFoundException('User not found');
    return { data: { ...status, notListedReason } };
  }

  @Put()
  updateProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.svc.updateProfile(user.sub, dto);
  }

  @Put('social')
  updateSocial(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateSocialDto,
  ) {
    return this.svc.updateSocial(user.sub, dto);
  }

  @Put('gear')
  updateGear(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateGearDto,
  ) {
    return this.svc.updateGear(user.sub, dto);
  }

  @Put('distinctions')
  updateDistinctions(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateDistinctionsDto,
  ) {
    return this.svc.updateDistinctions(user.sub, dto);
  }

  @Post('avatar/presign')
  @HttpCode(HttpStatus.OK)
  presignAvatar(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: PresignMediaDto,
  ) {
    return this.svc.presignAvatar(user.sub, dto.mimeType, dto.fileSizeBytes);
  }

  @Post('avatar/confirm')
  @HttpCode(HttpStatus.OK)
  confirmAvatar(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ConfirmMediaDto,
  ) {
    return this.svc.confirmAvatar(user.sub, dto.r2Key);
  }

  @Post('cover/presign')
  @HttpCode(HttpStatus.OK)
  presignCover(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: PresignMediaDto,
  ) {
    return this.svc.presignCover(user.sub, dto.mimeType, dto.fileSizeBytes);
  }

  @Post('cover/confirm')
  @HttpCode(HttpStatus.OK)
  confirmCover(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ConfirmMediaDto,
  ) {
    return this.svc.confirmCover(user.sub, dto.r2Key);
  }
}
