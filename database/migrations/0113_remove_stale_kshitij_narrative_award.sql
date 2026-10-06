-- ============================================================================
-- 0113_remove_stale_kshitij_narrative_award.sql
-- Data correction: remove the stale legacy "Photography Achievements" narrative
-- row seeded for Kshitij Patle by migration 0044.
--
-- AUTHORISED: Rajnish (human authority), 2026-10-06.
--
-- WHY:
--   0044 inserted user_awards row 8 as ONE flat narrative (12 achievements in a
--   single description, no machine-readable separation). 0045 migrated the
--   same legacy source into users.awards_html as a structured list, which the
--   member has since maintained himself (Hub "Awards & Recognition", last
--   edited 2026-10-06; 18 entries, a superset of all 12 in row 8).
--   user_awards has no write path, and the public About tab gives it
--   precedence over awards_html — so this stale row hid the member's current
--   list and rendered as one undifferentiated block. It also inflated the
--   interim Hub "Contest Awards" count although it is not a contest award.
--   No information is lost: every achievement in row 8 is present in
--   awards_html, and the original row text remains on record in 0044.
--
-- SCOPE: exactly one row. The WHERE clause pins the row by id, owner
--   (resolved by username), name, NULL body/year, and a SHA-256 of the
--   description as seeded, so it deletes nothing if production state differs.
--   No other user_awards rows, no users.awards_html, no schema change.
--   Migration 0044 is left untouched as the historical record.
--
-- Idempotent: a re-run matches zero rows.
-- Runs as bcc_v3_app (no triggers).
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

DELETE FROM user_awards
WHERE id = 8
  AND user_id = (SELECT u.id FROM users u WHERE u.username = 'kshitijpatle')
  AND award_name = 'Photography Achievements'
  AND awarding_body IS NULL
  AND award_year IS NULL
  AND SHA2(description, 256) = '88c4ed560985244c70924bd2ddec9c8392d99b42355ac98a66c2d0330e517aff';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0113_remove_stale_kshitij_narrative_award.sql', NOW());

COMMIT;
