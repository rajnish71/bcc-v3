# BCC Unified Platform V3 — Phase Roadmap

**Status:** AUTHORITATIVE — Living Roadmap
**Version:** 2.6
**Last Updated:** 2026-07-15 — IDENTITY-001 Identity Completion Architecture implemented by Claude Code

---

# PURPOSE

This document defines the implementation sequence of the BCC Unified Platform V3.

It is the authoritative roadmap describing:

- completed milestones
- current implementation priorities
- deployment sequencing
- future platform expansion

Detailed implementation belongs to the Platform Specification.
Governance belongs to MEM-006 and MEM-007.

This document governs **when** work happens, not **how** it is implemented.

---

# CURRENT STATUS

## Stage 1 — Foundation

**Status:** ✅ COMPLETE

### Design System

- ✅ V6 91 — Site Header
- ✅ V6 92 — Site Footer

### Public Pages

- ✅ V6 01 — Home
- ✅ V6 03 — Showcase

### Member Hub

- ✅ V6 09 — Hub Home
- ✅ V6 10 — Portfolio

---

# STAGE 2 — MEMBER HUB FOUNDATION

**Status:** ✅ PHASE A COMPLETE — Phase B next

---

## PHASE A — Complete the Member Hub Foundation

**Status:** ✅ COMPLETE
**Completed:** 2026-07-10

### A1

Architecture Foundations

✅ HUB-ARCH-001 — Hub Component Architecture

Hub Component Architecture

**Status:** ✅ COMPLETE
**Completed:** 2026-07-10

Purpose:

Establish the canonical architecture governing the authenticated Member Hub, including layout composition, authentication ownership, RBAC propagation, navigation structure and component responsibilities.

- Authored HUB-ARCH-001 v1.0 — the frozen composition model for the authenticated Member Hub
- Defined the HubLayout / HubSidebar / HubPageHeader / HubSection component hierarchy
- Established the slot-based composition pattern separating shell from page content
- Froze the sidebar navigation structure, active-state logic, and responsive collapse behaviour
- Documented in `Architecture/HUB_COMPONENT_ARCHITECTURE_FREEZE_v1.0.md`

---

### A1a

PHOTO-ARCH-001 — Photo Asset Architecture

**Status:** ✅ COMPLETE
**Completed:** 2026-07-11

Purpose:

Establish the platform-wide canonical architecture governing photographic assets.

Completed deliverable:

PHOTO-ARCH-001 — Photo Asset Architecture Freeze v1.0

Defines:

- Canonical Photo Identity
- Container Architecture
- Viewing Context
- Canonical Photo URLs
- Photo Ownership Model
- Navigation Context
- Asset Reuse Across Modules

Document:

Architecture/PHOTO-ASSET-ARCHITECTURE_FREEZE_v1.0.md
---

### A2

V6 12 — Members Hub Navigation

**Status:** ✅ COMPLETE
**Completed:** 2026-07-10

- Reviewed V6 12 design authority wire­frame for the Members Hub sidebar navigation
- Reconciled all nav items, groupings, icons, and active-state treatments against HUB-ARCH-001
- Confirmed sidebar collapse / mobile drawer behaviour matches the architecture freeze
- Identified gold accent treatment on active nav item as the single primary interaction signal
- Recorded all deviations — none found; design authority and architecture are aligned

---

### A3

Reconcile V6 09 — Members Hub Home

**Status:** ✅ COMPLETE
**Completed:** 2026-07-10

- Reviewed V6 09 design authority wireframe for the Members Hub main home page
- Reconciled Welcome strip, Quick Stats row, Recent Uploads grid, and Activity Feed sections
- Confirmed all section labels, slot positions, and data-binding points against HUB-ARCH-001
- Identified API endpoints required: `/api/v1/hub/stats`, `/api/v1/gallery/feed`, `/api/v1/hub/activity`
- No layout deviations found; design authority is implementation-ready

---

### A4

Reconcile V6 10 — Portfolio

**Status:** ✅ COMPLETE
**Completed:** 2026-07-10

- Reviewed V6 10 design authority wireframe for the Member Hub Portfolio page
- Reconciled grid layout, upload CTA placement, filter bar, and photo card composition
- Confirmed photo borders are radius-0 throughout; no rounding introduced
- Noted visibility-toggle control per photo card (Public / Members / Private) maps to existing API
- No layout deviations found; design authority is implementation-ready

---

### A5

Reconcile V6 11 — Upload Studio

**Status:** ✅ COMPLETE
**Completed:** 2026-07-10

- Reviewed V6 11 design authority wireframe for the Member Hub Upload Studio
- Reconciled drop-zone, metadata form, tag input, genre selector, and submission button layout
- Confirmed single gold CTA (Submit Upload) rule is honoured; no secondary gold elements present
- Identified R2 / ImageKit integration points align with existing `uploads` backend module
- No layout deviations found; design authority is implementation-ready

---

### A6

Implementation

**Status:** ✅ COMPLETE
**Completed:** 2026-07-10

- Batch 1 — HubLayout + HubSidebar: shell composition, JWT auth guard, role extraction, slot structure
- Batch 2 — Members Hub Navigation (V6 12): three responsive surfaces (desktop rail, tablet tabs, mobile bar), RBAC elevation
- Batch 3 — Members Hub Home (V6 09): all six sections, populated + empty states, loading shimmer, client-side data fetching
- Batch 4 — Members Hub Portfolio (V6 10): toolbar, grid/list view, SelectionBar, Inspector overlay, delete confirm dialog
- Batch 5 — Members Hub Upload Studio (V6 11): four-phase flow, drop zone, queue grid with progress, metadata inspector, mobile source picker

---

### Implementation Authority

#### Design Authority Files

| # | Component | File | Path |
|---|---|---|---|
| 1–2 | HubLayout · HubSidebar | _(HUB-ARCH-001)_ | `ProjectDocs/Architecture/HUB_COMPONENT_ARCHITECTURE_FREEZE_v1.0.md` |
| 3 | Members Hub Navigation | `V6 12 Members Hub Navigation.dc.html` | `ProjectDocs/Wireframes/V6/12 Hub Navigation/` |
| 4 | Members Hub Home | `V6 09 Members Hub Main Home.dc.html` | `ProjectDocs/Wireframes/V6/09 Hub Home/` |
| 5 | Members Hub Portfolio | `V6 10 Members Hub Portfolio.dc.html` | `ProjectDocs/Wireframes/V6/10 Hub Portfolio/` |
| 6 | Members Hub Upload Studio | `V6 11 Members Hub Upload.dc.html` | `ProjectDocs/Wireframes/V6/11 Hub Upload/` |

Supporting Design System Files (reference only — do not re-implement)

| File | Path |
|---|---|
| `V6 91 SiteHeader.dc.html` | `ProjectDocs/Wireframes/V6/91 SiteHeader/` |
| `V6 92 SiteFooter.dc.html` | `ProjectDocs/Wireframes/V6/92 SiteFooter/` |

---

### A7

Validation

**Status:** ✅ COMPLETE
**Completed:** 2026-07-10

Release validation audit conducted against all four design authority wireframes:

- HubLayout — composition, auth guard, responsive grid, loading state: ✅ PASS
- HubSidebar — all three responsive surfaces, RBAC elevation, keyboard interaction, accessibility: ✅ PASS
- V6 12 Navigation — all nav items and group labels verified against wireframe: ✅ PASS
- V6 09 Hub Home — all six sections, populated/empty states, CTA ownership, loading shimmer: ✅ PASS
- V6 10 Portfolio — toolbar, inspector, grid/list view, selection bar, empty state: ✅ PASS
- V6 11 Upload Studio — four phases, drop zone, queue, metadata, complete state: ✅ PASS

Build: ✅ Clean — 59 pages built in 1.11s, zero errors
TypeScript: ✅ Clean — zero type errors
Design fidelity: ✅ Verified — tokens, typography, gold CTA rule, photo border-radius-0
Accessibility: ✅ Verified — ARIA roles, keyboard navigation, focus-visible outlines, screen-reader labels
Responsive: ✅ Verified — desktop / tablet / mobile breakpoints across all components

Known limitations (non-blocking — future phases):
- Journey Strip "Full journey →" links to `/hub/journey/` (Phase B page, not yet implemented)
- Academy card renders placeholder mock data (Academy marked SOON, not yet implemented)

**Phase A — Member Hub Foundation: COMPLETE**

---

## PHASE B — Legacy Profile Migration Audit

**Status:** ✅ COMPLETE

Audit all legacy member profile fields before designing the new Member Profile.

Includes (but is not limited to):

- Biography
- About
- Equipment
- Camera Bodies
- Lenses
- Awards
- Distinctions
- Honours
- Social Links
- Websites
- Profile Photograph
- Cover Photograph
- Portfolio Metadata
- Member KYC Information
- Membership Consent Requirements

Deliverable:

**Legacy Profile Audit Report**

---

## PHASE C — Legacy Data Reconciliation

**Status:** ✅ COMPLETE

- ✅ 0035 members migrated
- ✅ 0038 social handles migrated

Compare

Legacy Database

↓

Current V3 Database

↓

Required V6 Data Model

Resolve missing fields before Member Profile implementation.

---

## PHASE D — Member Profile

**Status:** ✅ COMPLETE

Design and implement

V6 13 — Member Profile

including

- Public Photographer Profile integration
- Private Member Profile
- Membership KYC
- Consent workflow
- Profile completion
- Visibility preferences

---

### D1 ✅ Schema Migrations 0039–0051 Applied

- `users`: tagline, awards_html, photography_genres, areas_of_expertise, favourite_subjects, preferred_camera_system, year_joined_bcc, date_of_birth, gender, name_title, first_name, middle_name, last_name, address fields, blood_group, emergency_contact fields, website_url
- `user_cover_photos` table
- `user_photo_titles` table
- `user_awards` table
- `membership_consent_log` table
- `pending_email_changes` table (0052)
- MySQL 8.0.46 note: VIRTUAL generated columns required (STORED + FK rejected in same CREATE TABLE)

---

### D2 ✅ Legacy Data Population Migrations 0042–0050

- 6 taglines populated
- 10 cover photos migrated
- 12 photo titles + 5 awards migrated
- 17 members: name parts split from full_name

---

### D3 ✅ Registration Extended

Name parts captured at signup.

---

### D4 ✅ V6 13 — Member Profile Editor Implemented

- 10 sections: Identity, Personal, Address, Public Profile, Social, Equipment, Distinctions, Internal BCC, Account, Statistics
- Avatar + cover upload via R2/ImageKit
- 2 RTF editors (bio, awards)
- One gold CTA (Save Changes), sticky on scroll

---

### D5 ✅ V6 19 — Membership Application & Renewal Form

- Variant A: application (`/hub/membership/apply`)
- Variant B: renewal (`/hub/membership/renew`)
- 3-step flow: Personal → T&C → Review
- MEM-006 + MEM-007 constitutional constraints enforced
- `membership_consent_log` populated on each submission

---

### D6 ✅ V6 20 — Account Settings

- Name & Title (editable — single source of truth)
- Email change (verification flow)
- Password change
- Username: read-only (MEM-007 permanent)
- Route: `/hub/account-settings`
- Shell: no HubSidebar (accessible to all roles)

---

### Phase D Implementation Authority

#### Design Authority Files

| # | Component | File | Path |
|---|---|---|---|
| 7 | Member Profile Editor | `V6 13 Members Hub Profile.dc.html` | `ProjectDocs/Wireframes/V6/13 Hub Member Profile/` |
| 8 | Membership Application & Renewal Form | `V6 19 Membership Consent Form.dc.html` | `ProjectDocs/Wireframes/V6/19 Consent Form/` |
| 9 | Account Settings | `V6 20 Account Settings.dc.html` | `ProjectDocs/Wireframes/V6/20 Accounts Settings/` |

---

## PHASE E — Soft Pre-Launch & Platform Stabilization

**Status:** 🚧 CURRENT

Objective

Transition the platform from development to a stable soft pre-launch
environment by completing the core public photography experience,
migrating to the production domain, reconciling the design system,
and performing end-to-end validation before expanding platform capabilities.

Domain Migration

v3bcc.bhopal.info
        ↓
bcc.bhopal.info

✅ **COMPLETE** — bcc.bhopal.info is the canonical production domain.

Soft Launch Activities

- Internal testing
- Core committee testing
- Selected member testing
- Bug fixing
- Performance validation
- Legacy site becomes read-only
- DNS migration
- Soft pre-launch

---

### Public Pages

- ✅ V6 04 — Photographers Directory (Reconciliation) — implemented by Claude Code, 2026-07-12
- ✅ V6 05 — Photographer Profile — implemented by Claude Code, 2026-07-12
- ✅ V6 21 — Canonical Photo / Showcase — implemented by Claude Code, 2026-07-12

---

### Design Authority Reconciliation

- ⬜ Membership Card widget reconciliation
- ⬜ Responsive canonical Membership Card rendering
- ⬜ Remove independent dark card implementation
- ⬜ General Design Authority reconciliation

---

### System Deliverables

- ⬜ V6 98 — token.css
- ⬜ V6 99 — systemdesign.md

---

## FEEDBACK STAGE 5 — Pre-Soft-Launch Polish

**Status:** 🚧 P0 BLOCKERS OUTSTANDING — F5.1–F5.4 complete; P0 issues must be resolved before soft launch

**Priority:** Highest. This block gates the Public Soft Launch. All items below must be resolved before any soft-launch announcement.

### F5.1 — Home Page Completeness — ✅ COMPLETE (Claude Code, 2026-07-12)

- ✅ Seed 3 demo activities: Monsoon Photowalk, Composition Workshop, Annual Print Exhibition — `database/migrations/0054_seed_demo_activities.sql`
- ✅ Populate "One Community. Four Ways to Participate." section — 4 club cards with real copy and gradients
- ✅ Replace hero editorial feature with `frontend/public/images/hero.jpg` ("Serene Morning around Tajul Masajid" — Photo by Kshitij Patle)
- ✅ Replace all remaining placeholder/editorial specification text with production-quality copy
- ✅ Restore Activity thumbnails — backend exposes `banner_url` via `ikUrl()`, frontend renders or falls back to gradient

### F5.2 — Photographer Profile Data Recovery — ✅ COMPLETE (Claude Code, 2026-07-12)

- ✅ Audit conducted — full field-by-field report at `ProjectDocs/SessionSummaries/2026-07-12 - Photographer Profile Data Audit.md`
- ✅ Awards (`user_awards`) and photography society titles (`user_photo_titles`) recovered and exposed in API + profile About tab
- ✅ `users.awards_html` field recovered to API
- ✅ Private fields (address, blood group, emergency contact) confirmed correctly excluded from public profile

### F5.3 — Photographer Profile Gallery — ✅ COMPLETE (Claude Code, 2026-07-12)

- ✅ Photographer profile gallery converted to canonical justified layout (`buildProfileRows()` with `flush(true)` to show all photos including partial last row)

### F5.4 — SEO Alt-Text — ✅ COMPLETE (Claude Code, 2026-07-12)

- ✅ Canonical SEO alt-text format `"${title} by ${photographerName} · Bhopal Camera Club"` applied to: gallery wall, photographer profile grid, profile lightbox

---

---

## IDENTITY-001 — Identity Completion Architecture

**Status:** ✅ COMPLETE (Claude Code, 2026-07-15)

**Mission:** Every user must complete identity (choose a username) before accessing the Member Hub. `identity_status` is the single authoritative state.

- ✅ **IdentityService implemented** — `reserveUsername()` with pre-write UX check + UPDATE WHERE username IS NULL guard + ER_DUP_ENTRY catch (HTTP 409) for race-condition safety; `markIdentityComplete()` writes `identity_status = IDENTITY_COMPLETE` and `identity_completed_at`
- ✅ **Identity Status architecture implemented** — `identity_status ENUM('IDENTITY_PENDING','IDENTITY_COMPLETE') NOT NULL DEFAULT 'IDENTITY_PENDING'` column added in migration `0067_add_identity_status.sql`; `identity_completed_at DATETIME NULL` added; existing users backfilled from `username IS NOT NULL`
- ✅ **Identity Completion workflow implemented** — `/auth/identity-complete/` page (MinimalLayout): loading → auth check → PENDING shows username form with debounced availability check → COMPLETE forwards to `?next`; open-redirect protection enforced
- ✅ **Hub Identity Guard implemented** — HubLayout performs blocking `/users/me` fetch before revealing Hub frame; `IDENTITY_PENDING` redirects to `/auth/identity-complete/?next=<current path>`; guard also active in `callback.astro` and `signin.astro` immediately after token issuance
- ✅ **Existing user migration implemented** — migration 0067 backfills `identity_status = IDENTITY_COMPLETE` for all users with an existing username; users without a username start IDENTITY_PENDING and are directed to complete identity on next sign-in
- ✅ **OAuth integration completed** — `callback.astro` checks `identityStatus` after OAuth token receipt; IDENTITY_PENDING redirects to completion with intended destination (`isNew ? '/hub/membership/apply/' : '/hub/'`) preserved as `?next`
- ✅ **Username ownership architecture completed** — username is write-once by the user only; UNIQUE INDEX `uq_users_username` (migration 0010) is the final authority; administrators cannot assign usernames; `reserveUsername()` enforces `WHERE username IS NULL` to prevent overwriting an existing username

Architecture authority: `ProjectDocs/Architecture/Identity_Architecture_Freeze_v1_IDENTITY-ARCH-001.md`

HUB-ARCH-001 updated: Amendment 001 (FD-016, FD-017, FD-018) records HubLayout as Identity Guard.

---

## FEEDBACK STAGE 5 — P0 Release Blockers

**Status:** 🚧 MUST RESOLVE BEFORE SOFT LAUNCH

These are confirmed production defects. Implementation complete in code; pending production deployment.

### P0-9 — Homepage Mobile Navigation — ✅ FIXED (Claude Code, 2026-07-12)

**Symptom:** Hamburger menu does not open on mobile. All page interactions broken on narrow viewports.

**Root cause:** `Nav.astro` — the `.drawer` element is `position:fixed; inset:0; z-index:950; display:block` at mobile widths even when closed. Its invisible overlay (`opacity:0`) still intercepts all pointer events, blocking the hamburger button and every other interactive element on the page.

**Fix:** Added `pointer-events: none` to `.drawer[aria-hidden="true"]` in `Nav.astro`. When closed the drawer does not intercept clicks; when open (`aria-hidden="false"`) pointer events are restored normally.

### P0-10 — Homepage Links Not Working — ✅ FIXED (Claude Code, 2026-07-12)

**Symptom:** Photo links, gallery cards, CTAs, activity links unresponsive.

**Root cause (primary):** Same as P0-9 — drawer overlay intercepts all clicks at mobile.

**Root cause (secondary):** Upcoming Activities rows were `<div>` elements, not `<a>` elements. Only the inner "Register →" button was a link; clicking the row body had no effect.

**Fix:**
- Primary: Same pointer-events fix as P0-9.
- Secondary: Changed event rows from `createElement('div')` to `createElement('a')` with `href` set to the event URL. Changed inner button from `<a>` to `<span>` to avoid invalid nested links.

---

# STAGE 3 — PLATFORM COMPLETION

---

## PHASE F — Membership & Billing

- V6 14 — Membership & Billing
- V6 15 — Future Modules Workspace

---

## PHASE G — Collections & Series

- V6 16 — Collections & Series
- V6 17 — Membership Card
- V6 18 — Notifications

---

## PHASE H — Taxonomy Architecture

Create

TAXONOMY_ARCHITECTURE_FREEZE_v1.0.md

Scope includes

- Genres
- Categories
- Collections
- Portfolio Series
- Activity Types
- Contest Types
- Membership Types
- Recognition Types
- Equipment Taxonomy
- Tags
- Awards
- Certificate Types
- Exhibition Types

---

## PHASE I — Remaining Public Pages

### Public Pages

- V6 04 — Photographers Directory
- V6 05 — Photographer Profile
- V6 02 — About
- V6 06 — Activities
- V6 07 — Journal
- V6 08 — Journal Article

### Authentication (Visual Reconciliation)

Existing functionality remains.

V6 visual refresh only.

- Sign In
- Register
- Forgot Password
- Reset Password
- Verify Email

---

# CONTINUATION OF ORIGINAL ROADMAP

After completion of the V6 UI Migration, continue with the remaining platform modules.

---

# PHASE 2b — Contest Engine & Certificates

These are the only remaining Phase 2 platform modules.

---

## Module 03 — Contest Management Engine

- 15+ Contest Formats
- Submission Management
- Eligibility Enforcement (MEM-006)
- Blind / Double Blind Judging
- Multi-round Evaluation
- Results Management
- Awards
- Publication Workflow

Dependencies

- Module 11
- Module 17

---

## Module 12 — Certificates & Badges

- Certificate Template Builder
- Membership Certificates
- Participation Certificates
- Achievement Certificates
- Badge Library
- QR Verification
- Verification URLs

Dependency

Membership Card redesign (Module 02 revisit)

---

## Module 11 — Financial Core

Expand the existing financial system with

- Event Fees
- Contest Entry Fees
- Expense Recording
- Event P&L
- INR Ledger
- Razorpay Integration
- Receipt Generation

---

# PHASE 3 — Growth

After Phase 2b completion.

Modules

- Module 09 — Community & Social Engagement
- Module 10 — Volunteer Management
- Module 07 — Exhibition Management
- Module 14 — Digital Archive
- Module 16 — Mobile PWA
- Migration Track D — Legacy Site Decommission

---

# PHASE 4 — Intelligence

Modules

- Module 08 — Photography School
- Module 13 — Governance & Administration
- Module 15 — AI Ecosystem Phase 1
- Native Mobile Applications

---

# PHASE 5 — Scale

Long-term platform evolution.

- Multi-tenancy
- AI Phase 2
- Visual Search
- Educational Feedback
- Renewal Prediction
- Interest Groups
- Video Contests
- Open Badges
- Lightroom Plugin

---

# CONVERSATION WORKFLOW

This roadmap is updated after every major implementation milestone.

Each major phase should begin in a fresh conversation referencing this roadmap.

This document remains the single authoritative sequencing document for BCC Unified Platform V3.
