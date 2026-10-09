# BCC Unified Platform V3 — Phase Roadmap

**Status:** AUTHORITATIVE — Living Roadmap
**Version:** 3.0
**Last Updated:** 2026-10-01 — Module 04 Activity Domain amendment applied (MODULE-04-MASTERPLAN-001 v1.1; EVENT-ARCH-001 v1.1)

**Version note:** v3.0 applies the Human Authority-approved "PHASE_ROADMAP v2.9 Module 04 Amendment" (`ProjectDocs/Plans/PHASE_ROADMAP-v2.9-MODULE04-AMENDMENT (1).md`). That amendment was drafted against v2.8; the v2.9 label had already been used by the 2026-09-30 consolidation (Family & Corporate Membership), so Human Authority directed the result to be labelled v3.0. The amendment changes sequencing and module boundaries only; it does not amend MEM-006, MEM-007, MEM-008, TECH-STACK-FREEZE or any other frozen authority.

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

# AUGUST 2026 REMEDIATION PROGRAMME

**This is a temporary remediation sequencing layer. It does not replace the permanent Platform Development Roadmap below.** After Track 7 closes, normal feature development resumes from the then-current PHASE_ROADMAP state (Phase E and onward).

Source: `ProjectDocs/Audits/BCC_V3_August_Audit_Blocks_1-15_Consolidated.md` and successor audit blocks.

## Track 0 — Governance Closeout — ✅ CLOSED

- 0.1 — MEM-007 — ✅ CLOSED / VERIFIED
- 0.2 — MEM-008 — ✅ CLOSED / VERIFIED
- 0.3 — ADMIN-ARCH-001 — ✅ CLOSED / VERIFIED — closure does **not** mean adoption. ADMIN-ARCH-001 exists in the working tree (`ProjectDocs/Architecture/ADMIN_CONSOLE_ARCHITECTURE_FREEZE_v1.0_ADMIN-ARCH-001.md`) but remains **untracked/unadopted and not authoritative**. Its Actor+Target principle, if ever adopted, is module-scoped to the Member Management surface only.
- 0.4 — PHASE_ROADMAP — ✅ CLOSED / VERIFIED (this reconciliation)

## Track 1 — F-001 / F-030 Residual Reconciliation — 🚧 CURRENT / NEXT

- F-001/F-030 (stuck `SETTLEMENT_IN_PROGRESS` contributions on rejected memberships) — root-caused to a pre-fix Razorpay auto-capture defect, fixed by commit `5c87792` (deployed 2026-08-14). Residual reconciliation of the two already-affected memberships (87, 88) remains open pending a specification decision; historical reconciliation is deferred unless separately authorized.

## Track 2 — F-010 Change Control / Authorized Manual Operations — 🔜 FUTURE / DEFERRED

- F-010 (membership 84 manual QA change, no audit trail) — authorized manual change-control gap, not yet closed.
- QA/test-account lifecycle and production access boundary — not yet started.

## Track 3 — Remaining Authorized Financial Resilience — 🔜 FUTURE / DEFERRED

- F-002 (system-actor refund for rejected-membership settlements) — ✅ implemented, commit `472bf6d`.
- F-003 (no outbox-recovery worker / expiry-processing job) — open; zero production impact recorded at last audit.
- F-004 (webhook/reconciliation tests are static source-pattern checks, not runtime tests) — open.
- F-005/F-006 — only in scope **if an actual required behaviour is established**; not to be invented. F-005 (this roadmap being stale on payment status) is addressed by this reconciliation. F-006 (webhook-driven refund `PROCESSING → COMPLETED` path) status not re-verified in this pass — treat as open until confirmed.

## Track 4 — Admin Financial Visibility — 🚧 IMPLEMENTED LOCALLY — PENDING PRODUCTION DEPLOYMENT

- Read-only admin financial visibility implemented (overview, contributions, contribution detail, refunds, receipts, exceptions, unified search) as an RBAC-gated Financial workspace group inside HubLayout/HubSidebar; API `GET /api/v1/financial/admin/*`.
- RBAC: new permission `financial.read`, granted to Super Admin and Financial Authority only. Financial Authority is a new **SYSTEM** RBAC role (not a membership class, position or event assignment). Not granted to Coordinator, Platform Admin, operational roles or members; independent of `financial.settlement.verify` and `financial.audit.view`.
- No financial mutation, refund, settlement or reconciliation operation introduced; refunds displayed from `financial_refunds` as stored.
- Migration `0114_add_financial_read_permission_and_financial_authority_role.sql` created — **not applied to production**. No user assigned the Financial Authority role.
- Committed locally as `2a0588a` (+ test hardening `ba7b3a4`) — not pushed, not deployed. Production deployment pending Human Authority approval.

## Track 5 — Production DB / Operational Security — 🔜 FUTURE / DEFERRED

- Least-privilege DB access and controlled production access boundary — not yet started.

## Track 6 — Specific Remaining Auditability Gaps — 🔜 FUTURE / DEFERRED

Scope limited to already-established remediation gaps only — **no new forensic audit**:

- F-011 (canonical identity-domain writes bypassing `identity_audit_log`) — ✅ **RESOLVED**. Five commits at HEAD (`21cfa52`, `321f53a`, `4546868`, `8048e66`, `5a37054`) add audit logging to each of the five write paths the audit identified: self-service password reset, self-service password change, email changes, password hash migrations, admin password resets. This corrects the prior 🟡-open status recorded in the audit consolidation.
- F-015/F-016/F-017/F-018/F-019/F-020 — generalized/related audit-atomicity and coverage gaps from the same sweep; not verified as closed by this reconciliation pass — treat as still open until independently checked.
- F-012 (no canonical path to clear `force_password_reset`) and F-033/F-034 (admin password-reset permission boundary, forced-reset enforcement) — appear to have associated fix commits (`bcaf569`, `1829b5e`) at HEAD; not independently re-verified in this pass.

## Track 7 — Final August Remediation Closure — 🔜 FUTURE / DEFERRED

Not reached. Pending feature development (Stage 3 / Phase F onward, below) resumes only after Track 7 closes.

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

- ✅ **COMPLETE** — Pre-Production Maintenance Toolkit implemented under `scripts/tools/maintenance/`. Enables safe, transactional deletion of test and terminated users.
  - `inspect-user` utility: Dynamical dependency collection, custom plans, safety warnings, and JSON reporting mode.
  - `delete-test-user` utility: Real deletions using sequential handler executions, interactive confirmation validation, transaction lifecycle timing, and post-deletion integrity verifications.
  - Handler-based architecture: Encapsulates domain logic in 6 pluggable handlers (`auth`, `membership`, `notification`, `profile`, `photo`, `event`).
  - FK validation: Runtime validation against `INFORMATION_SCHEMA` covering all 51 active foreign keys.
  - Dry-run verification: 100% read-only simulations of deletions without starting transaction blocks or altering triggers.
  - Trigger preservation: Preservation of database trigger `trg_prevent_numbered_membership_delete` with byte-for-byte SHA256 checksum validation.

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

### MEM-008 Portfolio Cap & Public Exposure Enforcement

**Status:** ✅ IMPLEMENTATION COMPLETE — ✅ DEPLOYED / OPERATIONAL CLOSEOUT

Owner-authorized MEM-008 amendment establishes:

- Basic Member: maximum 5 publicly visible portfolio photos.
- Student Member: maximum 10 publicly visible portfolio photos.
- Basic and Student members do not receive Public Gallery access.

Implementation:

- Public exposure is enforced through the entitlement/policy layer.
- Portfolio selection is explicit through `photos.portfolio_selected`.
- The system never automatically selects, promotes, orders, or trims photos.
- If stored selection exceeds the applicable cap, no selected photos are publicly exposed until the member reconciles the selection to the cap.
- Four owner-authorized individual overrides provide unlimited portfolio + public gallery while retaining BASIC_MEMBER class.
- Pranil Kishnani has a temporary individual portfolio restriction pending separate minor-policy decision.
- Migration 0103 establishes the applicable individual overrides/restriction.
- Membership comparison UI is reconciled to the amended MEM-008 policy.

Status: Deployed to production on 2026-09-29 — migration 0103 applied (17:47 UTC) and commit `3d7d415` deployed via GitHub Actions (17:58 UTC). Verified in production (read-only, 2026-09-30): Basic cap 5 / Student cap 10 with no Public Gallery served by the public membership API and page; `photos.portfolio_selected` present; the 0103 individual overrides/restriction are in place. The Pranil Kishnani restriction remains pending its separate minor-policy decision.

**MEM-008 Amendment 002 — Recognition-Based Unlimited Public Photographer Portfolio.** RATIFIED 2026-10-09 by Human Authority; now APPROVED / FROZEN / AUTHORITATIVE in MEM-008. Senior Member, Honorary Member, Honorary Mentor, Honorary Grandmaster and Honorary Senior Member receive an Unlimited Public Photographer Portfolio (no numeric maximum). The entitlement is recognition-based: it requires no active underlying Membership, and an Individual Override or administrative restriction cannot reduce, cap or remove it. Basic remains capped at 5 and Student at 10. Public Gallery and Photographer Directory eligibility remain separate and unchanged, and explicit `photos.portfolio_selected` selection remains required. Implementation is complete at the existing portfolio-exposure policy/service boundary (`portfolio-exposure.policy.ts`, `portfolio-exposure.service.ts`); no migration or seed change. Status: implemented and tested locally; not yet committed or deployed.

---

### PROFILE-ARCH-001 — Photographer Profile Completion & Directory Eligibility

**Status:** 🚧 IMPLEMENTED — COMMITTED LOCALLY, NOT DEPLOYED (pending review)

Architecture authority: `ProjectDocs/Architecture/PROFILE-ARCH-001_PHOTOGRAPHER_PROFILE_COMPLETION_AND_DIRECTORY_ELIGIBILITY_FREEZE_v1.0.md` (frozen by Human Authority, 2026-10-06; subordinate to MEM-006/MEM-007/MEM-008).

- Profile completion: seven equally weighted binary elements (Bio, City, Camera Gear, Social/Website, Cover Photo, Photography Genres, Tagline); threshold 4 of 7 (`2 * completed >= 7`), computed server-side, never stored.
- Public Photographer Directory lists a photographer only when existing directory gates pass AND a valid profile photograph exists AND completion >= 4/7 AND >= 5 MEM-008 publicly eligible portfolio photographs exist.
- `/photographers/:username` and static profile paths/sitemap are independent of directory eligibility.

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

Module 04 dependency: a required Module 04 taxonomy slice (Activity/Contest/Exhibition types) is a G2 prerequisite for Contest/Exhibition development. It is a governance artifact — Claude AI drafts it; Rajnish adopts it. This roadmap records only its sequencing requirement.

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

## Membership Expansion — Family & Corporate Membership

**Status:** ✅ IMPLEMENTATION COMPLETE — ✅ DEPLOYED / OPERATIONAL CLOSEOUT

Family and Corporate Group Membership support has been implemented and reconciled against MEM-006, MEM-007, MEM-008 and PAY-001.

Scope completed:

- Family Group Membership
- Corporate Group Membership
- Group-level financial contribution and Razorpay Payment Link flow
- Payment-before-approval lifecycle gate
- BCC approval workflow
- Group member invitation / assignment
- Invitation acceptance
- Individual Membership records linked to Group Membership
- First-member activation triggering Group activation
- Individual Membership Number allocation through the existing unified numbering pool
- Group remains unnumbered
- Shared Group membership term
- Group renewal extending existing member records in place
- Admin-only member revocation
- Permanent non-reusable Membership Numbers
- Configurable Corporate verification requirements

Frozen operational lifecycle:

**PAY → APPROVE → INVITE → ACCEPT → ACTIVATE → NUMBER**

Authority:

- MEM-006 — Membership Constitution
- MEM-007 — Membership Numbering Constitution
- MEM-008 — Membership Plans, Benefits & Lifecycle Constitution
- PAY-001 — Financial Contribution & Transaction Architecture

Implementation verification:

- 57/57 Family & Corporate lifecycle tests passed
- Full backend suite: 38 suites / 1,159 tests passed
- TypeScript clean
- Nest build successful
- Deployed to production and verified (see Production deployment below)

Production deployment (2026-09-30):

- Commit `8f26c53` deployed to production via the existing GitHub Actions / deploy.sh pipeline (atomic frontend publish, PM2 backend restart).
- Migrations 0104 and 0105 applied to production in order (0104 before 0105) and verified, before the backend deploy, after a pre-migration database backup.
- Production verification passed: production confirmed running `8f26c53`; application started cleanly against 0104 + 0105 with no schema or startup errors.
- Frontend and backend verification passed.
- No production business data was modified during verification.
- Implementation, migration and deployment are complete.

Remaining operational items:

- Corporate verification document configuration, if/when Human Authority defines the required document type
- Any required UI/navigation polish is tracked separately and does not block the core lifecycle implementation

This workstream does not create a new Phase 2 module and does not alter existing Phase/Module sequencing.

---

# CONTINUATION OF ORIGINAL ROADMAP

After completion of the V6 UI Migration, continue with the remaining platform modules.

---

## Module 04 — Events & Activity Management (Activity Domain)

**Status:** CORE IMPLEMENTED — MASTERPLAN FROZEN — G1 REMEDIATION PENDING

Authorities: `MODULE-04-MASTERPLAN-001 v1.1` (`ProjectDocs/Plans/MODULE-04-MASTERPLAN-001_v1.1.md`) and `EVENT-ARCH-001 v1.1` (`ProjectDocs/Architecture/EVENTS_ACTIVITY_MANAGEMENT_ARCHITECTURE_FREEZE_v1.0_EVENT-ARCH-001.md`). Architecture detail lives there, not in this roadmap.

The Module 04 Activity Domain comprises three separate peer implementation modules:

- **Activity Core** — the existing Module 04 `events` implementation
- **Module 03 — Contest Engine** (Phase 2b, below)
- **Module 07 — Exhibition Engine** (Phase 3, below)

Contest and Exhibition are not Activity subtypes and must not be implemented through `event_type`. Module numbers remain unchanged. Activity Core remains the existing `events` module; its tables, routes, `event.*` permission prefix and `EVENT_REGISTRATION` concept are not renamed.

Activity Core — implemented foundation: canonical Activity model; lifecycle DRAFT/PUBLISHED/CANCELLED/COMPLETED; eligibility; registration; waitlist; invite list; communication integration; PAY-001 integration (✅ deployed — commits `56ce7d8`, `a96179e`, `c348405`; migrations 0107/0108); historical Activity support (migration 0102); volunteer capability (dormant). Activity/photo integration pending reconciliation (S4).

### G1 — Activity Core reconciliation (= Masterplan S1 + S2)

Reconciliation/safety remediation covered by the existing Module 04 reconciliation exemption (documentation and reconciliation of already-built history — not new feature development, not gated by Track 7):

1. Registration time guard — reject registration at/after `starts_at`
2. Cancellation guard — reject cancellation of COMPLETED/CANCELLED/historical Activities
3. Admin registration-cancellation permission `event.registration.manage`
4. Check-in guard — REGISTERED only, under Activity lock
5. Check-in undo restores REGISTERED
6. Correct admin cancellation notification
7. Activity-domain audit trail with actor capture
8. Lifecycle timestamps/actors and registration-window fields
9. Historical/archive and unpublish guards
10. Unit tests for the above

### G2 — prerequisites for Contest/Exhibition development

- Photo architecture reconciliation
- `EligibilityPolicy` extraction and approved eligibility modes
- In-process job runner with MySQL advisory lock (no new standing process)
- Real MySQL integration tests in CI
- PAY-001 `EXPIRED` and refund behaviour verification
- R2 key-format verification for blind judging
- Required PHASE H taxonomy slice (Claude AI drafts; Rajnish adopts)
- EVENT-ARCH-001 v1.1 adoption
- CONTEST-ARCH-001 adoption before Contest implementation
- EXHIBITION-ARCH-001 adoption before Exhibition implementation

### Track 7 gate

Track 7 remains **🔜 FUTURE / DEFERRED** and remains the gate for new feature development. No Track 7 closure is implied by this entry.

- S1, S2 and S4 are reconciliation work — permitted under the existing Module 04 reconciliation exemption.
- S3 (governance/document adoption of EVENT-ARCH-001 v1.1 and this amendment) occurs before S4.
- S5 new capabilities and S6 are feature/governance work — gated until Track 7 closes.
- S5 payment-hold expiry is additionally conditional on Financial Engine expiry processing (Track 3 F-003); Module 04 must not implement a workaround.
- S7–S9 retain Module 03 / Phase 2b placement; S10–S11 retain Module 07 / Phase 3 placement; each requires its own architecture gate.

### Activity Core completion (after applicable gates)

Refund-window implementation; payment-hold expiry using PAY-001 `EXPIRED`; staff assignment; attendance/NO_SHOW; waitlist promotion; date/venue change notifications; admin/self-service cancellation surfaces; exports; remaining archive/SEO/public integration as sequenced. MEM-008 Activity benefits (priority registration, configured Activity discounts, student-specific Activity eligibility) are implemented through the configurable entitlement system — no discount percentage or entitlement decision is hard-coded.

### Sequencing

```text
MASTERPLAN FREEZE
      ↓
EVENT-ARCH-001 v1.1 + PHASE_ROADMAP amendment
      ↓
G1 — Activity Core safety remediation + audit/lifecycle foundation (S1 + S2)
      ↓
Photo reconciliation (S4)
      ↓
[Track 7 closure required for new feature work]
      ↓
Activity Core completion (S5)
      ↓
Cross-domain foundations (S6)
      ↓
CONTEST-ARCH-001 FREEZE → Contest Engine MVP — Module 03 / Phase 2b
      ↓
Module 12 read-API integration on its own roadmap
      ↓
EXHIBITION-ARCH-001 FREEZE → Exhibition Engine MVP — Module 07 / Phase 3
```

### Prohibited sequencing shortcuts

Building Contest or Exhibition as `event_type`; Contest entries or Exhibition submissions in `event_registrations`; `events.engine`; generic polymorphic submission/container tables; new Activity lifecycle states; stored print derivatives; a new standing service/process for Module 04; permissions derived from membership class or recognition; entry/judging codes derived from membership numbers, user IDs or photo IDs; implementing Contest before CONTEST-ARCH-001 or Exhibition before EXHIBITION-ARCH-001 is adopted.

Module 04 Activity Core remains excluded from the "remaining Phase 2 platform modules" line below because its core is already implemented.

---

# PHASE 2b — Contest Engine & Certificates

These are the only remaining Phase 2 platform modules.

---

## Module 03 — Contest Management Engine

**Activity Domain placement:** Contest Engine portion of the Module 04 Activity Domain (peer of Activity Core — not an Activity type). Remains **Phase 2b**.

- 15+ Contest Formats
- Submission Management (Contest entries — never Activity registrations)
- Eligibility Enforcement (MEM-006 / MEM-008, via `EligibilityPolicy`)
- Blind / Double Blind Judging
- Multi-round Evaluation
- Results Management
- Awards
- Publication Workflow

Dependencies

- Module 04 Activity Core foundations and G2 gate (see Module 04 above)
- Module 11 (PAY-001 / Financial Engine)
- Module 17
- Photo Architecture reconciliation
- `EligibilityPolicy`
- PHASE H taxonomy slice
- CONTEST-ARCH-001 adoption — Contest implementation begins only after the G2 gate and CONTEST-ARCH-001 adoption

Contest ownership scope and the day-one table inventory are indicative until CONTEST-ARCH-001 is adopted (see MODULE-04-MASTERPLAN-001 v1.1 §5).

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

- Consumes published Contest/Exhibition read APIs (Module 04 S9 exposes Contest read APIs only; it does not authorize Module 12 implementation — Module 12 follows its own roadmap and architecture).
- Membership Card redesign (Module 02 revisit) — retained only for Membership Certificates where it is a legitimate dependency. The obsolete Membership Card dependency does not block Contest/Exhibition unless independently confirmed as real.

---

## Module 11 — Financial Core

**Foundational Financial Engine (PAY-001) — ✅ COMPLETE.** PAY-001 (`ProjectDocs/Architecture/PAY-001-Financial_Contribution_and_Transaction_Architecture_v1.md`) is Approved/Frozen/Authoritative and is built: Financial Obligation → Financial Contribution → Settlement → Financial Transaction → Receipt, provider-independent, immutable transactions, zero-value contributions, offline settlement — implemented across migrations `0088`–`0096` (financial engine, settlement evidence, event outbox, webhook inbox, refunds) and the `backend/src/modules/financial` module. Membership↔Financial integration and Razorpay settlement are live in production (webhook handling, auto-capture, refund automation).

**Razorpay is no longer future work — it is live, with remaining resilience items tracked under the August 2026 Remediation Programme (Track 1/3 above):** outbox-recovery worker (F-003), runtime regression test coverage (F-004), and any further refund-completion path work (F-006) only if an actual required behaviour is established.

**Offline settlement is architecturally supported by PAY-001** (bank transfer, cash, cheque, and future offline methods). A specific offline-settlement UI/workflow (e.g. UPI transaction-ID entry, admin approve/disapprove screen) is **not yet specified or authorized** — treat as FUTURE / TO BE SPECIFIED, not current work.

Module 11 remains the Financial Engine (PAY-001). No Event Fees engine is created inside Module 11: Activity registration fees are already wired as PAY-001 obligations initiated by Module 04 Activity Core (`EVENT_REGISTRATION`), and Contest Entry Fees are obligations initiated by the Contest Engine and processed through PAY-001. Provider execution remains inside the Financial Engine.

Remaining expansion (not yet started):

- Contest Entry Fees (initiated by Module 03, processed via PAY-001)
- Expense Recording
- Event P&L
- INR Ledger (reporting/export)
- Receipt Generation (beyond current settlement receipts, if additional formats are required)

---

# PHASE 3 — Growth

After Phase 2b completion.

Modules

- Module 09 — Community & Social Engagement
- Module 10 — Volunteer Management
- Module 07 — Exhibition Management — Exhibition Engine portion of the Module 04 Activity Domain (peer of Activity Core — not an Activity type). Remains Phase 3. EXHIBITION-ARCH-001 adoption required before implementation. Exhibition submissions are never Activity registrations; artwork sales remain outside the Exhibition Engine. Contest/Exhibition archives apply the adopted PHOTO-ARCH-001 ruling and MEM-008 privacy/exposure rules; the exact archive exposure model is resolved in the relevant architecture freeze.
- Module 14 — Digital Archive — owns cross-domain browsing/archive navigation; Activity, Contest and Exhibition engines own their own domain archives and read APIs.
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
