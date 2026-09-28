-- ============================================================================
-- 0100_add_session_id_to_auth_provenance.sql
-- Payment & Authentication Observability Remediation -- OBS-03.
--
-- session_id is a random UUID minted once per login (AuthService.
-- issueTokenPair()) and inherited unchanged across refresh-token rotation
-- (AuthService.refresh() reads the existing row's session_id and passes it
-- through) -- it is correlation metadata only and grants no authority
-- (Section 8: "The session UUID is correlation metadata only. It grants no
-- authority."). The access JWT's new `sid` claim (token.util.ts
-- AccessTokenPayload) carries the same value so AccessTokenGuard's existing
-- signature-only verification (no DB lookup, access-token.guard.ts) can
-- expose it to downstream code (e.g. FinancialAuditService) without adding
-- a DB round-trip to every authenticated request.
--
-- Existing rows get NULL -- Section 11 forbids fabricating historical
-- provenance. A refresh of a pre-existing NULL-session refresh_tokens row
-- mints a fresh session id going forward (AuthService.refresh()).
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE refresh_tokens
  ADD COLUMN session_id CHAR(36) NULL AFTER user_id;

ALTER TABLE refresh_tokens
  ADD INDEX idx_refresh_tokens_session (session_id);

ALTER TABLE login_history
  ADD COLUMN session_id CHAR(36) NULL AFTER user_id;

ALTER TABLE login_history
  ADD INDEX idx_login_history_session (session_id);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0100_add_session_id_to_auth_provenance.sql', NOW());

COMMIT;
