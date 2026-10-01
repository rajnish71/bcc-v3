# BCC Unified Platform V3 — PHASE_ROADMAP v2.9 Amendment
# Module 04 Activity Domain Reconciliation

**Target:** PHASE_ROADMAP v2.8  
**Proposed version:** 2.9  
**Date:** 2026-10-01  
**Status:** HUMAN AUTHORITY APPROVED — READY FOR ADOPTION

## Purpose

This amendment updates roadmap sequencing and module boundaries to reflect the approved Module 04 Masterplan.

It governs **when** work happens, not **how** it is implemented.

It does not amend MEM-006, MEM-007, MEM-008, TECH-STACK-FREEZE, or any other frozen constitutional authority.

## 1. Module 04 Activity Domain

### Module 04 — Events & Activity Management

**Status:** CORE IMPLEMENTED — MASTERPLAN FROZEN — G1 REMEDIATION PENDING

The Module 04 Activity Domain comprises three separate implementation modules:

- Activity Core — existing Module 04 `events` implementation
- Module 03 — Contest Engine
- Module 07 — Exhibition Engine

They are peers within the Activity Domain. Contest and Exhibition are not Activity subtypes and must not be implemented through `event_type`.

The module numbers remain unchanged.

### Activity Core

Existing Activity implementation remains the foundation:

- canonical Activity model
- lifecycle DRAFT/PUBLISHED/CANCELLED/COMPLETED
- eligibility
- registration
- waitlist
- invite list
- volunteer capability (dormant)
- communication integration
- PAY-001 integration
- Activity/photo integration pending reconciliation

Activity Core remains the existing `events` module. This amendment does not authorize renaming its tables, routes, permission prefix, or `EVENT_REGISTRATION` concept.

## 2. G1 — Activity Core reconciliation

G1 maps to S1 + S2 of the Module 04 Masterplan.

Required reconciliation:

1. Registration time guard: reject registration at/after `starts_at`.
2. Cancellation guard: reject cancellation for COMPLETED/CANCELLED/historical Activities.
3. Admin registration-cancellation permission: `event.registration.manage`.
4. Check-in guard: REGISTERED only, under Activity lock.
5. Check-in undo restores REGISTERED.
6. Correct admin cancellation notification.
7. Activity-domain audit trail with actor capture.
8. Lifecycle timestamps/actors and registration-window fields.
9. Historical/archive and unpublish guards.
10. Unit tests for the above.

These are reconciliation items already covered by the Module 04 reconciliation exemption in PHASE_ROADMAP v2.8 and therefore do not constitute reopening general feature development.

## 3. G2 — prerequisites for Contest/Exhibition development

G2 maps to the approved Module 04 cross-domain gates.

Required before Contest/Exhibition implementation:

- Photo architecture reconciliation
- `EligibilityPolicy` extraction
- approved eligibility modes
- in-process job runner with MySQL advisory lock
- real MySQL integration tests in CI
- PAY-001 `EXPIRED` and refund behavior verification
- R2 key-format verification for blind judging
- required PHASE H taxonomy slice
- EVENT-ARCH-001 v1.1 adoption
- CONTEST-ARCH-001 adoption before Contest implementation
- EXHIBITION-ARCH-001 adoption before Exhibition implementation

## 4. Track 7 gate

PHASE_ROADMAP v2.8 records Track 7 as **FUTURE / DEFERRED** and states that feature development resumes only after Track 7 closes.

Therefore:

- S1, S2 and S4 are reconciliation work and remain permitted under the existing Module 04 reconciliation exemption.
- S3 is the governance/document adoption step and must occur before S4.
- S5 new capabilities and S6 are feature/governance work and remain gated until Track 7 closes.
- S5 payment-hold expiry is additionally conditional on Financial Engine expiry processing (Track 3 F-003); Module 04 must not implement a workaround for missing Financial Engine expiry processing.
- S7–S9 retain Module 03 / Phase 2b placement and require their own architecture gates.
- S10–S11 retain Module 07 / Phase 3 placement and require their own architecture gates.

No Track 7 closure is implied by this amendment.

## 5. Activity Core completion sequence

After the applicable gates close, Activity Core completion includes:

- refund-window implementation
- payment-hold expiry using PAY-001 `EXPIRED`
- staff assignment
- attendance / NO_SHOW
- waitlist promotion
- date/venue change notifications
- admin/self-service cancellation surfaces
- exports
- remaining Activity archive/SEO/public integration as sequenced

MEM-008 activity benefits must be implemented through the configurable entitlement system, including where applicable:

- priority registration
- configured Activity discounts
- student-specific Activity eligibility

Discount percentages and entitlement decisions must not be hard-coded.

## 6. Module 03 — Contest Engine

Module 03 remains **Phase 2b** and is the Contest Engine portion of the Activity Domain.

It must not be treated as a generic Activity type.

Dependencies:

- Activity Core foundations
- PAY-001 / Financial Engine
- Photo Architecture reconciliation
- `EligibilityPolicy`
- PHASE H taxonomy slice
- CONTEST-ARCH-001 adoption

Contest implementation begins only after the Module 04 G2 gate and CONTEST-ARCH-001 adoption.

Contest Engine owns:

- contests
- categories
- rounds
- eligible classes
- entries
- entry photo references
- payment batches
- judges
- recusals
- scores
- awards
- result sets
- published/versioned results
- blind judging and embargo behavior

Contest entries are never Activity registrations.

Day-one Contest table inventory remains indicative until CONTEST-ARCH-001 is adopted.

## 7. Module 07 — Exhibition Engine

Module 07 remains **Phase 3** and is the Exhibition Engine portion of the Activity Domain.

Required gate:

- EXHIBITION-ARCH-001 adoption before implementation.

Exhibition Engine owns:

- exhibition identity
- theme/type
- curators
- open calls/eligibility
- works/submissions
- curation
- selection
- showings
- sections
- captions/sequence
- attribution
- online exhibition/archive

Artwork sales remain outside Exhibition Engine.

Contest/Exhibition archives must apply the adopted PHOTO-ARCH-001 ruling and MEM-008 privacy/exposure rules. The exact archive exposure model is to be resolved in the relevant architecture freeze, not inferred by implementation.

## 8. Module 12 dependency

Module 12 Certificates & Badges consumes published Contest/Exhibition read APIs.

The obsolete Membership Card dependency must not block Contest/Exhibition unless independently confirmed as a real dependency.

Membership certificates may retain any legitimate Membership Card dependency separately.

## 9. Module 11 correction

Module 11 remains the **Financial Engine (PAY-001, roadmap Module 11)**.

Do not create an Event Fees engine inside Module 11.

Contest Entry Fees are financial obligations initiated by the Contest Engine and processed through PAY-001. Provider execution remains inside the Financial Engine.

## 10. Module 14 and Module 17 boundaries

Module 14 owns cross-domain browsing/archive navigation.

Activity, Contest and Exhibition engines own their own domain archives and read APIs.

Module 17 is the Communication Engine. Activity/Contest/Exhibition use approved communication dispatch/type keys and do not own message delivery.

## 11. PHASE H taxonomy governance

The required Module 04 taxonomy slice is a governance artifact.

**Owner:** Claude AI drafts the taxonomy slice; Rajnish adopts it.

The roadmap only records its sequencing requirement. Taxonomy implementation detail belongs to the architecture/specification documents.

## 12. S9 scope

S9 is limited to exposing Contest read APIs required by downstream consumers.

It does not authorize Module 12 implementation. Module 12 follows its own roadmap and architecture.

## 13. Explicit sequencing prohibition

The following are prohibited shortcuts:

- building Contest as `event_type`
- building Exhibition as `event_type`
- putting Contest entries in `event_registrations`
- putting Exhibition submissions in `event_registrations`
- creating `events.engine`
- creating generic polymorphic submission/container tables
- introducing new Activity lifecycle states
- creating stored print derivatives
- introducing a new standing service/process for Module 04
- permissions derived from membership class or recognition
- entry/judging codes derived from membership numbers, user IDs or photo IDs
- implementing Contest before CONTEST-ARCH-001 is adopted
- implementing Exhibition before EXHIBITION-ARCH-001 is adopted

## 14. Roadmap sequencing

```text
MASTERPLAN FREEZE
      ↓
EVENT-ARCH-001 v1.1 + PHASE_ROADMAP amendment
      ↓
G1 — Activity Core safety remediation
      ↓
Activity audit/lifecycle foundation
      ↓
Photo reconciliation
      ↓
[Track 7 closure required for new feature work]
      ↓
Activity Core completion
      ↓
Cross-domain foundations
(EligibilityPolicy + job runner + MySQL CI + PHASE H slice)
      ↓
CONTEST-ARCH-001 FREEZE
      ↓
Contest Engine MVP — Module 03 / Phase 2b
      ↓
Module 12 read-API integration on its own roadmap
      ↓
EXHIBITION-ARCH-001 FREEZE
      ↓
Exhibition Engine MVP — Module 07 / Phase 3
```

## 15. Adoption record

On adoption, the authoritative roadmap must be updated from **v2.8 to v2.9** and record:

- Module 04 Activity Domain = Activity Core + Module 03 Contest Engine + Module 07 Exhibition Engine
- Module 04 status = **CORE IMPLEMENTED — MASTERPLAN FROZEN — G1 REMEDIATION PENDING**
- Module 03 remains Phase 2b
- Module 07 remains Phase 3
- Track 7 remains the gate for new feature development
- this amendment governs sequencing only; architecture detail remains in the Masterplan and relevant architecture freezes

