// backend/src/modules/membership/membership.controller.ts
//
// HTTP surface: application intake (self + on-behalf) + seven-state lifecycle.
//
// Batch 3: POST /:id/approve and /:id/reject route through
// ApplicationWorkflowService.recordStageDecision() -- a coordinator approval
// IS the COORDINATOR stage of the staged approval flow (spec 02.4). For
// operational and group applications this is the sole required stage and
// completes the transition; for constitutional-class applications it records
// the stage and returns the next required stage.

import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import * as argon2 from 'argon2';
import { db } from '../../database/db';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/token.util';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RequirePermissions } from '../identity/rbac/permissions.decorator';
import { MembershipLifecycleService } from './lifecycle/membership-lifecycle.service';
import { ApplicationWorkflowService } from './application/application-workflow.service';
import { ApplyMembershipDto } from './dto/apply-membership.dto';
import { ApplyOnBehalfDto } from './dto/apply-on-behalf.dto';
import { RejectMembershipDto } from './dto/reject-membership.dto';
import { SuspendMembershipDto } from './dto/suspend-membership.dto';
import { TerminateMembershipDto } from './dto/terminate-membership.dto';
import { SELF_SERVICE_CLASS_CODES } from './dto/submit-membership-form.dto';

@Controller('api/v1/membership')
export class MembershipController {
  constructor(
    private readonly lifecycle: MembershipLifecycleService,
    private readonly workflow: ApplicationWorkflowService,
  ) {}

  // -- Applications --------------------------------------------------

  @Post('applications')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  async apply(@CurrentUser() actor: AccessTokenPayload, @Body() dto: ApplyMembershipDto) {
    return this.lifecycle.apply({
      ownerType: 'INDIVIDUAL',
      membershipClassId: dto.membershipClassId,
      userId: actor.sub,
    });
  }

  @Post('applications/on-behalf')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.create_for_others')
  async applyOnBehalf(@Body() dto: ApplyOnBehalfDto) {
    return this.lifecycle.apply({
      ownerType: dto.groupEntityId ? 'GROUP' : 'INDIVIDUAL',
      membershipClassId: dto.membershipClassId ?? null,
      groupMembershipTypeId: dto.groupMembershipTypeId ?? null,
      userId: dto.groupEntityId ? null : dto.userId,
      groupEntityId: dto.groupEntityId ?? null,
    });
  }

  @Post(':id/approve')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.approve')
  async approve(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.workflow.recordStageDecision({
      membershipId: id,
      stage: 'COORDINATOR',
      decision: 'APPROVED',
      actorUserId: actor.sub,
    });
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
    return this.workflow.recordStageDecision({
      membershipId: id,
      stage: 'COORDINATOR',
      decision: 'REJECTED',
      actorUserId: actor.sub,
      note: dto.reason,
    });
  }

  // -- Activation / payment -------------------------------------------

  @Post(':id/activate')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.activate')
  async activate(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.lifecycle.activate(id, { type: 'ADMIN', userId: actor.sub });
  }

  @Post(':id/resend-activation-email')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.activate')
  async resendActivationEmail(@Param('id', ParseIntPipe) id: number) {
    await this.lifecycle.resendActivationNotification(id);
    return { ok: true };
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
  // Static routes declared before parameterised :id to prevent shadowing.

  // Public, unauthenticated: the /membership marketing page and the
  // registration/application flow read fee_inr and term entitlements from
  // here instead of hard-coding prices. Scoped to SELF_SERVICE_CLASS_CODES
  // only (MEM-006: constitutional class names/pricing never appear on
  // public surfaces) and to a fixed, non-sensitive set of entitlement keys.
  @Get('public/classes')
  @HttpCode(200)
  async publicClasses() {
    const classes = await db
      .selectFrom('membership_classes')
      .select(['id', 'code', 'name', 'sort_order'])
      .where('code', 'in', SELF_SERVICE_CLASS_CODES as unknown as string[])
      .where('type', '=', 'OPERATIONAL')
      .orderBy('sort_order', 'asc')
      .execute();

    const classIds = classes.map((c) => c.id);
    const entitlementKeys = [
      'fee_inr',
      'validity_months',
      'renewal_term_months',
      'pvc_card',
      'welcome_kit',
      'discount_pct',
      'tour_discount_pct',
    ];
    const entitlements = classIds.length
      ? await db
          .selectFrom('class_entitlements')
          .select(['membership_class_id', 'entitlement_key', 'entitlement_value'])
          .where('membership_class_id', 'in', classIds)
          .where('entitlement_key', 'in', entitlementKeys)
          .execute()
      : [];

    const byClass = new Map<number, Record<string, string>>();
    for (const e of entitlements) {
      const existing = byClass.get(e.membership_class_id) ?? {};
      existing[e.entitlement_key] = e.entitlement_value;
      byClass.set(e.membership_class_id, existing);
    }

    return classes.map((c) => {
      const ent = byClass.get(c.id) ?? {};
      return {
        code: c.code,
        name: c.name,
        feeInr: Number(ent.fee_inr ?? '0'),
        validityMonths: Number(ent.renewal_term_months ?? ent.validity_months ?? '12'),
        pvcCard: ent.pvc_card === 'true',
        welcomeKit: ent.welcome_kit === 'true',
        discountPct: Number(ent.discount_pct ?? '0'),
        tourDiscountPct: Number(ent.tour_discount_pct ?? '0'),
      };
    });
  }

  @Get('admin/pending')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async pendingApplications() {
    return db
      .selectFrom('memberships as m')
      .leftJoin('users as u', 'u.id', 'm.user_id')
      .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .select([
        'm.id',
        'm.user_id',
        'm.lifecycle_state',
        'm.owner_type',
        'm.applied_at',
        'm.membership_class_id',
        'u.username',
        'u.full_name',
        'u.email',
        'mc.name as class_name',
        'mc.code as class_code',
      ])
      .where('m.lifecycle_state', '=', 'PENDING')
      .orderBy('m.applied_at', 'asc')
      .execute();
  }

  @Post('admin/users/:userId/reset-password')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.approve')
  async adminResetPassword(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { newPassword: string },
  ) {
    if (!body.newPassword || body.newPassword.length < 8) {
      throw new BadRequestException('newPassword must be at least 8 characters');
    }
    const hash = await argon2.hash(body.newPassword);
    await db
      .updateTable('users')
      .set({ password_hash: hash, force_password_reset: true })
      .where('id', '=', userId)
      .execute();
    return { ok: true };
  }

  @Get('mine')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async mine(@CurrentUser() actor: AccessTokenPayload) {
    return this.lifecycle.listForUser(actor.sub);
  }

  @Get('due-for-expiry/list')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.expire')
  async dueForExpiry() {
    return this.lifecycle.listDueForExpiry();
  }

  @Get(':id')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.record.view')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.lifecycle.getOrThrow(id);
  }

}
