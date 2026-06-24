-- ============================================================================
-- 0006_create_entitlement_tables.sql
-- MEM-006 ENTITLEMENT ARCHITECTURE — the frozen formula:
--
--   Resolved Entitlements = Base(Membership Class)
--                          + Modifiers(Active Recognition)
--                          + Individual Overrides
--
-- "This formula is constitutionally frozen." Three tables, one per term.
-- Resolution order (also frozen): Class -> Recognition -> Overrides.
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_entitlements (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  membership_class_id   INT NOT NULL,
  entitlement_key       VARCHAR(100) NOT NULL,
  entitlement_value     VARCHAR(255) NOT NULL,

  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_class_entitlement_class FOREIGN KEY (membership_class_id) REFERENCES membership_classes(id) ON DELETE CASCADE,
  UNIQUE KEY uq_class_entitlement (membership_class_id, entitlement_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recognition_modifiers (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  recognition_code    ENUM('SENIOR_MEMBER','HONORARY_SENIOR_MEMBER',
                            'HONORARY_MEMBER','HONORARY_MENTOR','HONORARY_GRANDMASTER')
                       NOT NULL,
  entitlement_key      VARCHAR(100) NOT NULL,
  modifier_value       VARCHAR(255) NOT NULL,

  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_recognition_modifier (recognition_code, entitlement_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS individual_overrides (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  membership_id       BIGINT NOT NULL,
  entitlement_key     VARCHAR(100) NOT NULL,
  override_value      VARCHAR(255) NOT NULL,
  reason               VARCHAR(255) NOT NULL,         -- overrides are exceptional — always require a reason
  created_by_user_id   BIGINT NULL,

  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_override_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
  CONSTRAINT fk_override_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uq_individual_override (membership_id, entitlement_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
