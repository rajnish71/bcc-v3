-- ============================================================================
-- 0098_create_merchandise.sql
-- Merchandise V1 — new Business Module (Track 7 exception, explicitly
-- authorized by Rajnish Khare; see governance note below).
--
-- Merchandise owns: products, orders, order items, coupons, coupon
-- redemptions, and fulfilment state. PAY-001 (financial_contributions,
-- financial_transactions, receipts) is reused UNCHANGED -- no PAY-001
-- table is touched by this migration. A Merchandise Order links to its
-- Financial Contribution via financial_contribution_id only; the Financial
-- Engine has no FK back into this schema (PAY-001 §OWNERSHIP RULE: the
-- Financial Engine is business-module-agnostic).
--
-- Pickup-only V1 (explicit scope decision): no shipping address, no
-- courier/tracking columns exist anywhere in this schema. Fulfilment is
-- a two-value progression (PENDING -> READY_FOR_PICKUP -> PICKED_UP)
-- mirrored 1:1 onto merchandise_orders.status (PAID -> FULFILLED ->
-- COMPLETED), per the order lifecycle in the authorizing prompt.
--
-- Coupon redemption exclusivity: enforced in application code
-- (MerchandiseOrderService), not by a DB UNIQUE constraint, because
-- "platform-wide-once" must exclude REFUNDED/RELEASED rows from the
-- count (a coupon should become available again after a refund or an
-- explicit order cancellation) -- MySQL 8 has no partial/filtered unique
-- index. Atomicity is instead achieved by locking the coupon row
-- (SELECT ... FOR UPDATE) for the duration of the redemption-count check
-- + insert, inside the same transaction as order creation.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS merchandise_products (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid              CHAR(36)      NOT NULL,
  sku               VARCHAR(50)   NOT NULL,
  name              VARCHAR(255)  NOT NULL,
  description       TEXT          NULL,
  price_paise       BIGINT        NOT NULL,
  active            BOOLEAN       NOT NULL DEFAULT TRUE,

  -- NULL = stock not tracked for this product (unlimited). A non-NULL
  -- value is decremented atomically on CONTRIBUTION_COMPLETED and
  -- restored on CONTRIBUTION_REFUNDED (MerchandiseFinancialListener).
  stock_quantity    INT           NULL,

  -- JSON stored as TEXT and parsed by application code (CLAUDE.md §5.7 --
  -- mysql2 auto-parses JSON columns; a TEXT column avoids the
  -- JSON.parse()-on-already-parsed-value failure mode). Images/details
  -- to be populated later; NULL/empty array until then.
  image_refs        TEXT          NULL,

  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_merch_product_uuid (uuid),
  UNIQUE KEY uq_merch_product_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS merchandise_coupons (
  id                     BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                   CHAR(36)      NOT NULL,
  code                   VARCHAR(50)   NOT NULL,
  discount_type          ENUM('FIXED') NOT NULL DEFAULT 'FIXED',
  discount_value_paise   BIGINT        NOT NULL,

  -- Product-scoped (V1 scope: a coupon applies to exactly one product).
  applicable_product_id  BIGINT        NOT NULL,

  max_redemptions        INT           NOT NULL DEFAULT 1,
  active                 BOOLEAN       NOT NULL DEFAULT TRUE,
  valid_from             TIMESTAMP     NULL,
  valid_until            TIMESTAMP     NULL,

  created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_merch_coupon_uuid (uuid),
  UNIQUE KEY uq_merch_coupon_code (code),

  CONSTRAINT fk_merch_coupon_product FOREIGN KEY (applicable_product_id)
    REFERENCES merchandise_products(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS merchandise_orders (
  id                          BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                        CHAR(36)      NOT NULL,
  user_id                     BIGINT        NOT NULL,

  status                      ENUM('DRAFT','PENDING_PAYMENT','PAID','FULFILLED','COMPLETED','CANCELLED','REFUNDED')
                              NOT NULL DEFAULT 'PENDING_PAYMENT',

  subtotal_paise              BIGINT        NOT NULL,
  discount_paise              BIGINT        NOT NULL DEFAULT 0,
  total_paise                 BIGINT        NOT NULL,

  coupon_id                   BIGINT        NULL,

  -- Generic Financial Engine relationship only (PAY-001 §OWNERSHIP RULE) --
  -- Merchandise never writes financial_contributions/financial_transactions
  -- directly; this column is populated once createContribution() returns.
  financial_contribution_id   BIGINT        NULL,

  -- Pickup-only V1: no address/courier columns. pickup_notes is a free-text
  -- field for the admin marking the order ready (e.g. "collected at Oct
  -- meetup"), not a shipping field.
  fulfilment_status           ENUM('PENDING','READY_FOR_PICKUP','PICKED_UP') NOT NULL DEFAULT 'PENDING',
  pickup_notes                VARCHAR(500)  NULL,

  created_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_merch_order_uuid (uuid),

  CONSTRAINT fk_merch_order_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_merch_order_coupon FOREIGN KEY (coupon_id)
    REFERENCES merchandise_coupons(id) ON DELETE RESTRICT,
  CONSTRAINT fk_merch_order_contribution FOREIGN KEY (financial_contribution_id)
    REFERENCES financial_contributions(id) ON DELETE RESTRICT,

  KEY idx_merch_order_user (user_id, status),
  KEY idx_merch_order_contribution (financial_contribution_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS merchandise_order_items (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id          BIGINT        NOT NULL,
  product_id        BIGINT        NOT NULL,
  quantity          INT           NOT NULL,

  -- Snapshotted at purchase time -- the order must never be reconstructed
  -- from the product's current price (authorizing prompt §7).
  unit_price_paise  BIGINT        NOT NULL,
  line_total_paise  BIGINT        NOT NULL,

  CONSTRAINT fk_merch_item_order FOREIGN KEY (order_id)
    REFERENCES merchandise_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_merch_item_product FOREIGN KEY (product_id)
    REFERENCES merchandise_products(id) ON DELETE RESTRICT,

  KEY idx_merch_item_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS merchandise_coupon_redemptions (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  coupon_id         BIGINT        NOT NULL,
  order_id          BIGINT        NOT NULL,
  user_id           BIGINT        NOT NULL,

  -- PENDING: reserved at order-creation time, payment not yet confirmed.
  -- CONFIRMED: CONTRIBUTION_COMPLETED observed for this order.
  -- RELEASED: order explicitly cancelled before payment -- does not count
  --           toward max_redemptions (coupon becomes available again).
  -- REFUNDED: CONTRIBUTION_REFUNDED observed -- likewise excluded from the
  --           active-redemption count.
  status            ENUM('PENDING','CONFIRMED','RELEASED','REFUNDED') NOT NULL DEFAULT 'PENDING',

  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at      TIMESTAMP     NULL,

  UNIQUE KEY uq_merch_redemption_order (order_id),

  CONSTRAINT fk_merch_redemption_coupon FOREIGN KEY (coupon_id)
    REFERENCES merchandise_coupons(id) ON DELETE RESTRICT,
  CONSTRAINT fk_merch_redemption_order FOREIGN KEY (order_id)
    REFERENCES merchandise_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_merch_redemption_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE RESTRICT,

  -- Not a substitute for the FOR-UPDATE-locked application-level count
  -- (which must exclude RELEASED/REFUNDED) -- this index only makes that
  -- count's query efficient.
  KEY idx_merch_redemption_coupon_status (coupon_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RBAC: Merchandise admin permissions. Follows the exact pattern of 0089
-- (financial.settlement.verify) -- assigned to the same administrative
-- roles used for other sensitive admin actions in this repository.
INSERT IGNORE INTO permissions (permission_key, description)
VALUES
  ('merchandise.product.manage', 'Create, edit, and activate/deactivate Merchandise products'),
  ('merchandise.order.manage', 'View Merchandise orders and update pickup/fulfilment status'),
  ('merchandise.coupon.manage', 'Create, edit, and deactivate Merchandise coupons');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin')
  AND p.permission_key IN (
    'merchandise.product.manage',
    'merchandise.order.manage',
    'merchandise.coupon.manage'
  );

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0098_create_merchandise.sql', NOW());

COMMIT;
