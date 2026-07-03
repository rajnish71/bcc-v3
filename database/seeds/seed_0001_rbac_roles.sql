-- ============================================================================
-- seed_0001_rbac_roles.sql — fixed role list from spec 01.5. Idempotent.
-- Not wired into schema_migrations tracking — run manually, once.
-- ============================================================================
INSERT IGNORE INTO roles (name, category) VALUES
  ('Super Admin',        'SYSTEM'),
  ('Platform Admin',     'SYSTEM'),
  ('Coordinator',        'OPERATIONAL'),
  ('Membership Manager', 'OPERATIONAL'),
  ('Event Manager',      'OPERATIONAL'),
  ('Finance Manager',    'OPERATIONAL'),
  ('Contest Manager',    'OPERATIONAL'),
  ('Exhibition Curator', 'OPERATIONAL'),
  ('Content Editor',     'OPERATIONAL'),
  ('Moderator',          'OPERATIONAL'),
  ('School Mentor',      'OPERATIONAL'),
  ('Judge',              'OPERATIONAL');
