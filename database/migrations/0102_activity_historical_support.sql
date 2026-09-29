-- ============================================================================
-- 0102_activity_historical_support.sql
-- Module 04 -- Activities: Stage 1 reconciliation (historical Activity support)
-- ============================================================================
-- Additive and non-destructive:
--   * events.starts_at becomes NULLable (all existing values preserved).
--     NULL is permitted by the application ONLY for historical Activities.
--   * historical date detail and provenance are stored separately from the
--     exact date, so no false precision is forced:
--       exact date/time known   -> starts_at set
--       year / month known      -> historical_year (+ historical_month)
--       nothing known           -> all NULL (+ optional historical_date_note)
--   * historical_source_note records where the historical facts came from.
--   * The historical Activity date is independent of created_at (portal
--     record creation).
-- No tables, columns or enum values are dropped. MEMBER_DISCOUNTED remains in
-- the fee_type enum as an inert value; it is rejected at the API layer.
-- ============================================================================

START TRANSACTION;

ALTER TABLE events
  MODIFY COLUMN starts_at DATETIME NULL,
  ADD COLUMN is_historical          TINYINT(1)        NOT NULL DEFAULT 0   AFTER state,
  ADD COLUMN historical_year        SMALLINT UNSIGNED NULL                 AFTER is_historical,
  ADD COLUMN historical_month       TINYINT UNSIGNED  NULL                 AFTER historical_year,
  ADD COLUMN historical_date_note   VARCHAR(255)      NULL                 AFTER historical_month,
  ADD COLUMN historical_source_note TEXT              NULL                 AFTER historical_date_note;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0102_activity_historical_support.sql', NOW());

COMMIT;
