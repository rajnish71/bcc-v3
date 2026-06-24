-- ============================================================================
-- 0002_create_membership_classes.sql
-- MEM-006 MEMBERSHIP CLASSIFICATION MODEL
--
-- Three categories exist per MEM-006: Constitutional, Operational, Group.
-- Group Membership Types are NOT membership classes ("Group Memberships are
-- not Membership Classes... not Recognition Classes... not Constitutional
-- Classes") — they are modeled separately in 0003_create_group_entities_*.
--
-- CONSTITUTIONAL PROTECTION RULE is enforced at the database layer in
-- 0009_create_constitutional_triggers.sql — rows with type='CONSTITUTIONAL'
-- cannot be UPDATEd or DELETEd once seeded, full stop.
--
-- IMPORTANT: the seed INSERT below uses INSERT IGNORE, not
-- "ON DUPLICATE KEY UPDATE". The latter issues a real UPDATE on re-run,
-- which would collide with the constitutional-protection trigger in 0009
-- and abort the migration. INSERT IGNORE simply skips existing rows.
-- ============================================================================

CREATE TABLE IF NOT EXISTS membership_classes (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  code                VARCHAR(40) NOT NULL UNIQUE,
  name                VARCHAR(100) NOT NULL,

  type                ENUM('CONSTITUTIONAL','OPERATIONAL') NOT NULL,

  voting_eligible     BOOLEAN NOT NULL DEFAULT FALSE,
  governance_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  is_renewable        BOOLEAN NOT NULL DEFAULT TRUE,
  is_lifetime         BOOLEAN NOT NULL DEFAULT FALSE,
  is_closed           BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE only for Founding Member — no new rows may ever be assigned this class

  sort_order          INT NOT NULL DEFAULT 0,

  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Seed data — the 7 classes named explicitly in MEM-006.
-- VOTING ELIGIBLE CLASSES (MEM-006): Full, Life, Patron, Founding.
-- NON-VOTING CLASSES (MEM-006): Basic, Student, Individual.
--
-- NOTE on Founding Member renewal/lifetime: MEM-006 states only "Closed
-- Membership Class" as its distinguishing trait — renewal/lifetime policy
-- is not specified. Defaulted here to is_renewable=FALSE, is_lifetime=FALSE.
-- Flag for governance confirmation if this is wrong.
--
-- NOTE on Patron Member: MEM-006 says "Renewal and tenure policies remain
-- configurable through governance" — defaulted to is_renewable=TRUE pending
-- an actual governance decision.
-- ----------------------------------------------------------------------------

INSERT IGNORE INTO membership_classes
  (code, name, type, voting_eligible, governance_eligible, is_renewable, is_lifetime, is_closed, sort_order)
VALUES
  ('FULL_MEMBER',       'Full Member',       'CONSTITUTIONAL', TRUE,  TRUE,  TRUE,  FALSE, FALSE, 10),
  ('LIFE_MEMBER',       'Life Member',       'CONSTITUTIONAL', TRUE,  TRUE,  FALSE, TRUE,  FALSE, 20),
  ('PATRON_MEMBER',     'Patron Member',     'CONSTITUTIONAL', TRUE,  TRUE,  TRUE,  FALSE, FALSE, 30),
  ('FOUNDING_MEMBER',   'Founding Member',   'CONSTITUTIONAL', TRUE,  TRUE,  FALSE, FALSE, TRUE,  40),
  ('BASIC_MEMBER',      'Basic Member',      'OPERATIONAL',    FALSE, FALSE, TRUE,  FALSE, FALSE, 50),
  ('STUDENT_MEMBER',    'Student Member',    'OPERATIONAL',    FALSE, FALSE, TRUE,  FALSE, FALSE, 60),
  ('INDIVIDUAL_MEMBER', 'Individual Member', 'OPERATIONAL',    FALSE, FALSE, TRUE,  FALSE, FALSE, 70);
