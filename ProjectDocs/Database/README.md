# BCC Unified Platform V3
# Database Documentation

---

## Status

AUTHORITATIVE

Living Documentation

---

## Purpose

This folder contains the authoritative documentation for the BCC Unified Platform V3 database.

It complements the Architecture documents and provides a complete reference for:

- database schema
- table ownership
- foreign key relationships
- migration history
- database governance
- schema evolution

These documents are intended for developers, maintainers and AI assistants working on the project.

---

# Authority

Database implementation remains governed by the following documents in order of precedence:

1. MEM-006 — Membership Constitution
2. MEM-007 — Membership Numbering Constitution
3. TECH-STACK-FREEZE
4. BCC Unified Platform Specification
5. Platform Architecture documents
6. Database documentation contained in this folder

Where conflicts exist, constitutional and architectural documents always take precedence over database documentation.

---

# Folder Contents

| File | Purpose |
|------|---------|
| DATABASE_DICTIONARY.md | Functional purpose of every table |
| DATABASE_SCHEMA.md | Human-readable schema reference |
| DATABASE_RELATIONSHIPS.md | Foreign key relationships and ER overview |
| TABLE_OWNERSHIP.md | Service/module ownership of each table |
| DATABASE_MIGRATIONS.md | Chronological migration history |
| CHANGELOG.md | Schema change log |
| schema.sql | Exact schema exported from MySQL |

---

# Documentation Philosophy

The database documentation serves two complementary purposes.

## Human Documentation

Explains why tables exist, how they interact and which service owns them.

## Machine Documentation

Provides accurate schema information so that AI assistants can generate correct SQL without guessing table or column names.

---

# Updating

Whenever a migration modifies the database:

1. Apply the migration.
2. Export a fresh `schema.sql`.
3. Update DATABASE_SCHEMA.md.
4. Update DATABASE_RELATIONSHIPS.md if required.
5. Update DATABASE_DICTIONARY.md if new tables are introduced.
6. Record the migration in DATABASE_MIGRATIONS.md.
7. Record significant changes in CHANGELOG.md.

---

# Rule

Never assume the database structure.

Always refer to the latest documentation contained in this folder.

`schema.sql` is the authoritative technical definition of the database.

The remaining documents exist to make the schema understandable and maintainable.

---

End of Document