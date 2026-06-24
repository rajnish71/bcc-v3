-- ============================================================================
-- 0005_create_member_recognitions.sql
-- MEM-006 DUAL-TRACK RECOGNITION MODEL
--
-- "A Member may hold at most one active recognition at any time."
-- (Single Active Recognition Rule)
-- "Governance Recognition supersedes Automatic Recognition... Automatic
--  Recognition becomes Historical Recognition." (Recognition Precedence Rule)
-- "Recognition transitions shall be non-destructive. Historical recognitions
--  must be preserved." (Historical Recognition Ledger)
--
-- This single table serves BOTH the active-recognition lookup and the
-- historical ledger — status='ACTIVE' rows are the live state, status=
-- 'HISTORICAL' rows are the non-destructive append-only history. Nothing is
-- ever deleted from this table; supersession just flips status and sets
-- end_date on the old row, then inserts a new ACTIVE row.
--
-- The generated column `active_lock` + its UNIQUE index is what actually
-- enforces the Single Active Recognition Rule at the database layer: MySQL
-- unique indexes treat multiple NULLs as non-conflicting, so only ACTIVE
-- rows (active_lock = membership_id) participate in the uniqueness check —
-- at most one per membership_id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS member_recognitions (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  membership_id       BIGINT NOT NULL,

  recognition_code    ENUM('SENIOR_MEMBER','HONORARY_SENIOR_MEMBER',
                            'HONORARY_MEMBER','HONORARY_MENTOR','HONORARY_GRANDMASTER')
                       NOT NULL,

  track                ENUM('AUTO','MANUAL') NOT NULL,
  status                ENUM('ACTIVE','HISTORICAL') NOT NULL DEFAULT 'ACTIVE',

  reason                VARCHAR(255) NULL,            -- required by app logic for MANUAL track (auditability)
  assigned_by_user_id   BIGINT NULL,                  -- NULL for AUTO/system-assigned

  start_date            DATE NOT NULL,
  end_date              DATE NULL,

  active_lock           BIGINT GENERATED ALWAYS AS (IF(status = 'ACTIVE', membership_id, NULL)) STORED,

  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_recognition_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE RESTRICT,
  CONSTRAINT fk_recognition_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uq_one_active_recognition (active_lock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_recognitions_membership ON member_recognitions (membership_id);
