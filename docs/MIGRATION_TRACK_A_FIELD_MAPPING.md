# Migration Track A -- Legacy Schema Discovery & Field Mapping
Status: COMPLETE (updated 2026-07-01)
Source: bcc database on bhopal-prod-01 (legacy site bcc.bhopal.info)
Target: bcc_v3 database -- MEM-006 / MEM-007 constitutional schema

---

## 1. Legacy Schema Inventory

| Table | Rows | Priority | Notes |
|---|---|---|---|
| bcc_photographers | 21 (15 active, 6 inactive) | HIGH | Master identity + membership record |
| bcc_member_profiles | 21 | HIGH | Membership activation state |
| bcc_membership_roles | 7 | Ref only | Class defs -- never actually assigned (see s2) |
| bcc_photographer_photos | 311 DB rows | HIGH | 310 photos in R2, not local disk |
| bcc_photo_categories | 419 | HIGH | Photo-to-genre junction |
| bcc_categories | 12 | MEDIUM | Genre taxonomy |
| bcc_student_progress | 100 | MEDIUM | LMS progress records |
| bcc_member_deliverables | 26 | Ref only | Entitlements per role |
| bcc_events | 3 | LOW | Seed events |
| bcc_event_installments | 3 | LOW | Installment records |
| bcc_contests | 2 | LOW | Seed contests |
| bcc_contest_submissions | 2 | LOW | |
| bcc_ledger_transactions | 2 | LOW | Payment records |
| bcc_membership_applications | 1 | LOW | |
| bcc_sessions | 31 | DISCARD | Auth sessions -- do not migrate |
| bcc_event_registrations | 0 | SKIP | Empty |
| bcc_entry_ratings | 0 | SKIP | Empty |
| bcc_exhibitions | 0 | SKIP | Empty |
| bcc_exhibition_entries | 0 | SKIP | Empty |
| bcc_registration_submissions | 0 | SKIP | Empty |

---

## 2. Critical Discovery: Dual Membership Classification System

The legacy schema has two parallel classification systems that do not agree:

SYSTEM A -- bcc_photographers.membership_tier (ENUM): GUEST | PREMIUM | MENTOR | PATRON
This is the LIVE, OPERATIVE classification. All 15 active members carry their real tier here.

SYSTEM B -- bcc_member_profiles.role_id -> bcc_membership_roles.role_key
NEVER ACTUALLY ASSIGNED: Every single active member has role_key = ROLE_BASIC regardless
of real tier. This table was built as part of V2 planning but never populated with real data.

MIGRATION CONSEQUENCE: Use bcc_photographers.membership_tier as the authoritative source
for identity grouping only -- NOT for V3 class assignment (see s4.2).

---

## 3. Full Member Roster (21 members)

### Active members (15)

| Name | Legacy Tier | Legacy Role | Year | Email |
|---|---|---|---|---|
| Rajnish Khare | PATRON | SUPER_ADMIN | 2016 | admin@bhopal.info |
| Kshitij Patle | MENTOR | MEMBER | 2017 | kshitijpatle@gmail.com |
| Rahil Khan | PREMIUM | MEMBER | 2018 | rahilkhan@bcc.in |
| Ankit Tiwari | PREMIUM | MEMBER | 2018 | ankit.tiwari86@gmail.com |
| Robin Dutta | PREMIUM | MEMBER | 2019 | robindutta.bhopal@gmail.com |
| Uttam Gurjar | MENTOR | CURATOR | 2019 | uttamcreative@gmail.com |
| Prakash Hatvalne | MENTOR | MEMBER | 2019 | prakashhatvalne@bcc.in |
| Dr. Anil Bhati | PATRON | MEMBER | 2019 | anilbhati@bcc.in |
| Suyash Pratap Singh | PREMIUM | MEMBER | 2020 | suyashsingh@bcc.in |
| Mr. Syed Taha Pasha | PATRON | MEMBER | 2021 | syedtahapasha@bcc.in |
| Dr. Sandeep Jain | PREMIUM | MEMBER | 2022 | sandeepjain@bcc.in |
| Dr. Sanjay Kumar Shukla | PATRON | MEMBER | 2022 | sanjayshukla@bhopal.info |
| Dr. Animesh Saxena | PREMIUM | MEMBER | 2023 | dranimeshsaxena@gmail.com |
| Akshita Jain | PREMIUM | MEMBER | 2023 | akshitajain@bcc.in |
| Sauvik Acharyya | MENTOR | MEMBER | 2023 | sauvikacharyya@bcc.in |

### Inactive / GUEST members -- CONFIRMED 2026-07-01

MIGRATE as Registered Users (identity only, no membership record):
| Name | Email | Year | Reason to keep |
|---|---|---|---|
| Afzal Khan | afzalkhan@bcc.in | 2017 | Portfolio photos requested -- keep identity |
| Priya Ojha | priyaojha@bcc.in | 2018 | Portfolio photos requested -- keep identity |

DISCARD (do not migrate -- confirmed seed/test data):
| Name | Email | Year | Reason |
|---|---|---|---|
| Rahul Kahar | rahulkahar@bcc.in | 2020 | Seed data |
| Prakash Writer | prakash@bcc.in | 2020 | Seed data |
| Salil Jain | saliljain@bcc.in | 2022 | Seed data |
| Anil Guest | anil.guest@gmail.com | 2026 | Test account |

---

## 4. Field-by-Field Mapping

### 4.1 bcc_photographers -> users (identity layer)

| Legacy Column | V3 Target | Notes |
|---|---|---|
| id (UUID) | user_id | Reuse directly |
| username | username | Direct carry |
| password | password_hash | POLICY: migrate as bcrypt("Bcc2026!") -- force-reset on first login |
| display_name | display_name | Direct |
| first_name | first_name | Direct |
| surname | last_name | Rename |
| suffix | name_suffix | Direct |
| email | email | Direct |
| phone | phone | Direct |
| avatar_url | avatar_url | Path format changes -- see s5 |
| cover_photo_url | Profile module | Carry |
| address_line1/2/3 | address_line1/2/3 | Direct |
| city, state, pin_code | Direct | |
| bio, tagline | Direct | |
| gender | gender | Expand enum in V3 |
| blood_group | blood_group | Direct |
| emergency_contact_* | emergency_contact_* | 3 fields direct |
| social_links (JSON) | social_links | Direct |
| gear_bag, equipment | Photographer profile module | |
| sub_genres, areas_of_expertise, favorite_subjects | Photographer profile module | |
| preferred_camera_system, website_url | Photographer profile module | |
| distinctions (JSON) | Recognition module | Review per field |
| bcc_info (JSON) | Membership module | Review per field |
| privacy_settings (JSON) | User settings | Carry |
| gallery_layout | Gallery module preference | Carry |
| niche | primary_genre | ENUM values match design categories |
| year_joined | Used for membership_number YYYY | Critical for MEM-007 |
| slug | username/profile URL slug | Harmonise with V3 URL scheme |
| is_active | users.status | active=1->ACTIVE, active=0->INACTIVE pending review |
| created_at | users.created_at | Direct |
| membership_tier | DISCARD for class assignment | See s4.2 |
| role | -> RBAC system | See s4.3 -- NOT in users table |

### 4.2 Membership Class Assignment -- CONFIRMED POLICY

POLICY (confirmed 2026-07-01):
  ALL 21 legacy members (regardless of legacy tier) migrate as Basic Member in V3.
  Legacy PATRON/MENTOR/PREMIUM tiers have NO bearing on V3 constitutional class assignment.
  Rajnish will manually upgrade each person to the correct V3 class via the admin panel
  after migration, based on actual governance decisions.

  This applies without exception:
  - Old PATRON -> Basic Member (not V3 Patron Member)
  - Old MENTOR -> Basic Member (recognition assigned separately via governance track)
  - Old PREMIUM -> Basic Member
  - Old GUEST -> Registered User only (no membership record)

### 4.3 legacy role -> V3 RBAC

| Legacy role | V3 RBAC Role | Current holders |
|---|---|---|
| SUPER_ADMIN | Super Admin | Rajnish Khare |
| COORDINATOR | Coordinator | None currently |
| ADMIN | Platform Admin | None currently |
| MEMBER | (no RBAC needed) | Standard members |
| AUTHOR | Content Editor | Prakash Writer (inactive, pending approval) |
| JUDGE | Judge | None currently |
| CURATOR | Exhibition Curator | Uttam Gurjar |

NOTE: RBAC role migration (Super Admin for Rajnish, Curator for Uttam Gurjar) will be
applied during Track C alongside membership migration. All others get no RBAC role.

### 4.4 seniority_level -> V3 Recognition

NOTE: All 15 active members currently have seniority_level = NONE.
No recognition records need to be migrated for the current member set.
Future recognition assignments will be made via the V3 governance track (admin panel).

Reference mapping for completeness:
  HONORARY_EXPERT -> Honorary Member (GOVERNANCE track, no direct V3 equivalent)
  HONORARY_MENTOR -> Honorary Mentor (GOVERNANCE track)
  HONORARY_GRANDMASTER -> Honorary Grandmaster (GOVERNANCE track)

### 4.5 membership state -> memberships.state

| Legacy status | V3 state |
|---|---|
| active | ACTIVE |
| pending | PENDING |
| approved | APPROVED |
| expired | EXPIRED |
| terminated | TERMINATED |

CRITICAL: valid_until is NULL for ALL 15 active members. No expiry dates on record.
Options for migration:
  (a) 31-Dec-2026
  (b) 1 year from migration date
  (c) Migrate ACTIVE, flag each record for admin renewal confirmation
PENDING GOVERNANCE DECISION -- non-blocking until Track C runs.

### 4.6 bcc_photographer_photos -> gallery

| Legacy Column | V3 Target | Notes |
|---|---|---|
| id | photo_id | Reuse UUID |
| photographer_id | user_id | Rename FK |
| image_url (/uploads/ts-hash.ext) | r2_key + ImageKit URL | See s5 |
| title, description | Direct | |
| width, height | Direct | |
| display_order | Direct | |
| camera_make, camera_model | exif_camera_make, exif_camera_model | |
| lens, aperture, shutter_speed, iso, focal_length | exif_* fields | |
| created_at | uploaded_at | |

New V3 fields (set defaults on migration): visibility=members_only, watermark_flag=true,
download_permission=false, album_id=null, gps_lat=null, gps_lng=null, perceptual_hash=null.

### 4.7 bcc_ledger_transactions -> Financial module

Schema is DIRECTLY REUSABLE. Carry all columns as-is.
Only change: user_id FK references users.user_id instead of bcc_photographers.id.

### 4.8 bcc_events -> Events module

| Legacy Column | V3 Target | Notes |
|---|---|---|
| id, title, slug | Direct | |
| type (Photowalk/Workshop/Tour) | event_type | Carry as-is, V3 expands later |
| start_date, end_date | Direct | |
| location (string) | location_text | V3 maps pin = NULL on migration |
| description, price | Direct | |
| registration_cap | capacity | |
| allow_online, allow_cash | Payment config flags | |
| is_installment_plan | Payment config flag | |

New V3 fields (defaults): eligibility_setting=members_only, volunteer_slots=0,
difficulty=null, age_restriction=null.

---

## 5. Storage Gap -- Photo Assets

Database: 311 photo records
Local disk (/var/www/bcc.bhopal.info/public/uploads/): 1 file only
Conclusion: 310 of 311 photos are in Cloudflare R2 (bccuploads bucket) via ImageKit.

MIGRATION ACTION (Track B): List R2 bucket keys, verify all 311 photos are present.
No file movement needed -- bccuploads is the same bucket V3 will use.
Only change: harmonise image_url to V3 R2 key format.

---

## 6. Password Policy (CONFIRMED)

Legacy: plaintext "bcc2026" stored in password column -- a security risk.

V3 POLICY (confirmed 2026-07-01):
  Migration script will bcrypt-hash the string "Bcc2026!" and store the hash.
  All migrated users will be flagged: password_reset_required = true.
  On first V3 login, users are redirected to set a new password before proceeding.
  No plaintext password is stored or logged at any point in V3.

---

## 7. Membership Number Construction

Per MEM-007 confirmed format: BCC + YYYY + MM + 5-digit serial
Month UNKNOWN for all legacy members (only year_joined stored).
Per MEM-007 s5: default month = 01 when historical month unavailable.
All members start on BCCTempXXXXX. Permanent numbers assigned after committee decisions on
Founding (00001-00007) and Historical Block (00008-00020) allocations.

Example permanent format when assigned:
  Rajnish Khare (2016) -> BCC201601XXXXX
  Kshitij Patle (2017) -> BCC201701XXXXX
  (all others: BCC{year_joined}01XXXXX)

---

## 8. Remaining Open Questions (non-blocking until Track C)

1. GUEST members -- RESOLVED 2026-07-01:
   Migrate as Registered Users: Afzal Khan, Priya Ojha (portfolio photos pending)
   Discard: Rahul Kahar, Prakash Writer, Salil Jain, Anil Guest (seed/test data)

2. valid_until for active members: What expiry date to assign?
   (a) 31-Dec-2026  (b) 1 year from migration date  (c) Flag for admin review

3. Founding Member serials 00001-00007: Which member gets which number?
   (Deferred -- all start on BCCTemp, committee decides when ready)

4. Historical Block 00008-00020: Which members qualify?
   (Deferred -- committee decision)

---

## 9. Migration Tracks Dependency Summary

| Track | Status | Dependency |
|---|---|---|
| Track A -- Discovery & field mapping | COMPLETE | None |
| Track B -- Assets & public content | READY TO START | Track A complete, R2 access confirmed |
| Track C -- Membership data | Phase 1-2 | Phase 1 NestJS module + s8 governance answers |
| Track D -- Cutover | Phase 3 | Track C complete + V3 modules verified |
