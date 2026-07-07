-- ============================================================================
-- seed_0010_journal_permissions.sql
-- Journal Module — RBAC permission keys + role assignments.
--
-- ROLE ASSIGNMENTS (informational, enforced below):
--
--   journal.create / journal.update_any / journal.publish / journal.archive
--     → Content Editor, Coordinator, Platform Admin, Super Admin
--
--   journal.delete_any
--     → Platform Admin, Super Admin   (destructive; narrower gate)
--
-- The "Content Editor" role (id=9, OPERATIONAL category) is the designated
-- journal-authoring role seeded in seed_0001_rbac_roles.sql.
-- Assign it to trusted members via identity.role.assign (Super Admin only).
--
-- Note: "author" in the UX sense maps to Content Editor in the RBAC sense.
-- No new role is created here — this keeps the role taxonomy stable.
-- ============================================================================

-- 1. Permission keys --------------------------------------------------------

INSERT IGNORE INTO permissions (permission_key, description) VALUES
  ('journal.create',
   'Create a new journal post (starts in DRAFT state).'),

  ('journal.update_any',
   'Edit any journal post regardless of author — title, body, hero image, category, tags, SEO fields.'),

  ('journal.publish',
   'Publish a DRAFT post (DRAFT → PUBLISHED) or restore an ARCHIVED post (ARCHIVED → PUBLISHED).'),

  ('journal.archive',
   'Archive a PUBLISHED post, hiding it from the public listing (PUBLISHED → ARCHIVED).'),

  ('journal.delete_any',
   'Permanently delete a journal post. Irreversible.');


-- 2. Editorial access: Content Editor + Coordinator + Platform Admin + Super Admin --------

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON p.permission_key IN (
         'journal.create',
         'journal.update_any',
         'journal.publish',
         'journal.archive'
       )
WHERE  r.name IN ('Content Editor', 'Coordinator', 'Platform Admin', 'Super Admin');


-- 3. Delete is restricted to Platform Admin and Super Admin ----------------

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON p.permission_key = 'journal.delete_any'
WHERE  r.name IN ('Platform Admin', 'Super Admin');
