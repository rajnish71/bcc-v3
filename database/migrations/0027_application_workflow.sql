-- ============================================================================
-- 0027_application_workflow.sql
-- Spec 02.4 Application Workflow: document uploads (R2), clarification
-- requests / applicant responses / internal notes, and multi-stage approval
-- for constitutional classes (coordinator -> committee -> final).
--
-- Operational and group applications require the COORDINATOR stage only;
-- constitutional applications require all three stages in order (spec 02.4:
-- "Multi-stage approval for constitutional classes: coordinator ->
-- committee -> final approval"). Required stages are computed in the
-- service layer from the class type -- not stored -- so a future
-- constitutional amendment changing the requirement is a code change with a
-- constitution reference, not a data migration.
--
-- Upload flow is presigned-PUT (RAM-conscious: files go browser -> R2
-- directly, never through the 1.9GB backend box):
--   1. POST request-upload  -> row created AWAITING_UPLOAD + presigned URL
--   2. client PUTs file to R2
--   3. POST confirm-upload  -> backend HEADs the object, marks UPLOADED
-- ============================================================================

CREATE TABLE IF NOT EXISTS membership_application_documents (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                  CHAR(36) NOT NULL UNIQUE,
  membership_id         BIGINT NOT NULL,

  -- Free-form-but-validated type label (ID_PROOF, STUDENT_ID,
  -- CORPORATE_REGISTRATION, ...). VARCHAR not ENUM: spec 02.4 says
  -- application fields are "configurable per class".
  document_type         VARCHAR(50) NOT NULL,

  r2_object_key         VARCHAR(512) NOT NULL,
  original_filename     VARCHAR(255) NOT NULL,
  mime_type             VARCHAR(100) NOT NULL,
  size_bytes            BIGINT NULL,

  upload_status         ENUM('AWAITING_UPLOAD','UPLOADED') NOT NULL DEFAULT 'AWAITING_UPLOAD',
  uploaded_at           TIMESTAMP NULL,
  uploaded_by_user_id   BIGINT NULL,

  review_status         ENUM('PENDING_REVIEW','ACCEPTED','REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  review_note           VARCHAR(500) NULL,
  reviewed_by_user_id   BIGINT NULL,
  reviewed_at           TIMESTAMP NULL,

  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_appdoc_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
  CONSTRAINT fk_appdoc_uploader   FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_appdoc_reviewer   FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uq_appdoc_object_key (r2_object_key),
  KEY idx_appdoc_membership (membership_id, review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS membership_application_messages (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  membership_id       BIGINT NOT NULL,

  -- INTERNAL_NOTE:        staff-only, never shown to applicant
  -- CLARIFICATION_REQUEST: staff -> applicant, visible, expects response
  -- APPLICANT_RESPONSE:   applicant -> staff, links to a request
  message_type        ENUM('INTERNAL_NOTE','CLARIFICATION_REQUEST','APPLICANT_RESPONSE') NOT NULL,
  body                TEXT NOT NULL,

  author_user_id      BIGINT NULL,
  parent_message_id   BIGINT NULL,       -- APPLICANT_RESPONSE -> its CLARIFICATION_REQUEST
  resolved_at         TIMESTAMP NULL,    -- set on CLARIFICATION_REQUEST when answered/closed

  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_appmsg_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
  CONSTRAINT fk_appmsg_author     FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_appmsg_parent     FOREIGN KEY (parent_message_id) REFERENCES membership_application_messages(id) ON DELETE SET NULL,

  KEY idx_appmsg_membership (membership_id, message_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS membership_approval_stages (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  membership_id    BIGINT NOT NULL,
  stage            ENUM('COORDINATOR','COMMITTEE','FINAL') NOT NULL,
  decision         ENUM('APPROVED','REJECTED') NOT NULL,
  actor_user_id    BIGINT NULL,
  note             VARCHAR(500) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_appstage_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
  CONSTRAINT fk_appstage_actor      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,

  -- One decision per stage per application. Rejection + re-application is
  -- a NEW memberships row (spec 02.5), so this never blocks a re-applicant.
  UNIQUE KEY uq_appstage (membership_id, stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
