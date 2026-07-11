-- ============================================================================
-- 0051_add_address_fields_to_users.sql
-- Phase D -- Schema: Address fields for membership application form
--
-- Adds three address columns used by V6 19 Membership Application & Renewal.
--
-- address_line1  VARCHAR(200) NULL -- street / locality
-- address_line2  VARCHAR(200) NULL -- landmark / area (optional)
-- pin_code       VARCHAR(10)  NULL -- Indian postal code (6 digits)
--
-- These fields are user-editable via the membership application and renewal
-- forms. They are NOT admin-only fields.
--
-- Credentials: bcc_v3_app
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE users
  ADD COLUMN address_line1 VARCHAR(200) NULL,
  ADD COLUMN address_line2 VARCHAR(200) NULL,
  ADD COLUMN pin_code      VARCHAR(10)  NULL;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0051_add_address_fields_to_users.sql', NOW());

COMMIT;
