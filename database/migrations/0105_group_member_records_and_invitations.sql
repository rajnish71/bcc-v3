-- ============================================================================
-- 0105_group_member_records_and_invitations.sql
-- Family / Corporate membership -- individual member records + invitations
--
-- Frozen lifecycle (Human Authority, Family & Corporate implementation
-- contract):  PAY -> APPROVE -> INVITE/ASSIGN -> ACTIVATE -> NUMBER
--
-- WHY A MIGRATION IS REQUIRED
-- ---------------------------
-- 1. memberships.parent_membership_id
--    MEM-007 MP-002: "A Membership Number shall belong to one membership
--    record only." Each person who becomes a Family/Corporate member must
--    therefore hold their OWN memberships row (numbered at activation by the
--    existing MembershipNumberingService), distinct from the GROUP row that
--    represents the Family/Corporate relationship (MEM-006: "A Group
--    Membership belongs to the Group"; the GROUP row is never numbered).
--    Nothing in the schema can currently link a member's row to its group
--    relationship -- this column does. No new table; same memberships table,
--    same seven lifecycle states, same numbering columns.
--
-- 2. chk_membership_owner_axis (0026) admits only
--        INDIVIDUAL + membership_class_id   or   GROUP + group_membership_type_id.
--    A group member's row is INDIVIDUAL-owned (user_id set, so cards,
--    directory, hub and numbering treat it as one person) but its base
--    entitlements are its GROUP TYPE's -- MEM-006: group types are not
--    membership classes, so it must NOT be given a fake membership class.
--    The constraint is widened by exactly one shape, only valid WITH a
--    parent GROUP row:
--        INDIVIDUAL + group_membership_type_id + parent_membership_id
--    Existing rows all have parent_membership_id NULL and keep satisfying
--    their original shapes unchanged.
--
-- 3. group_delegates invitation state
--    The existing delegate roster (0003) has no invitation/acceptance state,
--    so it cannot express "invited but not yet accepted", nor who invited,
--    nor an administrative revocation with actor + reason. Rather than a
--    parallel invitations table, the EXISTING roster row gains the smallest
--    state model the contract requires:
--        INVITED -> ACCEPTED -> (REVOKED_BY_ADMIN)
--    status NULL = a roster row with no membership seat (rows predating this
--    migration, and the primary contact's own contact row until they take a
--    seat themselves). These rows are untouched here.
--
-- Nothing in this migration allocates, alters, or releases a membership
-- number. trg_membership_number_immutable / trg_prevent_numbered_membership_
-- delete are unaffected.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- 1. Member-record -> group-relationship link --------------------------------
-- ON DELETE RESTRICT (never CASCADE/SET NULL): MySQL forbids referential
-- actions on a column used in a CHECK constraint, and a group relationship
-- with member records must never be deletable anyway.
ALTER TABLE memberships
  ADD COLUMN parent_membership_id BIGINT NULL AFTER group_membership_type_id,
  ADD CONSTRAINT fk_membership_parent
    FOREIGN KEY (parent_membership_id) REFERENCES memberships(id) ON DELETE RESTRICT,
  ADD INDEX idx_memberships_parent (parent_membership_id);

-- 2. Owner-axis constraint: one additional, parent-bound shape ---------------
ALTER TABLE memberships DROP CHECK chk_membership_owner_axis;

ALTER TABLE memberships
  ADD CONSTRAINT chk_membership_owner_axis CHECK (
    (owner_type = 'INDIVIDUAL' AND membership_class_id IS NOT NULL
       AND group_membership_type_id IS NULL AND parent_membership_id IS NULL)
    OR
    (owner_type = 'INDIVIDUAL' AND membership_class_id IS NULL
       AND group_membership_type_id IS NOT NULL AND parent_membership_id IS NOT NULL)
    OR
    (owner_type = 'GROUP' AND group_membership_type_id IS NOT NULL
       AND membership_class_id IS NULL AND parent_membership_id IS NULL)
  );

-- 3. Invitation / assignment state on the existing delegate roster -----------
ALTER TABLE group_delegates
  ADD COLUMN status ENUM('INVITED','ACCEPTED','REVOKED_BY_ADMIN') NULL AFTER role,
  ADD COLUMN group_membership_id  BIGINT NULL AFTER status,
  ADD COLUMN member_membership_id BIGINT NULL AFTER group_membership_id,
  ADD COLUMN invited_by_user_id   BIGINT NULL AFTER member_membership_id,
  ADD COLUMN invited_at           TIMESTAMP NULL AFTER invited_by_user_id,
  ADD COLUMN accepted_at          TIMESTAMP NULL AFTER invited_at,
  ADD COLUMN revoked_at           TIMESTAMP NULL AFTER accepted_at,
  ADD COLUMN revoked_by_user_id   BIGINT NULL AFTER revoked_at,
  ADD COLUMN revocation_reason    VARCHAR(500) NULL AFTER revoked_by_user_id,
  ADD CONSTRAINT fk_delegate_group_membership
    FOREIGN KEY (group_membership_id) REFERENCES memberships(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_delegate_member_membership
    FOREIGN KEY (member_membership_id) REFERENCES memberships(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_delegate_invited_by
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_delegate_revoked_by
    FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD INDEX idx_delegate_group_membership_status (group_membership_id, status);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0105_group_member_records_and_invitations.sql', NOW());

COMMIT;
