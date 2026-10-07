-- ============================================================================
-- 0116_create_photographic_distinctions.sql
-- Photographic Distinctions -- Implementation Phase 1 (schema foundation).
--
-- Photographic Distinctions are structured, catalogue-bounded, self-declared,
-- UNVERIFIED identity attributes. They are NOT Recognition Classes, Status
-- Overlays, Membership Categories, RBAC roles, entitlements or voting/
-- governance rights. No FK to memberships / membership_classes /
-- member_recognitions exists here, by design (MEM-006 boundary).
--
-- The derived "BCC Distinguished Photographer Badge" has NO table and NO
-- stored state: it is derived at read time (photographic-distinction-badge.ts).
--
-- 1. photographic_institutions -- extensible institution catalogue.
--    Seeded with exactly FIP, FIAP, PSA, RPS, GPU. No generic OTHER row.
--
-- 2. photographic_distinctions -- distinction catalogue, unique per
--    (institution_id, code). Deliberately seeded with NO rows here: entries
--    are created only after Human Authority approves the legacy
--    classification report (names and badge_eligible are HA decisions),
--    through identity.distinction.catalogue.manage.
--
-- 3. user_photographic_distinctions -- member declarations.
--      state             DECLARED | WITHDRAWN | REMOVED
--      pre_removal_state the state an administrator Remove superseded, so
--                        Restore returns the entry to its prior valid state.
--                        Set if and only if state = REMOVED (CHECK).
--    One row per (user_id, distinction_id); rows are never hard-deleted by
--    the application (withdraw / remove are state changes). user FK is
--    RESTRICT (0110 convention), so history cannot vanish by cascade.
--
-- Legacy user_photo_titles is NOT read, modified or retired by this
-- migration (SNAPSHOT -> CLASSIFY -> MAP -> VERIFY -> CARRY FORWARD -> RETIRE;
-- carry-forward awaits HA approval of the classification report).
--
-- Idempotency: CREATE TABLE IF NOT EXISTS; INSERT IGNORE on uq code.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS photographic_institutions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  code                VARCHAR(20)  NOT NULL,
  name                VARCHAR(255) NOT NULL,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  updated_by_user_id  BIGINT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_photo_inst_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_photo_inst_code (code),
  KEY idx_photo_inst_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photographic_distinctions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  institution_id      INT NOT NULL,
  code                VARCHAR(50)  NOT NULL,
  name                VARCHAR(255) NOT NULL,
  badge_eligible      TINYINT(1)   NOT NULL DEFAULT 0,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  updated_by_user_id  BIGINT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_photo_dist_institution FOREIGN KEY (institution_id) REFERENCES photographic_institutions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_photo_dist_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_photo_dist_institution_code (institution_id, code),
  KEY idx_photo_dist_sort (institution_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_photographic_distinctions (
  id                        BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id                   BIGINT NOT NULL,
  distinction_id            INT NOT NULL,
  state                     ENUM('DECLARED','WITHDRAWN','REMOVED') NOT NULL,
  pre_removal_state         ENUM('DECLARED','WITHDRAWN') NULL,
  declared_at               DATETIME NOT NULL,
  state_changed_at          DATETIME NOT NULL,
  state_changed_by_user_id  BIGINT NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_user_photo_dist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_photo_dist_distinction FOREIGN KEY (distinction_id) REFERENCES photographic_distinctions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_photo_dist_changed_by FOREIGN KEY (state_changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_user_photo_dist_pre_removal
    CHECK ((state = 'REMOVED') = (pre_removal_state IS NOT NULL)),
  UNIQUE KEY uq_user_photo_dist (user_id, distinction_id),
  KEY idx_user_photo_dist_distinction_state (distinction_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initial institution catalogue: exactly these five. Names are catalogue
-- data editable via identity.distinction.catalogue.manage.
INSERT IGNORE INTO photographic_institutions (code, name, is_active, sort_order) VALUES
  ('FIP',  'Federation of Indian Photography',                     1, 10),
  ('FIAP', 'Fédération Internationale de l''Art Photographique',  1, 20),
  ('PSA',  'Photographic Society of America',                      1, 30),
  ('RPS',  'The Royal Photographic Society',                       1, 40),
  ('GPU',  'Global Photographic Union',                            1, 50);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0116_create_photographic_distinctions.sql', NOW());

COMMIT;
