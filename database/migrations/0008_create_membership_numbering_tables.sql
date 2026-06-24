-- ============================================================================
-- 0008_create_membership_numbering_tables.sql
-- MEM-007 MEMBERSHIP NUMBERING CONSTITUTION
--
-- membership_number_pool: a SINGLETON row (id always = 1) holding the next
-- operational serial to allocate. MP-004 Sequential Allocation + Section 3
-- "A single numbering pool shall be used for all membership classes" — one
-- row, one counter, no per-class sequences.
--
-- Reserved blocks (Section 4):
--   00001–00007  Founding Member reservation       — NOT drawn from this pool;
--                                                     assigned directly during
--                                                     the one-time migration.
--   00008–00020  Historical Allocation Block       — same: direct assignment,
--                                                     not pool-drawn.
--   00021+       Operational sequential allocation — THIS is what
--                                                     next_operational_serial
--                                                     tracks and increments.
--
-- membership_number_log: immutable record of every serial ever handed out,
-- regardless of which mechanism assigned it (founding/historical/operational).
--
-- membership_temp_identifiers: BCCTempXXXXX lifecycle (Section 6) — issued
-- during onboarding/migration, retired the moment a permanent number is
-- assigned. Never authoritative, never a Membership Number.
-- ============================================================================

CREATE TABLE IF NOT EXISTS membership_number_pool (
  id                        TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  next_operational_serial   INT NOT NULL DEFAULT 21,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT chk_pool_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO membership_number_pool (id, next_operational_serial) VALUES (1, 21);

CREATE TABLE IF NOT EXISTS membership_number_log (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  membership_id       BIGINT NOT NULL,

  number_serial       INT NOT NULL,
  membership_number   VARCHAR(20) NOT NULL,

  assignment_type     ENUM('FOUNDING_RESERVED','HISTORICAL_RESERVED',
                            'OPERATIONAL_SEQUENTIAL','HISTORICAL_MIGRATION_IMPORT')
                       NOT NULL,

  assigned_by_user_id   BIGINT NULL,    -- NULL = system-assigned (the normal operational path)
  notes                  VARCHAR(255) NULL,

  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_number_log_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE RESTRICT,
  CONSTRAINT fk_number_log_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uq_number_log_serial (number_serial),
  UNIQUE KEY uq_number_log_membership_number (membership_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS membership_temp_identifiers (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  membership_id       BIGINT NOT NULL,

  temp_identifier     VARCHAR(20) NOT NULL UNIQUE,   -- format: BCCTempXXXXX

  status               ENUM('ACTIVE','RETIRED') NOT NULL DEFAULT 'ACTIVE',

  issued_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_at           TIMESTAMP NULL,

  CONSTRAINT fk_temp_id_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,

  UNIQUE KEY uq_one_temp_id_per_membership (membership_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
