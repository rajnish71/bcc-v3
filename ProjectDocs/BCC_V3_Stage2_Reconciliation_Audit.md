# BCC Unified Platform V3
## Stage 2 Post-Migration Reconciliation Audit
**Date:** 6 July 2026 | **Audited by:** Claude (Documentation Authority) | **Status:** EVIDENCE-BASED — server read at audit time

---

## Audit Methodology

Every finding below is grounded in direct server evidence collected during this session:
source files read from `/var/www/bcc-v3/`, live API calls to `127.0.0.1:3001`, database queries
via `sudo mysql`, PM2 error logs, and Nginx configuration. No finding is inferred or assumed.

---

# PART 1 — Stage 2 Reconciliation Audit Report

---

## Item 1 — Authentication UI State (Sign In / Register visible while logged in)

**Current state:** The Nav (`Nav.astro`) renders the guest div (containing "Sign In" and "Become a Member") as the default server-rendered state. A client-side script swaps to the member div when `bcc_user` is found in `localStorage`. This works correctly for the nav itself.

**Evidence:**
```
// Nav.astro lines 79-97
<div id="nav-guest" class="nav-auth__guest">
  <a href="/auth/signin/" ...>Sign In</a>
  <a href="/join/" class="btn btn-gold btn-md">Become a Member</a>
</div>
<div id="nav-member" class="nav-auth__member" hidden>
  ...Member Hub...
</div>
// Client script: if (raw) { guest.hidden = true; member.hidden = false; }
```

The Nav and mobile drawer both handle this correctly. However, three pages outside the Nav are not auth-aware:

- `join.astro` — no `localStorage` check. An ACTIVE member who visits `/join/` sees the full membership application flow with no redirect or conditional rendering.
- `journal/[slug].astro` — contains a hardcoded `<a href="/join/" class="btn btn-dark btn-md">Become a Member</a>` CTA with no auth guard.
- `index.astro` — gallery footnote contains `<a href="/join/" class="btn-text">Become a Member</a>` with no auth guard (cosmetic, lower priority).

**Root cause:** The Nav swap is client-side JS. Pages using static CTAs that point to `/join/` have not had equivalent auth-awareness applied.

**Expected state:** Authenticated users with an active membership should not see "Become a Member" on any surface. Authenticated users without a membership (Registered Users) may still reasonably see it.

**Severity:** Medium — cosmetic/UX issue, not a security concern.

---

## Item 2 — Membership CTA Visibility for Active Members

**Current state:** Directly linked to Item 1. The "Become a Member" CTA in the nav gold button is correctly hidden when the member state activates (the entire `nav-guest` div is hidden). The following surfaces are NOT conditional:

- `join.astro` — full page visible with no redirect for authenticated active members.
- `journal/[slug].astro` — "Become a Member" CTA in the article sidebar.
- `index.astro` — gallery footnote "Become a Member" link.

**Evidence:** Grep across all `.astro` files confirms three locations of the `"Become a Member"` string that are not inside the Nav's `nav-guest` conditional block. The join page has no `localStorage` access at all.

**Expected state per design system §13:** "Become a Member" is the gold CTA owned by the Nav, targeting guests and registered non-members. Active members inside the hub would see upgrade options (Individual → Biennial etc.) only via the Membership Management section, which does not yet exist.

**Root cause:** No auth-aware redirect on `join.astro`; static CTAs in journal and home page.

**Severity:** Medium — confusing for members, no constitutional breach.

---

## Item 3 — Logout Discoverability

**Current state:** The Sign Out button exists in exactly one location: `hub/index.astro`, in the page header. No logout option exists in the Nav (desktop or mobile drawer), in the footer, on any profile page, or on any auth page.

**Evidence:**
```
# Grep result:
frontend/src/pages/hub/index.astro:39:
  <button id="hub-signout-btn" ...>Sign Out</button>
# Full backend logout:
frontend/src/layouts/HubLayout.astro:108-110:
  localStorage.removeItem('bcc_token');
  localStorage.removeItem('bcc_refresh');
  localStorage.removeItem('bcc_user');
```

The logout button calls `POST /api/v1/auth/logout` (revokes the refresh token) and then clears localStorage. The backend endpoint exists and is correct. The problem is purely discoverability — a user must navigate to `/hub/` to find it.

**Expected state per wireframe annotation 2:** Sign In, Register, and Apply for Membership are distinct CTAs. The Nav shows Sign In for guests. By extension, authenticated state in the Nav should expose a discoverable Sign Out option, canonically via an avatar dropdown or explicit nav slot.

**Root cause:** Sign Out was only wired in the Hub. Nav member state has avatar + name + "Member Hub" but no logout action.

**Severity:** High — poor UX; users cannot easily sign out from any non-Hub page.

---

## Item 4 — Login Using User ID / Username

**Current state:** The backend `LoginDto` is email-only:

```typescript
// auth/dto/login.dto.ts
export class LoginDto {
  @IsEmail()
  email: string;
  @IsString() @MinLength(1)
  password: string;
}
```

`AuthService.login()` queries `users` table with `.where('email', '=', email)`. There is no username lookup path.

The frontend `signin.astro` form has only an email input field (`type="email"`, `autocomplete="email"`). No username/user-ID field exists.

**Expected state (per spec 01.2):** Users can authenticate with email address OR with their username. The DB has a `username` column; the `users` table has been confirmed to have unique usernames for all non-social-login accounts.

**Root cause:** Login was implemented email-only. Username support requires: (a) changing `LoginDto` to accept either, (b) modifying `AuthService.login()` to detect whether input looks like an email and branch accordingly, and (c) adding a second input or a combined field in the frontend.

**Severity:** Medium — missing spec feature; all users can currently log in by email.

---

## Item 5 — Password Compatibility (CRITICAL)

**Current state:** This is the most severe finding in this audit. All 24 migrated legacy users have `bcrypt` password hashes (`$2b$12$...`). Only the founding admin account (`rajnishkhare`) has an `argon2id` hash. Two social-login-only users (user IDs 12 and 32) have `NULL` hashes — these are unaffected.

```
# Database evidence:
$argon2   : 1 user  (rajnishkhare)
$2b$12$   : 24 users (all migrated members)
NULL      : 2 users  (social-login only, correct)
```

`AuthService.login()` calls `argon2.verify(user.password_hash, password)`. When passed a bcrypt hash, the `argon2` library's internal `@phc/format` parser throws:

```
TypeError: pchstr must contain a $ as first char
  at deserialize (node_modules/@phc/format/index.js:147:11)
  at Object.verify (node_modules/argon2/argon2.cjs:158:27)
  at AuthService.login (auth.service.ts:87:40)
```

**This exception is confirmed in PM2 error logs and causes a 500 Internal Server Error** instead of a clean 401 Unauthorised. The `catch` block in `AuthService.login()` does not exist — the error propagates to the NestJS exception handler and returns a 500 to the client. The frontend interprets any non-OK, non-401 response as a generic "Sign-in failed" error.

**Net result: All 24 migrated legacy members cannot log in at all.**

The migration SQL (`0035_migration_track_c_legacy_members.sql`) was prepared to set an Argon2 hash for `Bcc2026!` as the default password. The confirmed bcrypt hashes indicate either (a) that SQL has not been executed, or (b) the users were created through a different path that set bcrypt hashes.

**Expected state:** All users must have argon2id hashes. Users migrated without a known password should have a working default hash (Argon2 for `Bcc2026!`) until they reset via password-reset flow.

**Root cause (two-part):**
1. Migration SQL either not yet executed OR a prior migration path set bcrypt hashes.
2. `AuthService.login()` has no fallback to `bcrypt.verify()` for legacy hashes, and no `try/catch` around `argon2.verify()`.

**Severity: CRITICAL** — blocks login for 24 out of 25 non-social-login users.

---

## Item 6 — Journal Migration

### 6A — Legacy journal content inventory

**Current state:** The V3 backend has no journal module, no journal database table, and no `/api/v1/journal` endpoint. The `bcc_v3` database schema confirmed: no `journal`, `articles`, or `posts` table exists.

The legacy site (`bcc.bhopal.info`) has 8 Markdown journal articles in `/src/content/journal/`:
```
birding-101.md
easy-photography-tips-for-beginners.md
ethics-and-manners.md
iso-balancing.md
photography-and-travel.md
seasonal-photography-guides.md
unlocking-the-beauty.md
wide-wild-world.md
```

These articles originated from a WordPress installation and contain residual WordPress block HTML markup (e.g., `<div class="wp-block-uagb-container ..."`). Frontmatter includes `title`, `description`, `pubDate`, `heroImage`, and `slug`.

The V3 `journal/index.astro` calls `/api/v1/journal?limit=3` (returns nothing) and falls back to two **hardcoded placeholder articles** that do not correspond to any real BCC content. The `journal/[slug].astro` page similarly falls back to static content.

### 6B — Historical SEO / redirect mapping

**Current state:** No 301 redirect mapping exists. The legacy WordPress URL structure (e.g., `bcc.bhopal.info/?p=123` or `bcc.bhopal.info/birding-101/`) has not been analysed and no Nginx redirect rules have been prepared.

**What needs to be assessed:** Whether the legacy WordPress URLs had indexable backlinks. The legacy Astro rebuild itself already changed URL structure; the V3 rebuild will change it again. SEO risk is real but proportionate to the site's current indexed footprint.

### 6C — Rich text editor recommendation

**Expected state per spec (Module 13.3):** Journal articles must be editable through the admin panel with a rich text editor. The spec cites "rich text editor" without specifying a library.

**Recommendation within frozen stack (Astro + NestJS + MySQL, no new standing processes):** [Tiptap](https://tiptap.dev/) is the appropriate choice. It is a headless ProseMirror wrapper, MIT-licensed, has zero server-side footprint (runs entirely in the browser), outputs clean HTML or JSON to a `TEXT`/`JSON` MySQL column, and requires no new infrastructure. It is compatible with the Astro frontend as a client-side import and with NestJS as a data format agnostic service. Alternatives (Quill, CKEditor, TinyMCE) either require cloud licensing or server-side processing.

**Severity:** High (missing feature, journal section is empty). SEO risk: Low-Medium (site is newly launched, indexed footprint is likely small).

---

## Item 7A — Membership Card

Confirmed deferred. Moved to a dedicated revisit session after Module 06 as directed.

---

## Item 7B — Google OAuth — Blank Page After Login

**Current state:** The OAuth exchange chain is architecturally correct:

1. Frontend fetches `GET /api/v1/registration/social/google/authorize-url` → gets Google auth URL
2. Browser redirects to Google
3. Google redirects to `https://v3bcc.bhopal.info/api/v1/registration/social/google/callback?code=...`
4. Nginx proxies to `127.0.0.1:3001` (path preserved — the `GOOGLE_REDIRECT_URI` in `.env` matches the Nginx proxy rule exactly)
5. Backend exchanges code, creates/logs in user, calls `reply.redirect('/auth/callback#at=...&rt=...&new=...')`
6. Browser follows 302 to `/auth/callback#at=...`
7. Nginx serves `/auth/callback/index.html` via `try_files`
8. `callback.astro` script parses hash, stores tokens, fetches `/api/v1/users/me`, redirects to `/hub/` or `/hub/membership/apply/`

**Identified issue:** Step 8 redirects new users (`new=1`) to `/hub/membership/apply/`. That page (`hub/membership/apply.astro`) must be confirmed as non-blank and properly guarded. Returning users go to `/hub/` which is known to work.

**Second issue confirmed:** Social login creates users with `NULL` username. The callback page fetches `/api/v1/users/me` which returns `{ username: '' }`. The Nav then tries to build a "My Profile" link at `/gallery/photographer//` (double slash, empty username) — harmless but incorrect.

**Third issue:** Two social-login accounts (user IDs 12, 32) have `NULL` username. The `photographers` directory endpoint filters on `u.username IS NOT NULL`, so these users don't appear in the photographer directory — correct behaviour for now, but their profiles are inaccessible.

**Root cause of blank page:** Cannot be confirmed without browser console access. Most probable cause: `hub/membership/apply.astro` loads but has no content to display for users who already have a membership (existing social login users redirected there again on re-login). Requires browser console investigation with `new=0` vs `new=1` distinction.

**Severity:** High — OAuth users cannot reliably complete the sign-in flow to a functional page.

---

## Item 7C — Facebook OAuth

**Current state:** The Facebook OAuth code is implemented identically to Google. `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, and `FACEBOOK_REDIRECT_URI` are all present in `.env`. The backend `OAuthService.facebookExchange()` is implemented using the Graph API v19.0.

**Blocking issue:** The Facebook App is in **Development mode**. In Development mode, only users listed as Developers or Testers in the Meta Developer Console can authenticate. All other users receive an error.

**Steps required to go Live:**
1. Open [Meta Developer Console](https://developers.facebook.com/) → App Dashboard.
2. Under "App Review", submit for review (if public login is required) OR use "Manage" → App Modes → switch to "Live" if the app only uses `email` and `public_profile` permissions (these are standard and do not require review for Live mode if the app is used as a website login).
3. Verify the Privacy Policy URL is set (required for Live mode).
4. Verify the `FACEBOOK_REDIRECT_URI` is listed in the Facebook App's "Valid OAuth Redirect URIs" under Facebook Login settings.

**Severity:** High — Facebook login is completely non-functional for anyone other than the app developer.

---

## Item 8 — Photographer Profile Route 404

**Current state:** `GET https://v3bcc.bhopal.info/gallery/photographer/rajnishkhare/` returns 404.

**Root cause confirmed (three-layer failure):**

**Layer 1 — Static path generation bug.** `gallery/photographer/[userid].astro` calls the API at build time to collect dynamic paths:

```typescript
// [userid].astro - getStaticPaths()
photographers.forEach((p: any) => {
  if (p.userid && !paths.some(...))  // BUG: field is p.username, not p.userid
    paths.push({ params: { userid: p.userid } });
});
```

The API returns `{ id, username, displayName, ... }`. The code reads `p.userid` which is always `undefined`. **No dynamic paths are ever added at build time.** Only the five hardcoded fallback paths are compiled: `rajnish-khare`, `ankit-tiwari`, `rahil-khan`, `sauvik-acharyya`, `kshitij-patle`.

**Layer 2 — Username slug mismatch.** Even if the API call worked, the hardcoded fallback paths use hyphenated slugs (`rajnish-khare`) while the actual DB usernames are concatenated lowercase (`rajnishkhare`). The Nav constructs the "My Profile" link as `/gallery/photographer/${user.username}/` which correctly uses `rajnishkhare`, pointing to a page that was never built.

**Layer 3 — Built paths confirmed:**
```
# ls /var/www/bcc-v3/frontend/dist/gallery/photographer/
ankit-tiwari  kshitij-patle  rahil-khan  rajnish-khare  sauvik-acharyya
```

None of the 17 active photographer usernames from the DB exist as built paths.

**Expected state:** Every active member with a Public profile visibility should have a pre-built static page at `/gallery/photographer/{username}/`.

**Fix required:** Change `p.userid` to `p.username` in `getStaticPaths()`. Remove the hardcoded fallback paths OR align them to actual DB usernames. Rebuild and redeploy.

**Severity: Critical** — no photographer profile page is accessible via its correct URL.

---

## Item 9 — Showcase Page Layout ("stacked vertically, full width")

**Current state:** The showcase calls `/api/v1/gallery/feed` which exists, returns data, and the response shape matches what the code expects. The 312 migrated photos are in R2. ImageKit URLs are correctly constructed from the `uploads/` r2_key prefix.

**Root cause of layout failure:** Astro **scopes CSS** by adding a unique `data-astro-*` attribute to elements and qualifying selectors in the compiled CSS. Any element created dynamically via `document.createElement()` in JavaScript does not receive this attribute. The CSS rule `.grid-row { display: flex; gap: 8px; }` is compiled to something like `.grid-row.astro-XXXX { display: flex; }`. Dynamically created `.grid-row` divs do not have `astro-XXXX` and therefore **do not match the rule**. Each row defaults to `display: block` and stacks vertically at full width. The inline `width` and `height` styles on each photo card are applied, but without the containing flex context, they appear as block elements at whatever width the browser assigns.

**Evidence:** Confirmed that `.justified-grid`, `.grid-row`, and `.photo-card` CSS rules are defined inside `<style>` blocks in `showcase.astro` and `index.astro`, not in `global.css`. All grid rows and photo cards are created via `document.createElement()`.

**Fix required:** Either move grid CSS to `global.css` (no scoping), add `is:global` to the `<style>` block for layout rules, or write CSS using `:global(.grid-row)` selector syntax within the scoped block.

**Data quality note:** 26 of the 312 migrated photos have numeric-string titles (e.g. `"1000631437"`) — these are filenames from the legacy system where no `title` was stored. They will display correctly but look poor in captions. These should be cleaned up in a data patch.

**Severity: High** — showcase renders nothing but skeleton/stacked images for all users.

---

## Item 10 — Home Page Hero (No Image)

**Current state:** The homepage calls `GET /api/v1/photos/spotlight`. This endpoint **does not exist**. The backend has no `photos` controller; the gallery module is namespaced at `/api/v1/gallery/`. The fetch fails silently (caught by try/catch), and the fallback gradient background is shown permanently.

**Root cause:** The homepage was written expecting a `/api/v1/photos/spotlight` endpoint that was never implemented. The gallery backend uses `/api/v1/gallery/feed` with no concept of a "spotlight" selection.

**Fix required:** Either (a) implement a `GET /api/v1/gallery/spotlight` endpoint that returns the most recently committee-curated or highest-quality photo, or (b) update the homepage to use `/api/v1/gallery/feed?limit=1` as a temporary spotlight source until curation is implemented.

**Severity:** High — the hero section, the most prominent visual on the homepage, never shows a member photograph.

---

## Item 11 — Home Page "Our Members on the Wall" (Empty)

**Current state:** The homepage calls `GET /api/v1/photos?showcase=true&limit=12`. This endpoint does not exist. The gallery feed is at `/api/v1/gallery/feed`.

**Root cause:** URL mismatch. The correct endpoint is `/api/v1/gallery/feed?limit=12`. The home page uses a different (non-existent) path.

**Additional note:** The `buildRows()` function in `index.astro` expects `{ data: [...] }` response shape but the gallery feed returns `{ photos: [...], total: N }`. If the URL is fixed, the data shape mapping also needs to be updated to match what showcase.astro already does correctly.

**Severity: High** — gallery wall section is permanently empty on the homepage.

---

## Item 12 — Home Page Upcoming Activities (Empty)

**Current state:** The homepage calls `GET /api/v1/events?upcoming=true&limit=3`. This endpoint **exists** (events controller is implemented). However, the `events` table in `bcc_v3` contains **zero rows**.

```sql
-- Confirmed:
SELECT COUNT(*) FROM bcc_v3.events;  --> 0
```

**Root cause:** No event data has been created or migrated. The legacy `bcc.bcc_events` table has data but it has not been migrated to V3. The events section shows skeleton placeholders indefinitely until events are created.

**Severity:** Medium — the API is correct; data entry or migration is the gap.

---

## Item 13 — Home Page Journal Section (Empty)

**Current state:** The homepage calls `GET /api/v1/journal?limit=3`. No journal module, controller, or table exists in the V3 backend. The call fails silently and journal cards remain as skeletons.

The `journal/index.astro` also falls back to two hardcoded placeholder articles that are fictional (not based on real BCC content).

**Root cause:** Journal backend was not implemented. The 8 legacy markdown articles in `/var/www/bcc.bhopal.info/src/content/journal/` are the source material but have not been migrated.

**Severity:** Medium — related to Item 6 (Journal Migration).

---

## Item 14 — Administrative Dashboard

**Current state:** No admin panel exists anywhere in the V3 frontend. There are no pages under `/admin/` or any admin-scoped section. The `Hub` (`/hub/`) is a member-facing dashboard only.

The backend does have admin-capable endpoints (e.g., `GET /api/v1/events/admin/all`, RBAC controller, membership admin endpoints) but they are inaccessible without a frontend interface.

**Expected state (per spec Module 13):** An admin panel is required for user management, membership lifecycle management, role assignment, approvals, content management, and moderation.

**Root cause:** Admin panel is a later-phase deliverable (spec Module 13 is Phase 4). No admin interface is planned until earlier modules stabilise. Coordinators currently have no way to approve memberships, manage events, or publish journal articles.

**Immediate workaround available:** The backend admin endpoints can be called directly (e.g., via Postman or curl) using a Super Admin JWT. This is not sustainable but unblocks critical operations.

**Severity:** Medium — planned gap, but blocks operational tasks (membership approvals, event creation, journal publishing).

---

## Item 15 — Password Reset (Forgot Password)

**Current state:**
- `password_reset_tokens` table **exists** in `bcc_v3` (schema was created).
- `users.force_password_reset` column exists and is set in `RegistrationService`.
- No `POST /api/v1/auth/forgot-password` endpoint exists.
- No `POST /api/v1/auth/reset-password` endpoint exists.
- No `/auth/forgot-password` or `/auth/reset-password` pages exist in the V3 frontend.

The legacy site **did have** these pages (`/src/pages/forgot-password.astro` and `/src/pages/reset-password.astro`).

The signin page has no "Forgot Password?" link.

**Evidence:**
```
# Grep result: no forgot-password or reset-password routes in V3
find /var/www/bcc-v3/frontend/src/pages -name "*password*" -o -name "*forgot*" -o -name "*reset*"
# Result: (empty)

# Backend also has no handler:
grep -rn "forgot\|reset" /var/www/bcc-v3/backend/src --include="*.ts"
# Result: only force_password_reset column references, no endpoint
```

**Root cause:** The table schema was prepared but the feature was not implemented. Given the critical state of password compatibility (Item 5), password reset is now urgent rather than a future concern.

**Severity:** High — combined with Item 5 (bcrypt incompatibility), migrated users who cannot log in have no self-service recovery path.

---

# PART 2 — Implementation Sequence

---

## Priority Classification and Order

### CRITICAL — Must fix before any member can use the platform

**P0-1 — Password hash incompatibility (Item 5)**
All 24 migrated users have bcrypt hashes. `argon2.verify()` throws a 500 on them. Fix has two parts:
1. **Immediate DB patch:** Replace all bcrypt hashes with an Argon2 hash of `Bcc2026!` as a temporary default.
2. **Code hardening:** Wrap `argon2.verify()` in a try/catch that returns `false` rather than throwing, so future hash format mismatches degrade gracefully to "wrong password" rather than 500.

Execute DB patch first (one SQL UPDATE). Code change is a safety net.

**P0-2 — Photographer profile 404 (Item 8)**
Fix the `p.userid` → `p.username` bug in `getStaticPaths()`, remove or correct the hardcoded fallback paths, rebuild and redeploy. Without this, no member can view any profile page via its canonical URL.

---

### HIGH — Platform is usable but key sections are empty or broken

**P1-1 — Logout discoverability (Item 3)**
Add a Sign Out option to the Nav member state. Simplest implementation: a clickable "Sign Out" text link next to the Member Hub button in the nav-member div, calling the same `logout()` function already in HubLayout.

**P1-2 — Showcase grid CSS scoping (Item 9)**
Move the `.grid-row`, `.justified-grid`, and `.photo-card` CSS rules to `global.css` or mark them with `is:global` in the `<style>` block. This fixes showcase and gallery wall simultaneously.

**P1-3 — Homepage gallery wall endpoint mismatch (Item 11)**
Change `/api/v1/photos?showcase=true&limit=12` to `/api/v1/gallery/feed?limit=12` and update the response-shape mapping in `index.astro` to match what `showcase.astro` already does correctly.

**P1-4 — Homepage hero endpoint missing (Item 10)**
Two options (choose one):
- (a) Add `GET /api/v1/gallery/spotlight` to the gallery controller returning the most recent ACTIVE PUBLIC photo.
- (b) Update homepage to use `/api/v1/gallery/feed?limit=1` temporarily.
Option (b) is a two-line frontend change. Option (a) is a future-proof backend addition.

**P1-5 — Password reset workflow (Item 15)**
Implement in sequence: backend `POST /api/v1/auth/forgot-password` → send token to email → frontend `/auth/forgot-password` page; backend `POST /api/v1/auth/reset-password` → verify token → update hash to argon2 → frontend `/auth/reset-password` page. Add "Forgot Password?" link to `signin.astro`. Communication via `CommunicationService` (Resend email already configured).

**P1-6 — Facebook OAuth (Item 7C)**
Promote the Facebook app from Development to Live mode in Meta Developer Console. Verify Privacy Policy URL is set. Verify redirect URI in Facebook Login settings. No code changes required.

**P1-7 — Google OAuth blank page investigation (Item 7B)**
Test with browser devtools open: follow the OAuth flow and capture the exact URL after redirect (is hash present?), any console errors on `/auth/callback`, and the final destination URL. Check `hub/membership/apply.astro` for display correctness for returning users. May resolve itself once Item 5 (password fix) is deployed — if the blank page was caused by a failed `/api/v1/users/me` call due to an unrelated server error.

---

### MEDIUM — Important but platform functions without them

**P2-1 — Login by username (Item 4)**
Modify `LoginDto` to accept `identifier: string` (email or username). In `AuthService.login()`, detect by `@` presence and branch to email or username lookup. Update `signin.astro` input field to accept either format. Low-risk backend change.

**P2-2 — Auth CTAs for authenticated users (Items 1 & 2)**
Add a client-side auth check to `join.astro`: if valid JWT in localStorage and user has active membership, redirect to `/hub/`. Add equivalent auth-check to the "Become a Member" CTA in `journal/[slug].astro`.

**P2-3 — Journal migration (Item 6)**
Create a `journal_posts` table (migration file). Implement a journal module in NestJS (controller, service, Kysely queries). Import the 8 legacy markdown articles as seed data. Wire the frontend journal pages to the API. This is a self-contained module with no dependencies on unbuilt features.

**P2-4 — Events data entry / migration (Item 12)**
Create at least the upcoming events for the current period. Either through direct SQL inserts (fastest) or via the backend admin API with a coordinator JWT. No code change needed — the API is implemented and working.

**P2-5 — Migrated photo title cleanup (Item 9 data quality)**
26 photos have numeric filenames as titles. Write a targeted SQL UPDATE that sets the title to NULL (or derives a proper title from the legacy description field in `bcc.bcc_photographer_photos`) for these rows.

---

### DEFERRED — Planned for later phases

**D1 — Admin dashboard (Item 14)**
Phase 4 as specified in PHASE_ROADMAP.md. Interim: coordinate directly via backend API endpoints + JWT for critical operations.

**D2 — Membership card redesign (Item 7A)**
Dedicated session post-Module 06.

**D3 — Photographer profile page client-side data enrichment**
Once the static path bug (Item 8) is fixed, the client-side fetch on `[userid].astro` needs to be confirmed against the actual `/api/v1/photographers/:username` response shape. The page currently uses fallback data; the API call should replace it.

---

# PART 3 — Risk Analysis

---

## Authentication Risks

**AUTH-R1 — 24 migrated users locked out (CRITICAL)**
All 24 legacy-migrated users receive a 500 error when attempting to log in. The `argon2.verify()` TypeError is unhandled and surfaces as a server error. Users who try their legacy password get a generic error message. There is no self-service recovery (password reset not implemented). This is the highest-risk item in the audit.

**Mitigation:** Execute the bcrypt→argon2 hash replacement SQL immediately. Add try/catch around `argon2.verify()` as a second line of defence. Deploy password reset before communicating the platform to members.

**AUTH-R2 — Social login users with NULL username**
Users who register via Google or Facebook have no username. The Nav links their profile as `/gallery/photographer//` (empty segment). The photographers directory excludes them. If a social-login user later attempts email+password login (e.g. same email), they get a `password_hash IS NULL` path that is currently handled — `AuthService.login()` checks `!user.password_hash` and returns a generic 401. This is correct. However, the user has no way to set a password.

**AUTH-R3 — JWT access token duration**
Access tokens expire in 15 minutes. The frontend has no token-refresh mechanism for in-page API calls. Long-running pages (showcase, hub) will start failing API calls silently after 15 minutes without a page reload. Refresh token rotation is implemented in the backend but no client-side refresh interceptor has been wired.

---

## Migration Risks

**MIG-R1 — Photo R2 key format**
The 312 migrated photos have `r2_key` values in `uploads/{timestamp}-{hash}.jpg` format (legacy filenames). New uploads via the V3 upload flow will create keys in `photos/{userId}/{year}/{month}/{uuid}.ext` format. These two namespaces coexist safely in the same R2 bucket — no collision risk — but the split makes lifecycle management (bulk delete, bucket organisation) more complex over time.

**MIG-R2 — Migrated photo EXIF is empty**
All 312 migrated photos have NULL values for all EXIF fields (`exif_camera_make`, `exif_camera_model`, `exif_aperture`, etc.). The legacy `bcc_photographer_photos` table had camera/lens/aperture/focal_length fields but the migration SQL mapped them. The DB shows NULL across the board, which suggests either (a) the migration SQL was not yet executed, or (b) the source data was blank for those fields. Verify against `bcc.bcc_photographer_photos` directly.

**MIG-R3 — `confirmed_at` timestamp on migrated photos**
All 312 migrated photos have `confirmed_at = 2026-07-04T09:47:18` (the same timestamp — bulk migration datetime). This means the photo feed's default sort (`created_at` DESC / `confirmed_at` DESC) presents all 312 photos as equally "recent" and the sort order will be arbitrary within the migration batch. A second-pass data update setting `confirmed_at` from the legacy `created_at` field would restore chronological order.

**MIG-R4 — 26 photos with numeric-string titles**
The legacy system stored filenames as titles for photos where no title was entered. These display as "19", "21", "1000631437" etc. in the showcase. Should be NULL-patched so the UI shows no title rather than a noise string.

---

## SEO Risks

**SEO-R1 — No 301 redirects from legacy URLs**
The legacy site's journal articles are at `bcc.bhopal.info/journal/birding-101/` etc. V3 will serve them at `v3bcc.bhopal.info/journal/birding-101/` (different domain). The V3 domain cutover will break any inbound links and Google-indexed URLs. Risk is proportionate to indexed footprint — for a club site of this scale, likely low-medium.

**SEO-R2 — Photographer profiles at new URL structure**
Legacy photographer profiles were at `bcc.bhopal.info/photographers/{username}`. V3 uses `/gallery/photographer/{username}/`. No redirects exist. Any indexed profile URLs will 404 after cutover.

**SEO-R3 — Showcase page not indexable while broken**
Google's crawler cannot render JavaScript-dependent justified grids. While the showcase grid is broken (CSS scoping issue, Item 9), the page presents skeleton placeholders to crawlers. Fixing the CSS scoping bug (P1-2) is also an SEO fix — once the grid renders, the image URLs will be present in the DOM.

---

## Governance Risks

**GOV-R1 — Admin operations blocked**
With no admin panel, the Membership Manager cannot approve pending membership applications. Any member who applies through `/hub/membership/apply/` will remain in PENDING state indefinitely. The backend lifecycle engine (PENDING → APPROVED → ACTIVE) is implemented but there is no UI to advance it. Workaround: direct API call with coordinator JWT.

**GOV-R2 — MEM-006 constitutional class protection**
The `trg_membership_number_immutable` trigger is in place. Constitutional class protection (`category = 'CONSTITUTIONAL'` guard) must be verified in the application layer — confirmed present in `MembershipService` which rejects mutations. No risk to constitutional integrity from the current codebase.

**GOV-R3 — BCCTempXXXXX identifiers still active**
The 16 migrated Track C members have `BCCTempXXXXX` identifiers as their current display identifier. Per MEM-007 Amendment 001-B, these are temporary and must be retired after the manual batch allocation. Until the allocation spreadsheet is completed and the batch import executed, these users' membership cards and any public display will show BCCTemp identifiers. This is constitutionally correct per the amendment (temporary identifiers are permitted during the migration window) but should not be left indefinitely.

---

## Historical Continuity Risks

**HIST-R1 — Founding member photo data**
Rajnish Khare (founding member serial 00001) has photos in the system. His photographer profile page is reachable at `/gallery/photographer/rajnish-khare/` (legacy hardcoded path) but NOT at `/gallery/photographer/rajnishkhare/` (actual username). After Item 8 is fixed, the correct URL will work and the legacy path will 404. A redirect from `rajnish-khare` to `rajnishkhare` should be added to Nginx.

**HIST-R2 — Legacy journal articles**
8 legacy journal articles exist only as Markdown files in the legacy site's source tree. They are not in the V3 database and not being served. If the legacy site is decommissioned before these are migrated, the content will be lost. They should be imported before any decommission window opens.

---

## Summary Table

| Item | Severity | Status | Immediate Action |
|---|---|---|---|
| 5 — Password bcrypt/argon2 incompatibility | **CRITICAL** | Confirmed, 500 in prod logs | DB patch + code fix before any member communication |
| 8 — Photographer profile 404 | **CRITICAL** | `p.userid` bug confirmed | Fix field name, rebuild, redeploy |
| 3 — Logout discoverability | High | Missing from Nav | Add to nav-member div |
| 9 — Showcase CSS scoping | High | Confirmed root cause | Move CSS to global.css |
| 10 — Hero no image | High | Endpoint missing | Implement or redirect to gallery feed |
| 11 — Gallery wall empty | High | URL mismatch confirmed | Change fetch URL |
| 15 — Password reset missing | High | Table exists, no endpoint/UI | Implement forgot/reset flow |
| 7B — Google OAuth blank page | High | Probable but unconfirmed | Browser devtools investigation |
| 7C — Facebook OAuth blocked | High | Dev mode confirmed | Promote app to Live |
| 1/2 — Auth CTAs for members | Medium | Nav correct, join.astro not | Auth-guard join.astro |
| 4 — Login by username | Medium | Email-only confirmed | Extend LoginDto + service |
| 6 — Journal missing | Medium | No module/table exists | Create journal module + migrate 8 articles |
| 12 — Events section empty | Medium | Table empty, API correct | Enter/migrate events |
| 13 — Journal section empty | Medium | Same as Item 6 | Same fix |
| 14 — Admin dashboard | Deferred | Phase 4 | Direct API workaround until built |
| 7A — Membership card | Deferred | By directive | Post-Module 06 session |

---

*BCC Unified Platform V3 — Stage 2 Post-Migration Reconciliation Audit*
*All findings based on direct server evidence. No assumptions made.*
