-- ============================================================================
-- 0007_create_membership_audit_log.sql
-- Generic, append-only audit trail for membership lifecycle transitions,
-- recognition changes, and entitlement overrides. MEM-007 explicitly says
-- numbering doesn't need its OWN audit layer because this one already
-- covers it ("Standard membership records, lifecycle records, and migration
-- records provide sufficient traceability. No separate numbering audit
-- layer is required.") — membership_number_log (0008) still exists, but as
-- a numbering-specific convenience view of events, not a duplicate system.
-- ============================================================================

CREATE TABLE IF NOT EXISTS membership_audit_log (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  membership_id   BIGINT NULL,

  event_type      VARCHAR(100) NOT NULL,   -- e.g. LIFECYCLE_TRANSITION, RECOGNITION_ASSIGNED, OVERRIDE_CREATED, PAYMENT_FAILED

  actor_type      ENUM('SYSTEM','ADMIN','MEMBER') NOT NULL DEFAULT 'SYSTEM',
  actor_user_id   BIGINT NULL,

  old_value       TEXT NULL,
  new_value       TEXT NULL,
  notes           TEXT NULL,

  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_audit_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_audit_membership ON membership_audit_log (membership_id);
CREATE INDEX idx_audit_event_type ON membership_audit_log (event_type);
