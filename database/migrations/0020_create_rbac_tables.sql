-- ============================================================================
-- 0020_create_rbac_tables.sql
-- MEM-006 P3: RBAC fully decoupled from membership/recognition. None of
-- these four tables carry a FK to memberships/membership_classes/
-- member_recognitions — schema-level enforcement of P3.
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  category    ENUM('SYSTEM','OPERATIONAL') NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  permission_key   VARCHAR(150) NOT NULL,
  description      VARCHAR(500) NULL,
  UNIQUE KEY uq_permissions_key (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id        BIGINT NOT NULL,
  permission_id  BIGINT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  role_id      BIGINT NOT NULL,
  scope_type   VARCHAR(50) NULL,
  scope_id     BIGINT NULL,
  valid_from   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until  TIMESTAMP NULL,
  granted_by   BIGINT NOT NULL,
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_granted_by FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_user_roles_user_active (user_id, valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
