-- ============================================================================
-- scripts/tools/tenure/wp2-production-snapshot.sql
--
-- TENURE-ARCH-001 v1.1 WP2 -- READ-ONLY pre- and post-migration evidence for
-- migrations 0119-0124. Every statement is a SELECT / SHOW. Nothing writes.
--
-- NOT RUN BY WP2. Run only when the production migration is separately
-- authorized, once BEFORE applying 0119 and once AFTER 0124, and compare.
--
-- Table snapshots required before migrating (operator, on the server; the
-- output contains personal data -- keep it on the server, never commit it):
--   mysqldump --single-transaction --no-tablespaces bcc_v3 \
--     member_recognitions recognition_criteria memberships \
--     membership_audit_log schema_migrations > wp2_pre_<UTC timestamp>.sql
--
-- Then:  mysql bcc_v3 < scripts/tools/tenure/wp2-production-snapshot.sql
-- ============================================================================

SELECT NOW() AS captured_at_db, @@time_zone AS session_tz, @@system_time_zone AS system_tz;

SHOW CREATE TABLE member_recognitions;
SHOW CREATE TABLE membership_audit_log;

-- Latest migrations (pre: 0118 last; post: 0119-0124 present).
SELECT filename, applied_at FROM schema_migrations ORDER BY filename DESC LIMIT 10;

-- Recognition rows 1-16: recorded-column hashes (active_lock excluded; it is
-- the only value 0124 is authorized to change, and only for Senior rows).
SELECT id, membership_id, recognition_code, track, status, start_date, end_date, assigned_by_user_id, active_lock,
       MD5(CONCAT_WS('|', id, membership_id, recognition_code, track, status, IFNULL(reason,''),
                     IFNULL(assigned_by_user_id,''), start_date, IFNULL(end_date,''), created_at)) AS row_hash
  FROM member_recognitions ORDER BY id;

-- Expected: total 16, max id 16, Senior 8 (ids 8-15, all MANUAL ACTIVE), AUTO Senior 0.
SELECT COUNT(*) AS total,
       MAX(id) AS max_id,
       SUM(recognition_code = 'SENIOR_MEMBER') AS senior_rows,
       SUM(recognition_code = 'SENIOR_MEMBER' AND track = 'AUTO') AS auto_senior,
       SUM(recognition_code = 'SENIOR_MEMBER' AND track = 'MANUAL' AND status = 'ACTIVE') AS manual_active_senior,
       SUM(recognition_code = 'SENIOR_MEMBER' AND active_lock IS NOT NULL) AS senior_rows_holding_slot
  FROM member_recognitions;

-- Honorary rows 3 and 7 (Senior wording in reason text; must stay Honorary).
SELECT id, membership_id, recognition_code, status FROM member_recognitions WHERE id IN (3, 7);

-- Recognition criteria (expected 5 rows, hash 50feee65eebea4e60adaeee9d47916cf on 2026-10-07).
SELECT COUNT(*) AS criteria_rows,
       MD5(GROUP_CONCAT(CONCAT_WS('|', recognition_code, criteria_key, criteria_value)
                        ORDER BY recognition_code, criteria_key)) AS criteria_hash
  FROM recognition_criteria;

-- Membership audit (expected max id 416 unless other authorized activity occurred).
SELECT MAX(id) AS max_audit_id, COUNT(*) AS audit_rows, MAX(created_at) AS last_audit_at FROM membership_audit_log;

-- POST-MIGRATION ONLY (these fail before 0119-0122 exist): all must be 0,
-- and subject_user_id must be NULL on every existing audit row.
-- SELECT COUNT(*) AS rsp_rows FROM recognized_service_periods;
-- SELECT COUNT(*) AS overlay_rows FROM senior_status_overlays;
-- SELECT COUNT(*) AS transition_rows FROM senior_status_transitions;
-- SELECT COUNT(*) AS audit_rows_with_subject FROM membership_audit_log WHERE subject_user_id IS NOT NULL;
-- SELECT trigger_name, event_object_table FROM information_schema.triggers
--  WHERE trigger_schema = DATABASE()
--    AND event_object_table IN ('member_recognitions','recognized_service_periods',
--                               'senior_status_overlays','senior_status_transitions','membership_audit_log');
