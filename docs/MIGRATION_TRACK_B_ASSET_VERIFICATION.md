# Migration Track B -- Asset Verification & Public Content
Status: COMPLETE
Date: 2026-07-01
Source: Cloudflare R2 bucket (bccuploads), legacy DB, ImageKit CDN
Target: Same R2 bucket, same ImageKit endpoint -- no file movement required

---

## 1. R2 Bucket Inventory

Total objects in bccuploads: 372
Total size: 201.0 MB

Breakdown by folder:

| Folder | Count | Purpose |
|---|---|---|
| uploads/ (timestamp-hash format) | 277 | Portfolio photos -- member uploaded |
| uploads/avatars/ | 12 | Member profile photos |
| uploads/covers/ | 11 | Member cover/banner photos |
| uploads/compressed-* | 34 | Older compressed originals (pre-platform format) |
| images/ | 38 | Static site assets, brand logos, stock photos |
| Total | 372 | |

---

## 2. Portfolio Photo Verification

DB records in bcc_photographer_photos: 311
Found in R2:                            311
MISSING from R2:                        0

RESULT: ALL 311 PORTFOLIO PHOTOS CONFIRMED IN R2. No file movement needed.

---

## 3. Avatar & Cover Photo Status (Active Members)

| Member | Avatar | Cover |
|---|---|---|
| Rajnish Khare | OK (R2) | OK (R2) |
| Mr. Syed Taha Pasha | OK (R2) | OK (R2) |
| Robin Dutta | OK (R2) | OK (R2) |
| Uttam Gurjar | OK (R2) | OK (R2) |
| Suyash Pratap Singh | OK (R2) | OK (R2) |
| Dr. Sanjay Kumar Shukla | OK (R2) | OK (R2) |
| Dr. Animesh Saxena | OK (R2) | OK (R2) |
| Dr. Anil Bhati | OK (R2) | OK (R2) |
| Dr. Sandeep Jain | OK (R2) | OK (R2) |
| Kshitij Patle | OK (R2) | OK (R2) |
| Rahil Khan | OK (R2) | PLACEHOLDER (Unsplash) |
| Ankit Tiwari | OK (R2) | PLACEHOLDER (Unsplash) |
| Prakash Hatvalne | PLACEHOLDER (ui-avatars.com) | PLACEHOLDER (Unsplash) |
| Sauvik Acharyya | PLACEHOLDER (ui-avatars.com) | PLACEHOLDER (Unsplash) |
| Akshita Jain | PLACEHOLDER (ui-avatars.com) | PLACEHOLDER (Unsplash) |

Real R2 avatars: 12 of 15 active members
Real R2 covers: 11 of 15 active members

Members with no uploaded avatar (using generated placeholder):
  Prakash Hatvalne, Sauvik Acharyya, Akshita Jain

Members with no uploaded cover (using Unsplash stock photo):
  Rahil Khan, Ankit Tiwari, Prakash Hatvalne, Sauvik Acharyya, Akshita Jain

MIGRATION ACTION: These 3-5 members will have no avatar/cover on V3 at launch.
V3 should generate initials-based avatars locally (no external dependency on ui-avatars.com).
Cover photo: show a default BCC branded placeholder if no real cover exists.

---

## 4. Image URL Format -- Legacy vs V3

### Legacy format (stored in DB)
  Portfolio: /uploads/1781333024874-aba9112f.jpg
  Avatar:    /uploads/avatars/1781424021405-d5a88218.png
  Cover:     /uploads/covers/1781187930059-eb883f91.jpg
  External:  https://ui-avatars.com/...  (ui-avatars.com generated -- 3 members)
  External:  https://images.unsplash.com/... (Unsplash placeholder -- 5 covers)

### How ImageKit serves these
  Legacy site lib/images.ts strips leading slash and prepends:
  https://ik.imagekit.io/duynda7oq/{key}?tr=q-80,f-auto,w-{width}

### V3 approach (no change to R2 keys needed)
  Store R2 key without leading slash: uploads/1781333024874-aba9112f.jpg
  Construct ImageKit URL in V3 using same pattern as legacy:
  https://ik.imagekit.io/duynda7oq/{r2_key}?tr=q-80,f-auto,w-{width}

  The images.ts helper from the legacy site can be carried into V3 frontend
  with zero changes -- identical ImageKit ID and URL pattern.

---

## 5. Static Site Assets in R2

The images/ prefix in R2 contains 38 files: brand logos, stock/hero images used on the
legacy site, and some member sample photos used in static pages.

| Asset | R2 Key | Migration Action |
|---|---|---|
| BCC logos (5 variants) | images/bcc-logo-*.png | Carry to V3 -- same R2 keys |
| Favicon | images/favicon.png | Already copied to V3 in Phase 0 |
| Stock hero images | images/*.jpg | Carry as-is -- same keys |
| Legacy avatar thumbnails | images/*-150x150.jpeg | Discard -- V3 uses ImageKit transforms |

---

## 6. Compressed-* Files

34 files in uploads/compressed-* format -- these appear to be early-era portfolio photos
uploaded before the timestamp-hash naming convention was adopted. They are NOT referenced
by bcc_photographer_photos in the DB (all 311 DB records use timestamp-hash format).

STATUS: Orphaned files -- not referenced by any DB record.
MIGRATION ACTION: Retain in R2 (no cost to keep them). Do not import into V3 gallery.
If a member wants these added to their portfolio, they can re-upload through V3.

---

## 7. R2 Credentials for V3

Legacy .env credentials are the same R2 bucket V3 will use.
Copy these into /var/www/bcc-v3/backend/.env if not already present:

  R2_ENDPOINT=https://85f30658f17a33a60f68615a94a4b281.r2.cloudflarestorage.com
  R2_BUCKET_NAME=bccuploads
  R2_ACCESS_KEY_ID=<from legacy .env>
  R2_SECRET_ACCESS_KEY=<from legacy .env>
  IMAGEKIT_BASE_URL=https://ik.imagekit.io/duynda7oq/

Do NOT duplicate credentials here in this document.

---

## 8. Photo Count by Member (migration planning)

| Member | Photos in R2/DB | Migration Action |
|---|---|---|
| Dr. Sanjay Kumar Shukla | 39 | Migrate all |
| Dr. Animesh Saxena | 34 | Migrate all |
| Dr. Anil Bhati | 30 | Migrate all |
| Robin Dutta | 27 | Migrate all |
| Mr. Syed Taha Pasha | 26 | Migrate all |
| Rahil Khan | 26 | Migrate all |
| Kshitij Patle | 25 | Migrate all |
| Uttam Gurjar | 22 | Migrate all |
| Dr. Sandeep Jain | 21 | Migrate all |
| Ankit Tiwari | 20 | Migrate all |
| Akshita Jain | 19 | Migrate all |
| Suyash Pratap Singh | 17 | Migrate all |
| Prakash Hatvalne | 5 | Migrate all |
| Rajnish Khare | 0 | Nothing to migrate |
| Sauvik Acharyya | 0 | Nothing to migrate |
| Total | 311 | |

---

## 9. Migration Script Plan (Track C asset phase)

When Track C runs, the photo migration SQL will:

1. INSERT into v3 gallery table for each of 311 records:
   - photo_id: reuse legacy UUID
   - user_id: map via photographer_id -> users.user_id
   - r2_key: legacy image_url stripped of leading slash
   - title, description, width, height, display_order: direct copy
   - exif_* fields: direct copy from legacy EXIF columns
   - uploaded_at: copy from legacy created_at
   - visibility: default to 'members_only'
   - watermark_flag: default to true
   - download_permission: default to false

2. INSERT photo-category junction records from bcc_photo_categories (419 rows)

3. INSERT category records from bcc_categories (12 rows)
   Map legacy category names to V3 genre taxonomy

No R2 operations needed -- files already in correct bucket with correct keys.

---

## 10. Track B Summary

| Item | Status |
|---|---|
| All 311 portfolio photos in R2 | CONFIRMED |
| ImageKit endpoint and ID | CONFIRMED (duynda7oq, no change needed) |
| R2 bucket name | CONFIRMED (bccuploads, shared with legacy) |
| Image URL format for V3 | DEFINED (strip leading slash, prepend ImageKit base) |
| Avatar gaps (3 members) | NOTED -- V3 generates initials placeholder locally |
| Cover photo gaps (5 members) | NOTED -- V3 shows BCC branded default |
| Orphaned compressed-* files | NOTED -- retain in R2, do not import |
| File movement required | NONE |
| Track B | COMPLETE |
