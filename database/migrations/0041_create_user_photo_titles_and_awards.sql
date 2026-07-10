-- ============================================================================
-- 0041_create_user_photo_titles_and_awards.sql
-- Phase D -- Member Profile Schema (Batch D1)
--
-- Creates two tables:
--   user_photo_titles  -- international photographic body title codes
--   user_awards        -- award narratives and structured award records
--
-- SOURCE (Phase C audit):
--   bcc.bcc_photographers.distinctions (JSON column)
--   Structure: { fip, psa, fiap, other, awards }
--
-- Members with substantive data:
--   Dr. Sanjay Kumar Shukla: fip="EFIP", psa="PPSA", fiap="AFIAP",
--     other="GPU-CR3, GPU VIP-3, FRPA, GNG, Hon PESGSPC, GPA-PESGSPC,
--            HonVNPC, Hon WPAI"
--   Kshitij Patle: fip="AFIP", awards=narrative about competition wins
--     and magazine features
--   Prakash Hatvalne: awards="Smithsonian Grand Prize 2011, UNDP First Prize
--     2010, Friends of Earth International 2009, Humanity Photo Award China 2006"
--   Rahil Khan: awards="Loading....." -- DISCARD (placeholder, not migrated)
--
-- ============================================================================
-- TABLE 1: user_photo_titles
-- ============================================================================
--
-- DESIGN DECISIONS:
--
--   Separate from user_awards:
--     Body codes (EFIP, PPSA, AFIAP) appear after a photographer's name as
--     credential suffixes. Awards are narrative achievements. These are
--     conceptually and display-wise distinct.
--
--   body_code ENUM covers five principal bodies:
--     FIP  -- Fédération Internationale de la Photographie
--              (AFIP = Associate, EFIP = Excellence, MFIP = Master)
--     PSA  -- Photographic Society of America
--              (PPSA = Proficient, FPSA = Fellow, MPSA = Master)
--     FIAP -- Fédération Internationale de l'Art Photographique
--              (AFIAP = Associate, EFIAP = Excellence, MFIAP = Master)
--     GPU  -- Global Photographic Union
--              (GPU-CR grades, GPU VIP levels)
--     OTHER -- Any body not in the above four; body_name must be supplied
--
--   title_code VARCHAR(50):
--     The exact code string as awarded. Examples: "EFIP", "PPSA", "AFIAP",
--     "GPU-CR3", "GPU VIP-3", "FRPA". Free text, not constrained, because
--     bodies issue new grade codes over time.
--
--   body_name VARCHAR(255) NULL:
--     Required when body_code = 'OTHER'; provides the full name of the awarding
--     body (e.g. "Federation of Russian Photographers Art", "PESGSPC").
--     NULL for FIP/PSA/FIAP/GPU whose names are internationally known.
--
--   sort_order TINYINT:
--     Controls display sequence of titles on the profile page. Smaller values
--     appear first. During migration, FIP=10, PSA=20, FIAP=30, GPU=40,
--     OTHER=50+ (incrementing per item for the comma-separated string).
--
-- ============================================================================
-- TABLE 2: user_awards
-- ============================================================================
--
-- DESIGN DECISIONS:
--
--   One row per award:
--     Prakash Hatvalne's structured awards (Smithsonian 2011, UNDP 2010, etc.)
--     map cleanly to individual rows. Kshitij's narrative text is stored as
--     a single row with description populated and award_name = narrative title.
--
--   award_year YEAR NULL:
--     MySQL YEAR type (valid 1901–2155). NULL for awards without a known year,
--     or when the entire entry is a narrative without individual year attribution.
--
--   description TEXT NULL:
--     Long narrative text field. Used for Kshitij's extended achievement text
--     and for any award that requires contextual explanation.
--
--   sort_order TINYINT:
--     Controls display sequence. Typically reverse-chronological (newer first)
--     but admin-overridable.
--
-- DATA MIGRATION:
--   Populating both tables from legacy distinctions data is a separate
--   operation (Batch D2). This migration creates the tables only.
--
-- CONSTITUTION:
--   No founding member data is altered. All existing user rows are untouched.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- ============================================================================
-- TABLE 1: user_photo_titles
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_photo_titles (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,

  body_code   ENUM('FIP', 'PSA', 'FIAP', 'GPU', 'OTHER') NOT NULL,
  title_code  VARCHAR(50) NOT NULL,
  body_name   VARCHAR(255) NULL,     -- required when body_code = 'OTHER'

  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,

  CONSTRAINT fk_photo_titles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_photo_titles_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE 2: user_awards
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_awards (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT NOT NULL,

  award_name      VARCHAR(255) NOT NULL,
  awarding_body   VARCHAR(255) NULL,
  award_year      YEAR NULL,
  description     TEXT NULL,

  sort_order      TINYINT UNSIGNED NOT NULL DEFAULT 0,

  CONSTRAINT fk_user_awards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_awards_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0041_create_user_photo_titles_and_awards.sql', NOW());

COMMIT;
