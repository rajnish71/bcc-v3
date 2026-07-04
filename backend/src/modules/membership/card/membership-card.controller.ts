// backend/src/modules/membership/card/membership-card.controller.ts
//
// GET /membership/memberships/:membershipId/card
//
// Access rules:
//   - A member may always download their OWN card (owner_type=INDIVIDUAL,
//     m.user_id === req.user.sub).
//   - Staff with membership.card.generate permission can download any card.
//
// Returns: application/pdf binary; filename header included.

import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Res,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { RbacService } from '../../identity/rbac/rbac.service';
import { MembershipCardService } from './membership-card.service';
import { db } from '../../../database/db';

@Controller('membership/memberships')
@UseGuards(AccessTokenGuard)
export class MembershipCardController {
  constructor(
    private readonly cardService: MembershipCardService,
    private readonly rbacService: RbacService,
  ) {}

  @Get(':membershipId/card')
  async downloadCard(
    @Param('membershipId', ParseIntPipe) membershipId: number,
    @Request() req: { user: { sub: number } },
    @Res() res: FastifyReply,
  ): Promise<void> {
    const actorId = req.user.sub;

    // Resolve access: own card or staff permission
    const canGenerateAny = await this.rbacService.hasPermission(actorId, 'membership.card.generate');

    if (!canGenerateAny) {
      // Check ownership
      const membership = await db
        .selectFrom('memberships')
        .select(['user_id', 'owner_type'])
        .where('id', '=', membershipId)
        .executeTakeFirst();

      if (!membership) {
        // Let cardService produce the correct 404
      } else if (membership.owner_type === 'GROUP' || membership.user_id !== actorId) {
        throw new ForbiddenException('You may only download your own membership card');
      }
    }

    const pdfBuffer = await this.cardService.generateCardPdf(membershipId);

    void res
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="bcc-membership-${membershipId}.pdf"`)
      .header('Content-Length', pdfBuffer.length)
      .send(pdfBuffer);
  }
}
