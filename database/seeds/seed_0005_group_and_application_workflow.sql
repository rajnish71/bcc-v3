-- ============================================================================
-- seed_0005_group_and_application_workflow.sql
-- Config + permissions for Module 02 batch 3. Idempotent. Run manually,
-- once, same pattern as seed_0001..seed_0004.
--
-- UNCONFIRMED PLACEHOLDERS (flagged, editable via entitlement endpoints --
-- same handling as the Senior Member tenure threshold):
--   * max_delegates: Family 4, Corporate 5, Institutional 5 -- spec 02.3
--     says "configurable number", no numbers given anywhere. CONFIRM.
--   * group renewal_term_months=12 / grace_period_days=60 -- mirrors the
--     confirmed individual-class policy; spec 02.3 says only "group-level
--     renewal" with no distinct term. CONFIRM.
-- ============================================================================

-- ---- Group type config (layer-1 base for GROUP-owned memberships) ----
INSERT IGNORE INTO group_type_entitlements (group_membership_type_id, entitlement_key, entitlement_value)
SELECT gmt.id, kv.k, kv.v
FROM group_membership_types gmt
JOIN (
  SELECT 'FAMILY_MEMBERSHIP' AS code, 'renewal_term_months' AS k, '12' AS v
  UNION ALL SELECT 'FAMILY_MEMBERSHIP',        'grace_period_days',   '60'
  UNION ALL SELECT 'FAMILY_MEMBERSHIP',        'max_delegates',       '4'
  UNION ALL SELECT 'CORPORATE_MEMBERSHIP',     'renewal_term_months', '12'
  UNION ALL SELECT 'CORPORATE_MEMBERSHIP',     'grace_period_days',   '60'
  UNION ALL SELECT 'CORPORATE_MEMBERSHIP',     'max_delegates',       '5'
  UNION ALL SELECT 'INSTITUTIONAL_MEMBERSHIP', 'renewal_term_months', '12'
  UNION ALL SELECT 'INSTITUTIONAL_MEMBERSHIP', 'grace_period_days',   '60'
  UNION ALL SELECT 'INSTITUTIONAL_MEMBERSHIP', 'max_delegates',       '5'
) kv ON kv.code = gmt.code;

-- ---- Permissions ----
INSERT IGNORE INTO permissions (permission_key, description) VALUES
  ('membership.application.stage_committee',       'Record the COMMITTEE stage decision on a constitutional-class application'),
  ('membership.application.stage_final',           'Record the FINAL stage decision on a constitutional-class application'),
  ('membership.application.request_clarification', 'Send a clarification request to an applicant'),
  ('membership.application.internal_note',         'Add a staff-only internal note to an application'),
  ('membership.application.review_documents',      'Accept or reject uploaded application documents'),
  ('group.entity.manage_any',                      'Create/update any group entity and manage any delegate list (staff)'),
  ('group.entitlement.manage',                     'Set or remove group-type entitlement/config values');

-- Coordinator stage reuses the existing 'membership.application.approve'
-- permission (seed_0003) -- a coordinator approval IS the coordinator stage.

-- Broad staff set: clarifications, notes, document review, group management
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin', 'Membership Manager', 'Coordinator')
  AND p.permission_key IN (
    'membership.application.request_clarification',
    'membership.application.internal_note',
    'membership.application.review_documents',
    'group.entity.manage_any'
  );

-- Committee stage: management tier and above (NOT Coordinator -- the whole
-- point of multi-stage is a second pair of eyes)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin', 'Membership Manager')
  AND p.permission_key = 'membership.application.stage_committee';

-- Final stage + group config: admin tier only
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin')
  AND p.permission_key IN ('membership.application.stage_final', 'group.entitlement.manage');
