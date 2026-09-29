// backend/src/modules/events/events.service.ts
//
// Module 04 -- Events & Activity Management (spec sections 04.1 - 04.4).
//
// ACTIVITY MODEL (Stage 1 reconciliation):
//   An Activity is the common BCC record for something BCC organizes, hosts,
//   participates in, or preserves as institutional history. event_type is
//   classification only. Historical Activities (is_historical) may have an
//   exact, partial (year/month) or unknown date -- see resolveHistoricalDate().
//
// PARTICIPATION: by Registered User (identity from the access token).
//   Membership is NOT a universal requirement; it is consulted only when the
//   Activity's eligibility_mode requires it:
//   OPEN                       Any Registered User.
//   MEMBERS_ONLY               ACTIVE membership in any class.
//   CONSTITUTIONAL_MEMBERS_ONLY ACTIVE membership in a CONSTITUTIONAL class.
//   SPECIFIC_CLASSES           ACTIVE membership whose class_id is in
//                              event.allowed_class_ids (JSON array).
//   INVITE_ONLY                user_id present in event_invite_list.
//   Identity-less GUEST registration was removed; legacy GUEST rows remain.
//
// CAPACITY / WAITLIST:
//   capacity NULL = unlimited; registrations always get REGISTERED status.
//   capacity set: count REGISTERED+ATTENDED rows. If full:
//     waitlist_enabled  -> WAITLISTED with next sequential position.
//     !waitlist_enabled -> 409 Conflict.
//   On cancellation of a REGISTERED row: promote the earliest WAITLISTED
//   row synchronously (no cron/worker queue -- RAM-conscious Phase 2a).
//
// FEES / PAYMENTS:
//   fee_type FREE | FLAT only. This module establishes the business reason
//   and amount (fee_type + base_fee_paise). PAY-001 owns Financial
//   Contribution, Settlement, Transaction and Receipt. Until Module 04 is
//   wired to FinancialContributionService, registration for FLAT Activities
//   is refused rather than confirmed without payment. The legacy
//   event_registrations.fee_paid_paise column is not written or exposed.
//
// OUT OF SCOPE (deactivated at the API layer; tables/columns retained):
//   volunteer subsystem, RECURRING occurrence, MEMBER_DISCOUNTED fee mode.
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
import { sql } from 'kysely';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import { ikUrl } from '../shared/storage/imagekit.util';
import { CommunicationService } from '../shared/communication/communication.service';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type {
  CancelRegistrationDto,
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

// JSON-ish columns may arrive already parsed (mysql2 JSON) or as TEXT.
function parseJsonArray<T>(v: unknown): T[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ISO 8601 (from DTOs) -> MySQL DATETIME string (CLAUDE.md 5.2).
function toDbDatetime(iso: string | null | undefined): string | null {
  return iso ? (toMysqlDatetime(new Date(iso)) as string) : null;
}

function dateLabel(row: any): string {
  if (row.starts_at) return toDate(row.starts_at).toLocaleDateString('en-IN');
  if (row.historical_date_note) return String(row.historical_date_note);
  if (row.historical_year != null) {
    return row.historical_month != null
      ? `${String(row.historical_month).padStart(2, '0')}/${row.historical_year}`
      : String(row.historical_year);
  }
  return 'Date unknown';
}

export type DatePrecision = 'EXACT' | 'MONTH' | 'YEAR' | 'UNKNOWN';

// Public visibility: DRAFT is never public. CANCELLED is reachable by direct
// link only (detail) and never listed.
const PUBLIC_LIST_STATES = ['PUBLISHED', 'COMPLETED'] as const;
const PUBLIC_DETAIL_STATES = ['PUBLISHED', 'COMPLETED', 'CANCELLED'] as const;

interface HistoricalDateInput {
  starts_at?: string | null;
  historical_year?: number | null;
  historical_month?: number | null;
}

// Validates and normalises the date fields of an Activity.
//  - exact date known  -> starts_at kept, year/month cleared (no duplicate truth)
//  - partial date      -> starts_at NULL, year (+ optional month) kept
//  - unknown date      -> everything NULL (historical only)
// Non-historical Activities always require an exact starts_at.
export function resolveHistoricalDate(
  isHistorical: boolean,
  d: HistoricalDateInput,
): { starts_at: string | null; historical_year: number | null; historical_month: number | null } {
  if (d.historical_month != null && d.historical_year == null) {
    throw new BadRequestException('historical_month requires historical_year');
  }
  if (!isHistorical) {
    if (!d.starts_at) {
      throw new BadRequestException('starts_at is required for a non-historical Activity');
    }
    if (d.historical_year != null || d.historical_month != null) {
      throw new BadRequestException('historical_year/historical_month apply to historical Activities only');
    }
    return { starts_at: d.starts_at, historical_year: null, historical_month: null };
  }
  if (d.starts_at) {
    return { starts_at: d.starts_at, historical_year: null, historical_month: null };
  }
  return {
    starts_at: null,
    historical_year: d.historical_year ?? null,
    historical_month: d.historical_month ?? null,
  };
}

export function datePrecision(row: any): DatePrecision {
  if (row.starts_at) return 'EXACT';
  if (row.historical_year != null) return row.historical_month != null ? 'MONTH' : 'YEAR';
  return 'UNKNOWN';
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
  // NULL only for historical Activities without an exact date.
  starts_at: string | null;
  date_precision: DatePrecision;
  is_historical: boolean;
  historical_year: number | null;
  historical_month: number | null;
  historical_date_note: string | null;
  ends_at: string | null;
  location_name: string | null;
  eligibility_mode: string;
  fee_type: string;
  base_fee_paise: number;
  capacity: number | null;
  waitlist_enabled: boolean;
  state: string;
  registration_count: number;
  banner_url: string | null;
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
  historical_source_note: string | null;
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
    const feeType = dto.fee_type ?? 'FREE';
    if (feeType === 'FLAT' && !dto.base_fee_paise) {
      throw new BadRequestException('base_fee_paise must be > 0 when fee_type is FLAT');
    }
    if (feeType === 'FREE' && dto.base_fee_paise) {
      throw new BadRequestException('base_fee_paise must be 0 when fee_type is FREE');
    }
    const isHistorical = dto.is_historical === true;
    if (isHistorical && feeType !== 'FREE') {
      throw new BadRequestException('A historical Activity cannot carry a fee');
    }
    const when = resolveHistoricalDate(isHistorical, dto);
    if (!isHistorical && (dto.historical_date_note || dto.historical_source_note)) {
      throw new BadRequestException('historical_* notes apply to historical Activities only');
    }

    const uuid = randomUUID();
    const slug = slugify(dto.title, uuid);
    const now = toMysqlDatetime(new Date()) as any;

    await db
      .insertInto('events')
      .values({
        uuid,
        slug,
        title: dto.title,
        description: dto.description ?? null,
        event_type: dto.event_type,
        occurrence: 'SINGLE',
        starts_at: toDbDatetime(when.starts_at),
        is_historical: isHistorical,
        historical_year: when.historical_year,
        historical_month: when.historical_month,
        historical_date_note: dto.historical_date_note ?? null,
        historical_source_note: dto.historical_source_note ?? null,
        ends_at: toDbDatetime(dto.ends_at),
        location_name: dto.location_name ?? null,
        location_address: dto.location_address ?? null,
        location_lat: dto.location_lat ?? null,
        location_lng: dto.location_lng ?? null,
        location_landmark: dto.location_landmark ?? null,
        capacity: dto.capacity ?? null,
        waitlist_enabled: dto.waitlist_enabled ?? true,
        fee_type: feeType,
        base_fee_paise: dto.base_fee_paise ?? 0,
        eligibility_mode: dto.eligibility_mode ?? 'OPEN',
        allowed_class_ids:
          dto.eligibility_mode === 'SPECIFIC_CLASSES' && dto.allowed_class_ids
            ? JSON.stringify(dto.allowed_class_ids)
            : null,
        difficulty_level: dto.difficulty_level ?? 'ALL',
        age_restriction: dto.age_restriction ?? 'ALL',
        weather_dependent: dto.weather_dependent ?? false,
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
    // Historical Activities stay editable after COMPLETED so they can be
    // enriched later; cancelled Activities are never editable.
    const isHistorical = Boolean(event.is_historical);
    if (event.state === 'CANCELLED' || (event.state === 'COMPLETED' && !isHistorical)) {
      throw new BadRequestException(
        `Cannot edit a ${event.state.toLowerCase()} event`,
      );
    }

    const patch: Record<string, unknown> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.event_type !== undefined) patch.event_type = dto.event_type;
    const touchesDate =
      dto.starts_at !== undefined ||
      dto.historical_year !== undefined ||
      dto.historical_month !== undefined;
    if (touchesDate) {
      const when = resolveHistoricalDate(isHistorical, {
        starts_at: dto.starts_at ?? (event.starts_at ? toDate(event.starts_at).toISOString() : null),
        historical_year: dto.historical_year ?? (event.historical_year as number | null),
        historical_month: dto.historical_month ?? (event.historical_month as number | null),
      });
      patch.starts_at = toDbDatetime(when.starts_at);
      patch.historical_year = when.historical_year;
      patch.historical_month = when.historical_month;
    }
    if (dto.historical_date_note !== undefined || dto.historical_source_note !== undefined) {
      if (!isHistorical) {
        throw new BadRequestException('historical_* notes apply to historical Activities only');
      }
      if (dto.historical_date_note !== undefined) patch.historical_date_note = dto.historical_date_note;
      if (dto.historical_source_note !== undefined) patch.historical_source_note = dto.historical_source_note;
    }
    if (dto.ends_at !== undefined) patch.ends_at = toDbDatetime(dto.ends_at);
    if (dto.location_name !== undefined) patch.location_name = dto.location_name;
    if (dto.location_address !== undefined) patch.location_address = dto.location_address;
    if (dto.location_lat !== undefined) patch.location_lat = dto.location_lat;
    if (dto.location_lng !== undefined) patch.location_lng = dto.location_lng;
    if (dto.location_landmark !== undefined) patch.location_landmark = dto.location_landmark;
    if (dto.capacity !== undefined) patch.capacity = dto.capacity;
    if (dto.waitlist_enabled !== undefined) patch.waitlist_enabled = dto.waitlist_enabled;
    if (dto.fee_type !== undefined || dto.base_fee_paise !== undefined) {
      const feeType = dto.fee_type ?? (event.fee_type as string);
      const fee = dto.base_fee_paise ?? (event.base_fee_paise as number);
      if (feeType === 'MEMBER_DISCOUNTED') {
        throw new BadRequestException('MEMBER_DISCOUNTED is no longer a supported fee mode');
      }
      if (feeType === 'FLAT' && !fee) {
        throw new BadRequestException('base_fee_paise must be > 0 when fee_type is FLAT');
      }
      if (feeType === 'FREE' && fee) {
        throw new BadRequestException('base_fee_paise must be 0 when fee_type is FREE');
      }
      if (isHistorical && feeType !== 'FREE') {
        throw new BadRequestException('A historical Activity cannot carry a fee');
      }
      patch.fee_type = feeType;
      patch.base_fee_paise = fee;
    }
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
    // A historical Activity has, by definition, already happened: publishing
    // it makes it public in its final COMPLETED state (no registration window).
    await db
      .updateTable('events')
      .set({ state: event.is_historical ? 'COMPLETED' : 'PUBLISHED' })
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
        await this.comm.dispatch('EVENT_CANCELLED', r.user_id, {
          first_name: user?.full_name?.split(' ')[0] ?? 'Member',
          event_title: event.title,
          event_date: dateLabel(event),
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

  // `public: true` restricts results to publicly visible states (never DRAFT
  // or CANCELLED) regardless of the requested `state`.
  //
  // scope:
  //   'upcoming' -> PUBLISHED and not yet started (exact starts_at >= now)
  //   'past'     -> COMPLETED, or PUBLISHED whose start has passed; includes
  //                 historical Activities with partial/unknown dates.
  //                 Newest first; undated historical records sort last.
  async listEvents(filter: {
    state?: string;
    event_type?: string;
    limit?: number;
    offset?: number;
    upcoming_only?: boolean;
    scope?: 'upcoming' | 'past';
    public?: boolean;
  }): Promise<{ items: EventSummary[]; total: number }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);
    const nowStr = toMysqlDatetime(new Date()) as any;

    // Effective sort date: exact date, else first day of the known year/month.
    const effectiveDate = sql<Date | null>`COALESCE(starts_at, STR_TO_DATE(CONCAT(historical_year, '-', COALESCE(historical_month, 1), '-01'), '%Y-%m-%d'))`;

    let q = db.selectFrom('events').selectAll();
    let countQ = db
      .selectFrom('events')
      .select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter.public) {
      q = q.where('state', 'in', [...PUBLIC_LIST_STATES] as any);
      countQ = countQ.where('state', 'in', [...PUBLIC_LIST_STATES] as any);
      if (filter.state && (PUBLIC_LIST_STATES as readonly string[]).includes(filter.state)) {
        q = q.where('state', '=', filter.state as any);
        countQ = countQ.where('state', '=', filter.state as any);
      }
    } else if (filter.state) {
      q = q.where('state', '=', filter.state as any);
      countQ = countQ.where('state', '=', filter.state as any);
    }
    if (filter.event_type) {
      q = q.where('event_type', '=', filter.event_type as any);
      countQ = countQ.where('event_type', '=', filter.event_type as any);
    }
    if (filter.upcoming_only || filter.scope === 'upcoming') {
      q = q.where('state', '=', 'PUBLISHED').where('starts_at', '>=', nowStr);
      countQ = countQ.where('state', '=', 'PUBLISHED').where('starts_at', '>=', nowStr);
    }
    if (filter.scope === 'past') {
      const pastCond = (eb: any) =>
        eb.or([
          eb('state', '=', 'COMPLETED'),
          eb.and([eb('state', '=', 'PUBLISHED'), eb('starts_at', '<', nowStr)]),
        ]);
      q = q.where(pastCond);
      countQ = countQ.where(pastCond);
    }

    const ordered =
      filter.scope === 'past'
        ? q
            .orderBy(sql`${effectiveDate} IS NULL`, 'asc')
            .orderBy(effectiveDate, 'desc')
        : q.orderBy(sql`starts_at IS NULL`, 'asc').orderBy('starts_at', 'asc');

    const [rows, countRow] = await Promise.all([
      ordered.limit(limit).offset(offset).execute(),
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

  // Admin/coordinator read: any state, by numeric id.
  async getEvent(id: number): Promise<EventDetail> {
    const row = await this.loadEvent(id);
    const regCount = await this.countActiveRegistrations(id);
    return this.toDetail(row, regCount);
  }

  // Public read: numeric id or slug. DRAFT Activities are not public.
  async getPublicEvent(idOrSlug: string): Promise<EventDetail> {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const row = await db
      .selectFrom('events')
      .selectAll()
      .where(isNumeric ? 'id' : 'slug', '=', (isNumeric ? Number(idOrSlug) : idOrSlug) as any)
      .executeTakeFirst();
    if (!row || !(PUBLIC_DETAIL_STATES as readonly string[]).includes(row.state as string)) {
      throw new NotFoundException('Activity not found');
    }
    const regCount = await this.countActiveRegistrations(row.id as number);
    return this.toDetail(row, regCount);
  }

  // =========================================================================
  // REGISTRATION ENGINE
  // =========================================================================

  // Participation is by Registered User. Membership is checked only when the
  // Activity's eligibility_mode requires it (assertEligibility).
  async registerForEvent(
    eventId: number,
    actorId: number,
  ): Promise<RegistrationResult> {
    const event = await this.loadEvent(eventId);

    if (event.is_historical) {
      throw new BadRequestException('This is a historical record and is not open for registration');
    }
    if (event.state !== 'PUBLISHED') {
      throw new BadRequestException('This event is not open for registration');
    }
    if (event.fee_type !== 'FREE') {
      // PAY-001 owns settlement; do not confirm a paid registration without it.
      throw new ConflictException(
        'Paid Activities cannot accept registration yet: payment is not connected',
      );
    }

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
    const now = toMysqlDatetime(new Date()) as any;

    // registration_type 'MEMBER' is the legacy enum label for "registered
    // user (user_id present)"; it does not imply membership.
    await db
      .insertInto('event_registrations')
      .values({
        uuid,
        event_id: eventId,
        user_id: actorId,
        guest_name: null,
        guest_email: null,
        guest_phone: null,
        registration_type: 'MEMBER',
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

    const user = await db
      .selectFrom('users')
      .select(['full_name'])
      .where('id', '=', actorId)
      .executeTakeFirst();
    const firstName = user?.full_name?.split(' ')[0] ?? 'Member';
    const eventDate = dateLabel(event);
    const eventUrl = `${process.env.FRONTEND_BASE_URL ?? ''}/activities/${event.slug}`;

    if (status === 'REGISTERED') {
      await this.comm.dispatch('EVENT_REGISTRATION_CONFIRMED', actorId, {
        first_name: firstName,
        event_title: event.title,
        event_date: eventDate,
        event_location: event.location_name ?? 'TBD',
        what_to_bring: event.what_to_bring ?? '',
        event_url: eventUrl,
      });
    } else {
      await this.comm.dispatch('EVENT_REGISTRATION_WAITLISTED', actorId, {
        first_name: firstName,
        event_title: event.title,
        event_date: eventDate,
        waitlist_position: String(waitlistPosition ?? ''),
        event_url: eventUrl,
      });
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
    const now = toMysqlDatetime(new Date()) as any;

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
      await this.comm.dispatch('EVENT_REGISTRATION_CANCELLED_SELF', reg.user_id, {
        first_name: user?.full_name?.split(' ')[0] ?? 'Member',
        event_title: event.title,
        event_date: dateLabel(event),
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

    const now = toMysqlDatetime(new Date()) as any;
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

    const now = toMysqlDatetime(new Date()) as any;
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
    // Never confirm a legacy waitlisted row on a paid Activity without PAY-001.
    if (event.fee_type !== 'FREE') return;

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
      await this.comm.dispatch('EVENT_SLOT_AVAILABLE', next.user_id, {
        first_name: user?.full_name?.split(' ')[0] ?? 'Member',
        event_title: event.title,
        event_date: dateLabel(event),
        event_url: `${process.env.FRONTEND_BASE_URL ?? ''}/activities/${event.slug}`,
      });
    }
  }

  // Spec 04.1 eligibility enforcement
  private async assertEligibility(
    event: { eligibility_mode: string; allowed_class_ids: unknown; id: number },
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
          'This event is restricted to a category of members you do not currently hold',
        );
      }
      return;
    }

    if (mode === 'SPECIFIC_CLASSES') {
      const allowed = parseJsonArray<number>(event.allowed_class_ids);
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
      starts_at: isoOrNull(row.starts_at),
      date_precision: datePrecision(row),
      is_historical: Boolean(row.is_historical),
      historical_year: row.historical_year ?? null,
      historical_month: row.historical_month ?? null,
      historical_date_note: row.historical_date_note ?? null,
      ends_at: isoOrNull(row.ends_at),
      location_name: row.location_name,
      eligibility_mode: row.eligibility_mode,
      fee_type: row.fee_type,
      base_fee_paise: row.base_fee_paise,
      capacity: row.capacity,
      waitlist_enabled: Boolean(row.waitlist_enabled),
      state: row.state,
      registration_count: registrationCount,
      banner_url: row.banner_r2_key ? ikUrl(row.banner_r2_key, 'w-400,h-225,fo-auto') : null,
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
      historical_source_note: row.historical_source_note ?? null,
      what_to_bring: row.what_to_bring,
      tags: parseJsonArray<string>(row.tags),
      banner_r2_key: row.banner_r2_key,
      allowed_class_ids: parseJsonArray<number>(row.allowed_class_ids),
      cancellation_reason: row.cancellation_reason,
      created_by: row.created_by,
      updated_at: toDate(row.updated_at).toISOString(),
    };
  }
}
