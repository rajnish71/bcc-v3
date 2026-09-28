-- ============================================================================
-- verify_0099_financial_audit_log_immutability.sql
-- OBS-12 verification for migration 0099 (financial_audit_log triggers).
--
-- Leaves nothing behind: the probe row is inserted inside a transaction that
-- is ROLLED BACK (a rollback is not a DELETE, so the no-delete trigger does
-- not fire), results are held in a non-transactional MEMORY temp table, and
-- the helper procedure is dropped at the end. Consumes one AUTO_INCREMENT
-- value (a gap in financial_audit_log.id). Requires CREATE ROUTINE.
--
-- Expected output: every row has expected = actual.
-- ============================================================================

DROP PROCEDURE IF EXISTS obs12_verify;

DELIMITER $$

CREATE PROCEDURE obs12_verify()
BEGIN
  DECLARE v_id BIGINT;
  DECLARE v_blocked INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLSTATE '45000' SET v_blocked = 1;

  DROP TEMPORARY TABLE IF EXISTS obs12_results;
  CREATE TEMPORARY TABLE obs12_results (
    check_name VARCHAR(80), expected VARCHAR(10), actual VARCHAR(10)
  ) ENGINE=MEMORY;

  START TRANSACTION;

  INSERT INTO financial_audit_log (uuid, event_type, actor_type, client_ip, user_agent, resulting_state)
  VALUES (UUID(), 'OBS12_PROBE', 'SYSTEM', '203.0.113.9', 'probe-agent', 'CREATED');
  SET v_id = LAST_INSERT_ID();

  SET v_blocked = 0;
  DELETE FROM financial_audit_log WHERE id = v_id;
  INSERT INTO obs12_results VALUES ('DELETE', 'BLOCKED', IF(v_blocked = 1, 'BLOCKED', 'ALLOWED'));

  SET v_blocked = 0;
  UPDATE financial_audit_log SET event_type = 'TAMPERED' WHERE id = v_id;
  INSERT INTO obs12_results VALUES ('UPDATE event_type', 'BLOCKED', IF(v_blocked = 1, 'BLOCKED', 'ALLOWED'));

  SET v_blocked = 0;
  UPDATE financial_audit_log SET resulting_state = 'COMPLETED' WHERE id = v_id;
  INSERT INTO obs12_results VALUES ('UPDATE resulting_state', 'BLOCKED', IF(v_blocked = 1, 'BLOCKED', 'ALLOWED'));

  SET v_blocked = 0;
  UPDATE financial_audit_log SET request_id = UUID() WHERE id = v_id;
  INSERT INTO obs12_results VALUES ('UPDATE request_id (NULL -> value)', 'BLOCKED', IF(v_blocked = 1, 'BLOCKED', 'ALLOWED'));

  SET v_blocked = 0;
  UPDATE financial_audit_log SET client_ip = '6.6.6.6' WHERE id = v_id;
  INSERT INTO obs12_results VALUES ('UPDATE client_ip to another value', 'BLOCKED', IF(v_blocked = 1, 'BLOCKED', 'ALLOWED'));

  SET v_blocked = 0;
  UPDATE financial_audit_log SET client_ip = NULL, event_type = 'TAMPERED' WHERE id = v_id;
  INSERT INTO obs12_results VALUES ('redaction smuggling another column', 'BLOCKED', IF(v_blocked = 1, 'BLOCKED', 'ALLOWED'));

  -- The approved 24-month retention operation, verbatim.
  SET v_blocked = 0;
  UPDATE financial_audit_log
     SET client_ip = NULL, user_agent = NULL
   WHERE id = v_id AND (client_ip IS NOT NULL OR user_agent IS NOT NULL);
  INSERT INTO obs12_results VALUES ('IP/UA redaction to NULL', 'ALLOWED', IF(v_blocked = 1, 'BLOCKED', 'ALLOWED'));

  SET v_blocked = 0;
  UPDATE financial_audit_log SET client_ip = '203.0.113.9' WHERE id = v_id;
  INSERT INTO obs12_results VALUES ('restore redacted client_ip', 'BLOCKED', IF(v_blocked = 1, 'BLOCKED', 'ALLOWED'));

  INSERT INTO obs12_results
  SELECT 'row intact after checks', 'YES',
         IF(event_type = 'OBS12_PROBE' AND resulting_state = 'CREATED' AND client_ip IS NULL AND user_agent IS NULL, 'YES', 'NO')
    FROM financial_audit_log WHERE id = v_id;

  ROLLBACK;

  SELECT check_name, expected, actual, IF(expected = actual, 'PASS', 'FAIL') AS result FROM obs12_results;
  DROP TEMPORARY TABLE obs12_results;
END $$

DELIMITER ;

CALL obs12_verify();
DROP PROCEDURE obs12_verify;
