# BCC Unified Platform V3 — Stage 7 · Batch B1 (URGENT)

> Paste everything below the line into a fresh Claude Code session on this repo.
> It is self-contained. Technical context (file paths, root causes, legacy
> tables) was gathered on 2026-07-14 and is accurate as of commit `016b808`.

---

You are working on the BCC Unified Platform V3. This is **Stage 7 — Batch B1**,
a set of urgent fixes and small features. It is a reconciliation/repair pass, not
a redesign. Some items are regressions where earlier work is not visible.

## GROUND RULES (read first)

Obey the ground-truth hierarchy in `CLAUDE.md`. Authoritative documents:

- Governance: `ProjectDocs/Governance/Bootstrap.md`, `SOURCE_INDEX.md`,
  `TECH-STACK-FREEZE.md`, `PHASE_ROADMAP.md`
- Membership: `ProjectDocs/Membership/MEM-006…`, `MEM-007…`
- Architecture: `ProjectDocs/Architecture/HUB_COMPONENT_ARCHITECTURE_FREEZE_v1.0.md`,
  `PHOTO-ASSET-ARCHITECTURE_FREEZE_v1.0.md` (**PHOTO-ARCH-001 — mandatory for any
  Stories/Collections/gallery/upload work**)
- Design authority: `ProjectDocs/DesignSystem/V6/…`, and the V6 wireframes under
  `ProjectDocs/Wireframes/V6/` (notably `05 Photographers Public Profile`,
  `03 Showcase`, `09 Hub Home`, `10 Hub Portfolio`, `11 Hub Upload`)

Operating rules: do NOT redesign, modernize, simplify, or reinterpret wireframes.
Wireframe wins on any conflict. Follow MEM-006/007 and the Tech Stack Freeze
(Astro static frontend, NestJS/Fastify + Kysely backend, MySQL, R2, ImageKit).
Audit first, code second, smoke-test third. Work in phases; run a build after
each phase; report audit findings → root cause → files changed → why →
implementation → evidence → build result → remaining risks.

## ENVIRONMENT NOTES (confirmed this session)

- Backend port **3001**; every controller declares its own `api/v1/` prefix.
- Deploy: push to `master` → GitHub Actions → server `deploy.sh` (build + PM2
  restart). **The deploy pipeline does NOT run DB migrations** — apply them
  manually with `bash scripts/run_migrations.sh` on the server (it skips already-
  recorded files). New untracked files placed on the server block `git pull` —
  don't leave scp'd files at committed paths.
- SSH: `ssh -i <BCCAWS.pem> ubuntu@52.66.167.85`. Legacy DB `bcc` is readable by
  `bcc_v3_app` on the same MySQL server; V3 DB is `bcc_v3`. Legacy image files
  live in the **same R2 bucket `bccuploads`** under `uploads/avatars/`,
  `uploads/covers/`, and photo prefixes; ImageKit serves them at
  `https://ik.imagekit.io/duynda7oq/<r2_key>`.

---

# ITEMS

## 67 — Fix "View public portfolio" link (regression)

**Where:** `frontend/src/pages/hub/portfolio/index.astro`, `loadProfileLink()`
(~line 1410): `link.href = \`/photographers/${me.id}/\`;` uses the numeric id →
produces `/photographers/1/`.

**Fix:** use the username: `link.href = \`/photographers/${me.username}/\`;`
Confirm `GET /api/v1/users/me` returns `username` (the hub home page already
links correctly with username). Hide/disable the link if username is missing.

**Acceptance:** the link on `/hub/portfolio/` opens the member's real
`/photographers/{username}/` page.

---

## 68 — Hub Home: "Your Stories & Collections" section (top) + creation thumbnails

**Where:** `frontend/src/pages/hub/index.astro` (main content currently has
"Your Latest Work", "Happening at the Club", membership card, etc.).

**Required:**
1. Add a **"Your Stories & Collections"** section and place it **above
   everything** in the main content area. Each item shows a **thumbnail** (one
   image from the story/collection) with the **story/collection name beneath**.
   Data source already exists: `GET /api/v1/gallery/albums` (own albums) returns
   `title`, `kind`, `photo_count`, and `cover_image_url` (falls back to the
   most-recent photo in the container).
2. In story/collection **creation** (portfolio page modal — see item 69), add
   **thumbnail selection** (choose a cover from the container's photos → the
   album `cover_photo_uuid` via `PATCH /api/v1/gallery/albums/:uuid`) and a
   **default fallback thumbnail** for containers with no photos/cover yet
   (a branded placeholder, radius-0, per design tokens).

**Acceptance:** Hub Home shows the member's stories/collections at the very top
with thumbnails + names; creation lets the user pick a cover and always renders
a sensible fallback.

---

## 69 — Portfolio: smaller collection cards + richer fields + Story/Collection definition

**Where:** `frontend/src/pages/hub/portfolio/index.astro` — the
"Collections & Stories" panel added in item 53. Cards are currently ~210px wide.

**Required:**
1. **Shrink** the collection/story cards to the **same size as portfolio grid
   photos** (match `.port-grid` card sizing; do not let them dominate the page).
2. Story/Collection metadata must support: **title, eyebrow, subtitle,
   description, and genre selection** (genre from the taxonomy in item 71).
   Today the create/edit modal + `photo_albums` only have title, description,
   kind, visibility, cover. Add columns `eyebrow`, `subtitle`, `genre` to
   `photo_albums` (new migration), extend `CreateAlbumDto`/`UpdateAlbumDto`,
   `gallery.service` create/update + `formatAlbum`, `db.ts` types, and the modal.
3. Produce a **written definition of Story vs Collection** — how they differ,
   with **no ambiguity** — and record it (propose adding to
   `PHOTO-ARCH-001` addendum or a new `ProjectDocs/Architecture/STORY_VS_COLLECTION.md`;
   confirm placement, since ProjectDocs are governance). Suggested distinction to
   validate with the owner: a **Collection** is an unordered/curated grouping of
   photos around a theme; a **Story** is an ordered narrative sequence with
   eyebrow/subtitle/description framing. Both are PHOTO-ARCH-001 Containers that
   *reference* canonical photos.
4. Two public wireframes will follow — **VS 22 Story Public Page** and
   **VS 23 Collection Public Page**. Do NOT build the public pages in this batch
   unless the wireframes are provided; scaffold data/fields so they're ready.

**Acceptance:** cards are photo-sized; create/edit captures title/eyebrow/
subtitle/description/genre; the Story-vs-Collection definition exists and is
unambiguous.

---

## 70 — Photographer profile gallery = Showcase gallery (discard current rules)

**Where:** profile grid in `frontend/src/pages/photographers/[username].astro`
(currently `buildProfileRows()`, fetches up to 500 at once). Source of truth to
**inherit from**: `frontend/src/pages/showcase.astro` (the `/showcase` gallery).

**Required:** **Discard the profile's current gallery rules entirely** and
inherit the Showcase justified-grid behaviour **exactly**, including all its
features, but showing **more photographs** (of that one photographer) rather than
photographers. Pagination: **initial view 20 photos, +20 per increment**
(load-more), matching Showcase. Reuse Showcase's justified-row algorithm, hover
treatment, lightbox/lightbox-context, and load-more control so the two stay
identical. Photo source stays `GET /api/v1/gallery/photographer/:userId` (add
limit/offset paging to match Showcase's paging if needed).

**Acceptance:** `/photographers/{username}` gallery is visually and behaviourally
identical to `/showcase`, scoped to that photographer, 20-at-a-time.

---

## 71 — Photo genre/category: import legacy + add taxonomy + enable filtering

**Regression/gap:** V3 upload has no genre/category selector; legacy had one and
photos were categorised.

**Legacy source (confirmed):**
- `bcc.bcc_categories` (id uuid, `name`, `slug`) — 12 categories: Architecture,
  Astro, Black & White, Event, Landscape, Macro, Monuments, Portfolio, Portrait,
  Street, Travel, Wildlife.
- `bcc.bcc_photo_categories` (`photo_id`, `category_id`) — **421 assignments
  across 315 photos** (many categories per photo).
- Legacy photos: `bcc.bcc_photographer_photos` (keyed by `id` uuid; has
  `image_url`, `title`, EXIF). **A legacy-photo → V3-photo identity mapping must
  be established first** (e.g. via `image_url`/r2 key/title+owner) before
  categories can be re-attached — flag if no reliable key exists.

**Target taxonomy (20):** the 12 legacy names **plus** Food, Nature, Product,
Fashion, Fine Art, Sports, Aerial, Documentary.

**Design decision required (Taxonomy — roadmap PHASE H):** V3 currently has a
single-value `photos.genre` ENUM (WILDLIFE, BIRD, STREET, PORTRAIT, LANDSCAPE,
ARCHITECTURE, MACRO, NIGHT, TRAVEL, AERIAL, UNDERWATER, ABSTRACT, DOCUMENTARY,
SPORT, OTHER) **and** many-to-many `photo_tags` / `photo_tag_assignments` tables
(category `GENRE|SUBJECT|LOCATION|EQUIPMENT|CUSTOM`). Legacy is many-per-photo.
**Do not guess** — decide with the owner whether categories are modelled as
multi-select tags (`photo_tags`, recommended — matches legacy + PHOTO-ARCH-001)
or a widened single ENUM. This is Phase-H taxonomy territory; STOP and confirm
the model before migrating.

**Required (after model confirmed):**
1. Seed the 20-category taxonomy.
2. Import legacy per-photo categories and re-attach to the mapped V3 photos.
3. Add the genre/category selector to the V3 **Upload Studio**
   (`frontend/src/pages/hub/upload/index.astro`) and Portfolio edit inspector.
4. Enable **category/genre filtering** in the gallery surfaces (Showcase,
   photographer profile, portfolio) — the directory/gallery already accept a
   `genre` filter param; extend to the chosen model.

**Acceptance:** members can pick categories on upload; legacy categories are
re-attached to migrated photos; users can filter photos by category/genre.

---

# IMPLEMENTATION REQUIREMENTS

- Work in logical phases; do not produce one massive commit. Cheapest/safest
  wins first (67 is a one-line fix; 68/69/70 are frontend + small backend; 71 is
  the largest and gated on the taxonomy decision).
- Run `npm run build` (frontend) and `npx tsc --noEmit` (backend) after each
  phase.
- Data migrations: write idempotent, fill-if-empty scripts under `scripts/`
  (mirror `migrate_legacy_profile_data.js` / `migrate_legacy_avatars.js`), DRY_RUN
  first, then apply on the server. Add schema changes as numbered
  `database/migrations/00NN_*.sql` and apply via `run_migrations.sh`.
- If blocked (esp. item 69 definition, item 71 taxonomy model, or the legacy→V3
  photo mapping), STOP for that blocker with root cause + recommendation; keep
  going on the rest.

# SUCCESS CRITERIA

✓ 67 public-portfolio link uses username
✓ 68 Hub Home shows Stories & Collections on top with thumbnails; creation has
  cover selection + fallback
✓ 69 photo-sized cards; title/eyebrow/subtitle/description/genre; unambiguous
  Story-vs-Collection definition recorded
✓ 70 photographer gallery inherits Showcase justified grid + 20/20 load-more
✓ 71 taxonomy model decided; legacy categories imported & re-attached; upload
  selector; category filtering works
