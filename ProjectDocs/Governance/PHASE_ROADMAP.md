# BCC Unified Platform V3 — Phase Roadmap

**Status:** AUTHORITATIVE — Living Roadmap
**Version:** 2.0
**Last Updated:** 2026-07-10

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

**Status:** 🚧 ACTIVE

Current development focus.

---

## PHASE A — Complete the Member Hub Foundation

### A1

Hub Component Architecture

✅ COMPLETE

---

### A2

V6 12 — Members Hub Navigation

Design Authority

---

### A3

Reconcile

V6 09 — Members Hub Home

---

### A4

Reconcile

V6 10 — Portfolio

---

### A5

Reconcile

V6 11 — Upload Studio

---

### A6

Implementation

Implementation order

```
HubLayout
        ↓
HubSidebar
        ↓
HubPageHeader
        ↓
HubSection
        ↓
Navigation
        ↓
Hub Home
        ↓
Portfolio
        ↓
Upload Studio
```

---

### A7

Validation

- UI Verification
- Functional Testing
- Deployment
- Bug Fixing
- Git Commit
- Production-ready Member Hub

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