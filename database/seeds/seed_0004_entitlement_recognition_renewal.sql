-- ============================================================================
-- seed_0004_entitlement_recognition_renewal.sql
-- Module 02 batch 2 seed. Idempotent (INSERT IGNORE throughout). Run
-- manually once, same pattern as seed_0001-0003.
--
-- CONTAINS ONE SET OF UNCONFIRMED DEFAULTS -- see recognition_criteria
-- section at the bottom.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Permissions
-- criteria.manage is Super-Admin-only: AUTO-recognition thresholds are
-- effectively governance policy, same reasoning as numbering.assign_reserved.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO permissions (permission_key, description) VALUES
  ('membership.entitlement.view',             'View resolved entitlements for any membership'),
  ('membership.entitlement.manage',           'Manage class entitlements, recognition modifiers, and individual overrides'),
  ('membership.recognition.view',             'View recognitions for any membership'),
  ('membership.recognition.assign',           'Assign a recognition (manual track) to a membership'),
  ('membership.recognition.revoke',           'Revoke an active recognition (moves it to HISTORICAL)'),
  ('membership.recognition.criteria.manage',  'Edit AUTO-track recognition criteria thresholds (governance-level)');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin', 'Membership Manager', 'Coordinator')
  AND p.permission_key IN ('membership.entitlement.view', 'membership.recognition.view');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin', 'Membership Manager')
  AND p.permission_key IN (
    'membership.entitlement.manage',
    'membership.recognition.assign',
    'membership.recognition.revoke'
  );

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Super Admin'
  AND p.permission_key = 'membership.recognition.criteria.manage';

-- ---------------------------------------------------------------------------
-- Renewal config: 12-month term + 60-day grace for every renewable class.
-- CONFIRMED by Rajnish (this session) as the default for all renewable
-- classes; admin-editable later via the entitlement.manage endpoints.
-- Selected off is_renewable so lifetime/closed classes never get these keys.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
SELECT mc.id, 'renewal_term_months', '12'
FROM membership_classes mc WHERE mc.is_renewable = 1;

INSERT IGNORE INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
SELECT mc.id, 'grace_period_days', '60'
FROM membership_classes mc WHERE mc.is_renewable = 1;

-- ---------------------------------------------------------------------------
-- AUTO-track recognition criteria defaults.
-- *** UNCONFIRMED -- placeholder values pending governance confirmation. ***
-- MEM-006/spec 02.9 make these thresholds admin-configurable but do not fix
-- the numbers. 10-year tenure for Senior Member is a placeholder default,
-- NOT a constitutional reading. Flagged as an open governance item; editable
-- via the criteria.manage endpoint (Super Admin) without a redeploy.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO recognition_criteria (recognition_code, criteria_key, criteria_value) VALUES
  ('SENIOR_MEMBER', 'min_tenure_years', '10');
