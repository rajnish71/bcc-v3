-- ============================================================================
-- 0115_identity_audit_log_nullable_target.sql
-- Photographic Distinctions -- Implementation Phase 1 (audit foundation).
--
-- identity_audit_log.target_user_id becomes NULLABLE so catalogue-level
-- events (photographic institution / distinction catalogue changes) can be
-- recorded in the existing identity audit trail without inventing a target.
--
-- Target rules (enforced in application code, identity-audit.util.ts):
--   user-level events      -> target_user_id = the affected user
--                             (e.g. the distinction holder)
--   catalogue-level events -> target_user_id = NULL
--   The actor is NEVER substituted as target merely to satisfy NOT NULL,
--   and catalogue updated_by_user_id is not a substitute for the audit row.
--
-- No second audit system is created. Existing rows are unchanged (every
-- existing row has a non-NULL target). The FK fk_identity_audit_target and
-- index idx_identity_audit_target are retained unchanged; a NULL value
-- simply does not participate in the FK.
--
-- Rollback (only valid while no NULL-target rows exist):
--   ALTER TABLE identity_audit_log MODIFY target_user_id BIGINT NOT NULL;
--
-- DDL auto-commits in MySQL 8; the transaction wrapper only scopes the
-- schema_migrations insert, matching the repository convention.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE identity_audit_log
  MODIFY target_user_id BIGINT NULL;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0115_identity_audit_log_nullable_target.sql', NOW());

COMMIT;
