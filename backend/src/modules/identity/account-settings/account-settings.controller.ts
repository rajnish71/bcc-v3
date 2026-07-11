import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AccountSettingsService } from './account-settings.service';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token.util';
import { UpdateNameDto } from './dto/update-name.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { InitiateEmailChangeDto } from './dto/initiate-email-change.dto';

@Controller('api/v1/hub/account-settings')
export class AccountSettingsController {
  constructor(private readonly svc: AccountSettingsService) {}

  @Get()
  @UseGuards(AccessTokenGuard)
  getSettings(@CurrentUser() user: AccessTokenPayload) {
    return this.svc.getSettings(user.sub);
  }

  @Put('name')
  @UseGuards(AccessTokenGuard)
  updateName(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateNameDto,
  ) {
    return this.svc.updateName(user.sub, dto);
  }

  @Post('email/initiate')
  @UseGuards(AccessTokenGuard)
  initiateEmailChange(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: InitiateEmailChangeDto,
  ) {
    return this.svc.initiateEmailChange(user.sub, dto);
  }

  // Public endpoint — token is validated inside the service by hash lookup
  @Get('email/verify')
  verifyEmailChange(@Query('token') token: string) {
    if (!token) throw new BadRequestException('token query parameter is required');
    return this.svc.verifyEmailChange(token);
  }

  @Put('password')
  @UseGuards(AccessTokenGuard)
  updatePassword(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdatePasswordDto,
  ) {
    return this.svc.updatePassword(user.sub, dto);
  }
}
