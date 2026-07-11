import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { CurrentUser } from '../../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/token.util';
import { HubProfileService } from './hub-profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSocialDto } from './dto/update-social.dto';
import { UpdateGearDto } from './dto/update-gear.dto';
import { UpdateDistinctionsDto } from './dto/update-distinctions.dto';
import { PresignMediaDto, ConfirmMediaDto } from './dto/presign-media.dto';

@Controller('api/v1/hub/profile')
@UseGuards(AccessTokenGuard)
export class HubProfileController {
  constructor(private readonly svc: HubProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: AccessTokenPayload) {
    return this.svc.getProfile(user.sub);
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
