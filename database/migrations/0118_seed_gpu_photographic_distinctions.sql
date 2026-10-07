-- ============================================================================
-- 0118_seed_gpu_photographic_distinctions.sql
-- Photographic Distinctions -- Phase 2A catalogue completion.
--
-- Seeds the two Human Authority-frozen GPU catalogue entries:
--   GPU / CROWN3  "GPU Crown 3"  active, badge eligible
--   GPU / VIP3    "GPU VIP 3"    active, badge eligible
--
-- CROWN3 and VIP3 are the canonical codes. The legacy strings GPU-CR3 and
-- GPU VIP-3 are NOT catalogue codes and are not added as aliases; the frozen
-- legacy mapping (GPU-CR3 -> GPU/CROWN3, GPU VIP-3 -> GPU/VIP3) is applied
-- only at carry-forward, a later separately authorized step. This migration
-- creates catalogue rows only: no member declaration, no carry-forward, and
-- user_photo_titles is not read or modified.
--
-- Same seed convention as 0116: institution resolved by code, never by id;
-- updated_by_user_id NULL = migration seed; INSERT IGNORE on
-- uq_photo_dist_institution_code keeps re-runs idempotent.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO photographic_distinctions
  (institution_id, code, name, badge_eligible, is_active, sort_order)
SELECT i.id, s.code, s.name, 1, 1, s.sort_order
FROM (
  SELECT 'GPU' AS institution_code, 'CROWN3' AS code, 'GPU Crown 3' AS name, 10 AS sort_order
  UNION ALL SELECT 'GPU', 'VIP3', 'GPU VIP 3', 20
) AS s
JOIN photographic_institutions i ON i.code = s.institution_code;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0118_seed_gpu_photographic_distinctions.sql', NOW());

COMMIT;
