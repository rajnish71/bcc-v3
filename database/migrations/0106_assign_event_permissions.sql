-- ============================================================================
-- 0106_assign_event_permissions.sql
-- Module 04 Stage 2 -- Activities Admin RBAC reconciliation.
--
-- seed_0009_events_permissions.sql created the seven event.* permission keys
-- but never assigned them to any role (its role list was "informational --
-- not enforced by this seed"). Every Module 04 admin endpoint therefore
-- returned 403 for all users once /hub/admin/activities/ began calling them.
--
-- This migration only repairs the missing role_permissions rows. The role
-- mapping is exactly the one documented in the seed_0009 header -- no role
-- authority is added beyond it:
--   event.create / event.update_any / event.publish / event.cancel_any
--     -> Super Admin, Coordinator, Event Manager
--   event.view_registrations
--     -> Super Admin, Coordinator, Event Manager, Membership Manager
--   event.registration.checkin
--     -> Coordinator, Event Manager
--   event.volunteer.manage
--     -> Coordinator, Event Manager
-- The seed_0009 "any volunteer (scoped at runtime)" check-in entry is a
-- runtime rule, not a role grant, and is not represented here.
--
-- The permission rows already exist (seed_0009); they are not recreated.
-- Follows the pattern of 0089/0098/0101 (role_permissions via CROSS JOIN,
-- INSERT IGNORE -- idempotent).
--
-- MEM-006 P3: grants only; touches role_permissions and no membership
-- table. No user_roles or permissions row is created or changed.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Coordinator', 'Event Manager')
  AND p.permission_key IN (
    'event.create',
    'event.update_any',
    'event.publish',
    'event.cancel_any'
  );

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Coordinator', 'Event Manager', 'Membership Manager')
  AND p.permission_key = 'event.view_registrations';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Coordinator', 'Event Manager')
  AND p.permission_key IN (
    'event.registration.checkin',
    'event.volunteer.manage'
  );

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0106_assign_event_permissions.sql', NOW());

COMMIT;
