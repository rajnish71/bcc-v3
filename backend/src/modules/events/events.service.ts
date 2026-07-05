// backend/src/modules/events/events.service.ts
//
// Module 04 -- Events & Activity Management (spec sections 04.1 - 04.4).
//
// ELIGIBILITY MODES (spec 04.1):
//   OPEN                       Any Registered User, including guests.
//   MEMBERS_ONLY               ACTIVE membership in any class.
//   CONSTITUTIONAL_MEMBERS_ONLY ACTIVE membership in a CONSTITUTIONAL class.
//   SPECIFIC_CLASSES           ACTIVE membership whose class_id is in
//                              event.allowed_class_ids (JSON array).
//   INVITE_ONLY                user_id present in event_invite_list.
//
// CAPACITY / WAITLIST:
//   capacity NULL = unlimited; registrations always get REGISTERED status.
//   capacity set: count REGISTERED+ATTENDED rows. If full:
//     waitlist_enabled  -> WAITLISTED with next sequential position.
//     !waitlist_enabled -> 409 Conflict.
//   On cancellation of a REGISTERED row: promote the earliest WAITLISTED
//   row synchronously (no cron/worker queue -- RAM-conscious Phase 2a).
//
// PAYMENTS (Phase 2a):
//   fee_paid_paise tracked directly on event_registrations; no FK into
//   the payments table (which is currently membership-scoped). Full
//   Razorpay integration for events is deferred to Module 11 expansion.
//
// NOTIFICATIONS:
//   Dispatched via injected CommunicationService.dispatch().
//   24h reminder type is seeded but actual scheduling deferred (no cron).
//
// KYSELY NOTE: uses expression builder (eb) => eb.fn pattern throughout,
// consistent with existing project services.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import { CommunicationService } from '../shared/communication/communication.service';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type {
  RegisterEventDto,
  CancelRegistrationDto,
  CreateVolunteerSlotDto,
  UpdateVolunteerStatusDto,
  AddInviteDto,
} from './dto/register-event.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(title: string, suffix: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) +
    '-' +
    suffix.slice(0, 8)
  );
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

function isoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toDate(v).toISOString();
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface EventSummary {
  id: number;
  uuid: string;
  slug: string;
  title: string;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  eligibility_mode: string;
  fee_type: string;
  base_fee_paise: number;
  capacity: number | null;
  waitlist_enabled: boolean;
  state: string;
  registration_count: number;
  created_at: string;
}

export interface EventDetail extends EventSummary {
  description: string | null;
  occurrence: string;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_landmark: string | null;
  difficulty_level: string;
  age_restriction: string;
  weather_dependent: boolean;
  volunteer_slots_needed: number;
  what_to_bring: string | null;
  tags: string[];
  banner_r2_key: string | null;
  allowed_class_ids: number[];
  cancellation_reason: string | null;
  created_by: number;
  updated_at: string;
}

export interface RegistrationResult {
  id: number;
  uuid: string;
  event_id: number;
  registration_type: string;
  status: string;
  waitlist_position: number | null;
  registered_at: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class EventsService {
  constructor(private readonly comm: CommunicationService) {}

  // =========================================================================
  // EVENT CRUD
  // =========================================================================

  async createEvent(dto: CreateEventDto, actorId: number): Promise<EventDetail> {
    if (dto.eligibility_mode === 'SPECIFIC_CLASSES') {
      if (!dto.allowed_class_ids || dto.allowed_class_ids.length === 0) {
        throw new BadRequestException(
          'allowed_class_ids is required when eligibility_mode is SPECIFIC_CLASSES',
        );
      }
    }
    if (dto.fee_type && dto.fee_type !== 'FREE' && !dto.base_fee_paise) {
      throw new BadRequestException(
        'base_fee_paise must be > 0 when fee_type is not FREE',
      );
    }

    const uuid = randomUUID();
    const slug = slugify(dto.title, uuid);
    const now = toMysqlDatetime(new Date());

    await db
      .insertInto('events')
      .values({
        uuid,
        slug,
        title: dto.title,
        description: dto.description ?? null,
        event_type: dto.event_type,
        occurrence: dto.occurrence ?? 'SINGLE',
        starts_at: dto.starts_at,
        ends_at: dto.ends_at ?? null,
        location_name: dto.location_name ?? null,
        location_address: dto.location_address ?? null,
        location_lat: dto.location_lat ?? null,
        location_lng: dto.location_lng ?? null,
        location_landmark: dto.location_landmark ?? null,
        capacity: dto.capacity ?? null,
        waitlist_enabled: dto.waitlist_enabled ?? true,
        fee_type: dto.fee_type ?? 'FREE',
        base_fee_paise: dto.base_fee_paise ?? 0,
        eligibility_mode: dto.eligibility_mode ?? 'OPEN',
        allowed_class_ids:
          dto.eligibility_mode === 'SPECIFIC_CLASSES' && dto.allowed_class_ids
            ? JSON.stringify(dto.allowed_class_ids)
            : null,
        difficulty_level: dto.difficulty_level ?? 'ALL',
        age_restriction: dto.age_restriction ?? 'ALL',
        weather_dependent: dto.weather_dependent ?? false,
        volunteer_slots_needed: dto.volunteer_slots_needed ?? 0,
        what_to_bring: dto.what_to_bring ?? null,
        tags: dto.tags ? JSON.stringify(dto.tags) : null,
        banner_r2_key: null,
        state: 'DRAFT',
        cancellation_reason: null,
        created_by: actorId,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const row = await db
      .selectFrom('events')
      .selectAll()
      .where('uuid', '=', uuid)
      .executeTakeFirstOrThrow();

    return this.toDetail(row, 0);
  }

  async updateEvent(
    id: number,
    dto: UpdateEventDto,
    actorId: number,
  ): Promise<EventDetail> {
    const event = await this.loadEvent(id);
    if (event.state === 'CANCELLED' || event.state === 'COMPLETED') {
      throw new BadRequestException(
        `Cannot edit a ${event.state.toLowerCase()} event`,
      );
    }

    const patch: Record<string, unknown> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.event_type !== undefined) patch.event_type = dto.event_type;
    if (dto.occurrence !== undefined) patch.occurrence = dto.occurrence;
    if (dto.starts_at !== undefined) patch.starts_at = dto.starts_at;
    if (dto.ends_at !== undefined) patch.ends_at = dto.ends_at;
    if (dto.location_name !== undefined) patch.location_name = dto.location_name;
    if (dto.location_address !== undefined) patch.location_address = dto.location_address;
    if (dto.location_lat !== undefined) patch.location_lat = dto.location_lat;
    if (dto.location_lng !== undefined) patch.location_lng = dto.location_lng;
    if (dto.location_landmark !== undefined) patch.location_landmark = dto.location_landmark;
    if (dto.capacity !== undefined) patch.capacity = dto.capacity;
    if (dto.waitlist_enabled !== undefined) patch.waitlist_enabled = dto.waitlist_enabled;
    if (dto.fee_type !== undefined) patch.fee_type = dto.fee_type;
    if (dto.base_fee_paise !== undefined) patch.base_fee_paise = dto.base_fee_paise;
    if (dto.eligibility_mode !== undefined) patch.eligibility_mode = dto.eligibility_mode;
    if (dto.allowed_class_ids !== undefined) {
      const effectiveMode = dto.eligibility_mode ?? event.eligibility_mode;
      patch.allowed_class_ids =
        effectiveMode === 'SPECIFIC_CLASSES'
          ? JSON.stringify(dto.allowed_class_ids)
          : null;
    }
    if (dto.difficulty_level !== undefined) patch.difficulty_level = dto.difficulty_level;
    if (dto.age_restriction !== undefined) patch.age_restriction = dto.age_restriction;
    if (dto.weather_dependent !== undefined) patch.weather_dependent = dto.weather_dependent;
    if (dto.volunteer_slots_needed !== undefined) patch.volunteer_slots_needed = dto.volunteer_slots_needed;
    if (dto.what_to_bring !== undefined) patch.what_to_bring = dto.what_to_bring;
    if (dto.tags !== undefined) patch.tags = JSON.stringify(dto.tags);

    if (Object.keys(patch).length === 0) return this.getEvent(id);

    await db
      .updateTable('events')
      .set(patch as any)
      .where('id', '=', id)
      .execute();

    return this.getEvent(id);
  }

  async publishEvent(id: number, actorId: number): Promise<EventDetail> {
    const event = await this.loadEvent(id);
    if (event.state !== 'DRAFT') {
      throw new BadRequestException(
        `Only DRAFT events can be published (current state: ${event.state})`,
      );
    }
    await db
      .updateTable('events')
      .set({ state: 'PUBLISHED' })
      .where('id', '=', id)
      .execute();
    return this.getEvent(id);
  }

  async cancelEvent(
    id: number,
    reason: string | undefined,
    actorId: number,
  ): Promise<{ cancelled: number }> {
    const event = await this.loadEvent(id);
    if (event.state === 'CANCELLED') {
      throw new BadRequestException('Event is already cancelled');
    }

    await db
      .updateTable('events')
      .set({ state: 'CANCELLED', cancellation_reason: reason ?? null })
      .where('id', '=', id)
      .execute();

    const registrants = await db
      .selectFrom('event_registrations')
      .select(['user_id', 'guest_email', 'guest_name'])
      .where('event_id', '=', id)
      .where('status', 'in', ['REGISTERED', 'WAITLISTED'])
      .execute();

    let notified = 0;
    for (const r of registrants) {
      if (r.user_id) {
        const user = await db
          .selectFrom('users')
          .select(['full_name'])
          .where('id', '=', r.user_id)
          .executeTakeFirst();
        await this.comm.dispatch(r.user_id, 'EVENT_CANCELLED', {
          first_name: user?.full_name?.split(' ')[0] ?? 'Member',
          event_title: event.title,
          event_date: toDate(event.starts_at).toLocaleDateString('en-IN'),
          cancellation_reason: reason ?? 'The event has been cancelled.',
        });
        notified++;
      }
    }

    return { cancelled: notified };
  }

  async completeEvent(id: number, actorId: number): Promise<EventDetail> {
    const event = await this.loadEvent(id);
    if (event.state !== 'PUBLISHED') {
      throw new BadRequestException(
        `Only PUBLISHED events can be completed (current state: ${event.state})`,
      );
    }
    await db
      .updateTable('events')
      .set({ state: 'COMPLETED' })
      .where('id', '=', id)
      .execute();
    return this.getEvent(id);
  }

  async listEvents(filter: {
    state?: string;
    event_type?: string;
    limit?: number;
    offset?: number;
    upcoming_only?: boolean;
  }): Promise<{ items: EventSummary[]; total: number }> {
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;

    let q = db.selectFrom('events').selectAll();
    let countQ = db
      .selectFrom('events')
      .select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter.state) {
      q = q.where('state', '=', filter.state as any);
      countQ = countQ.where('state', '=', filter.state as any);
    }
    if (filter.event_type) {
      q = q.where('event_type', '=', filter.event_type as any);
      countQ = countQ.where('event_type', '=', filter.event_type as any);
    }
    if (filter.upcoming_only) {
      const nowStr = toMysqlDatetime(new Date());
      q = q.where('starts_at', '>=', nowStr);
      countQ = countQ.where('starts_at', '>=', nowStr);
    }

    const [rows, countRow] = await Promise.all([
      q.orderBy('starts_at', 'asc').limit(limit).offset(offset).execute(),
      countQ.executeTakeFirst(),
    ]);

    const ids = rows.map((r) => r.id);
    const regCounts: Record<number, number> = {};
    if (ids.length > 0) {
      const counts = await db
        .selectFrom('event_registrations')
        .select((eb) => [
          'event_id' as any,
          eb.fn.countAll<number>().as('cnt'),
        ])
        .where('event_id', 'in', ids)
        .where('status', 'in', ['REGISTERED', 'ATTENDED'])
        .groupBy('event_id')
        .execute();
      for (const c of counts) {
        regCounts[(c as any).event_id] = Number((c as any).cnt);
      }
    }

    return {
      items: rows.map((r) => this.toSummary(r, regCounts[r.id] ?? 0)),
      total: Number(countRow?.count ?? 0),
    };
  }

  async getEvent(id: number): Promise<EventDetail> {
    const row = await this.loadEvent(id);
    const regCount = await this.countActiveRegistrations(id);
    return this.toDetail(row, regCount);
  }

  // =========================================================================
  // REGISTRATION ENGINE
  // =========================================================================

  async registerForEvent(
    eventId: number,
    dto: RegisterEventDto,
    actorId: number,
  ): Promise<RegistrationResult> {
    const event = await this.loadEvent(eventId);

    if (event.state !== 'PUBLISHED') {
      throw new BadRequestException('This event is not open for registration');
    }

    if (dto.registration_type === 'GUEST') {
      if (event.eligibility_mode !== 'OPEN') {
        throw new ForbiddenException(
          'Guest registration is only available for open events',
        );
      }
      if (!dto.guest_name || !dto.guest_email) {
        throw new BadRequestException(
          'guest_name and guest_email are required for guest registration',
        );
      }
    }

    if (dto.registration_type === 'MEMBER') {
      await this.assertEligibility(event, actorId);

      // Guard: no duplicate active registration
      const existing = await db
        .selectFrom('event_registrations')
        .select('id')
        .where('event_id', '=', eventId)
        .where('user_id', '=', actorId)
        .where('status', 'not in', ['CANCELLED'])
        .executeTakeFirst();
      if (existing) {
        throw new ConflictException('You are already registered for this event');
      }
    }

    const activeCount = await this.countActiveRegistrations(eventId);
    const isFull = event.capacity !== null && activeCount >= (event.capacity as number);

    let status: 'REGISTERED' | 'WAITLISTED' = 'REGISTERED';
    let waitlistPosition: number | null = null;

    if (isFull) {
      if (!event.waitlist_enabled) {
        throw new ConflictException(
          'This event is at full capacity and has no waitlist',
        );
      }
      status = 'WAITLISTED';
      waitlistPosition = await this.nextWaitlistPosition(eventId);
    }

    const uuid = randomUUID();
    const now = toMysqlDatetime(new Date());

    await db
      .insertInto('event_registrations')
      .values({
        uuid,
        event_id: eventId,
        user_id: dto.registration_type === 'MEMBER' ? actorId : null,
        guest_name: dto.guest_name ?? null,
        guest_email: dto.guest_email ?? null,
        guest_phone: dto.guest_phone ?? null,
        registration_type: dto.registration_type,
        status,
        waitlist_position: waitlistPosition,
        fee_paid_paise: 0,
        checked_in_at: null,
        checked_in_by: null,
        registered_at: now,
        cancelled_at: null,
        cancellation_reason: null,
      })
      .execute();

    const reg = await db
      .selectFrom('event_registrations')
      .selectAll()
      .where('uuid', '=', uuid)
      .executeTakeFirstOrThrow();

    if (dto.registration_type === 'MEMBER') {
      const user = await db
        .selectFrom('users')
        .select(['full_name'])
        .where('id', '=', actorId)
        .executeTakeFirst();
      const firstName = user?.full_name?.split(' ')[0] ?? 'Member';
      const eventDate = toDate(event.starts_at).toLocaleDateString('en-IN');
      const eventUrl = `${process.env.FRONTEND_BASE_URL ?? ''}/activities/${event.slug}`;

      if (status === 'REGISTERED') {
        await this.comm.dispatch(actorId, 'EVENT_REGISTRATION_CONFIRMED', {
          first_name: firstName,
          event_title: event.title,
          event_date: eventDate,
          event_location: event.location_name ?? 'TBD',
          what_to_bring: event.what_to_bring ?? '',
          event_url: eventUrl,
        });
      } else {
        await this.comm.dispatch(actorId, 'EVENT_REGISTRATION_WAITLISTED', {
          first_name: firstName,
          event_title: event.title,
          event_date: eventDate,
          waitlist_position: String(waitlistPosition ?? ''),
          event_url: eventUrl,
        });
      }
    }

    return {
      id: reg.id,
      uuid: reg.uuid,
      event_id: reg.event_id,
      registration_type: reg.registration_type,
      status: reg.status,
      waitlist_position: reg.waitlist_position,
      registered_at: toDate(reg.registered_at).toISOString(),
    };
  }

  async cancelRegistration(
    eventId: number,
    registrationId: number,
    actorId: number,
    dto: CancelRegistrationDto,
    hasAdminPermission: boolean,
  ): Promise<{ ok: boolean }> {
    const reg = await db
      .selectFrom('event_registrations')
      .selectAll()
      .where('id', '=', registrationId)
      .where('event_id', '=', eventId)
      .executeTakeFirst();

    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status === 'CANCELLED') {
      throw new BadRequestException('Registration is already cancelled');
    }
    if (reg.user_id !== actorId && !hasAdminPermission) {
      throw new ForbiddenException('You can only cancel your own registration');
    }

    const wasRegistered = reg.status === 'REGISTERED';
    const now = toMysqlDatetime(new Date());

    await db
      .updateTable('event_registrations')
      .set({
        status: 'CANCELLED',
        cancelled_at: now,
        cancellation_reason: dto.reason ?? null,
      })
      .where('id', '=', registrationId)
      .execute();

    if (reg.user_id) {
      const event = await this.loadEvent(eventId);
      const user = await db
        .selectFrom('users')
        .select(['full_name'])
        .where('id', '=', reg.user_id)
        .executeTakeFirst();
      await this.comm.dispatch(reg.user_id, 'EVENT_REGISTRATION_CANCELLED_SELF', {
        first_name: user?.full_name?.split(' ')[0] ?? 'Member',
        event_title: event.title,
        event_date: toDate(event.starts_at).toLocaleDateString('en-IN'),
        events_url: `${process.env.FRONTEND_BASE_URL ?? ''}/activities`,
      });
    }

    if (wasRegistered) {
      await this.promoteWaitlist(eventId);
    }

    return { ok: true };
  }

  async checkIn(
    eventId: number,
    registrationId: number,
    actorId: number,
  ): Promise<{ ok: boolean }> {
    const reg = await db
      .selectFrom('event_registrations')
      .selectAll()
      .where('id', '=', registrationId)
      .where('event_id', '=', eventId)
      .executeTakeFirst();

    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status === 'CANCELLED') {
      throw new BadRequestException('Cannot check in a cancelled registration');
    }
    if (reg.status === 'ATTENDED') return { ok: true }; // idempotent

    const now = toMysqlDatetime(new Date());
    await db
      .updateTable('event_registrations')
      .set({ status: 'ATTENDED', checked_in_at: now, checked_in_by: actorId })
      .where('id', '=', registrationId)
      .execute();

    return { ok: true };
  }

  async listRegistrations(
    eventId: number,
    filter: { status?: string; limit?: number; offset?: number },
  ): Promise<{ items: unknown[]; total: number }> {
    await this.loadEvent(eventId);

    const limit = Math.min(filter.limit ?? 50, 200);
    const offset = filter.offset ?? 0;

    let q = db
      .selectFrom('event_registrations')
      .leftJoin('users', 'users.id', 'event_registrations.user_id')
      .select([
        'event_registrations.id',
        'event_registrations.uuid',
        'event_registrations.registration_type',
        'event_registrations.status',
        'event_registrations.waitlist_position',
        'event_registrations.fee_paid_paise',
        'event_registrations.checked_in_at',
        'event_registrations.registered_at',
        'event_registrations.guest_name',
        'event_registrations.guest_email',
        'event_registrations.guest_phone',
        'users.id as member_id',
        'users.full_name as member_name',
        'users.email as member_email',
      ])
      .where('event_registrations.event_id', '=', eventId);

    let countQ = db
      .selectFrom('event_registrations')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('event_id', '=', eventId);

    if (filter.status) {
      q = q.where('event_registrations.status', '=', filter.status as any);
      countQ = countQ.where('status', '=', filter.status as any);
    }

    const [rows, countRow] = await Promise.all([
      q
        .orderBy('event_registrations.registered_at', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
      countQ.executeTakeFirst(),
    ]);

    return {
      items: rows.map((r) => ({
        ...r,
        checked_in_at: isoOrNull(r.checked_in_at),
        registered_at: toDate(r.registered_at).toISOString(),
      })),
      total: Number(countRow?.count ?? 0),
    };
  }

  // =========================================================================
  // INVITE LIST (INVITE_ONLY events)
  // =========================================================================

  async addToInviteList(
    eventId: number,
    dto: AddInviteDto,
    actorId: number,
  ): Promise<{ added: number }> {
    const event = await this.loadEvent(eventId);
    if (event.eligibility_mode !== 'INVITE_ONLY') {
      throw new BadRequestException('Invite list is only for INVITE_ONLY events');
    }

    const now = toMysqlDatetime(new Date());
    let added = 0;
    for (const userId of dto.user_ids) {
      try {
        await db
          .insertInto('event_invite_list')
          .values({
            event_id: eventId,
            user_id: userId,
            invited_by: actorId,
            invited_at: now,
          })
          .execute();
        added++;
      } catch {
        // duplicate key -- already invited, skip silently
      }
    }
    return { added };
  }

  // =========================================================================
  // VOLUNTEER MANAGEMENT
  // =========================================================================

  async createVolunteerSlot(
    eventId: number,
    dto: CreateVolunteerSlotDto,
    actorId: number,
  ): Promise<{ id: number }> {
    await this.loadEvent(eventId);
    const now = toMysqlDatetime(new Date());

    const result = await db
      .insertInto('event_volunteer_slots')
      .values({
        event_id: eventId,
        role_name: dto.role_name,
        role_description: dto.role_description ?? null,
        skills_required: dto.skills_required ? JSON.stringify(dto.skills_required) : null,
        slots_count: dto.slots_count ?? 1,
        created_at: now,
      })
      .executeTakeFirstOrThrow();

    return { id: Number(result.insertId) };
  }

  async listVolunteerSlots(eventId: number): Promise<unknown[]> {
    await this.loadEvent(eventId);
    const slots = await db
      .selectFrom('event_volunteer_slots')
      .selectAll()
      .where('event_id', '=', eventId)
      .execute();

    const slotIds = slots.map((s) => s.id);
    const volCountMap: Record<number, { applied: number; confirmed: number }> = {};

    if (slotIds.length > 0) {
      const volunteers = await db
        .selectFrom('event_volunteers')
        .select((eb) => [
          'slot_id' as any,
          'status' as any,
          eb.fn.countAll<number>().as('cnt'),
        ])
        .where('slot_id', 'in', slotIds)
        .where('status', 'in', ['APPLIED', 'CONFIRMED', 'CHECKED_IN'])
        .groupBy(['slot_id', 'status'])
        .execute();

      for (const v of volunteers) {
        const sid = (v as any).slot_id as number;
        if (!volCountMap[sid]) volCountMap[sid] = { applied: 0, confirmed: 0 };
        if ((v as any).status === 'APPLIED') volCountMap[sid].applied += Number((v as any).cnt);
        if ((v as any).status === 'CONFIRMED' || (v as any).status === 'CHECKED_IN') {
          volCountMap[sid].confirmed += Number((v as any).cnt);
        }
      }
    }

    return slots.map((s) => ({
      id: s.id,
      event_id: s.event_id,
      role_name: s.role_name,
      role_description: s.role_description,
      skills_required: s.skills_required ? JSON.parse(s.skills_required) : [],
      slots_count: s.slots_count,
      volunteers_applied: volCountMap[s.id]?.applied ?? 0,
      volunteers_confirmed: volCountMap[s.id]?.confirmed ?? 0,
    }));
  }

  async applyAsVolunteer(
    eventId: number,
    slotId: number | null,
    actorId: number,
  ): Promise<{ id: number }> {
    const event = await this.loadEvent(eventId);
    if (event.state !== 'PUBLISHED') {
      throw new BadRequestException('Event is not open for volunteer applications');
    }

    const existing = await db
      .selectFrom('event_volunteers')
      .select('id')
      .where('event_id', '=', eventId)
      .where('user_id', '=', actorId)
      .executeTakeFirst();
    if (existing) {
      throw new ConflictException('You have already applied as a volunteer for this event');
    }

    const now = toMysqlDatetime(new Date());
    const result = await db
      .insertInto('event_volunteers')
      .values({
        event_id: eventId,
        slot_id: slotId,
        user_id: actorId,
        status: 'APPLIED',
        hours_logged: null,
        applied_at: now,
        confirmed_at: null,
        checked_in_at: null,
      })
      .executeTakeFirstOrThrow();

    return { id: Number(result.insertId) };
  }

  async updateVolunteerStatus(
    eventId: number,
    volunteerId: number,
    dto: UpdateVolunteerStatusDto,
    actorId: number,
  ): Promise<{ ok: boolean }> {
    const vol = await db
      .selectFrom('event_volunteers')
      .selectAll()
      .where('id', '=', volunteerId)
      .where('event_id', '=', eventId)
      .executeTakeFirst();

    if (!vol) throw new NotFoundException('Volunteer record not found');

    const now = toMysqlDatetime(new Date());
    const patch: Record<string, unknown> = { status: dto.status };

    if (dto.status === 'CONFIRMED') patch.confirmed_at = now;
    if (dto.status === 'CHECKED_IN') patch.checked_in_at = now;
    if (dto.hours_logged !== undefined) patch.hours_logged = dto.hours_logged;

    await db
      .updateTable('event_volunteers')
      .set(patch as any)
      .where('id', '=', volunteerId)
      .execute();

    return { ok: true };
  }

  // =========================================================================
  // INTERNAL HELPERS
  // =========================================================================

  private async loadEvent(id: number) {
    const row = await db
      .selectFrom('events')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException(`Event ${id} not found`);
    return row;
  }

  private async countActiveRegistrations(eventId: number): Promise<number> {
    const r = await db
      .selectFrom('event_registrations')
      .select((eb) => eb.fn.countAll<number>().as('cnt'))
      .where('event_id', '=', eventId)
      .where('status', 'in', ['REGISTERED', 'ATTENDED'])
      .executeTakeFirst();
    return Number(r?.cnt ?? 0);
  }

  private async nextWaitlistPosition(eventId: number): Promise<number> {
    // Get the highest current waitlist_position and increment by 1
    const rows = await db
      .selectFrom('event_registrations')
      .select('waitlist_position')
      .where('event_id', '=', eventId)
      .where('status', '=', 'WAITLISTED')
      .orderBy('waitlist_position', 'desc')
      .limit(1)
      .execute();
    const maxPos = rows[0]?.waitlist_position ?? 0;
    return (maxPos as number) + 1;
  }

  private async promoteWaitlist(eventId: number): Promise<void> {
    const event = await this.loadEvent(eventId);
    if (!event.capacity) return;

    const activeCount = await this.countActiveRegistrations(eventId);
    if (activeCount >= (event.capacity as number)) return;

    const next = await db
      .selectFrom('event_registrations')
      .selectAll()
      .where('event_id', '=', eventId)
      .where('status', '=', 'WAITLISTED')
      .orderBy('waitlist_position', 'asc')
      .limit(1)
      .executeTakeFirst();

    if (!next) return;

    await db
      .updateTable('event_registrations')
      .set({ status: 'REGISTERED', waitlist_position: null })
      .where('id', '=', next.id)
      .execute();

    if (next.user_id) {
      const user = await db
        .selectFrom('users')
        .select(['full_name'])
        .where('id', '=', next.user_id)
        .executeTakeFirst();
      await this.comm.dispatch(next.user_id, 'EVENT_SLOT_AVAILABLE', {
        first_name: user?.full_name?.split(' ')[0] ?? 'Member',
        event_title: event.title,
        event_date: toDate(event.starts_at).toLocaleDateString('en-IN'),
        event_url: `${process.env.FRONTEND_BASE_URL ?? ''}/activities/${event.slug}`,
      });
    }
  }

  // Spec 04.1 eligibility enforcement
  private async assertEligibility(
    event: { eligibility_mode: string; allowed_class_ids: string | null; id: number },
    userId: number,
  ): Promise<void> {
    const mode = event.eligibility_mode;
    if (mode === 'OPEN') return;

    if (mode === 'INVITE_ONLY') {
      const invite = await db
        .selectFrom('event_invite_list')
        .select('id')
        .where('event_id', '=', event.id)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if (!invite) {
        throw new ForbiddenException('You are not on the invite list for this event');
      }
      return;
    }

    // All remaining modes require an ACTIVE individual membership
    const membership = await db
      .selectFrom('memberships')
      .innerJoin('membership_classes', 'membership_classes.id', 'memberships.membership_class_id')
      .select([
        'memberships.id',
        'memberships.membership_class_id',
        'membership_classes.type as class_type',
      ])
      .where('memberships.user_id', '=', userId)
      .where('memberships.owner_type', '=', 'INDIVIDUAL')
      .where('memberships.lifecycle_state', '=', 'ACTIVE')
      .executeTakeFirst();

    if (!membership) {
      throw new ForbiddenException(
        'An active membership is required to register for this event',
      );
    }

    if (mode === 'CONSTITUTIONAL_MEMBERS_ONLY') {
      if ((membership as any).class_type !== 'CONSTITUTIONAL') {
        throw new ForbiddenException(
          'This event is restricted to constitutional members (Full, Life, Patron, Founding)',
        );
      }
      return;
    }

    if (mode === 'SPECIFIC_CLASSES') {
      const allowed: number[] = event.allowed_class_ids
        ? JSON.parse(event.allowed_class_ids)
        : [];
      if (!allowed.includes(membership.membership_class_id as number)) {
        throw new ForbiddenException(
          'Your membership class is not eligible for this event',
        );
      }
      return;
    }

    // MEMBERS_ONLY -- any ACTIVE membership is sufficient (already verified above)
  }

  // ---------------------------------------------------------------------------
  // Shape mapping
  // ---------------------------------------------------------------------------

  private toSummary(row: any, registrationCount: number): EventSummary {
    return {
      id: row.id,
      uuid: row.uuid,
      slug: row.slug,
      title: row.title,
      event_type: row.event_type,
      starts_at: toDate(row.starts_at).toISOString(),
      ends_at: isoOrNull(row.ends_at),
      location_name: row.location_name,
      eligibility_mode: row.eligibility_mode,
      fee_type: row.fee_type,
      base_fee_paise: row.base_fee_paise,
      capacity: row.capacity,
      waitlist_enabled: Boolean(row.waitlist_enabled),
      state: row.state,
      registration_count: registrationCount,
      created_at: toDate(row.created_at).toISOString(),
    };
  }

  private toDetail(row: any, registrationCount: number): EventDetail {
    return {
      ...this.toSummary(row, registrationCount),
      description: row.description,
      occurrence: row.occurrence,
      location_address: row.location_address,
      location_lat: row.location_lat,
      location_lng: row.location_lng,
      location_landmark: row.location_landmark,
      difficulty_level: row.difficulty_level,
      age_restriction: row.age_restriction,
      weather_dependent: Boolean(row.weather_dependent),
      volunteer_slots_needed: row.volunteer_slots_needed,
      what_to_bring: row.what_to_bring,
      tags: row.tags ? JSON.parse(row.tags) : [],
      banner_r2_key: row.banner_r2_key,
      allowed_class_ids: row.allowed_class_ids ? JSON.parse(row.allowed_class_ids) : [],
      cancellation_reason: row.cancellation_reason,
      created_by: row.created_by,
      updated_at: toDate(row.updated_at).toISOString(),
    };
  }
}
