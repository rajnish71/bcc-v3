// backend/src/modules/membership/card/membership-verify.controller.ts
//
// GET /membership/verify/:token
//
// Deliberately UNAUTHENTICATED -- this is the endpoint a QR scan lands on.
// `token` is card_verify_token (migration 0029), an opaque unguessable
// slug, NEVER membership_number. Do not add a route that accepts
// membership_number here; that would recreate the enumeration problem this
// token exists to avoid.
//
// Response is intentionally minimal (see VerifyResult) -- no email, phone,
// or user_id. This is the public-facing "yes, this card is real" surface,
// not a member lookup API.

import { Controller, Get, Param } from '@nestjs/common';
import { MembershipCardService } from './membership-card.service';

@Controller('membership/verify')
export class MembershipVerifyController {
  constructor(private readonly cardService: MembershipCardService) {}

  @Get(':token')
  async verify(@Param('token') token: string) {
    return this.cardService.verifyToken(token);
  }
}
