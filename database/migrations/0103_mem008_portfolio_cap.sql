-- ============================================================================
-- 0103_mem008_portfolio_cap.sql
-- MEM-008 portfolio entitlement amendment.
--
--   Basic   : public portfolio, maximum 5 photos visible to the public
--   Student : public portfolio, maximum 10 photos visible to the public
--   Individual / Family / Corporate / Legacy / Honorary / Constitutional:
--             unchanged -- full public portfolio (no cap key => unlimited)
--
-- Uses the existing three-layer entitlement architecture
-- (class_entitlements + recognition_modifiers + individual_overrides).
-- New entitlement key:
--   portfolio_max_photos   integer | 'unlimited' | (absent = unlimited)
-- The cap controls PUBLIC EXPOSURE only. No photograph is deleted or altered.
--
-- SECTIONS
--   1. photos.portfolio_selected / portfolio_selected_at  (member-chosen slots)
--   2. class_entitlements: Basic = 5, Student = 10
--   3. recognition_modifiers: Honorary Member / Mentor / Grandmaster stay
--      uncapped (their recognition layer overrides the Basic class cap)
--   4. individual_overrides (auditable, reversible, class-independent):
--        a. FOUR owner-authorised ADMIN exceptions (they stay BASIC_MEMBER):
--             portfolio_enabled = true, portfolio_max_photos = unlimited,
--             public_gallery_enabled = true
--             Suyash Pratap Singh, Gaurav Sharma, Ritu Ahluwalia, Animesh Saxena
--           Identified by verified user_id + username + membership_id.
--        b. Pranil Kishnani (minor; visibility policy unresolved) ->
--             portfolio_enabled = false  (TEMPORARY restriction)
--
-- DEPLOY ORDER (IMPORTANT): apply this migration BEFORE the backend that reads
-- photos.portfolio_selected is deployed. `git push` deploys automatically.
--
-- HOW TO REVERSE AN EXCEPTION / RESTRICTION (no code change needed):
--   DELETE FROM individual_overrides WHERE id = <id>;   -- see the report below
--   (or use the existing admin entitlement API: DELETE .../overrides/:id)
--
-- NOT applied to production by Claude Code -- run manually with sudo mysql.
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. photos: member-chosen public portfolio slots (DDL auto-commits)
--    Default 0: existing photographs and new uploads never consume a slot.
-- ----------------------------------------------------------------------------
ALTER TABLE photos
  ADD COLUMN portfolio_selected TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'MEM-008: member-chosen slot in a CAPPED public portfolio (Basic 5 / Student 10). Ignored for uncapped members. Never auto-set.'
    AFTER show_in_portfolio,
  ADD COLUMN portfolio_selected_at TIMESTAMP NULL DEFAULT NULL
    AFTER portfolio_selected,
  ADD INDEX idx_photos_owner_selected (owner_user_id, portfolio_selected, status);

START TRANSACTION;

-- ----------------------------------------------------------------------------
-- 2. class_entitlements
-- ----------------------------------------------------------------------------
SET @id_basic   = (SELECT id FROM membership_classes WHERE code = 'BASIC_MEMBER');
SET @id_student = (SELECT id FROM membership_classes WHERE code = 'STUDENT_MEMBER');

INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_basic,   'portfolio_enabled',    'true'),
  (@id_basic,   'portfolio_max_photos', '5'),
  (@id_student, 'portfolio_enabled',    'true'),
  (@id_student, 'portfolio_max_photos', '10')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);
-- public_gallery_enabled stays 'false' for both (MEM-008: Public Gallery NOT included).

-- ----------------------------------------------------------------------------
-- 3. recognition_modifiers -- Honorary recognitions keep an uncapped portfolio
--    (SENIOR_MEMBER / HONORARY_SENIOR_MEMBER have no modifiers and are unchanged).
-- ----------------------------------------------------------------------------
INSERT INTO recognition_modifiers (recognition_code, entitlement_key, modifier_value)
VALUES
  ('HONORARY_MEMBER',      'portfolio_max_photos', 'unlimited'),
  ('HONORARY_MENTOR',      'portfolio_max_photos', 'unlimited'),
  ('HONORARY_GRANDMASTER', 'portfolio_max_photos', 'unlimited')
ON DUPLICATE KEY UPDATE modifier_value = VALUES(modifier_value);

-- ----------------------------------------------------------------------------
-- 4. individual_overrides  (admin-authorised, auditable, reversible)
--
-- Identities are matched by immutable ids, NOT by name. Expected values come
-- from the repository's own record (migration 0079 Rev 2: user_id /
-- membership_id / username). Each is VERIFIED against the live database
-- (user id, username, membership id, membership belongs to that user,
-- lifecycle ACTIVE, class BASIC_MEMBER). Anything that does not match exactly
-- is SKIPPED and reported as MISMATCH below -- nothing is guessed.
-- ----------------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_mem008_targets;
CREATE TEMPORARY TABLE tmp_mem008_targets (
  kind          VARCHAR(16)  NOT NULL,   -- 'EXCEPTION' | 'MINOR'
  label         VARCHAR(80)  NOT NULL,
  user_id       BIGINT       NULL,       -- NULL = not recorded in the repository
  username      VARCHAR(100) NOT NULL,
  membership_id BIGINT       NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_mem008_targets (kind, label, user_id, username, membership_id) VALUES
  ('EXCEPTION', 'Suyash Pratap Singh', 24, 'suyashpratapsingh', 19),
  ('EXCEPTION', 'Gaurav Sharma',       48, 'gauravsharma',      55),
  ('EXCEPTION', 'Ritu Ahluwalia',      30, 'rituahluwalia',     25),
  ('EXCEPTION', 'Animesh Saxena',      29, 'animeshsaxena',     24),
  -- Pranil's numeric ids are not recorded in the repository; username only.
  ('MINOR',     'Pranil Kishnani',   NULL, 'pranilkishani',   NULL);

-- Verified identities only.
DROP TEMPORARY TABLE IF EXISTS tmp_mem008_verified;
CREATE TEMPORARY TABLE tmp_mem008_verified (
  kind          VARCHAR(16)  NOT NULL,
  label         VARCHAR(80)  NOT NULL,
  membership_id BIGINT       NOT NULL,
  user_id       BIGINT       NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_mem008_verified (kind, label, membership_id, user_id)
SELECT t.kind, t.label, m.id, u.id
FROM tmp_mem008_targets t
JOIN users u
  ON u.username = t.username AND (t.user_id IS NULL OR u.id = t.user_id)
JOIN memberships m
  ON m.user_id = u.id
 AND m.lifecycle_state = 'ACTIVE'
 AND (t.membership_id IS NULL OR m.id = t.membership_id)
JOIN membership_classes mc ON mc.id = m.membership_class_id
WHERE t.kind = 'MINOR' OR mc.code = 'BASIC_MEMBER';

-- Exactly-one guard per target (a temp table cannot be referenced twice in one
-- query, hence the separate counts table).
DROP TEMPORARY TABLE IF EXISTS tmp_mem008_counts;
CREATE TEMPORARY TABLE tmp_mem008_counts (
  kind  VARCHAR(16) NOT NULL,
  label VARCHAR(80) NOT NULL,
  n     INT         NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO tmp_mem008_counts (kind, label, n)
SELECT kind, label, COUNT(*) FROM tmp_mem008_verified GROUP BY kind, label;

-- 4a. Four owner-authorised ADMIN exceptions. Basic class is NOT changed; these
--     three rows sit on top of it (membership class, number, dates, recognition,
--     payment status and every other entitlement are untouched):
--       portfolio_enabled = true, portfolio_max_photos = unlimited,
--       public_gallery_enabled = true
INSERT INTO individual_overrides
  (membership_id, entitlement_key, override_type, override_value, reason, expires_at, created_by_user_id)
SELECT v.membership_id, k.entitlement_key, 'GRANT', k.override_value,
       'MEM-008: Owner-authorized administrative portfolio exception',
       NULL, NULL
FROM tmp_mem008_verified v
JOIN tmp_mem008_counts c ON c.kind = v.kind AND c.label = v.label AND c.n = 1
JOIN (SELECT 'portfolio_enabled' AS entitlement_key, 'true' AS override_value
      UNION ALL SELECT 'portfolio_max_photos', 'unlimited'
      UNION ALL SELECT 'public_gallery_enabled', 'true') k
WHERE v.kind = 'EXCEPTION'
ON DUPLICATE KEY UPDATE
  override_type = VALUES(override_type),
  override_value = VALUES(override_value),
  reason = VALUES(reason),
  expires_at = NULL;

-- 4b. Minor: public portfolio withheld pending the owner's minor-policy decision.
--     Only portfolio_enabled = false. No exception, no gallery access.
INSERT INTO individual_overrides
  (membership_id, entitlement_key, override_type, override_value, reason, expires_at, created_by_user_id)
SELECT v.membership_id, 'portfolio_enabled', 'GRANT', 'false',
       'MEM-008 TEMPORARY restriction: member is a minor; minor-visibility policy unresolved (owner decision pending). Public portfolio withheld. Photos, membership and class unchanged.',
       NULL, NULL
FROM tmp_mem008_verified v
JOIN tmp_mem008_counts c ON c.kind = v.kind AND c.label = v.label AND c.n = 1
WHERE v.kind = 'MINOR'
ON DUPLICATE KEY UPDATE
  override_type = VALUES(override_type),
  override_value = VALUES(override_value),
  reason = VALUES(reason),
  expires_at = NULL;

-- Audit trail (same event type the admin API writes)
INSERT INTO membership_audit_log (membership_id, event_type, actor_type, actor_user_id, new_value, notes)
SELECT o.membership_id, 'INDIVIDUAL_OVERRIDE_CREATED', 'SYSTEM', NULL,
       CAST(JSON_OBJECT('key', o.entitlement_key, 'overrideType', o.override_type,
                        'value', o.override_value, 'expiresAt', NULL) AS CHAR),
       o.reason
FROM individual_overrides o
JOIN tmp_mem008_verified v ON v.membership_id = o.membership_id
JOIN tmp_mem008_counts c ON c.kind = v.kind AND c.label = v.label AND c.n = 1
WHERE o.reason LIKE 'MEM-008%'
  AND o.entitlement_key IN ('portfolio_enabled', 'portfolio_max_photos', 'public_gallery_enabled');

-- ----------------------------------------------------------------------------
-- Verification output.  EVERY row must say VERIFIED.  A MISMATCH row was
-- SKIPPED: nothing was written for it. Fix the identity by hand and re-run
-- section 4 only.
-- ----------------------------------------------------------------------------
SELECT t.kind, t.label,
       t.user_id AS expected_user_id, t.username AS expected_username,
       t.membership_id AS expected_membership_id,
       u.id AS actual_user_id, u.username AS actual_username,
       m.id AS actual_membership_id, m.lifecycle_state, mc.code AS actual_class,
       CASE WHEN COALESCE(c.n, 0) = 1 THEN 'VERIFIED' ELSE 'MISMATCH - SKIPPED' END AS status
FROM tmp_mem008_targets t
LEFT JOIN tmp_mem008_counts c ON c.kind = t.kind AND c.label = t.label
LEFT JOIN users u ON u.username = t.username
LEFT JOIN memberships m ON m.user_id = u.id AND m.lifecycle_state = 'ACTIVE'
LEFT JOIN membership_classes mc ON mc.id = m.membership_class_id;

SELECT o.id AS override_id, u.username, m.id AS membership_id, mc.code AS class_code,
       o.entitlement_key, o.override_type, o.override_value, o.reason
FROM individual_overrides o
JOIN memberships m ON m.id = o.membership_id
JOIN users u ON u.id = m.user_id
JOIN membership_classes mc ON mc.id = m.membership_class_id
WHERE o.reason LIKE 'MEM-008%'
ORDER BY u.username, o.entitlement_key;

DROP TEMPORARY TABLE IF EXISTS tmp_mem008_counts;
DROP TEMPORARY TABLE IF EXISTS tmp_mem008_verified;
DROP TEMPORARY TABLE IF EXISTS tmp_mem008_targets;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0103_mem008_portfolio_cap.sql', NOW());

COMMIT;
