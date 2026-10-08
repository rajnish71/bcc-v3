-- ============================================================================
-- 0126_amend_service_period_verification_check.sql
--
-- TENURE-ARCH-001 v1.1 WP2-A1 (Human Authority approved, applied in WP3):
-- native-system vs human verification. CHECK-only amendment of
-- chk_rsp_verification from 0119. No column is added; `basis` already
-- distinguishes native (NATIVE_LIFECYCLE) from human-evidenced
-- (HISTORICAL_RECONCILIATION / GOVERNANCE_ATTESTATION) periods.
--
--   UNVERIFIED                      verifier NULL, verified_at NULL   (unchanged)
--   VERIFIED  + NATIVE_LIFECYCLE    verifier MUST be NULL, verified_at required.
--                                   native_source_type / native_source_id are
--                                   already mandatory (chk_rsp_native_source).
--                                   No system user identity exists or is created.
--   VERIFIED  + human basis         verifier required, verified_at required,
--                                   evidence_reference required and non-blank.
--   REJECTED                        verifier, verified_at and reason required
--                                   (unchanged).
--
-- The write-once protection of verification fields (trg_rsp_before_update)
-- and every other 0119 constraint are untouched. The table holds no rows at
-- the time of this amendment (no writer existed before WP3).
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE recognized_service_periods DROP CHECK chk_rsp_verification;

ALTER TABLE recognized_service_periods
  ADD CONSTRAINT chk_rsp_verification CHECK (
    (verification_status = 'UNVERIFIED' AND verified_by_user_id IS NULL AND verified_at IS NULL)
    OR (verification_status = 'VERIFIED' AND verified_at IS NOT NULL
        AND ((basis = 'NATIVE_LIFECYCLE' AND verified_by_user_id IS NULL)
             OR (basis <> 'NATIVE_LIFECYCLE' AND verified_by_user_id IS NOT NULL
                 AND evidence_reference IS NOT NULL AND TRIM(evidence_reference) <> '')))
    OR (verification_status = 'REJECTED' AND verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL
        AND verification_reason IS NOT NULL AND TRIM(verification_reason) <> '')
  );

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0126_amend_service_period_verification_check.sql', NOW());

COMMIT;
