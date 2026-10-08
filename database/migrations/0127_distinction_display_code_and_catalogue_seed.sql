-- ============================================================================
-- 0127_distinction_display_code_and_catalogue_seed.sql
-- Photographic Distinctions -- display_code + complete photographer catalogue.
--
-- 1. photographic_distinctions.display_code (nullable): canonical display form
--    carrying official punctuation (EFIAP/d1, GMPSA/B, AV-AFIAP). The
--    internal `code` stays machine-safe ([A-Z0-9_]); NULL display_code means
--    "display the code" (all pre-existing rows, unchanged).
--
-- 2. Seeds the remaining photographer-held FIP / FIAP / PSA / GPU / RPS
--    distinctions. Notation sources: FIP Distinctions practical info and
--    Viewfinder Jan/Apr 2026 (GFIP/pt|ut|st, EFIP/g|p (Nature), MFIP
--    (Nature), Hon. FIP, Hon. MFIP (Nature), ESFIP); FIAP Document 047/2025 E
--    (in force 2026-01-01) and the FIAP Audio-Visual document (AV-AFIAP,
--    AV-EFIAP and /b /s /g /p, AV-MFIAP); PSA ROPA / portfolio / honours
--    pages. Club distinctions (ESFIPC, CAFIAP, CEFIAP) are deliberately NOT
--    seeded. No Research-route RPS rows. GPU: Crown/VIP 1-5 plus the TITLE
--    family (Aphrodite, Hermes, Zeus) and GPU Grand Master, per the GPU
--    distinctions pages (gpuphoto.com). RPS titles are seeded from the task
--    specification (rps.org unreachable). GPU legacy strings stay unaliased (0118 frozen decision).
--    Rows already seeded by 0116/0118 (AFIP, EFIP, AFIAP, PPSA, CROWN3,
--    VIP3) are not repeated; INSERT IGNORE would skip them regardless.
--
-- New rows are NOT badge eligible (badge eligibility is an explicit HA/admin
-- decision, never broadened by seeding). Existing rows are never modified.
--
-- Idempotency: ADD COLUMN guarded by information_schema; INSERT IGNORE on
-- uq_photo_dist_institution_code; institutions resolved by code, not id.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

SET @pd_sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'photographic_distinctions' AND column_name = 'display_code') = 0,
  'ALTER TABLE photographic_distinctions ADD COLUMN display_code VARCHAR(50) NULL AFTER code',
  'DO 0');
PREPARE pd_stmt FROM @pd_sql;
EXECUTE pd_stmt;
DEALLOCATE PREPARE pd_stmt;

INSERT IGNORE INTO photographic_distinctions
  (institution_id, code, display_code, name, badge_eligible, is_active, sort_order)
SELECT i.id, s.code, s.display_code, s.name, 0, 1, s.sort_order
FROM (  SELECT 'FIP' AS institution_code, 'GFIP' AS code, 'GFIP' AS display_code, 'Genius FIP' AS name, 25 AS sort_order
  UNION ALL SELECT 'FIP', 'GFIP_PT', 'GFIP/pt', 'Genius FIP Pratham', 26
  UNION ALL SELECT 'FIP', 'GFIP_UT', 'GFIP/ut', 'Genius FIP Uttam', 27
  UNION ALL SELECT 'FIP', 'GFIP_ST', 'GFIP/st', 'Genius FIP Sarvottam', 28
  UNION ALL SELECT 'FIP', 'EFIP_G', 'EFIP/g', 'EFIP Gold', 30
  UNION ALL SELECT 'FIP', 'EFIP_P', 'EFIP/p', 'EFIP Platinum', 40
  UNION ALL SELECT 'FIP', 'EFIP_G_NATURE', 'EFIP/g (Nature)', 'EFIP Gold (Nature)', 50
  UNION ALL SELECT 'FIP', 'EFIP_P_NATURE', 'EFIP/p (Nature)', 'EFIP Platinum (Nature)', 60
  UNION ALL SELECT 'FIP', 'MFIP', 'MFIP', 'MFIP', 70
  UNION ALL SELECT 'FIP', 'MFIP_NATURE', 'MFIP (Nature)', 'MFIP (Nature)', 80
  UNION ALL SELECT 'FIP', 'ESFIP', 'ESFIP', 'ESFIP', 90
  UNION ALL SELECT 'FIP', 'HON_FIP', 'Hon. FIP', 'Honorary FIP', 100
  UNION ALL SELECT 'FIP', 'HON_MFIP_NATURE', 'Hon. MFIP (Nature)', 'Honorary MFIP (Nature)', 110
  UNION ALL SELECT 'FIAP', 'NFIAP', 'NFIAP', 'Novice FIAP', 5
  UNION ALL SELECT 'FIAP', 'EFIAP', 'EFIAP', 'Excellence FIAP', 20
  UNION ALL SELECT 'FIAP', 'EFIAP_B', 'EFIAP/b', 'Excellence FIAP Bronze', 30
  UNION ALL SELECT 'FIAP', 'EFIAP_S', 'EFIAP/s', 'Excellence FIAP Silver', 40
  UNION ALL SELECT 'FIAP', 'EFIAP_G', 'EFIAP/g', 'Excellence FIAP Gold', 50
  UNION ALL SELECT 'FIAP', 'EFIAP_P', 'EFIAP/p', 'Excellence FIAP Platinum', 60
  UNION ALL SELECT 'FIAP', 'EFIAP_D1', 'EFIAP/d1', 'Excellence FIAP Diamond 1', 70
  UNION ALL SELECT 'FIAP', 'EFIAP_D2', 'EFIAP/d2', 'Excellence FIAP Diamond 2', 80
  UNION ALL SELECT 'FIAP', 'EFIAP_D3', 'EFIAP/d3', 'Excellence FIAP Diamond 3', 90
  UNION ALL SELECT 'FIAP', 'EFIAP_D4', 'EFIAP/d4', 'Excellence FIAP Diamond 4', 100
  UNION ALL SELECT 'FIAP', 'EFIAP_D5', 'EFIAP/d5', 'Excellence FIAP Diamond 5', 110
  UNION ALL SELECT 'FIAP', 'EFIAP_D6', 'EFIAP/d6', 'Excellence FIAP Diamond 6', 120
  UNION ALL SELECT 'FIAP', 'EFIAP_D7', 'EFIAP/d7', 'Excellence FIAP Diamond 7', 130
  UNION ALL SELECT 'FIAP', 'EFIAP_D8', 'EFIAP/d8', 'Excellence FIAP Diamond 8', 140
  UNION ALL SELECT 'FIAP', 'MFIAP', 'MFIAP', 'Master FIAP', 150
  UNION ALL SELECT 'FIAP', 'GMFIAP', 'GMFIAP', 'Grandmaster FIAP', 160
  UNION ALL SELECT 'FIAP', 'PFIAP', 'PFIAP', 'Portfolio FIAP', 170
  UNION ALL SELECT 'FIAP', 'PFIAP_B', 'PFIAP/b', 'Portfolio FIAP Bronze', 180
  UNION ALL SELECT 'FIAP', 'PFIAP_S', 'PFIAP/s', 'Portfolio FIAP Silver', 190
  UNION ALL SELECT 'FIAP', 'PFIAP_G', 'PFIAP/g', 'Portfolio FIAP Gold', 200
  UNION ALL SELECT 'FIAP', 'MPFIAP', 'MPFIAP', 'Master Portfolio FIAP', 210
  UNION ALL SELECT 'FIAP', 'AV_AFIAP', 'AV-AFIAP', 'Artist FIAP Audio-Visual', 220
  UNION ALL SELECT 'FIAP', 'AV_EFIAP', 'AV-EFIAP', 'Excellence FIAP Audio-Visual', 222
  UNION ALL SELECT 'FIAP', 'AV_EFIAP_B', 'AV-EFIAP/b', 'Excellence FIAP Bronze Audio-Visual', 224
  UNION ALL SELECT 'FIAP', 'AV_EFIAP_S', 'AV-EFIAP/s', 'Excellence FIAP Silver Audio-Visual', 226
  UNION ALL SELECT 'FIAP', 'AV_EFIAP_G', 'AV-EFIAP/g', 'Excellence FIAP Gold Audio-Visual', 228
  UNION ALL SELECT 'FIAP', 'AV_EFIAP_P', 'AV-EFIAP/p', 'Excellence FIAP Platinum Audio-Visual', 230
  UNION ALL SELECT 'FIAP', 'AV_MFIAP', 'AV-MFIAP', 'Master FIAP Audio-Visual', 240
  UNION ALL SELECT 'FIAP', 'ESFIAP', 'ESFIAP', 'Excellence FIAP for Services Rendered', 250
  UNION ALL SELECT 'FIAP', 'HONEFIAP', 'HonEFIAP', 'Honorary Excellence FIAP', 260
  UNION ALL SELECT 'FIAP', 'LAAFIAP', 'LAAFIAP', 'Lifetime Achievement Award', 270
  UNION ALL SELECT 'FIAP', 'HMFIAP', 'HMFIAP', 'Honourable Member FIAP', 280
  UNION ALL SELECT 'PSA', 'QPSA', 'QPSA', 'Qualified PSA', 5
  UNION ALL SELECT 'PSA', 'EPSA', 'EPSA', 'Excellence PSA', 20
  UNION ALL SELECT 'PSA', 'MPSA', 'MPSA', 'Master PSA', 30
  UNION ALL SELECT 'PSA', 'MPSA2', 'MPSA2', 'Master PSA Level 2', 40
  UNION ALL SELECT 'PSA', 'GMPSA', 'GMPSA', 'Grand Master PSA', 50
  UNION ALL SELECT 'PSA', 'GMPSA_B', 'GMPSA/B', 'Grand Master PSA Bronze', 52
  UNION ALL SELECT 'PSA', 'GMPSA_S', 'GMPSA/S', 'Grand Master PSA Silver', 54
  UNION ALL SELECT 'PSA', 'GMPSA_G', 'GMPSA/G', 'Grand Master PSA Gold', 56
  UNION ALL SELECT 'PSA', 'GMPSA_P', 'GMPSA/P', 'Grand Master PSA Platinum', 58
  UNION ALL SELECT 'PSA', 'BPSA', 'BPSA', 'Bronze Portfolio PSA', 60
  UNION ALL SELECT 'PSA', 'SPSA', 'SPSA', 'Silver Portfolio PSA', 70
  UNION ALL SELECT 'PSA', 'GPSA', 'GPSA', 'Gold Portfolio PSA', 80
  UNION ALL SELECT 'PSA', 'APSA', 'APSA', 'Associate PSA', 90
  UNION ALL SELECT 'PSA', 'FPSA', 'FPSA', 'Fellow PSA', 100
  UNION ALL SELECT 'PSA', 'HONPSA', 'HonPSA', 'Honorary PSA', 110
  UNION ALL SELECT 'PSA', 'HONFPSA', 'HonFPSA', 'Honorary Fellow PSA', 120
  UNION ALL SELECT 'GPU', 'CROWN1', 'GPU Crown 1', 'GPU Crown 1', 2
  UNION ALL SELECT 'GPU', 'CROWN2', 'GPU Crown 2', 'GPU Crown 2', 6
  UNION ALL SELECT 'GPU', 'CROWN4', 'GPU Crown 4', 'GPU Crown 4', 12
  UNION ALL SELECT 'GPU', 'CROWN5', 'GPU Crown 5', 'GPU Crown 5', 14
  UNION ALL SELECT 'GPU', 'VIP1', 'GPU VIP 1', 'GPU VIP 1', 17
  UNION ALL SELECT 'GPU', 'VIP2', 'GPU VIP 2', 'GPU VIP 2', 18
  UNION ALL SELECT 'GPU', 'VIP4', 'GPU VIP 4', 'GPU VIP 4', 22
  UNION ALL SELECT 'GPU', 'VIP5', 'GPU VIP 5', 'GPU VIP 5', 24
  UNION ALL SELECT 'GPU', 'APHRODITE', 'Aphrodite', 'Aphrodite (GPU Title)', 30
  UNION ALL SELECT 'GPU', 'HERMES', 'Hermes', 'Hermes (GPU Title)', 32
  UNION ALL SELECT 'GPU', 'ZEUS', 'Zeus', 'Zeus (GPU Title)', 34
  UNION ALL SELECT 'GPU', 'GRAND_MASTER', 'GPU Grand Master', 'GPU Grand Master', 40
  UNION ALL SELECT 'RPS', 'LRPS', 'LRPS', 'Licentiate of the Royal Photographic Society', 10
  UNION ALL SELECT 'RPS', 'ARPS', 'ARPS', 'Associate of the Royal Photographic Society', 20
  UNION ALL SELECT 'RPS', 'FRPS', 'FRPS', 'Fellow of the Royal Photographic Society', 30
) AS s
JOIN photographic_institutions i ON i.code = s.institution_code;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0127_distinction_display_code_and_catalogue_seed.sql', NOW());

COMMIT;
