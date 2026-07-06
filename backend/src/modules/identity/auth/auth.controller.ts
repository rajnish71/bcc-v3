// backend/src/modules/identity/auth/auth.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService, DeviceContext } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AccessTokenGuard } from './access-token.guard';
import { CurrentUser } from './current-user.decorator';
import type { AccessTokenPayload } from './token.util';

function deviceContextFrom(req: FastifyRequest): DeviceContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string) ?? null,
  };
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: FastifyRequest) {
    return this.authService.login(dto.email, dto.password, deviceContextFrom(req));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: FastifyRequest) {
    return this.authService.refresh(dto.refreshToken, deviceContextFrom(req));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
  }

  @Get('sessions')
  @UseGuards(AccessTokenGuard)
  async listSessions(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.listActiveSessions(user.sub);
  }

  @Delete('sessions/:id')
  @UseGuards(AccessTokenGuard)
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) sessionId: number,
  ) {
    await this.authService.revokeSession(user.sub, sessionId);
  }
}
