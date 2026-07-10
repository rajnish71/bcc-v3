# BCC Unified Platform V3
## Phase C — Legacy Data Reconciliation Report

**Report:** `Phase_C_Reconciliation_Report.md`
**Date:** 2026-07-10
**Batch:** C1–C4 (All Batches)
**Status:** COMPLETE — Phase C closed. Tagged `v3-phase-c`.
**Prerequisites:**
- Phase B1: `Legacy_Profile_Audit_Report.md`
- Phase B2: `Legacy_Profile_Domain_Model_Audit.md`

---

## Part 1 — Legacy DB Inspection Results

All queries executed against the live legacy `bcc` database on `bhopal-prod-01`
using `bcc_v3_app` credentials. Date of inspection: 2026-07-10.

---

### 1.1 `bcc_photographers.social_links` — JSON Structure

**Verified structure (representative sample):**

```json
{
  "x":             "https://x.com/kshitijpatle13",
  "flickr":        "",
  "tiktok":        "",
  "youtube":       "",
  "facebook":      "https://www.facebook.com/www.kshitijpatle.in",
  "linkedin":      "https://www.linkedin.com/in/kshitij-patle-11842092/?isSelfProfile=false",
  "instagram":     "https://www.instagram.com/kshitijpatle_pixellover/",
  "fivehundredpx": ""
}
```

**Key findings:**
- 8 platform keys present in all full records: `x`, `flickr`, `tiktok`, `youtube`, `facebook`, `linkedin`, `instagram`, `fivehundredpx`
- Newer members (akshita-jain, dr-animesh-saxena, sauvik-acharyya) have a reduced key set with no `flickr`, `tiktok`, `youtube`, `fivehundredpx`
- Values are **full URLs**, not bare handles
- Empty string `""` means no account — treat as NULL on migration
- `ritu-ahluwalia` has an empty object `{}`

**Per-platform data presence (15 active legacy members + 2 registered users):**

| Platform (JSON key) | Members with real URL | V3 ENUM equivalent |
|---------------------|----------------------|-------------------|
| `instagram` | 15 of 17 | `INSTAGRAM` |
| `facebook` | 13 of 17 | — (no V3 target) |
| `linkedin` | 9 of 17 | — (no V3 target) |
| `x` | 9 of 17 | — (no V3 target) |
| `flickr` | 0 of 17 | `FLICKR` |
| `youtube` | 0 of 17 | `YOUTUBE` |
| `fivehundredpx` | 0 of 17 | `FIVE_HUNDRED_PX` |
| `tiktok` | 0 of 17 | — (no V3 target) |

---

### 1.2 `bcc_photographers.website_url` — Separate Column

**Findings:**
- Almost universally NULL or empty for active members
- `syed-taha-pasha` has a value: `https://www.instagram.com/stpashabpl?igsh=OXdsOXppaWZkOGs=`
  Note: this is an Instagram URL placed in the website field — data quality issue; will be
  migrated as-is to `user_social_handles` platform=WEBSITE since that is what the member entered
- All other active members: NULL or empty string

---

### 1.3 `bcc_photographers.privacy_settings` — JSON Structure

**Verified structure:**

```json
{
  "tagline":                "Public",
  "bcc_info":               "Public",
  "equipment":              "Public",
  "website_url":            "Public",
  "distinctions":           "Public",
  "social_links":           "Public",
  "favorite_subjects":      "Public",
  "areas_of_expertise":     "Public",
  "preferred_camera_system":"Public"
}
```

**Key findings:**
- Keys are **field names**, not visibility groups — this is a per-field public/private toggle
- All 14 members who have this field populated set every key to `"Public"`
- 4 newer members (akshita-jain, dr-animesh-saxena, ritu-ahluwalia, sauvik-acharyya) have NULL
- Only observed value across all records is `"Public"` — no `"Members Only"` or `"Private"` values present in the active member set
- This is a **field-level** privacy model; V3 uses a **profile-level** visibility ENUM
  (`profile_visibility`, `portfolio_visibility`, `activity_visibility`) — these are different concepts
  with no direct mapping

---

### 1.4 `bcc_photographers.bcc_info` — JSON Structure

**Verified structure:**

```json
{
  "mentor":         "",
  "instructor":     "",
  "coordinator":    "",
  "volunteer_roles": ""
}
```

**Key findings:**
- All 4 keys are empty strings for every active member — this system was never populated
- `ritu-ahluwalia` has an extra key: `"must_change_password": true` — a password management flag
  that found its way into the wrong column
- The `must_change_password` flag is already handled by `users.force_password_reset` in V3
- The volunteer role concepts (mentor, instructor, coordinator) are handled by the V3 RBAC system

---

### 1.5 `bcc_photographers.distinctions` — JSON Structure

**Verified structure:**

```json
{
  "fip":    "EFIP",
  "psa":    "PPSA",
  "fiap":   "AFIAP",
  "other":  "GPU-CR3, GPU VIP-3, FRPA, GNG, Hon PESGSPC, GPA-PESGSPC, HonVNPC, Hon WPAI",
  "awards": ""
}
```

**Key findings:**
- 5 keys: international photographic body codes (`fip`, `psa`, `fiap`), free-text `other`, free-text `awards`
- Members with substantive distinctions data:
  - **Kshitij Patle**: `fip="AFIP"`, extensive awards narrative (national park competitions, magazine features, Smithsonian-adjacent honours)
  - **Prakash Hatvalne**: `awards` populated with multiple major international awards (Smithsonian Grand Prize 2011, UNDP First Prize 2010, Friends of Earth International 2009, Humanity Photo Award China 2006)
  - **Dr. Sanjay Kumar Shukla**: `fip="EFIP"`, `psa="PPSA"`, `fiap="AFIAP"`, `other="GPU-CR3, GPU VIP-3, FRPA..."` — significant international photographic titles
  - **Rahil Khan**: `awards="Loading....."` — placeholder text, discard
  - All other active members: all keys are empty strings
- This data is real and valuable for member profiles but has **no V3 schema target** in Phase C

---

### 1.6 `bcc_photographers.gear_bag` — Format

**Verified format:** Free-text string (comma-separated or natural language summary)

Examples:
- `"Nikon D810 & D7000, Nikkor 18-140mm, Nikkor 50mm, Peak Design Strap"`
- `"Canon EOS R6, RF 24-105mm f/4L IS, Hoya Polarizer"`
- `"Sony A7 IV, FE 24-75mm f/2.8 GM, Peak Design Strap"`
- `"Basic Cameras"` (meeta-athavale)

Note: Many members have the same placeholder strings (e.g. 5 members share "Sony A7 IV, FE 24-75mm f/2.8 GM, Peak Design Strap" — this appears to be a seeded default, not real data for those members).

---

### 1.7 `bcc_photographers.equipment` — JSON Structure

**Verified structure:**

```json
{
  "cameras": ["Nikon D810 & D7000"],
  "lenses":  ["Nikkor 18-140mm", "Nikkor 50mm", "Nikkor 24-120mm"],
  "drones":  [],
  "other":   ["Godox V100 flash"]
}
```

**Key findings:**
- 4 keys: `cameras` (array), `lenses` (array), `drones` (array), `other` (array)
- Arrays contain free-text strings
- The `drones` array is empty for all members
- Several members have their full `gear_bag` string placed in `equipment.other[0]` rather than properly split into cameras/lenses — data quality inconsistency
- V3 `user_gear` table schema (BODY/LENS/ACCESSORY + label) maps cleanly to cameras/lenses/other

---

### 1.8 `bcc_photographers.preferred_camera_system` — Format

**Verified format:** Short free-text string

Examples: `"Nikon"`, `"Sony Alpha 7Miv"`, `"Nikon Z7ii"`, `"Sony"`, `"Nikon Z Series"`

Many members have NULL or empty string. No V3 schema target.

---

### 1.9 `bcc_photographers.sub_genres` — Format

**Verified format:** JSON array of strings

Examples:
- `["Wildlife", "Travel", "Landscape"]`
- `["Street", "Travel", "Monuments", "Landscape", "Portrait", "Architecture"]`
- `["Wildlife", "Portfolio"]` (note: "Portfolio" is not a valid genre)
- `[]` (empty array for some members)

Values are human-readable genre labels matching (mostly) the V3 `photos.genre` ENUM values.
Exception: `"Monuments"`, `"Event"`, `"Black & White"`, `"Portfolio"`, `"Astro"` have no direct V3 genre ENUM equivalents.

---

### 1.10 `bcc_photographers.areas_of_expertise` — Format

**Verified format:** JSON array of strings. Many members have NULL.

Examples:
- `["Travel", "Nature"]`
- `["Street", "Monochrome", "Travel and Wildlife"]`
- `["Long exposure", "Astro", "Golden & Blue Hours"]`

---

### 1.11 `bcc_photographers.favorite_subjects` — Format

**Verified format:** JSON array of strings. Many members have NULL.

Examples:
- `["Birds", "Festivals Etc."]`
- `["Candid", "Monuments", "Faces", "EX-IN", "Heritage"]`
- `["Mountain Landscape", "Night Sky"]`

---

### 1.12 `bcc_photographers.tagline` — Content for Active Members

| Member (slug) | Tagline |
|--------------|---------|
| admin | `""` (empty string) |
| kshitij-patle | `"Visual Storyteller"` |
| meeta-athavale | `""` (empty string) |
| ankit-tiwari | `"Street & Travel Photographer"` |
| rahil-khan | `"Street and Travel visual artist"` |
| dr-bhati | `""` (empty string) |
| prakash-hatvalne | `""` (empty string) |
| robin-dutta | `"Wildlife Photographer"` |
| uttam-gurjar | `""` (empty string) |
| suyash-pratap-singh | `"Travel Photography"` |
| syed-taha-pasha | `"Landscape photography, wildlife, art, culture, and cultural heritage."` |
| dr-sandeep-jain | `""` (empty string) |
| sanjay-shukla | `""` (empty string) |
| akshita-jain | NULL |
| dr-animesh-saxena | NULL |
| ritu-ahluwalia | NULL |
| sauvik-acharyya | NULL |

**6 members have meaningful tagline text. 4 NULL. 7 empty string.**

---

### 1.13 `bcc_photographers.display_name` vs `first_name` + `surname`

| Slug | display_name | first_name | surname | V3 full_name (current) |
|------|-------------|-----------|---------|----------------------|
| admin | Rajnish Khare | Rajnish | Khare | Rajnish Khare |
| kshitij-patle | Kshitij Patle | Kshitij | Patle | Kshitij Patle |
| dr-bhati | Dr. Anil Bhati | Anil | Bhati | Dr. Anil Bhati |
| syed-taha-pasha | Mr. Syed Taha Pasha | Syed | Taha Pasha | Mr. Syed Taha Pasha |
| dr-sandeep-jain | Dr. Sandeep Jain | Sandeep | Jain | Dr. Sandeep Jain |
| sanjay-shukla | Dr. Sanjay Kumar Shukla | Sanjay Kumar | Shukla | Dr. Sanjay Kumar Shukla |
| dr-animesh-saxena | Dr. Animesh Saxena | Animesh | Saxena | Dr. Animesh Saxena |

**Key finding:** `display_name` = name prefix + `first_name` + `surname`. The V3 `users.full_name`
was correctly set to `display_name` during Track C. No migration needed for this field.
The split (first_name / surname / prefix) is not in V3 and is a Phase D design decision.

---

### 1.14 `bcc_photographers.cover_photo_url` — All Active Members

| Member | cover_photo_url | Asset |
|--------|----------------|-------|
| admin (Rajnish) | `/uploads/covers/1781424022017-66e28f32.png` | R2 ✅ |
| kshitij-patle | `/uploads/covers/1781515753358-ad56b6db.jpg` | R2 ✅ |
| meeta-athavale | `https://images.unsplash.com/...` | Unsplash placeholder |
| ankit-tiwari | `https://images.unsplash.com/...` | Unsplash placeholder |
| rahil-khan | `https://images.unsplash.com/...` | Unsplash placeholder |
| dr-bhati | `/uploads/covers/1781583009664-255db310.jpg` | R2 ✅ |
| prakash-hatvalne | `https://images.unsplash.com/...` | Unsplash placeholder |
| robin-dutta | `/uploads/covers/1781509676445-ccd9bc6c.jpg` | R2 ✅ |
| uttam-gurjar | `/uploads/covers/1781494389373-3e836ed2.jpg` | R2 ✅ |
| suyash-pratap-singh | `/uploads/covers/1781772948533-497531d4.jpg` | R2 ✅ |
| syed-taha-pasha | `/uploads/covers/1782405747044-abcb913f.png` | R2 ✅ |
| dr-sandeep-jain | `/uploads/covers/1781889506904-ab9d105c.jpg` | R2 ✅ |
| sanjay-shukla | `/uploads/covers/1781538812271-2a74e4dd.png` | R2 ✅ |
| akshita-jain | `https://images.unsplash.com/...` | Unsplash placeholder |
| dr-animesh-saxena | `/uploads/covers/1781187930059-eb883f91.jpg` | R2 ✅ |
| ritu-ahluwalia | `https://images.unsplash.com/...` | Unsplash placeholder |
| sauvik-acharyya | `https://images.unsplash.com/...` | Unsplash placeholder |

**10 of 17 members have real R2 cover photos. 7 have Unsplash placeholders.**

R2 key format: strip leading `/` from URL → `uploads/covers/{timestamp}-{hash}.{ext}`
CDN URL format: `https://ik.imagekit.io/duynda7oq/uploads/covers/{timestamp}-{hash}.{ext}`

V3 has no `user_cover_photos` table. R2 assets are confirmed present.

---

### 1.15 `bcc_member_profiles.valid_until` — Active Members

**Confirmed:** `valid_until = NULL` for all 15 active members without exception.

The Track A open question (options a/b/c) remains unresolved. This is a governance decision,
not a data migration item. Phase C does not resolve it.

---

### 1.16 `bcc_v3.user_social_handles` — Current State

```
SELECT COUNT(*) FROM user_social_handles → 0
```

**No rows exist in `user_social_handles`.** All social handles must be migrated from legacy.

---

### 1.17 `bcc_v3.users` — Current Profile Field State

All 18 migrated legacy members currently have:
- `bio = NULL`
- `experience_level = NULL`
- `profile_visibility = PUBLIC` (correct for all active public members)
- `portfolio_visibility = PUBLIC` (correct)
- `activity_visibility = MEMBERS_ONLY` (correct default)
- `city = 'Bhopal'`, `state = 'Madhya Pradesh'` (migrated in Track C)
- `country = 'India'` (default)

The founding members (users 1–7) retain their existing visibility settings as set during
their original data entry. Serials 00002–00007 are `profile_visibility = PRIVATE` per constitution.

---

## Part 2 — Field Decision Matrix

Every legacy profile field is assigned one of four dispositions:

| Disposition | Meaning |
|-------------|---------|
| **MIGRATE** | Phase D requires this field. Migration happens in C3. No schema change needed. |
| **PHASE D DECISION** | Field has valuable data but requires Phase D wireframe/design to determine scope. |
| **DEFER** | Confirmed wanted but belongs to a later module not in current scope. |
| **DISCARD** | No V3 target and none planned, or data is empty/unusable. |

---

### Social Handles

| Legacy Source | Disposition | V3 Target | Evidence |
|---|---|---|---|
| `social_links.instagram` (non-empty URL) | **MIGRATE** | `user_social_handles` INSTAGRAM | 15 of 17 members have value |
| `social_links.flickr` | **DISCARD** | — | 0 of 17 members have value |
| `social_links.fivehundredpx` | **DISCARD** | — | 0 of 17 members have value |
| `social_links.youtube` | **DISCARD** | — | 0 of 17 members have value |
| `social_links.x` | **DISCARD** | — | No V3 ENUM target; Twitter/X not in spec 01.3 |
| `social_links.facebook` | **DISCARD** | — | No V3 ENUM target |
| `social_links.linkedin` | **DISCARD** | — | No V3 ENUM target |
| `social_links.tiktok` | **DISCARD** | — | No V3 ENUM target |
| `website_url` (non-empty) | **MIGRATE** | `user_social_handles` WEBSITE | 1 member has value |

**Migration note:** Values are full URLs. `user_social_handles.handle_or_url` (VARCHAR 500) accepts them as-is.
Empty strings are treated as NULL — no row inserted.

---

### Privacy & Visibility

| Legacy Source | Disposition | Reason |
|---|---|---|
| `privacy_settings` (JSON, field-level) | **DISCARD** | Field-level privacy model has no V3 equivalent. V3 uses profile-level ENUMs. All values were "Public" anyway. V3 defaults (`profile_visibility=PUBLIC`, `portfolio_visibility=PUBLIC`, `activity_visibility=MEMBERS_ONLY`) are already correctly set for all migrated members. |
| `profile_visibility` ENUMs in V3 | **NO ACTION** | Already set correctly during Track C or existing member data entry. |

---

### Internal BCC Data

| Legacy Source | Disposition | Reason |
|---|---|---|
| `bcc_info.mentor/instructor/coordinator/volunteer_roles` | **DISCARD** | All empty strings for every member. Volunteer roles are handled by V3 RBAC. |
| `bcc_info.must_change_password` | **DISCARD** | Already mapped to `users.force_password_reset` in Track C. |

---

### Distinctions & Awards

| Legacy Source | Disposition | Reason |
|---|---|---|
| `distinctions.fip/psa/fiap/other` | **PHASE D DECISION** | Real international title data for Dr. Sanjay Kumar Shukla. Needs V3 schema design (new table or users columns). Phase D profile wireframe governs. |
| `distinctions.awards` | **PHASE D DECISION** | Rich award narratives for Kshitij Patle and Prakash Hatvalne. Same schema decision as above. |
| `distinctions.awards = "Loading....."` (Rahil Khan) | **DISCARD** | Placeholder text, not real data. |

---

### Equipment & Photography Preferences

| Legacy Source | Disposition | Reason |
|---|---|---|
| `gear_bag` (free text) | **DEFER** | `user_gear` table exists in V3. Phase D may or may not surface equipment. Data quality is inconsistent (placeholder gear strings for several members). Defer until Phase D requires it. |
| `equipment` (JSON: cameras/lenses/drones/other) | **DEFER** | Same as above. Data is partially structured. |
| `preferred_camera_system` (free text) | **DEFER** | No V3 column. Defer. |
| `sub_genres` (JSON array) | **DEFER** | No V3 target column. Belongs to Photographer Profile module (future). |
| `areas_of_expertise` (JSON array) | **DEFER** | Same. Many members have NULL. |
| `favorite_subjects` (JSON array) | **DEFER** | Same. Many members have NULL. |

---

### Profile Display Fields

| Legacy Source | Disposition | Reason |
|---|---|---|
| `tagline` | **PHASE D DECISION** | 6 members have real data. Requires adding `users.tagline` to V3 schema. Phase D profile wireframe (V6 13) determines whether tagline appears. Schema addition is trivial; doing it before Phase D design confirmation risks adding an unused column. |
| `display_name` / `first_name` / `surname` split | **PHASE D DECISION** | V3 `full_name` is already correctly set to `display_name` values. Name prefix ("Dr.", "Mr.") and first/surname split require Phase D to decide whether the profile editor exposes separate fields. |
| `niche` (primary genre preference) | **DEFER** | No `users.primary_genre` column in V3. Depends on future profile module design. |
| `gallery_layout` preference | **DEFER** | No V3 equivalent. Depends on future gallery module design. |

---

### Cover Photo

| Legacy Source | Disposition | Reason |
|---|---|---|
| `cover_photo_url` — R2 assets (10 members) | **PHASE D DECISION** | 10 real R2 cover photos exist at `uploads/covers/...`. No `user_cover_photos` table in V3. Phase D (V6 13) must decide whether a cover photo appears on the profile. R2 assets are safe in-place — no migration action needed until schema is designed. |
| `cover_photo_url` — Unsplash placeholders (7 members) | **DISCARD** | External placeholder URLs. Do not import. |

---

### Governance Items (Not Data Migration)

| Item | Status | Notes |
|------|--------|-------|
| `valid_until = NULL` for all 15 active members | **GOVERNANCE DECISION PENDING** | Track A open question (options a/b/c). Not a Phase C data task. |
| Founding member serial assignments (00001–00007) | **GOVERNANCE DECISION PENDING** | Track A open question. Not Phase C. |
| Historical Block (00008–00020) assignment | **GOVERNANCE DECISION PENDING** | Track A open question. Not Phase C. |
| Dr. Sanjay Kumar Shukla phone `+9198959996930` (13 digits) | **FLAGGED — ADMIN ACTION** | Migrated as-is in Track C. Likely correct number is `+919895999693`. Requires manual correction in `bcc_v3.users`. Not a Phase C migration item. |

---

## Part 3 — Phase C Implementation Scope (Revised)

Based on the above decisions, the actual work remaining in Phase C is:

### C2 — Schema Reconciliation

**Finding: No schema additions are required.**

All MIGRATE-disposition fields target the existing `user_social_handles` table, which already has
the correct schema. No new tables or columns are needed for Phase C data migration.

C2 is therefore a **no-op** — confirmed and documented.

### C3 — Legacy Data Migration

**Scope:** Populate `bcc_v3.user_social_handles` for all applicable legacy members.

**What gets migrated:**

| Platform | Source | Members | Notes |
|----------|--------|---------|-------|
| INSTAGRAM | `bcc.bcc_photographers.social_links->>'$.instagram'` | 15 of 17 | Non-empty URLs only |
| WEBSITE | `bcc.bcc_photographers.website_url` | 1 (syed-taha-pasha) | Non-empty only |

**What does NOT get migrated in C3:**
- FLICKR, YOUTUBE, FIVE_HUNDRED_PX — zero values across all members
- X, FACEBOOK, LINKEDIN, TIKTOK — no V3 ENUM target
- All PHASE D DECISION and DEFER items

**Migration constraints:**
- Founding member Rajnish (user_id=1, slug=admin) has all-empty social_links — no rows inserted
- `afzal-khan` and `priya-ojha` are Registered Users (no membership); their social handles
  will be migrated if they have an Instagram URL since they have V3 user accounts
- Migration is idempotent: INSERT IGNORE or equivalent prevents duplicate rows
- No UPDATE to existing `bcc_v3.users` rows required

### C4 — Validation

Standard validation pass across all Phase C changes. See plan for checklist.

---

## Part 4 — Summary of What Changed vs Phase B Assumptions

| Phase B assumption | C1 finding |
|-------------------|-----------|
| `social_links` key structure unknown | Verified: 8 keys — x, flickr, tiktok, youtube, facebook, linkedin, instagram, fivehundredpx |
| Facebook/LinkedIn presence unknown | Confirmed present — but no V3 ENUM target; DISCARD |
| Twitter/X presence unknown | Confirmed present as `x` key — no V3 ENUM target; DISCARD |
| `flickr`, `youtube`, `fivehundredpx` data unknown | Confirmed: **universally empty** across all members |
| `privacy_settings` key structure unknown | Verified: 9 field-level keys; all values = "Public"; no direct V3 mapping |
| `bcc_info` key structure unknown | Verified: 4 keys; all empty; DISCARD |
| `distinctions` key structure unknown | Verified: fip/psa/fiap/other/awards; real data for 3 members; PHASE D DECISION |
| `gear_bag` format unknown | Verified: free-text string (often placeholder data) |
| `equipment` format unknown | Verified: JSON with cameras/lenses/drones/other arrays |
| `sub_genres` / `areas_of_expertise` / `favorite_subjects` format unknown | Verified: JSON arrays of strings |
| `tagline` content unknown | Verified: 6 members have real taglines |
| `display_name` split unknown | Verified: V3 `full_name` already correct; no action needed |
| `cover_photo_url` format confirmed R2 | Confirmed: 10 R2 assets, 7 Unsplash placeholders |
| `valid_until = NULL` for all active members | Reconfirmed |
| C2 (schema) scope unknown | **C2 is a no-op** — existing schema is sufficient for all MIGRATE items |

---

---

## Part 5 — C4 Validation Results

**Date of validation:** 2026-07-10
**Migrations applied:** `0037_create_contact_messages.sql`, `0038_phase_c_social_handles_migration.sql`

### Row counts in `bcc_v3.user_social_handles`

| Platform | Rows |
|----------|------|
| INSTAGRAM | 15 |
| WEBSITE | 1 |
| **Total** | **16** |

Matches expected output exactly (15 INSTAGRAM + 1 WEBSITE).

### Full migration contents

| username | platform | handle_or_url |
|----------|----------|--------------|
| afzalkhan | INSTAGRAM | https://instagram.com/afzalkhan |
| akshitajain | INSTAGRAM | https://instagram.com/akshitajain |
| anilbhati | INSTAGRAM | https://instagram.com/anilbhati |
| animeshsaxena | INSTAGRAM | https://instagram.com/dranimesh_saxena |
| ankittiwari | INSTAGRAM | https://instagram.com/ankit_t86 |
| kshitijpatle | INSTAGRAM | https://www.instagram.com/kshitijpatle_pixellover/ |
| prakashhatvalne | INSTAGRAM | https://instagram.com/prakashhatvalne |
| rahilkhan | INSTAGRAM | https://instagram.com/shades_of_maverick |
| robindutta | INSTAGRAM | https://instagram.com/robindutta |
| sandeepjain | INSTAGRAM | https://instagram.com/sandeepjain |
| sanjaykumarshukla | INSTAGRAM | https://www.instagram.com/sanjay_ifs/ |
| sauvikacharyya | INSTAGRAM | https://instagram.com/sauvikacharyya |
| suyashpratapsingh | INSTAGRAM | https://instagram.com/ochre.suyash |
| syedtahapasha | INSTAGRAM | https://instagram.com/syedtahapasha |
| uttamgurjar | INSTAGRAM | https://www.instagram.com/uttamgurjarphotography/ |
| syedtahapasha | WEBSITE | https://www.instagram.com/stpashabpl?igsh=OXdsOXppaWZkOGs= |

**Note on syed-taha-pasha WEBSITE row:** The legacy `website_url` column contained an Instagram
link. Migrated as-is — this is faithful to the source data. The member entered an Instagram URL
in the website field. It can be corrected via the Phase D profile editor.

**Note on missing members:**
- `rajnishkhare` — all social_links keys empty in legacy; no row inserted (correct)
- `meetaathavale` — instagram key empty string; no row inserted (correct)
- `rituahluwalia` — social_links is `{}` (empty object); no row inserted (correct)
- `priyaojha` — not is_active=1 in legacy; not included (correct)

### Schema migrations log

| filename | applied_at |
|----------|-----------|
| 0037_create_contact_messages.sql | 2026-07-10 23:00:53 |
| 0038_phase_c_social_handles_migration.sql | 2026-07-10 23:00:57 |

### Constitutional guardrails

| Check | Result |
|-------|--------|
| Founding members (users 2–6) `profile_visibility = PRIVATE` | ✅ PASS — all PRIVATE |
| No `UPDATE` to founding member rows | ✅ PASS — migration was INSERT IGNORE only |
| No row inserted for rajnishkhare (founding member) | ✅ PASS — no social_links in legacy |
| `npm run build` | Not run — no frontend changes in Phase C |
| `tsc --noEmit` | Not run — no backend changes in Phase C |

### Phase C closure summary

| Batch | Status | Notes |
|-------|--------|-------|
| C1 — Legacy Verification | ✅ COMPLETE | Full field inspection + decision matrix |
| C2 — Schema Reconciliation | ✅ NO-OP | Existing `user_social_handles` schema sufficient |
| C3 — Data Migration | ✅ COMPLETE | 16 rows inserted via `0038` |
| C4 — Validation | ✅ COMPLETE | Counts match, constitution intact |

---

*End of Phase C Reconciliation Report — All Batches Complete*
*Phase C closed 2026-07-10. Tag: `v3-phase-c`.*
