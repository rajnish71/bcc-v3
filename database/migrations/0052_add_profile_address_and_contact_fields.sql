-- ============================================================================
-- 0052_add_profile_address_and_contact_fields.sql
-- Phase D -- Schema: Extended address, blood group, emergency contact,
-- and website URL fields for V6 20 Account Settings / V6 13 Member Profile.
--
-- Note: address_line1, address_line2, pin_code already added in 0051.
-- This migration adds the remaining fields requested for the Member Profile.
--
-- Credentials: bcc_v3_app
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE users
  ADD COLUMN address_line3   VARCHAR(120) NULL,
  ADD COLUMN blood_group
    ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NULL,
  ADD COLUMN emergency_contact_name         VARCHAR(120) NULL,
  ADD COLUMN emergency_contact_phone        VARCHAR(15)  NULL,
  ADD COLUMN emergency_contact_relationship
    ENUM('SPOUSE','PARENT','SIBLING','CHILD','FRIEND','OTHER') NULL,
  ADD COLUMN website_url     VARCHAR(500) NULL;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0052_add_profile_address_and_contact_fields.sql', NOW());

COMMIT;
