# BCC V3 — Migration Convention

> **This document is the canonical standard for all database migrations in this repository.**
> All new migrations must comply with these rules.
> All historical migration source corrections must comply where they do not alter deployed behaviour.

---

## 1. Directory

All migration files reside exclusively under:

```
database/migrations/
```

Files placed anywhere else (e.g. `database/`) are not discovered by the migration runner and will not be applied.

---

## 2. Filename Format

```
NNNN_description_in_snake_case.sql
```

- `NNNN` is a zero-padded four-digit integer that must be **globally unique** across the repository.
- The number identifies the migration permanently and is never reused.
- Once a migration file has been committed to the repository, its filename is **immutable**.
  Renaming a published migration breaks the migration runner's history tracking.

Examples:
```
0001_create_users.sql
0072_introduce_project_taxonomy.sql
0073_gallery_spotlight.sql
```

---

## 3. Canonical File Structure

Every migration file must follow this structure in this exact order:

```sql
-- ============================================================================
-- NNNN_description.sql
--
-- Brief human-readable description of what this migration does.
--
-- Idempotency
--   Document which statements are idempotent and why.
-- ============================================================================

SET NAMES utf8mb4;
START TRANSACTION;

-- ── All schema and data work here ─────────────────────────────────────────

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('NNNN_description.sql', NOW());

COMMIT;
```

Key rules:
- `SET NAMES utf8mb4` goes first.
- `START TRANSACTION` goes immediately after.
- All work (DDL, DML, seed data) goes next.
- `INSERT INTO schema_migrations` goes **last**, immediately before `COMMIT`.
  This guarantees the migration is only recorded after all work succeeds.
- `COMMIT` closes the transaction.

> **Note on DDL and transactions in MySQL 8:** DDL statements (`CREATE TABLE`,
> `ALTER TABLE`, etc.) cause an implicit commit in MySQL's InnoDB engine.
> `START TRANSACTION` / `COMMIT` bracketing is still included for consistency,
> clarity, and to protect the DML portions of mixed migrations.

---

## 4. Idempotency

Write idempotent migrations wherever practical:

| Pattern | Use when |
|---|---|
| `CREATE TABLE IF NOT EXISTS` | Creating tables |
| `ALTER TABLE ... IF NOT EXISTS` (MySQL 8) | Adding columns |
| `INSERT IGNORE INTO` | Seeding reference / permission data |
| `UPDATE ... WHERE` (stable keys) | Setting values on named rows |
| `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER` | Recreating triggers |

Idempotency protects against partial re-runs and makes fresh installations reliable.

---

## 5. schema_migrations Registration

The `schema_migrations` table is the authoritative record of applied migrations.

Rules:
- Every migration file must register itself exactly once.
- Registration uses `INSERT INTO schema_migrations (filename, applied_at) VALUES (...)`.
- Use `INSERT INTO` (not `INSERT IGNORE`): duplicate registration is a sign
  that the migration was applied twice, which should surface as an error.
- Registration must happen **after** all work in the migration is complete.
  Never register at the top of the file.
- The `filename` value must match the actual filename exactly (including `.sql`).

---

## 6. Numbering Rules

- Numbers run from `0000` upward without gaps.
- **Numbers are never reused** — even if a migration is reverted or superseded,
  its number is permanently retired.
- If a migration is abandoned after being published, a corrective migration
  receives the next available number. The abandoned file is left in place
  with a header note explaining the situation.
- Never assign the same number to two different migrations.
  Duplicate numbers corrupt the migration history on fresh installations.

---

## 7. Destructive Operations

- Avoid `DROP TABLE`, `DROP COLUMN`, and `DELETE` unless the migration is
  explicitly an administrative correction or cleanup.
- Destructive operations must include a header comment explaining the authority
  and justification for the operation.
- Never issue production `UPDATE` or `DELETE` statements without confirming
  the affected rows in advance.

---

## 8. Historical Source Corrections

Historical migration source corrections are acceptable when:

1. They correct a bug that would cause fresh installations to fail or behave incorrectly.
2. They do not change behaviour on systems where the migration has already been applied.
3. They are documented in the migration header with a note explaining the correction.

Historical corrections must never:
- Change a migration's number.
- Change a migration's filename.
- Add new database objects that do not exist on deployed systems.
- Modify the production migration history (`schema_migrations` table).

---

## 9. Seeds vs Migrations

Seed files live under `database/seeds/` and follow a separate naming convention (`seed_NNNN_description.sql`). Seeds are idempotent reference data. Migrations are structural changes. Do not mix the two into a single file unless the data is inseparable from the schema change (e.g. seeding an ENUM mapping table created in the same migration).

---

## 10. Summary Checklist

Before committing a new migration, verify:

- [ ] File is in `database/migrations/`
- [ ] Filename is `NNNN_description.sql` with a unique, never-reused number
- [ ] File begins with `SET NAMES utf8mb4; START TRANSACTION;`
- [ ] All DDL and DML work precedes the `schema_migrations` INSERT
- [ ] `INSERT INTO schema_migrations (filename, applied_at) VALUES (...)` is present
- [ ] `COMMIT;` closes the file
- [ ] Idempotent statements used where practical
- [ ] No duplicate migration numbers exist in the repository
