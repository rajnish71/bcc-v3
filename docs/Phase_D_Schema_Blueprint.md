# BCC Unified Platform V3
## Phase D — V6 13 Member Profile Schema Blueprint

**Date:** 2026-07-10
**Status:** D1 COMPLETE — Schema migrations authored. Batch D2 (data migration) pending.
**Prerequisites:**
- Phase C Reconciliation Report: `docs/Phase_C_Reconciliation_Report.md`
- Design Authority: V6 13 Members Hub Profile (wireframe to be authored in Claude Design)

---

## Purpose

This document records every schema design decision made at the start of Phase D.
It is the authoritative data model reference for V6 13 (Member Profile) implementation.

Scope:
- `users.tagline` column (migration 0039)
- `user_cover_photos` table (migration 0040)
- `user_photo_titles` + `user_awards` tables (migration 0041)
- Gear/equipment placement decision (no migration — existing `user_gear` table)
- Sub-genre / expertise / subject placement decision (deferred to Phase H)
- Deferred columns (preferred_camera_system, name prefix split)

---

## Part 1 — users.tagline Column

### Source
`bcc.bcc_photographers.tagline`

### Data Summary (from Phase C audit)

| Member | Tagline |
|--------|---------|
| kshitij-patle | "Visual Storyteller" |
| ankit-tiwari | "Street & Travel Photographer" |
| rahil-khan | "Street and Travel visual artist" |
| robin-dutta | "Wildlife Photographer" |
| suyash-pratap-singh | "Travel Photography" |
| syed-taha-pasha | "Landscape photography, wildlife, art, culture, and cultural heritage." |
| All others | NULL or empty string |

Longest value: 67 characters.

### Schema Decision

```sql
ALTER TABLE users ADD COLUMN tagline VARCHAR(160) NULL AFTER bio;
```

- **VARCHAR(160)**: 2× the longest observed value; matches Instagram Bio character limit.
  Enforces the tagline as a concise single-line statement, not a paragraph.
- **NULL**: No tagline is a valid state. Empty string is normalized to NULL by application.
- **AFTER bio**: Contextually adjacent in profile display and edit form.

### Migration
`0039_add_users_tagline.sql` — schema only, no data populated.

### Batch D2 Action
Populate `users.tagline` for the 6 members with real tagline data.
Source: `bcc.bcc_photographers.tagline` WHERE value IS NOT NULL AND value != ''.
Do NOT update founding member Rajnish (tagline is empty string in legacy).

---

## Part 2 — user_cover_photos Table

### Source
`bcc.bcc_photographers.cover_photo_url`

### Data Summary (from Phase C audit)

10 of 17 active members have real R2 assets:

| Member (V3 username) | R2 Key |
|---------------------|--------|
| rajnishkhare | `uploads/covers/1781424022017-66e28f32.png` |
| kshitijpatle | `uploads/covers/1781515753358-ad56b6db.jpg` |
| anilbhati | `uploads/covers/1781583009664-255db310.jpg` |
| robindutta | `uploads/covers/1781509676445-ccd9bc6c.jpg` |
| uttamgurjar | `uploads/covers/1781494389373-3e836ed2.jpg` |
| suyashpratapsingh | `uploads/covers/1781772948533-497531d4.jpg` |
| syedtahapasha | `uploads/covers/1782405747044-abcb913f.png` |
| sandeepjain | `uploads/covers/1781889506904-ab9d105c.jpg` |
| sanjaykumarshukla | `uploads/covers/1781538812271-2a74e4dd.png` |
| animeshsaxena | `uploads/covers/1781187930059-eb883f91.jpg` |

7 members have Unsplash placeholder URLs — NOT migrated.

### Schema Decision

Multi-row design with single-active enforcement via generated column:

```sql
CREATE TABLE user_cover_photos (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  r2_key        VARCHAR(500) NOT NULL,
  imagekit_url  VARCHAR(500) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  active_lock   BIGINT GENERATED ALWAYS AS (IF(is_active = TRUE, user_id, NULL)) STORED,
  uploaded_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cover_photos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_one_active_cover (active_lock),
  INDEX idx_cover_photos_user (user_id)
);
```

Key design decisions:

- **Multi-row (not 1:1 column)**: Allows upload history and future admin actions
  without data loss. Old cover photos are retained as `is_active = FALSE`.

- **Single-active enforcement at DB layer**: The `active_lock` generated column
  reuses the pattern from `member_recognitions` (migration 0005). At most one
  `is_active = TRUE` row per `user_id` is permitted by the UNIQUE constraint.
  Deactivating a cover requires `UPDATE user_cover_photos SET is_active = FALSE
  WHERE user_id = ? AND is_active = TRUE` before inserting the new active row.

- **No CDN variant sizes**: ImageKit handles all resizing via URL query parameters
  (e.g. `?tr=w-1360,h-320,fo-auto`). A single `imagekit_url` per row is sufficient.
  This mirrors the V6 design authority: cover photos appear as a full-width banner,
  one crop, one breakpoint treatment.

- **r2_key derivation from legacy**:
  `SUBSTRING(cover_photo_url, 2)` — strips the leading `/` from the legacy path.

- **imagekit_url construction**:
  `CONCAT('https://ik.imagekit.io/duynda7oq/', r2_key)`

### Migration
`0040_create_user_cover_photos.sql` — table creation only.

### Batch D2 Action
INSERT 10 rows from legacy R2 assets. Unsplash URLs: no row inserted.
`rajnishkhare` (founding member) has an R2 cover photo — this row is included
because it is profile asset data, not membership or governance data. Confirm before
inserting: it does not change `profile_visibility` or any governance field.

---

## Part 3 — user_photo_titles and user_awards Tables

### Source
`bcc.bcc_photographers.distinctions` (JSON column)

### JSON Structure
```json
{
  "fip":    "EFIP",
  "psa":    "PPSA",
  "fiap":   "AFIAP",
  "other":  "GPU-CR3, GPU VIP-3, FRPA, GNG, Hon PESGSPC, GPA-PESGSPC, HonVNVC, Hon WPAI",
  "awards": ""
}
```

### Members with Real Distinctions Data

**Dr. Sanjay Kumar Shukla (sanjaykumarshukla)**
- fip: "EFIP"
- psa: "PPSA"
- fiap: "AFIAP"
- other: "GPU-CR3, GPU VIP-3, FRPA, GNG, Hon PESGSPC, GPA-PESGSPC, HonVNPC, Hon WPAI"

**Kshitij Patle (kshitijpatle)**
- fip: "AFIP"
- awards: narrative text about national park competition wins, magazine features,
  Smithsonian-adjacent honours

**Prakash Hatvalne (prakashhatvalne)**
- awards: "Smithsonian Grand Prize 2011, UNDP First Prize 2010,
  Friends of Earth International 2009, Humanity Photo Award China 2006"

**Rahil Khan (rahilkhan)**
- awards: "Loading....." → DISCARD (placeholder, not a real award)

All other members: all keys are empty strings → no rows inserted.

---

### Table 1: user_photo_titles Schema

```sql
CREATE TABLE user_photo_titles (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  body_code   ENUM('FIP', 'PSA', 'FIAP', 'GPU', 'OTHER') NOT NULL,
  title_code  VARCHAR(50) NOT NULL,
  body_name   VARCHAR(255) NULL,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_photo_titles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_photo_titles_user (user_id)
);
```

**body_code rationale:**
| Code | Body | Notes |
|------|------|-------|
| FIP | Fédération Internationale de la Photographie | AFIP, EFIP, MFIP |
| PSA | Photographic Society of America | PPSA, FPSA, MPSA |
| FIAP | Fédération Internationale de l'Art Photographique | AFIAP, EFIAP, MFIAP, ESFIAP |
| GPU | Global Photographic Union | GPU-CR grades, GPU VIP levels |
| OTHER | Any other body | `body_name` must be supplied |

**body_name:** Required when `body_code = 'OTHER'`. Stores the full name or
abbreviation of the awarding body (e.g. "FRPA", "PESGSPC"). This enables future
display in a tooltip or link.

**title_code:** The exact code string as awarded (e.g. "EFIP", "GPU-CR3"). Not
constrained to an ENUM because awarding bodies introduce new grade designations
over time.

**sort_order:** Controls display sequence in the profile's Distinctions section.
Recommended display order: FIP → PSA → FIAP → GPU → OTHER.

### Batch D2 Row Plan — user_photo_titles

| user_id | body_code | title_code | body_name | sort_order |
|---------|-----------|------------|-----------|------------|
| sanjaykumarshukla | FIP | EFIP | NULL | 10 |
| sanjaykumarshukla | PSA | PPSA | NULL | 20 |
| sanjaykumarshukla | FIAP | AFIAP | NULL | 30 |
| sanjaykumarshukla | GPU | GPU-CR3 | NULL | 40 |
| sanjaykumarshukla | GPU | GPU VIP-3 | NULL | 41 |
| sanjaykumarshukla | OTHER | FRPA | FRPA | 50 |
| sanjaykumarshukla | OTHER | GNG | GNG | 51 |
| sanjaykumarshukla | OTHER | Hon PESGSPC | PESGSPC | 52 |
| sanjaykumarshukla | OTHER | GPA-PESGSPC | PESGSPC | 53 |
| sanjaykumarshukla | OTHER | HonVNPC | VNPC | 54 |
| sanjaykumarshukla | OTHER | Hon WPAI | WPAI | 55 |
| kshitijpatle | FIP | AFIP | NULL | 10 |

12 rows total for Batch D2.

---

### Table 2: user_awards Schema

```sql
CREATE TABLE user_awards (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  award_name      VARCHAR(255) NOT NULL,
  awarding_body   VARCHAR(255) NULL,
  award_year      YEAR NULL,
  description     TEXT NULL,
  sort_order      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_user_awards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_awards_user (user_id)
);
```

**award_year YEAR:** MySQL YEAR type (1901–2155). NULL when year is unknown or
when the row stores a narrative without individual year attribution.

**description TEXT:** Narrative field for extended achievement text. Used when
award data is a free-text paragraph rather than a structured entry.

**sort_order:** Suggested: reverse-chronological (newest year = lowest sort_order).

### Batch D2 Row Plan — user_awards

**Prakash Hatvalne — 4 structured rows:**
| award_name | awarding_body | award_year | sort_order |
|-----------|--------------|-----------|-----------|
| Smithsonian Grand Prize | Smithsonian Institution | 2011 | 10 |
| First Prize | UNDP | 2010 | 20 |
| Award | Friends of Earth International | 2009 | 30 |
| Humanity Photo Award | China | 2006 | 40 |

**Kshitij Patle — 1 narrative row:**
| award_name | award_year | description | sort_order |
|-----------|-----------|-------------|-----------|
| Photography Achievements | NULL | [full narrative from distinctions.awards] | 10 |

5 rows total for Batch D2.

### Migration
`0041_create_user_photo_titles_and_awards.sql` — table creation only.

---

## Part 4 — Gear / Equipment Placement Decision

### Existing Schema
`user_gear` table (migration 0018) exists:
```sql
gear_type ENUM('BODY','LENS','ACCESSORY')
label VARCHAR(255)
```

### Legacy Field Mapping

| Legacy field | Format | V3 Target |
|---|---|---|
| `equipment.cameras` | JSON array of strings | `user_gear (gear_type='BODY')` |
| `equipment.lenses` | JSON array of strings | `user_gear (gear_type='LENS')` |
| `equipment.other` | JSON array of strings | `user_gear (gear_type='ACCESSORY')` |
| `equipment.drones` | JSON array (always empty) | Discard — 0 members have entries |
| `gear_bag` | Free-text comma-separated string | Supplementary source for members where `equipment` is empty or inconsistent |
| `preferred_camera_system` | Short free-text string (e.g. "Nikon", "Sony") | No V3 column yet — see Deferred Items below |

### Data Quality Note
Several members share identical placeholder gear strings (e.g. "Sony A7 IV, FE 24-75mm f/2.8 GM, Peak Design Strap" appears for 5 members). These are seeded defaults from the legacy system, not actual gear. Batch D2 must identify and discard placeholder entries.

**Placeholder detection heuristic:** If the same gear label string appears for ≥3 users, treat as a potential placeholder and flag for manual review before migrating.

### Action for Batch D2
- No schema change required (`user_gear` is sufficient).
- Parse `equipment` JSON per member.
- Discard members whose gear matches the placeholder pattern.
- For members with genuine data, insert into `user_gear`.
- Members with genuine data identified in Phase C: kshitijpatle, prakashhatvalne, robindutta.

### No Schema Migration Needed
`user_gear` table schema is already correct for Phase D.

---

## Part 5 — Sub-Genre Metrics Placement Decision

### Legacy Fields

| Field | Format | Content |
|---|---|---|
| `sub_genres` | JSON array of strings | e.g. ["Wildlife", "Travel", "Landscape"] |
| `areas_of_expertise` | JSON array of strings | e.g. ["Long exposure", "Astro", "Golden & Blue Hours"] |
| `favorite_subjects` | JSON array of strings | e.g. ["Birds", "Festivals Etc."] |

### Phase D Decision: DEFER to Phase H

**Rationale:**
1. Phase H (TAXONOMY_ARCHITECTURE) will define the authoritative taxonomy for genres,
   subjects, expertise areas, and related concepts across the entire platform.
2. Creating a premature `user_genre_tags` or `user_interests` table now risks
   schema conflict with Phase H taxonomy tables.
3. V6 13 (Member Profile) will display a genre breakdown derived automatically
   from the user's `photos` table (`photos.genre` ENUM) — this is more accurate
   than manually-entered preference data and requires no additional schema.
4. The `sub_genres`, `areas_of_expertise`, and `favorite_subjects` legacy data
   has significant quality issues (invalid values, e.g. "Portfolio", "Black & White"
   which don't map to the V3 `photos.genre` ENUM).

**Resolution:**
- No V3 schema target created in Phase D.
- Genre distribution for the V6 13 profile page is derived from `photos` at query time.
- Legacy `sub_genres` / `areas_of_expertise` / `favorite_subjects` data is preserved
  in the legacy database until Phase H creates the proper taxonomy tables.
- If V6 13 wireframe review reveals a requirement for manually-editable genre tags,
  revisit this decision before Batch D2.

---

## Part 6 — Deferred Column Decisions

These items were raised in Phase C but require explicit design confirmation
before schema changes are made.

### 6.1 preferred_camera_system

**Legacy value:** Short free-text string (e.g. "Nikon Z Series", "Sony Alpha 7Miv")
**Decision:** Defer. No V3 column added in Phase D.
**Condition for revisit:** V6 13 wireframe includes a visible "Preferred System" field
on the Gear section of the Member Profile page.
**If added:** `ALTER TABLE users ADD COLUMN preferred_camera_system VARCHAR(100) NULL;`

### 6.2 Name Prefix / First Name / Surname Split

**Context:** 7 active members have name prefixes ("Dr.", "Mr.") stored in `full_name`.
The legacy system stored these as `first_name` + `surname` + `prefix` separately.
**Decision:** Defer to Phase D wireframe review.
**Condition for revisit:** V6 13 profile editor exposes separate first/last name fields.
**If added:**
```sql
ALTER TABLE users
  ADD COLUMN name_prefix  VARCHAR(20)  NULL AFTER full_name,
  ADD COLUMN first_name   VARCHAR(100) NULL AFTER name_prefix,
  ADD COLUMN last_name    VARCHAR(100) NULL AFTER first_name;
```
No data migration needed for `full_name` itself — it is already correctly set.

---

## Part 7 — Migration Sequence Summary

| Migration | Purpose | Status |
|-----------|---------|--------|
| 0039 | `users.tagline` column | ✅ Authored |
| 0040 | `user_cover_photos` table | ✅ Authored |
| 0041 | `user_photo_titles` + `user_awards` tables | ✅ Authored |
| 0042 | Batch D2: Populate taglines from legacy | ⏳ Pending |
| 0043 | Batch D2: Populate cover photos from legacy | ⏳ Pending |
| 0044 | Batch D2: Populate photo titles + awards from legacy | ⏳ Pending |
| TBD | Batch D3: Populate user_gear from equipment JSON (quality pass first) | ⏳ Pending |

Batches D2 and D3 require cross-database SELECT from `bcc.*` (same as migrations
0035 and 0038). Run under `sudo mysql` or ensure `bcc_v3_app` has been granted
SELECT on `bcc.*`.

---

## Part 8 — What the V6 13 Wireframe Must Address

Before Batch D2 can be finalized, the V6 13 wireframe must confirm:

1. **Tagline display location** — below full_name in the profile hero? In the About tab?
2. **Cover photo dimensions** — aspect ratio and breakpoint crop strategy determine
   whether additional `r2_key` variants are needed (currently no variants planned).
3. **Distinctions section** — Are photo titles displayed as suffixes after the member's
   name (e.g. "Rajnish Khare EFIP") or in a dedicated section? Affects sort_order strategy.
4. **Awards section** — Free narrative or structured card list? Determines whether
   `award_name` + `award_year` columns are surfaced or `description` alone is displayed.
5. **Gear section** — Does V6 13 display gear at all? If yes, does it show `BODY` + `LENS`
   + `ACCESSORY` in separate groups, or as a flat list?
6. **Genre distribution** — Displayed as auto-calculated badges from `photos.genre`
   counts, or as a manually-set "Specialty Genres" picker?

---

*Phase D Schema Blueprint — Batch D1 complete.*
*Migrations 0039, 0040, 0041 authored. Awaiting V6 13 wireframe for Batch D2 confirmation.*
