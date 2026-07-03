-- ============================================================================
-- 0024_entitlement_recognition_renewal.sql
-- Module 02 batch 2: entitlement engine schema fix + recognition AUTO
-- criteria + renewal config groundwork.
--
-- 1) individual_overrides gains override_type + expires_at (spec 02.10
--    required both; flagged as a gap at the start of Module 02).
--    GRANT = set/replace an entitlement value for this membership.
--    REVOKE = remove the entitlement key entirely for this membership,
--    regardless of what class/recognition layers would grant.
--
-- 2) recognition_criteria: admin-configurable thresholds for the AUTO
--    recognition track (spec 02.9). Key-value per recognition_code, same
--    shape as class_entitlements. Seeded defaults live in seed_0004 and are
--    explicitly UNCONFIRMED pending governance sign-off.
--
-- 3) Renewal term/grace-period config deliberately does NOT get columns on
--    membership_classes: the constitutional trigger (0009) blocks UPDATE on
--    constitutional class rows, so setting values there for Life/Patron/
--    Founding would be impossible. Config lives in class_entitlements as
--    key-value instead (renewal_term_months / grace_period_days), seeded in
--    seed_0004 for is_renewable classes only. No DDL needed here for that.
-- ============================================================================

ALTER TABLE individual_overrides
  ADD COLUMN override_type ENUM('GRANT','REVOKE') NOT NULL DEFAULT 'GRANT' AFTER entitlement_key,
  ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL AFTER reason;

CREATE TABLE IF NOT EXISTS recognition_criteria (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  recognition_code    ENUM(
                        'SENIOR_MEMBER',
                        'HONORARY_SENIOR_MEMBER',
                        'HONORARY_MEMBER',
                        'HONORARY_MENTOR',
                        'HONORARY_GRANDMASTER'
                      ) NOT NULL,
  criteria_key        VARCHAR(100) NOT NULL,
  criteria_value      VARCHAR(255) NOT NULL,
  updated_by_user_id  BIGINT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_recognition_criteria_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uq_recognition_criteria (recognition_code, criteria_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
