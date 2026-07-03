-- ============================================================================
-- seed_0003_membership_permissions.sql
-- Permissions gating Module 02 lifecycle/numbering endpoints. Idempotent.
-- Not wired into schema_migrations tracking -- run manually, once, same
-- pattern as seed_0001/seed_0002.
--
-- membership.numbering.assign_reserved is Super-Admin-only, deliberately
-- NOT granted to Platform Admin or Membership Manager -- MEM-007 §7 frames
-- Founding/Historical serial assignment as a one-time, committee-decided
-- migration act, not routine membership administration.
-- ============================================================================
INSERT IGNORE INTO permissions (permission_key, description) VALUES
  ('membership.application.create_for_others',    'Submit a membership application on behalf of another user or a group entity'),
  ('membership.application.approve',               'Approve a PENDING membership application'),
  ('membership.application.reject',                'Reject a PENDING membership application'),
  ('membership.lifecycle.activate',                'Manually activate an APPROVED membership (APPROVED -> ACTIVE)'),
  ('membership.lifecycle.record_payment_failure',  'Record a failed/timed-out payment against an APPROVED membership'),
  ('membership.lifecycle.suspend',                 'Suspend an ACTIVE membership'),
  ('membership.lifecycle.reinstate',                'Lift a suspension (SUSPENDED -> ACTIVE)'),
  ('membership.lifecycle.expire',                   'Manually mark an ACTIVE membership as EXPIRED'),
  ('membership.lifecycle.renew',                    'Renew an EXPIRED membership back to ACTIVE'),
  ('membership.lifecycle.terminate',                'Terminate a membership permanently'),
  ('membership.record.view',                        'View any membership record (not just one''s own)'),
  ('membership.numbering.assign_reserved',          'One-time migration-only assignment of a Founding (00001-00007) or Historical Block (00008-00020) serial');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin', 'Membership Manager', 'Coordinator')
  AND p.permission_key IN (
    'membership.application.create_for_others',
    'membership.application.approve',
    'membership.application.reject',
    'membership.lifecycle.activate',
    'membership.lifecycle.record_payment_failure',
    'membership.lifecycle.suspend',
    'membership.lifecycle.reinstate',
    'membership.lifecycle.expire',
    'membership.lifecycle.renew',
    'membership.lifecycle.terminate',
    'membership.record.view'
  );

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Super Admin'
  AND p.permission_key = 'membership.numbering.assign_reserved';
