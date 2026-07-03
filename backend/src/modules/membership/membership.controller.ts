// backend/src/modules/membership/membership.controller.ts
//
// HTTP surface for this pass: application intake + the seven-state
// lifecycle + migration-only reserved-number assignment. Deliberately does
// NOT include entitlement/recognition/group-CRUD/voting/reporting
// endpoints -- those are separate future sessions (see chat history for the
// gap list flagged at the start of this build).

import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { db } from '../../database/db';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/token.util';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RequirePermissions } from '../identity/rbac/permissions.decorator';
import { MembershipLifecycleService } from './lifecycle/membership-lifecycle.service';
import { MembershipNumberingService } from './numbering/membership-numbering.service';
import { ApplyMembershipDto } from './dto/apply-membership.dto';
import { ApplyOnBehalfDto } from './dto/apply-on-behalf.dto';
import { RejectMembershipDto } from './dto/reject-membership.dto';
import { SuspendMembershipDto } from './dto/suspend-membership.dto';
import { TerminateMembershipDto } from './dto/terminate-membership.dto';
import { AssignReservedNumberDto } from './dto/assign-reserved-number.dto';

@Controller('membership')
export class MembershipController {
  constructor(
    private readonly lifecycle: MembershipLifecycleService,
    private readonly numbering: MembershipNumberingService,
  ) {}

  // -- Applications --------------------------------------------------

  @Post('applications')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async apply(@CurrentUser() actor: AccessTokenPayload, @Body() dto: ApplyMembershipDto) {
    return this.lifecycle.apply({
      membershipClassId: dto.membershipClassId,
      ownerType: 'INDIVIDUAL',
      userId: actor.sub,
    });
  }

  @Post('applications/on-behalf')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.create_for_others')
  async applyOnBehalf(@Body() dto: ApplyOnBehalfDto) {
    return this.lifecycle.apply({
      membershipClassId: dto.membershipClassId,
      ownerType: dto.groupEntityId ? 'GROUP' : 'INDIVIDUAL',
      userId: dto.groupEntityId ? null : dto.userId,
      groupEntityId: dto.groupEntityId ?? null,
    });
  }

  @Post(':id/approve')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.approve')
  async approve(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    await this.lifecycle.approve(id, actor.sub);
    return { ok: true };
  }

  @Post(':id/reject')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.reject')
  async reject(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectMembershipDto,
  ) {
    await this.lifecycle.reject(id, actor.sub, dto.reason);
    return { ok: true };
  }

  // -- Activation / payment -------------------------------------------
  // Manual/coordinator activation path. The eventual Razorpay-webhook path
  // (Module 11) will call MembershipLifecycleService.activate() directly
  // from the webhook handler, not through this guarded HTTP route.

  @Post(':id/activate')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.activate')
  async activate(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.lifecycle.activate(id, { type: 'ADMIN', userId: actor.sub });
  }

  @Post(':id/payment-failure')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.record_payment_failure')
  async recordPaymentFailure(@Param('id', ParseIntPipe) id: number) {
    await this.lifecycle.recordPaymentFailure(id);
    return { ok: true };
  }

  // -- Suspension / reinstatement --------------------------------------

  @Post(':id/suspend')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.suspend')
  async suspend(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuspendMembershipDto,
  ) {
    await this.lifecycle.suspend(id, actor.sub, dto.reason);
    return { ok: true };
  }

  @Post(':id/reinstate')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.reinstate')
  async reinstate(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    await this.lifecycle.reinstate(id, actor.sub);
    return { ok: true };
  }

  // -- Expiry / renewal -------------------------------------------------
  // Manual/coordinator-triggered for now -- no scheduled job exists yet
  // (see MembershipLifecycleService header).

  @Post(':id/expire')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.expire')
  async expire(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    await this.lifecycle.markExpired(id, { type: 'ADMIN', userId: actor.sub });
    return { ok: true };
  }

  @Post(':id/renew')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.renew')
  async renew(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    await this.lifecycle.renewFromExpired(id, actor.sub, 'ADMIN');
    return { ok: true };
  }

  // -- Termination -------------------------------------------------------

  @Post(':id/terminate')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.terminate')
  async terminate(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TerminateMembershipDto,
  ) {
    await this.lifecycle.terminate(id, actor.sub, dto.reason);
    return { ok: true };
  }

  // -- Reads ---------------------------------------------------------

  @Get('mine')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async mine(@CurrentUser() actor: AccessTokenPayload) {
    return this.lifecycle.listForUser(actor.sub);
  }

  @Get(':id')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.lifecycle.getOrThrow(id);
  }

  // -- Migration-only numbering (Super Admin only) -----------------------
  // MEM-007 §7: one-time migration allocation for Founding (00001-00007)
  // and Historical Block (00008-00020) serials. Not part of routine
  // membership administration -- see membership-numbering.service.ts header.

  @Post('migration/:id/assign-reserved-number')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.numbering.assign_reserved')
  async assignReservedNumber(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignReservedNumberDto,
  ) {
    return db.transaction().execute((trx) =>
      this.numbering.assignReservedNumber(
        trx,
        id,
        dto.serial,
        dto.assignmentType,
        dto.joinYear,
        dto.joinMonth,
        actor.sub,
        dto.notes,
      ),
    );
  }
}
