-- ============================================================================
-- 0033_events_schema.sql
-- Module 04 -- Events & Activity Management (Phase 2a)
-- Spec: BCC Unified Platform v3.0 sections 04.1 - 04.4
-- Dependency: users (0001), payments (0023)
-- ============================================================================
-- Five tables:
--   events              -- event definition and lifecycle
--   event_invite_list   -- per-user invite list for INVITE_ONLY events
--   event_registrations -- attendee registrations (member and guest)
--   event_volunteer_slots -- volunteer role definitions per event
--   event_volunteers    -- volunteer applications and assignments
-- ============================================================================

CREATE TABLE events (
  id                   BIGINT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid                 CHAR(36)         NOT NULL UNIQUE,
  slug                 VARCHAR(255)     NOT NULL UNIQUE,
  title                VARCHAR(255)     NOT NULL,
  description          TEXT,
  event_type           ENUM(
                         'PHOTOWALK','BIRD_WALK','WORKSHOP','SEMINAR',
                         'TOUR','MEETUP','TRAINING','CONSERVATION',
                         'EXHIBITION_EVENT','GOVERNANCE','AWARD_CEREMONY',
                         'ONLINE','COLLABORATIVE','OTHER'
                       ) NOT NULL,
  occurrence           ENUM('SINGLE','RECURRING') NOT NULL DEFAULT 'SINGLE',
  starts_at            DATETIME         NOT NULL,
  ends_at              DATETIME,

  -- Location (nullable -- online events have no physical location)
  location_name        VARCHAR(255),
  location_address     TEXT,
  location_lat         DECIMAL(9,6),
  location_lng         DECIMAL(9,6),
  location_landmark    VARCHAR(255),

  -- Capacity management
  -- NULL = unlimited attendance. Waitlist only meaningful when capacity is set.
  capacity             INT UNSIGNED,
  waitlist_enabled     TINYINT(1)       NOT NULL DEFAULT 1,

  -- Fee configuration (INR only, stored in paise per Module 11 constraint).
  -- Phase 2a: FREE and FLAT supported. Full Razorpay integration for events
  -- deferred to Module 11 expansion; fee_paid_paise is tracked directly on
  -- event_registrations (no FK into payments table -- that table is
  -- currently membership-scoped).
  fee_type             ENUM('FREE','FLAT','MEMBER_DISCOUNTED') NOT NULL DEFAULT 'FREE',
  base_fee_paise       INT UNSIGNED     NOT NULL DEFAULT 0,

  -- Eligibility (spec 04.1)
  eligibility_mode     ENUM(
                         'OPEN',
                         'MEMBERS_ONLY',
                         'SPECIFIC_CLASSES',
                         'INVITE_ONLY',
                         'CONSTITUTIONAL_MEMBERS_ONLY'
                       ) NOT NULL DEFAULT 'OPEN',
  -- JSON array of membership_class.id values for SPECIFIC_CLASSES mode.
  -- NULL for all other modes.
  allowed_class_ids    JSON,

  -- Event characteristics
  difficulty_level     ENUM('ALL','BEGINNER','INTERMEDIATE','ADVANCED') NOT NULL DEFAULT 'ALL',
  age_restriction      ENUM('ALL','ADULT','FAMILY')                     NOT NULL DEFAULT 'ALL',
  weather_dependent    TINYINT(1)       NOT NULL DEFAULT 0,
  volunteer_slots_needed INT UNSIGNED   NOT NULL DEFAULT 0,
  what_to_bring        TEXT,
  tags                 JSON,

  -- Media
  banner_r2_key        VARCHAR(500),

  -- Lifecycle
  state                ENUM('DRAFT','PUBLISHED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'DRAFT',
  cancellation_reason  TEXT,

  -- Audit
  created_by           BIGINT           NOT NULL,
  created_at           DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_events_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invite list for INVITE_ONLY events.
-- Populated by coordinators. EventsService checks this before allowing registration.
CREATE TABLE event_invite_list (
  id               BIGINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id         BIGINT     NOT NULL,
  user_id          BIGINT     NOT NULL,
  invited_by       BIGINT     NOT NULL,
  invited_at       DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_event_invite (event_id, user_id),
  CONSTRAINT fk_invite_event   FOREIGN KEY (event_id)   REFERENCES events(id),
  CONSTRAINT fk_invite_user    FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT fk_invite_by_user FOREIGN KEY (invited_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Event registrations: one row per person per event.
-- GUEST registrations have user_id = NULL and guest_* fields populated.
-- A user can hold only one non-cancelled registration per event.
-- This is enforced at the application layer (not a DB unique key, because
-- MySQL UNIQUE on a nullable column does not prevent multiple NULLs cleanly
-- and we need to allow re-registration after cancellation).
CREATE TABLE event_registrations (
  id                   BIGINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid                 CHAR(36)   NOT NULL UNIQUE,
  event_id             BIGINT     NOT NULL,

  -- NULL for guest registrations
  user_id              BIGINT,

  -- Populated for GUEST registrations only (OPEN events)
  guest_name           VARCHAR(255),
  guest_email          VARCHAR(255),
  guest_phone          VARCHAR(30),

  registration_type    ENUM('MEMBER','GUEST') NOT NULL,

  -- REGISTERED    -- confirmed slot
  -- WAITLISTED    -- capacity full, queued; position stored in waitlist_position
  -- CANCELLED     -- cancelled by member or coordinator
  -- ATTENDED      -- QR check-in confirmed
  -- NO_SHOW       -- event ended; coordinator marked absent
  status               ENUM('REGISTERED','WAITLISTED','CANCELLED','ATTENDED','NO_SHOW')
                       NOT NULL DEFAULT 'REGISTERED',

  -- 1 = next in queue. NULL when not waitlisted.
  waitlist_position    INT UNSIGNED,

  -- Phase 2a: fee tracking without Razorpay integration.
  -- Coordinator records cash/UPI payment manually by updating this field.
  -- Full Razorpay payment_id linkage deferred to Module 11 expansion.
  fee_paid_paise       INT UNSIGNED NOT NULL DEFAULT 0,

  -- Check-in audit
  checked_in_at        DATETIME,
  checked_in_by        BIGINT,

  registered_at        DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at         DATETIME,
  cancellation_reason  TEXT,

  CONSTRAINT fk_reg_event      FOREIGN KEY (event_id)      REFERENCES events(id),
  CONSTRAINT fk_reg_user       FOREIGN KEY (user_id)       REFERENCES users(id),
  CONSTRAINT fk_reg_checkin_by FOREIGN KEY (checked_in_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Volunteer slot definitions per event.
-- Coordinator defines what volunteer roles are needed.
CREATE TABLE event_volunteer_slots (
  id               BIGINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id         BIGINT     NOT NULL,
  role_name        VARCHAR(100) NOT NULL,
  role_description TEXT,
  skills_required  JSON,       -- string array of skill tags
  slots_count      INT UNSIGNED NOT NULL DEFAULT 1,
  created_at       DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_vslot_event FOREIGN KEY (event_id) REFERENCES events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Volunteer applications and assignments (spec 10.1: any Registered User may volunteer).
-- UNIQUE (event_id, user_id): one volunteer record per person per event.
CREATE TABLE event_volunteers (
  id               BIGINT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id         BIGINT          NOT NULL,
  slot_id          BIGINT,         -- NULL: applied without selecting a specific slot
  user_id          BIGINT          NOT NULL,
  status           ENUM('APPLIED','CONFIRMED','CHECKED_IN','NO_SHOW','CANCELLED')
                   NOT NULL DEFAULT 'APPLIED',
  hours_logged     DECIMAL(4,1),
  applied_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at     DATETIME,
  checked_in_at    DATETIME,

  UNIQUE KEY uq_event_volunteer (event_id, user_id),
  CONSTRAINT fk_vol_event FOREIGN KEY (event_id) REFERENCES events(id),
  CONSTRAINT fk_vol_slot  FOREIGN KEY (slot_id)  REFERENCES event_volunteer_slots(id),
  CONSTRAINT fk_vol_user  FOREIGN KEY (user_id)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
