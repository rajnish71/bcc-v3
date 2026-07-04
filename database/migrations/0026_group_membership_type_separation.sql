-- ============================================================================
-- 0026_group_membership_type_separation.sql
--
-- OPTION B (confirmed by Rajnish, 04 Jul 2026): Group Membership Types are
-- structurally separated from membership_classes, taking MEM-006 at its
-- word: "Group Memberships are not Membership Classes. Group Memberships
-- are not Recognition Classes. Group Memberships are not Constitutional
-- Classes."
--
-- The spec's Classification Reference table lists group types alongside
-- classes, which batches 1-2 implicitly assumed meant same-table storage.
-- That ambiguity was surfaced and resolved by governance decision: full
-- separation, mirroring the RBAC/membership decoupling precedent (MEM-006
-- P3).
--
-- Consequences implemented here:
--   1. New group_membership_types config table (admin-configurable per
--      MEM-006 -- group types are NOT constitutional, NOT protected by the
--      0009 trigger, and deliberately have NO voting/governance columns:
--      "Voting rights not inherited... NO -- Entity". The columns not
--      existing is the strongest possible enforcement.)
--   2. New group_type_entitlements table mirroring class_entitlements
--      (layer-1 base config for GROUP-owned memberships).
--   3. memberships.membership_class_id becomes NULLable; new
--      memberships.group_membership_type_id added. A CHECK constraint
--      enforces exactly-one based on owner_type.
--
-- MEM-007 note: numbering is untouched. "Single pool for all membership
-- classes -- Full, Life, Patron, Founding, Basic, Student, Individual,
-- Group delegates all draw from the same sequence." Group memberships get
-- numbers from the same unified pool via the same allocation trigger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_membership_types (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(40) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,

  -- Binds each type to its owning entity kind (group_entities.type).
  -- UNIQUE: exactly one membership type per entity kind today; relaxing
  -- that later is an ALTER, not a redesign.
  entity_type   ENUM('FAMILY','CORPORATE','INSTITUTIONAL') NOT NULL UNIQUE,

  is_renewable  TINYINT(1) NOT NULL DEFAULT 1,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Structural seed (parallel to how 0002 seeded membership_classes).
-- Renewal terms / grace / max_delegates are CONFIG, seeded in seed_0005.
INSERT IGNORE INTO group_membership_types (code, name, entity_type, is_renewable, sort_order) VALUES
  ('FAMILY_MEMBERSHIP',        'Family Membership',        'FAMILY',        1, 1),
  ('CORPORATE_MEMBERSHIP',     'Corporate Membership',     'CORPORATE',     1, 2),
  ('INSTITUTIONAL_MEMBERSHIP', 'Institutional Membership', 'INSTITUTIONAL', 1, 3);

CREATE TABLE IF NOT EXISTS group_type_entitlements (
  id                        BIGINT AUTO_INCREMENT PRIMARY KEY,
  group_membership_type_id  INT NOT NULL,
  entitlement_key           VARCHAR(100) NOT NULL,
  entitlement_value         VARCHAR(255) NOT NULL,

  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_group_type_entitlement_type
    FOREIGN KEY (group_membership_type_id) REFERENCES group_membership_types(id) ON DELETE CASCADE,
  UNIQUE KEY uq_group_type_entitlement (group_membership_type_id, entitlement_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- memberships: class becomes nullable, group type FK added.
ALTER TABLE memberships
  MODIFY COLUMN membership_class_id INT NULL,
  ADD COLUMN group_membership_type_id INT NULL AFTER membership_class_id,
  ADD CONSTRAINT fk_membership_group_type
    FOREIGN KEY (group_membership_type_id) REFERENCES group_membership_types(id);

-- Exactly-one enforcement, keyed on owner_type. MySQL 8.0.16+ enforces
-- CHECK constraints; this server is 8.0.x on Ubuntu 24.04. All existing
-- rows are INDIVIDUAL with membership_class_id set, so validation of
-- existing data passes.
ALTER TABLE memberships
  ADD CONSTRAINT chk_membership_owner_axis CHECK (
    (owner_type = 'INDIVIDUAL' AND membership_class_id IS NOT NULL AND group_membership_type_id IS NULL)
    OR
    (owner_type = 'GROUP' AND group_membership_type_id IS NOT NULL AND membership_class_id IS NULL)
  );
