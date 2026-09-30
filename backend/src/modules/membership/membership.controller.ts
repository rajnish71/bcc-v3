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

import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import * as argon2 from 'argon2';
import { sql } from 'kysely';
import { requestAuditContext } from '../financial/audit/request-provenance.util';
import { db } from '../../database/db';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/token.util';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RequirePermissions } from '../identity/rbac/permissions.decorator';
import { logIdentityAudit } from '../identity/shared/identity-audit.util';
import { MembershipLifecycleService } from './lifecycle/membership-lifecycle.service';
import { ApplicationWorkflowService } from './application/application-workflow.service';
import { ApplyMembershipDto } from './dto/apply-membership.dto';
import { ApplyOnBehalfDto } from './dto/apply-on-behalf.dto';
import { RejectMembershipDto } from './dto/reject-membership.dto';
import { SuspendMembershipDto } from './dto/suspend-membership.dto';
import { TerminateMembershipDto } from './dto/terminate-membership.dto';
import { SELF_SERVICE_CLASS_CODES } from './dto/submit-membership-form.dto';
import { parseMaxPhotos } from '../gallery/portfolio-exposure.policy';

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
  async apply(
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: ApplyMembershipDto,
    @Req() req: FastifyRequest,
  ) {
    return this.lifecycle.apply(
      {
        ownerType: 'INDIVIDUAL',
        membershipClassId: dto.membershipClassId,
        userId: actor.sub,
      },
      requestAuditContext('MEMBER', req, actor),
    );
  }

  // The audit actor is the staff member acting, not the payer.
  @Post('applications/on-behalf')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.create_for_others')
  async applyOnBehalf(
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: ApplyOnBehalfDto,
    @Req() req: FastifyRequest,
  ) {
    return this.lifecycle.apply(
      {
        ownerType: dto.groupEntityId ? 'GROUP' : 'INDIVIDUAL',
        membershipClassId: dto.membershipClassId ?? null,
        groupMembershipTypeId: dto.groupMembershipTypeId ?? null,
        userId: dto.groupEntityId ? null : dto.userId,
        groupEntityId: dto.groupEntityId ?? null,
      },
      requestAuditContext('ADMIN', req, actor),
    );
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
    @Req() req: FastifyRequest,
  ) {
    return this.workflow.recordStageDecision({
      membershipId: id,
      stage: 'COORDINATOR',
      decision: 'REJECTED',
      actorUserId: actor.sub,
      note: dto.reason,
      auditContext: requestAuditContext('ADMIN', req, actor),
    });
  }

  // Family / Corporate: create (idempotently) the application's Financial
  // Contribution. Same permission that files group applications (they are
  // only ever created on-behalf today). Returns the contribution id for the
  // generic Financial Engine routes (e.g. .../settlement/payment-link);
  // never approves, activates or numbers the membership.
  @Post(':id/group-contribution')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.application.create_for_others')
  async createGroupContribution(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    return this.lifecycle.createGroupApplicationContribution(id, requestAuditContext('ADMIN', req, actor));
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

  // Family / Corporate renewal: step 1 -- the term's PAY-001 renewal
  // obligation (idempotent; paid via the generic payment-link route).
  @Post(':id/group-renewal-contribution')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.renew')
  async createGroupRenewalContribution(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    return this.lifecycle.createGroupRenewalContribution(id, requestAuditContext('ADMIN', req, actor));
  }

  // Family / Corporate renewal: step 2 -- refused unless that renewal
  // Contribution is COMPLETED. Extends the group and its members' existing
  // records; creates no record and allocates no number.
  @Post(':id/group-renew')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('membership.lifecycle.renew')
  async renewGroup(@CurrentUser() actor: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.lifecycle.renewGroup(id, actor.sub);
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
  // here instead of hard-coding prices. Individual-ownership classes are
  // scoped to SELF_SERVICE_CLASS_CODES (MEM-006: constitutional class
  // names/pricing never appear on public surfaces) and a fixed,
  // non-sensitive set of entitlement keys. Family/Corporate are group
  // memberships (a separate model -- group_membership_types +
  // group_type_entitlements, not membership_classes/class_entitlements) and
  // are merged in from that source, tagged `kind: 'GROUP'` so consumers
  // can't confuse them with individual-ownership classes. INSTITUTIONAL is
  // excluded -- it has no presence on the public catalogue today.
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
      'portfolio_enabled',
      'portfolio_max_photos',
      'public_gallery_enabled',
      'featured_in_directory',
      'priority_registration',
      'digital_card',
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

    const individualResults = classes.map((c) => {
      const ent = byClass.get(c.id) ?? {};
      return {
        code: c.code,
        name: c.name,
        kind: 'INDIVIDUAL' as const,
        feeInr: Number(ent.fee_inr ?? '0'),
        validityMonths: Number(ent.renewal_term_months ?? ent.validity_months ?? '12'),
        pvcCard: ent.pvc_card === 'true',
        welcomeKit: ent.welcome_kit === 'true',
        discountPct: Number(ent.discount_pct ?? '0'),
        tourDiscountPct: Number(ent.tour_discount_pct ?? '0'),
        portfolioEnabled: ent.portfolio_enabled === 'true',
        // MEM-008: null = full/unlimited public portfolio; a number = cap.
        portfolioMaxPhotos: parseMaxPhotos(ent.portfolio_max_photos),
        publicGalleryEnabled: ent.public_gallery_enabled === 'true',
        featuredInDirectory: ent.featured_in_directory === 'true',
        priorityRegistration: ent.priority_registration === 'true',
        digitalCard: ent.digital_card === 'true',
      };
    });

    const groupTypes = await db
      .selectFrom('group_membership_types')
      .select(['id', 'code', 'name', 'sort_order'])
      .where('entity_type', 'in', ['FAMILY', 'CORPORATE'])
      .orderBy('sort_order', 'asc')
      .execute();

    const groupTypeIds = groupTypes.map((g) => g.id);
    const groupEntitlementKeys = [
      'fee_inr',
      'validity_months',
      'pvc_card',
      'welcome_kit',
      'discount_pct',
      'tour_discount_pct',
      'portfolio_enabled',
      'portfolio_max_photos',
      'public_gallery_enabled',
      'featured_in_directory',
      'priority_registration',
      'digital_card',
      'max_delegates',
      'company_recognition',
    ];
    const groupEntitlements = groupTypeIds.length
      ? await db
          .selectFrom('group_type_entitlements')
          .select(['group_membership_type_id', 'entitlement_key', 'entitlement_value'])
          .where('group_membership_type_id', 'in', groupTypeIds)
          .where('entitlement_key', 'in', groupEntitlementKeys)
          .execute()
      : [];

    const byGroupType = new Map<number, Record<string, string>>();
    for (const e of groupEntitlements) {
      const existing = byGroupType.get(e.group_membership_type_id) ?? {};
      existing[e.entitlement_key] = e.entitlement_value;
      byGroupType.set(e.group_membership_type_id, existing);
    }

    const groupResults = groupTypes.map((g) => {
      const ent = byGroupType.get(g.id) ?? {};
      return {
        code: g.code,
        name: g.name,
        kind: 'GROUP' as const,
        feeInr: Number(ent.fee_inr ?? '0'),
        validityMonths: Number(ent.validity_months ?? '12'),
        pvcCard: ent.pvc_card === 'true',
        welcomeKit: ent.welcome_kit === 'true',
        discountPct: Number(ent.discount_pct ?? '0'),
        tourDiscountPct: Number(ent.tour_discount_pct ?? '0'),
        portfolioEnabled: ent.portfolio_enabled === 'true',
        // MEM-008: null = full/unlimited public portfolio; a number = cap.
        portfolioMaxPhotos: parseMaxPhotos(ent.portfolio_max_photos),
        publicGalleryEnabled: ent.public_gallery_enabled === 'true',
        featuredInDirectory: ent.featured_in_directory === 'true',
        priorityRegistration: ent.priority_registration === 'true',
        digitalCard: ent.digital_card === 'true',
        maxDelegates: Number(ent.max_delegates ?? '0'),
        companyRecognition: ent.company_recognition === 'true',
      };
    });

    return [...individualResults, ...groupResults];
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
      // Family / Corporate applications have no user/class: surface the
      // group entity + type, and the application Contribution (id, state,
      // live payment link) so staff can see payment state and hand the
      // link to the head. The link URL is never secret (PAY-001 0104).
      .leftJoin('group_entities as ge', 'ge.id', 'm.group_entity_id')
      .leftJoin('group_membership_types as gmt', 'gmt.id', 'm.group_membership_type_id')
      .leftJoin('users as gu', 'gu.id', 'ge.primary_contact_user_id')
      .leftJoin('financial_contributions as gfc', (join) =>
        join
          .onRef('gfc.business_reference_id', '=', 'm.id')
          .on('gfc.business_module', '=', 'MEMBERSHIP')
          .on('m.owner_type', '=', 'GROUP')
          .on(sql`gfc.idempotency_key = CONCAT('MEMBERSHIP-', m.id, '-CONTRIBUTION')`),
      )
      .select((eb) => [
        'ge.name as group_name',
        'ge.type as group_type',
        'gmt.name as group_type_name',
        'gu.full_name as group_head_name',
        'gu.email as group_head_email',
        'gfc.id as group_contribution_id',
        'gfc.state as group_contribution_state',
        'gfc.amount_paise as group_contribution_amount_paise',
        'gfc.active_settlement_url as group_payment_link_url',
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
        'mc.activation_mode as activation_mode',
        // Latest Financial Contribution state (same lookup as
        // FinancialContributionService.findLatestForBusinessReference) so the
        // Admin Console can withhold Approve until payment is COMPLETED.
        eb
          .selectFrom('financial_contributions as fc')
          .select('fc.state')
          .where('fc.business_module', '=', 'MEMBERSHIP')
          .whereRef('fc.business_reference_id', '=', 'm.id')
          .orderBy('fc.created_at', 'desc')
          .limit(1)
          .as('contribution_state'),
      ])
      .where('m.lifecycle_state', '=', 'PENDING')
      .orderBy('m.applied_at', 'asc')
      .execute();
  }

  @Post('admin/users/:userId/reset-password')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('identity.user.reset_password')
  async adminResetPassword(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { newPassword: string },
  ) {
    if (!body.newPassword || body.newPassword.length < 8) {
      throw new BadRequestException('newPassword must be at least 8 characters');
    }
    const hash = await argon2.hash(body.newPassword);

    // F-011: password update + audit entry happen inside a single
    // transaction, following the pattern established for resetPassword()
    // in auth.service.ts.
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({ password_hash: hash, force_password_reset: true })
        .where('id', '=', userId)
        .execute();

      await logIdentityAudit(
        {
          actorId: actor.sub,
          targetUserId: userId,
          actionType: 'ADMIN_PASSWORD_RESET',
        },
        trx,
      );
    });

    return { ok: true };
  }

  @Get('mine')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async mine(@CurrentUser() actor: AccessTokenPayload) {
    const memberships = await this.lifecycle.listForUser(actor.sub);
    if (memberships.length === 0) return memberships;

    // Surface an active complimentary-period marker (individual_overrides,
    // key='complimentary_period') so the Hub can show a courtesy badge
    // instead of implying this is the standard paid plan. Read-only lookup;
    // never affects fee/term resolution (see EntitlementService.getClassConfigValue).
    const overrides = await db
      .selectFrom('individual_overrides')
      .select(['membership_id', 'expires_at', 'reason'])
      .where('membership_id', 'in', memberships.map((m) => m.id))
      .where('entitlement_key', '=', 'complimentary_period')
      .where('override_type', '=', 'GRANT')
      .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', new Date())]))
      .execute();
    const complimentaryByMembership = new Map(overrides.map((o) => [o.membership_id, o]));

    return memberships.map((m) => {
      const c = complimentaryByMembership.get(m.id);
      return c ? { ...m, complimentary: { until: c.expires_at, reason: c.reason } } : m;
    });
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
