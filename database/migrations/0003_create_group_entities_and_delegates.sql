-- ============================================================================
-- 0003_create_group_entities_and_delegates.sql
-- MEM-006 GROUP MEMBERSHIP ARCHITECTURE
--
-- "A Group Membership belongs to the Group. It does not belong to the
--  individual participants... Delegates remain individual identities.
--  The membership belongs to the organization." (MEM-006)
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_entities (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                  CHAR(36) NOT NULL UNIQUE,

  type                  ENUM('FAMILY','CORPORATE','INSTITUTIONAL') NOT NULL,
  name                  VARCHAR(255) NOT NULL,

  primary_contact_user_id BIGINT NULL,

  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_group_primary_contact
    FOREIGN KEY (primary_contact_user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Delegates represent the organization as individual identities — they do
-- not themselves hold the membership (MEM-006 Group Membership Principle).
CREATE TABLE IF NOT EXISTS group_delegates (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  group_entity_id   BIGINT NOT NULL,
  user_id           BIGINT NOT NULL,

  role              VARCHAR(50) NOT NULL DEFAULT 'DELEGATE',  -- e.g. PRIMARY_CONTACT, DELEGATE

  added_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at        TIMESTAMP NULL,

  CONSTRAINT fk_delegate_group FOREIGN KEY (group_entity_id) REFERENCES group_entities(id) ON DELETE CASCADE,
  CONSTRAINT fk_delegate_user  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  UNIQUE KEY uq_active_delegate (group_entity_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
