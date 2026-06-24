-- ============================================================================
-- 0004_create_memberships.sql
-- MEM-006 MEMBERSHIP LIFECYCLE + MEM-007 NUMBERING (columns only — the
-- allocation engine itself lives in application code, since it must combine
-- the join date with the pool counter from membership_number_pool).
--
-- MEM-006: "All Members are Registered Users. Not all Registered Users are
-- Members." A membership belongs to EITHER an individual user OR a group
-- entity, never both — enforced by the CHECK constraint below.
--
-- MEM-006 Lifecycle states (ALL seven required, no simplification):
-- PENDING, APPROVED, ACTIVE, SUSPENDED, EXPIRED, TERMINATED, REJECTED.
--
-- MEM-007 numbering columns:
--   join_year / join_month  — frozen forever once set (MP-005 Historical
--                              Continuity / "migration shall not alter this
--                              value"). Pre-incorporation members use
--                              2019 / 11 per MEM-007 Section 5.
--   number_serial            — the raw integer drawn from the single unified
--                              pool (MP-004). 1–7 = Founding (reserved),
--                              8–20 = Historical block (reserved),
--                              21+ = operational sequential.
--   membership_number         — composed display identifier:
--                              'BCC' || join_year || LPAD(join_month,2,'0')
--                              || LPAD(number_serial,5,'0')
--                              e.g. BCC20260600021
--                              *** This composition is Claude's interpretation
--                              reconciling MEM-007 Section 4 (plain serials)
--                              with Section 5 (BCC+YYYY+MM+serial format).
--                              CONFIRM before real data is seeded — MP-001
--                              means this can never be changed once assigned. ***
--   number_assigned_at        — set only at APPROVED -> ACTIVE transition
--                              (MEM-007 Allocation Trigger).
--
-- Immutability of number_serial / membership_number is enforced at the DB
-- layer by a trigger in 0009_create_constitutional_triggers.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memberships (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                  CHAR(36) NOT NULL UNIQUE,

  owner_type            ENUM('INDIVIDUAL','GROUP') NOT NULL,
  user_id               BIGINT NULL,
  group_entity_id       BIGINT NULL,

  membership_class_id   INT NOT NULL,

  lifecycle_state       ENUM('PENDING','APPROVED','ACTIVE','SUSPENDED','EXPIRED','TERMINATED','REJECTED')
                          NOT NULL DEFAULT 'PENDING',

  -- MEM-007 numbering
  join_year             SMALLINT NULL,
  join_month            TINYINT NULL,
  number_serial         INT NULL UNIQUE,
  membership_number     VARCHAR(20) NULL UNIQUE,
  number_assigned_at    TIMESTAMP NULL,

  -- Payment-failure handling (Phase 0 gap fix from the v3.0 spec): a failed
  -- or duplicate payment must NOT advance lifecycle_state past APPROVED and
  -- must NOT trigger number assignment. last_payment_status gives the
  -- application layer somewhere to record that without inventing a new
  -- lifecycle state (MEM-006: "No lifecycle simplification is authorized" —
  -- equally, no unauthorized states should be added either).
  last_payment_status   ENUM('NONE','PENDING','FAILED','SUCCEEDED') NOT NULL DEFAULT 'NONE',

  applied_at            TIMESTAMP NULL,
  approved_at           TIMESTAMP NULL,
  activated_at          TIMESTAMP NULL,
  expires_at            TIMESTAMP NULL,
  terminated_at         TIMESTAMP NULL,

  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_membership_user  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_group FOREIGN KEY (group_entity_id) REFERENCES group_entities(id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_class FOREIGN KEY (membership_class_id) REFERENCES membership_classes(id) ON DELETE RESTRICT,

  CONSTRAINT chk_membership_owner CHECK (
    (owner_type = 'INDIVIDUAL' AND user_id IS NOT NULL AND group_entity_id IS NULL)
    OR
    (owner_type = 'GROUP' AND group_entity_id IS NOT NULL AND user_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_memberships_lifecycle_state ON memberships (lifecycle_state);
CREATE INDEX idx_memberships_user ON memberships (user_id);
CREATE INDEX idx_memberships_group ON memberships (group_entity_id);
