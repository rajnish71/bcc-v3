# Stage 7 — Batch A & B Implementation

**Date:** 2026-07-14
**Type:** Reconciliation (not redesign)
**Commit:** `f97086e` — pushed to `master`, deployed to production
**Scope:** Photographer Profile + Member Hub — items 45–53

---

## Outcome

All nine work items (45–53) implemented, build-verified (backend `tsc` clean;
frontend 65 pages), committed, deployed, and validated on production. Two
database migrations and one Nginx change applied to the live server.

---

## Items delivered

| # | Item | Result |
|---|---|---|
| 45 | Profile field migration + debug removal + live stats | Removed `⊘ MEM-006` debug box; render migrated **recognition badge** + **awards_html fallback** on public profile; live `contestAwards` (counts `user_awards`) + `activityScore` (interim composite) |
| 46 | Temporary membership card | `BCCTempXXXXX` (MEM-007 §6, from membership id, display-only) shown on Hub Home card + Hub Profile |
| 47 | Numbering prep (MEM-007) | Verified existing immutability (trigger 0009) + sequential + temp-retirement; added migration `0059` — hard-delete guard on numbered memberships (MP-003) |
| 48 | 16:5 banners | Both `/photographers/{username}` and `/hub/profile` — fixed 16:5, `object-fit:contain`, no vertical crop |
| 49 | Public gallery hover | Matches homepage: dark overlay + viewfinder corners + caption slide-up; no captions beneath; justified rows aligned |
| 50 | Hub Profile reconciliation | Converted 10-section long-scroll → **true tab-panels** (each tab shows only its content). See override note below |
| 51 | Member edit/save | Verified in code — `AccessTokenGuard` only (JWT + ACTIVE), no RBAC on `/hub/profile` routes; any active member can save |
| 52 | Auto photographer page creation | Already client-rendered + `_profile` fallback shell; added Nginx `try_files` fallback so new members resolve with **no rebuild** |
| 53 | Stories/Collections + Journal links | Full build on existing album Container tables (PHOTO-ARCH-001 compliant); `kind` column (`0060`); journal-by-author endpoint; public Stories strip + Journal section; Hub Portfolio create/manage UI |

---

## Files changed (commit f97086e — 13 files, +816/−93)

**Backend**
- `backend/src/database/db.ts` — `photo_albums.kind` type
- `backend/src/modules/gallery/dto/album.dto.ts` — `kind` on create/update DTOs
- `backend/src/modules/gallery/gallery.service.ts` — `kind` wiring + cover image URL in `listAlbums`
- `backend/src/modules/hub/profile/hub-profile.service.ts` — temp number display, live stats
- `backend/src/modules/journal/journal.service.ts` — `listByAuthor`
- `backend/src/modules/journal/journal.controller.ts` — `GET /api/v1/journal/author/:userId`

**Frontend**
- `frontend/src/pages/photographers/[username].astro` — recognition badge, awards_html fallback, 16:5 banner, homepage-style hover, Stories strip, Journal section
- `frontend/src/pages/photographers/index.astro` — removed debug box + CSS
- `frontend/src/pages/hub/profile/index.astro` — temp number, 16:5 cover, tab-panel refactor
- `frontend/src/pages/hub/index.astro` — temp number on membership card
- `frontend/src/pages/hub/portfolio/index.astro` — Collections/Stories create/edit/delete + Add-to-Collection

**Migrations**
- `database/migrations/0059_prevent_hard_delete_numbered_memberships.sql`
- `database/migrations/0060_add_kind_to_photo_albums.sql`

---

## Production server actions (bhopal-prod-01, 52.66.167.85)

1. **Migrations applied** via `scripts/run_migrations.sh`:
   - Recorded pre-existing drift: `0058_add_photo_view_count` was applied to the
     DB but never recorded in `schema_migrations` (would have blocked the runner
     on a duplicate-column error). Column verified present; recorded as applied.
   - Applied `0059` (trigger) + `0060` (`kind` column). Both verified.
2. **Nginx** — added `location /photographers/` `try_files` fallback to
   `bcc.bhopal.info` and `v3bcc.bhopal.info` (backups: `*.bak.stage7`).
   `nginx -t` passed; reloaded.
3. **Verification** — PM2 `bcc-v3-backend` online; deploy at `f97086e` (502
   pages). Direct nginx test (`--resolve`, bypassing edge bot-protection):
   known slug → 200; unknown slug → 200 serving the `_profile` shell. API smoke
   tests (`/photographers/:username`, `/gallery/albums/user/:id`,
   `/journal/author/:id`) all 200.

---

## Notes / decisions to review

- **Item 50 override:** V6 13 wireframe specifies *scroll-anchored* sections;
  the item-50 feedback ("each tab displays only its own content", "remove
  unnecessary scrolling") directly overrides that. Implemented tab-panels while
  keeping the wireframe's visual layout/fields intact. Documented as an override
  consistent with the file's existing OVERRIDES header.
- **`activityScore` formula** (item 45) is interim (`photos + events×2 +
  awards×3`) — the canonical engagement score is a Phase-3 concern.
- **`contestAwards`** currently counts `user_awards`; a true contest-awards
  count depends on the Phase-2b Contest module.
- Public HTTPS hostname sits behind an edge/bot-protection layer that 403s
  automated `curl`; real browsers are unaffected.

---

## Follow-ups (not blocking)

- Live end-to-end test of a non-admin member saving all profile fields (item 51
  verified in code; runtime confirmation pending).
- When the Contest module lands (Phase 2b), wire real contest-award counts.

---

## Addendum — Legacy profile DATA migration (same day, commit `016b808`)

The 2026-07-12 audit confirmed the *plumbing* existed but its own population
table showed most fields empty — the actual legacy DATA had never been copied
into `bcc_v3`. Fixed by sourcing from the legacy `bcc` DB (same MySQL server,
readable by `bcc_v3_app`).

**Scripts (idempotent, fill-if-empty, DRY_RUN support):**
- `scripts/migrate_legacy_profile_data.js` — bio (->HTML), tagline, website,
  preferred camera, year joined, genres (niche+sub_genres), areas_of_expertise,
  favourite_subjects, awards_html (distinctions.awards ->list), user_gear
  (equipment JSON), user_photo_titles (distinctions), user_social_handles.
- `scripts/migrate_legacy_avatars.js` — wires `user_avatars`/`user_cover_photos`
  to legacy images already in R2 under `uploads/avatars/` & `uploads/covers/`
  (ImageKit serves them; no file copy). Skips ui-avatars/unsplash placeholders.

**Matching:** `bcc_photographers.username` -> `users.username`, falling back to
exact `full_name = display_name` (legacy usernames were regenerated for some V3
users, e.g. `sanjayshukla` -> `sanjaykumarshukla`, `suyashsingh` ->
`suyashpratapsingh`). System accounts (`admin`, `guestuser`, `writer`) skipped —
the legacy `admin` row carries display_name "Rajnish Khare" but placeholder data.

**Applied to prod:** 17 members text/structured (14 bios, 55 gear rows, 1
awards_html; titles/social skipped where members already had rows); 9 avatars
wired. Unmatched: 3 inactive legacy placeholders with no V3 user (priyaojha,
rahulkahar, saliljain).

**Rail reconciled to V6 05** "Profile at a Glance": Member Since · Membership
Class · Primary Genre · Areas of Expertise · Favourite Subject · Preferred
Camera · Distinctions & Awards · Equipment Bag. Public API now returns
`favouriteSubjects`. Social handles remain in the About tab per the wireframe.

**Known gap:** legacy avatar/cover files that were only ever placeholder URLs
(ui-avatars/unsplash) were not migrated — those members show initials until they
upload via the Hub. The `bio` for members not present as active V3 users, and
the 3 inactive legacy accounts, were not migrated (no V3 user to attach to).
