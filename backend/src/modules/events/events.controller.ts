// backend/src/modules/events/events.controller.ts
//
// REST surface for Module 04 Events.
//
// PUBLIC endpoints (no auth guard):
//   GET  /api/v1/events          list published events
//   GET  /api/v1/events/:id      get event detail
//
// AUTHENTICATED (AccessTokenGuard only):
//   POST /api/v1/events/:id/registrations          register for event
//   DELETE /api/v1/events/:id/registrations/:regId cancel own registration
//   POST /api/v1/events/:id/volunteer-slots/:slotId/apply  apply as volunteer
//
// COORDINATOR / ADMIN (AccessTokenGuard + RbacGuard):
//   POST   /api/v1/events                                  create event
//   PATCH  /api/v1/events/:id                              update event
//   POST   /api/v1/events/:id/publish                      publish event
//   POST   /api/v1/events/:id/complete                     mark completed
//   POST   /api/v1/events/:id/cancel                       cancel event
//   GET    /api/v1/events/:id/registrations                list registrations
//   POST   /api/v1/events/:id/registrations/:regId/checkin check in
//   DELETE /api/v1/events/:id/registrations/:regId (admin) cancel any reg
//   POST   /api/v1/events/:id/invites                      add to invite list
//   POST   /api/v1/events/:id/volunteer-slots              create slot
//   GET    /api/v1/events/:id/volunteer-slots              list slots
//   PATCH  /api/v1/events/:id/volunteer-slots/:slotId/volunteers/:volId update volunteer

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
  RegisterEventDto,
  CancelRegistrationDto,
  CreateVolunteerSlotDto,
  UpdateVolunteerStatusDto,
  CancelEventDto,
  AddInviteDto,
} from './dto/register-event.dto';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RequirePermissions } from '../identity/rbac/permissions.decorator';

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
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Unauthenticated callers only see PUBLISHED events
    return this.events.listEvents({
      state: state ?? 'PUBLISHED',
      event_type,
      upcoming_only: upcoming === 'true',
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get(':id')
  async getEvent(@Param('id', ParseIntPipe) id: number) {
    return this.events.getEvent(id);
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
    return this.events.cancelEvent(id, dto.reason, req.user.sub);
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

  // =========================================================================
  // REGISTRATION -- member self-service
  // =========================================================================

  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post(':id/registrations')
  async register(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterEventDto,
    @Req() req: any,
  ) {
    return this.events.registerForEvent(id, dto, req.user.sub);
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
    return this.events.cancelRegistration(eventId, regId, req.user.sub, dto, false);
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
    return this.events.cancelRegistration(eventId, regId, req.user.sub, dto, true);
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

  // =========================================================================
  // VOLUNTEER SLOTS
  // =========================================================================

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.volunteer.manage')
  @Post(':id/volunteer-slots')
  async createSlot(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateVolunteerSlotDto,
    @Req() req: any,
  ) {
    return this.events.createVolunteerSlot(id, dto, req.user.sub);
  }

  @Get(':id/volunteer-slots')
  async listSlots(@Param('id', ParseIntPipe) id: number) {
    return this.events.listVolunteerSlots(id);
  }

  // Spec 10.1: any Registered User can volunteer
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post(':id/volunteer-slots/:slotId/apply')
  async applyAsVolunteer(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('slotId', ParseIntPipe) slotId: number,
    @Req() req: any,
  ) {
    return this.events.applyAsVolunteer(eventId, slotId, req.user.sub);
  }

  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('event.volunteer.manage')
  @HttpCode(HttpStatus.OK)
  @Patch(':id/volunteer-slots/:slotId/volunteers/:volId')
  async updateVolunteer(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('volId', ParseIntPipe) volId: number,
    @Body() dto: UpdateVolunteerStatusDto,
    @Req() req: any,
  ) {
    return this.events.updateVolunteerStatus(eventId, volId, dto, req.user.sub);
  }
}
