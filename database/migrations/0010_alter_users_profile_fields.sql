-- ============================================================================
-- 0010_alter_users_profile_fields.sql
-- MODULE 01 — IDENTITY & USER MANAGEMENT
--
-- Extends the minimal Phase 0 `users` table with profile fields from spec
-- 01.3. Surgical ALTER, not a rewrite — 0001_create_users.sql is untouched.
--
-- MEM-006 P1 check: none of these columns imply membership, recognition, or
-- governance authority. date_of_birth is stored here because it is identity
-- data the user owns; Module 02 will READ it to evaluate Senior Member
-- auto-recognition eligibility later, but this table does not grant that
-- status itself.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN username             VARCHAR(30)  NULL,
  ADD COLUMN bio                  TEXT         NULL,
  ADD COLUMN city                 VARCHAR(100) NULL,
  ADD COLUMN state                VARCHAR(100) NULL,
  ADD COLUMN country              VARCHAR(100) NOT NULL DEFAULT 'India',
  ADD COLUMN date_of_birth        DATE         NULL,
  ADD COLUMN experience_level     ENUM('BEGINNER','ENTHUSIAST','SERIOUS_AMATEUR','PROFESSIONAL') NULL,
  ADD COLUMN language_pref        ENUM('EN','HI') NOT NULL DEFAULT 'EN',
  ADD COLUMN profile_visibility   ENUM('PUBLIC','MEMBERS_ONLY','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN portfolio_visibility ENUM('PUBLIC','MEMBERS_ONLY','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN activity_visibility  ENUM('PUBLIC','MEMBERS_ONLY','PRIVATE') NOT NULL DEFAULT 'MEMBERS_ONLY',
  ADD COLUMN deletion_requested_at TIMESTAMP NULL,
  ADD COLUMN deleted_at            TIMESTAMP NULL,
  ADD UNIQUE KEY uq_users_username (username);
