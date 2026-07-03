// backend/src/modules/identity/registration/registration.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RegistrationService } from './registration.service';
import type { DeviceContext } from '../auth/auth.service';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token.util';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { RegisterEmailPasswordDto } from './dto/register-email-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { SocialProvider } from './dto/social-login.dto';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { ConsumeMagicLinkDto } from './dto/consume-magic-link.dto';
import { AdminCreateAccountDto } from './dto/admin-create-account.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { OAuthService } from './oauth.service';

function deviceContextFrom(req: FastifyRequest): DeviceContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string) ?? null,
  };
}

@Controller('registration')
export class RegistrationController {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly oauthService: OAuthService,
  ) {}

  private parseProvider(raw: string): SocialProvider {
    const upper = raw.toUpperCase();
    if (upper in SocialProvider) {
      return SocialProvider[upper as keyof typeof SocialProvider];
    }
    throw new BadRequestException(`Unknown provider: ${raw}`);
  }

  // -- 1. Email + password ----------------------------------------------

  @Post('email-password')
  @HttpCode(201)
  async registerEmailPassword(@Body() dto: RegisterEmailPasswordDto, @Req() req: FastifyRequest) {
    return this.registrationService.registerWithEmailPassword(dto, deviceContextFrom(req));
  }

  @Post('email-password/verify')
  @HttpCode(204)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.registrationService.verifyEmail(dto);
  }

  // -- 2. Phone + OTP ------------------------------------------------------

  @Post('phone-otp/request')
  @HttpCode(200)
  async requestPhoneOtp(@Body() dto: RequestPhoneOtpDto) {
    return this.registrationService.requestPhoneOtp(dto);
  }

  @Post('phone-otp/verify')
  @HttpCode(201)
  async verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto, @Req() req: FastifyRequest) {
    return this.registrationService.verifyPhoneOtpAndRegister(dto, deviceContextFrom(req));
  }

  // -- 3. Social login -------------------------------------------------
  // No longer a POST endpoint that trusts caller-supplied provider data --
  // that was a real "log in as anyone" hole once OAuthService existed to
  // compare against. The callback below does the code exchange itself and
  // only ever calls registerOrLoginWithSocial with a provider-verified
  // profile.

  @Get('social/:provider/authorize-url')
  @HttpCode(200)
  authorizeUrl(@Param('provider') providerParam: string) {
    const provider = this.parseProvider(providerParam);
    return { authorizeUrl: this.oauthService.getAuthorizeUrl(provider) };
  }

  @Get('social/:provider/callback')
  @HttpCode(200)
  async socialCallback(
    @Param('provider') providerParam: string,
    @Query('code') code: string,
    @Req() req: FastifyRequest,
  ) {
    const provider = this.parseProvider(providerParam);
    if (!code) throw new BadRequestException('Missing authorization code');

    const profile = await this.oauthService.exchangeCodeForProfile(provider, code);
    return this.registrationService.registerOrLoginWithSocial(
      { provider, providerUserId: profile.providerUserId, email: profile.email, fullName: profile.fullName },
      deviceContextFrom(req),
    );
  }

  // -- 4. Magic link -----------------------------------------------------

  @Post('magic-link/request')
  @HttpCode(200)
  async requestMagicLink(@Body() dto: RequestMagicLinkDto) {
    return this.registrationService.requestMagicLink(dto);
  }

  @Post('magic-link/consume')
  @HttpCode(200)
  async consumeMagicLink(@Body() dto: ConsumeMagicLinkDto, @Req() req: FastifyRequest) {
    return this.registrationService.consumeMagicLink(dto, deviceContextFrom(req));
  }

  // -- 5. Admin-created (coordinator+) -----------------------------------

  @Post('admin-created')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.user.create')
  async adminCreate(@CurrentUser() actor: AccessTokenPayload, @Body() dto: AdminCreateAccountDto) {
    return this.registrationService.adminCreateAccount(actor.sub, dto);
  }

  // -- 6. Invitation-based ------------------------------------------------

  @Post('invitations')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.invitation.create')
  async createInvitation(@CurrentUser() actor: AccessTokenPayload, @Body() dto: CreateInvitationDto) {
    return this.registrationService.createInvitation(actor.sub, dto);
  }

  @Post('invitations/accept')
  @HttpCode(201)
  async acceptInvitation(@Body() dto: AcceptInvitationDto, @Req() req: FastifyRequest) {
    return this.registrationService.acceptInvitation(dto, deviceContextFrom(req));
  }
}
