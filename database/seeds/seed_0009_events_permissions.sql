-- ============================================================================
-- seed_0009_events_permissions.sql
-- Module 04 Events -- RBAC permission keys.
--
-- MEM-006 P3: RBAC is fully decoupled from Membership. These permissions
-- govern operational event management; they do not confer voting rights or
-- membership benefits of any kind.
--
-- Intended role assignments (informational -- not enforced by this seed):
--   event.create / event.update_any / event.publish / event.cancel_any
--     -> Event Manager, Coordinator, Super Admin
--   event.view_registrations
--     -> Event Manager, Coordinator, Membership Manager, Super Admin
--   event.registration.checkin
--     -> Event Manager, Coordinator, any volunteer (scoped at runtime)
--   event.volunteer.manage
--     -> Event Manager, Coordinator
-- ============================================================================

INSERT INTO permissions (permission_key, description) VALUES

('event.create',
 'Create a new event (starts in DRAFT state).'),

('event.update_any',
 'Edit any existing event regardless of creator.'),

('event.publish',
 'Publish a DRAFT event, making it publicly visible and open for registration.'),

('event.cancel_any',
 'Cancel a PUBLISHED or COMPLETED event; triggers mass notification to registrants.'),

('event.view_registrations',
 'View the full registration list for any event, including attendee details and check-in status.'),

('event.registration.checkin',
 'Mark an event registration as ATTENDED (QR check-in or manual).'),

('event.volunteer.manage',
 'Create volunteer slots, confirm volunteer applications, and log volunteer hours.');
