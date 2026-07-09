// backend/src/modules/contact/contact.controller.ts
//
// Route: POST /api/v1/contact
//
// Public endpoint (no auth guard) — the contact form is available to visitors.
// class-validator runs via the global ValidationPipe; any invalid body returns
// a structured 400 with field-level messages.
//
// Rate-limiting is intentionally left to the Nginx layer (10r/m per IP is
// recommended for this endpoint in nginx.conf). No throttle guard added here
// to avoid introducing a new dependency (ThrottlerModule) for a single route.

import {
  Body,
  Controller,
  HttpCode,
  Post,
  Ip,
  Headers,
} from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactDto } from './contact.dto';

@Controller('api/v1/contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  // POST /api/v1/contact
  @Post()
  @HttpCode(200)
  async submit(
    @Body() dto: ContactDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<{ ok: boolean }> {
    await this.contact.send(dto, ip, userAgent);
    return { ok: true };
  }
}
