# BCC Unified Platform V3 — Phase Roadmap

**Status:** AUTHORITATIVE — Living Roadmap
**Version:** 2.1
**Last Updated:** 2026-07-10 — Phase A complete; Member Hub implementation validated and deployed

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

Photo Asset Architecture

**Status:** 📋 PLANNED

Purpose:

Establish the platform-wide canonical architecture governing photographic assets.

Planned deliverable:

PHOTO-ARCH-001 — Photo Asset Architecture Freeze v1.0

Will define:

- Canonical Photo Identity
- Container Architecture
- Viewing Context
- Canonical Photo URLs
- Photo Ownership Model
- Navigation Context
- Asset Reuse Across Modules

Target location:

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

Compare

Legacy Database

↓

Current V3 Database

↓

Required V6 Data Model

Resolve missing fields before Member Profile implementation.

---

## PHASE D — Member Profile

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

## PHASE E — Production Cutover

Deploy

```
v3bcc.bhopal.info
        ↓
bcc.bhopal.info
```

Activities

- Internal testing
- Core committee validation
- Existing member onboarding
- Portfolio migration
- Legacy site becomes read-only
- DNS cutover
- Public launch

---

## System Deliverables

- V6 98 — token.css
- V6 99 — systemdesign.md

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