// backend/src/modules/events/events.controller.ts
//
// REST surface for Module 04 Activities (table `events`).
//
// PUBLIC endpoints (no auth guard). Only PUBLISHED / COMPLETED Activities are
// listed; DRAFT is never public:
//   GET  /api/v1/events?scope=upcoming|past   list public Activities
//   GET  /api/v1/events/:idOrSlug             Activity detail (numeric id or slug)
//
// AUTHENTICATED (AccessTokenGuard only -- any Registered User):
//   POST /api/v1/events/:id/registrations          participate (no body)
//   GET  /api/v1/events/:id/registrations/me       caller's own active registration
//   DELETE /api/v1/events/:id/registrations/:regId cancel own registration
//
// COORDINATOR / ADMIN (AccessTokenGuard + RbacGuard):
//   POST   /api/v1/events                                  create Activity
//   PATCH  /api/v1/events/:id                              update Activity
//   POST   /api/v1/events/:id/publish                      publish (historical -> COMPLETED)
//   POST   /api/v1/events/:id/complete                     mark completed
//   POST   /api/v1/events/:id/cancel                       cancel Activity
//   GET    /api/v1/events/admin/all                        list any state
//   GET    /api/v1/events/admin/:id                        detail in any state
//   GET    /api/v1/events/:id/registrations                list registrations
//   POST   /api/v1/events/:id/registrations/:regId/checkin mark attended
//   DELETE /api/v1/events/:id/registrations/:regId/admin   cancel any registration
//   POST   /api/v1/events/:id/invites                      add to invite list
//
// The volunteer endpoints were removed in the Stage 1 reconciliation (out of
// Module 04 scope); the event_volunteer* tables are retained untouched.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import {
  CancelRegistrationDto,
  CancelEventDto,
  AddInviteDto,
} from './dto/register-event.dto';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RequirePermissions } from '../identity/rbac/permissions.decorator';
import { requestAuditContext } from '../financial/audit/request-provenance.util';

@Controller('api/v1/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // =========================================================================
  // PUBLIC
  // =========================================================================

  @Get()
  async listEvents(
    @Query('state') state?: string,
    @Query('event_type') event_type?: string,
    @Query('upcoming') upcoming?: string,
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.events.listEvents({
      public: true,
      state,
      event_type,
      upcoming_only: upcoming === 'true',
      scope: scope === 'upcoming' || scope === 'past' ? scope : undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  // =========================================================================
  // COORDINATOR / ADMIN -- event lifecycle
  // =========================================================================

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.create')
  @Post()
  async createEvent(@Body() dto: CreateEventDto, @Req() req: any) {
    return this.events.createEvent(dto, req.user.sub);
  }

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.update_any')
  @Patch(':id')
  async updateEvent(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventDto,
    @Req() req: any,
  ) {
    return this.events.updateEvent(id, dto, req.user.sub);
  }

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.publish')
  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  async publishEvent(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.events.publishEvent(id, req.user.sub);
  }

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.publish')
  @HttpCode(HttpStatus.OK)
  @Post(':id/complete')
  async completeEvent(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.events.completeEvent(id, req.user.sub);
  }

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.cancel_any')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  async cancelEvent(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelEventDto,
    @Req() req: any,
  ) {
    return this.events.cancelEvent(
      id,
      dto.reason,
      req.user.sub,
      requestAuditContext('ADMIN', req, req.user),
    );
  }

  // Admin view of all events (any state)
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.view_registrations')
  @Get('admin/all')
  async listAllEvents(
    @Query('state') state?: string,
    @Query('event_type') event_type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.events.listEvents({
      state,
      event_type,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.view_registrations')
  @Get('admin/:id')
  async getEventAdmin(@Param('id', ParseIntPipe) id: number) {
    return this.events.getEvent(id);
  }

  // Public detail. Declared after the static admin/* routes.
  @Get(':idOrSlug')
  async getEvent(@Param('idOrSlug') idOrSlug: string) {
    return this.events.getPublicEvent(idOrSlug);
  }

  // =========================================================================
  // REGISTRATION -- Registered User self-service
  // =========================================================================

  // Any Registered User may participate; membership is consulted only when
  // the Activity's eligibility rules require it.
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post(':id/registrations')
  async register(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.events.registerForEvent(id, req.user.sub);
  }

  // The caller's own active registration (or null) -- read-only, identity
  // from the token. Wrapped in an object so "none" is an explicit value.
  @UseGuards(AccessTokenGuard)
  @Get(':id/registrations/me')
  async getMyRegistration(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return { registration: await this.events.getMyRegistration(id, req.user.sub) };
  }

  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @Delete(':id/registrations/:regId')
  async cancelRegistration(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('regId', ParseIntPipe) regId: number,
    @Body() dto: CancelRegistrationDto,
    @Req() req: any,
  ) {
    // hasAdminPermission = false: service will verify actor owns the registration
    return this.events.cancelRegistration(
      eventId,
      regId,
      req.user.sub,
      dto,
      false,
      requestAuditContext('MEMBER', req, req.user),
    );
  }

  // =========================================================================
  // REGISTRATION -- coordinator
  // =========================================================================

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.view_registrations')
  @Get(':id/registrations')
  async listRegistrations(
    @Param('id', ParseIntPipe) id: number,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.events.listRegistrations(id, {
      status,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.registration.checkin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/registrations/:regId/checkin')
  async checkIn(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('regId', ParseIntPipe) regId: number,
    @Req() req: any,
  ) {
    return this.events.checkIn(eventId, regId, req.user.sub);
  }

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.view_registrations')
  @HttpCode(HttpStatus.OK)
  @Delete(':id/registrations/:regId/admin')
  async adminCancelRegistration(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('regId', ParseIntPipe) regId: number,
    @Body() dto: CancelRegistrationDto,
    @Req() req: any,
  ) {
    return this.events.cancelRegistration(
      eventId,
      regId,
      req.user.sub,
      dto,
      true,
      requestAuditContext('ADMIN', req, req.user),
    );
  }

  // =========================================================================
  // INVITE LIST
  // =========================================================================

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.update_any')
  @HttpCode(HttpStatus.OK)
  @Post(':id/invites')
  async addInvites(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddInviteDto,
    @Req() req: any,
  ) {
    return this.events.addToInviteList(id, dto, req.user.sub);
  }
}
